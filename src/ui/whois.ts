// Who is that: a click on a person on the land opens their card beside the point clicked, tied to them (tie.ts; a
// sheet from the bottom on a phone); a click on anything else that looks like someone (a machine, a caller, a picker,
// an animal) gives its name the same way. Before any click, the pointer over a person or a thing shows its name
// and a mark on the ground. In every phase where people are on the land.
import type { Thing } from '../game/contracts.ts'
import * as S from '../sim/index.ts'
import { confirmPaper, patch, type Ctx } from './core.ts'
import { doingWord, openCrew, ringFor } from './crew.ts'
import { personNow } from './now.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { moodSaid, restControl, restWords } from './people.ts'
import { firstName, jobText, KIND_NAME, LET_GO_TEXT, moodWhy, personSign, SKILL_NAME, skillCovers } from './rules.ts'
import { ringed } from './system/people.ts'
import { anchored, ties } from './tie.ts'
import './whois.css'
import { toLocal } from './scale.ts'

const SKILL_CUT: Record<S.Skill, string> = { machine: 'machine', field: 'field', woods: 'woods', build: 'hammer', pack: 'pack' }
const SKILL_SHORT: Record<S.Skill, string> = { machine: 'Machine', field: 'Field', woods: 'Woods', build: 'Build', pack: 'Pack' }
const WINTER_WORDS: Record<S.WinterWork, string> = { off: 'Off', woods: 'Woods', pack: 'Pack', build: 'Build' }

export interface Whois {
  el: HTMLElement
  update(): void
  frame(): void
  // The foot of the window its sheet covers on a phone, in pixels (0 at a desk).
  inset(): number
  // Puts away whatever is open; false when nothing was.
  escape(): boolean
  dispose(): void
}

// What a thing is, in a name and a line.
function thingWords(c: S.Campaign, t: Thing, touch = false): { name: string; line: string; glyph: string } {
  const who = (id: number) => { const u = c.crew.find(x => x.id === id); return u ? (u.kind === 'farmer' ? '당신이' : S.iga(firstName(u.name))) : '' }
  switch (t.kind) {
    case 'tractor': case 'truck': {
      const name = t.kind === 'tractor' ? (t.k ? `당신의 ${t.k === 1 ? '두 번째' : '세 번째'} 트랙터` : '당신의 트랙터') : '당신의 트럭'
      const holder = t.holder >= 0 ? who(t.holder) : ''
      const job = holder && c.season ? c.season.jobs.find(j => c.crew.find(u => u.id === t.holder)?.job === j.id) : undefined
      return { name, glyph: t.kind === 'tractor' ? 'machine' : 'haul', line: holder ? `${holder} 쓰는 중${job ? `, ${jobText(job, c, job.building)}` : ''}.` : c.phase === 'season' ? '아무도 쓰지 않습니다. 세워둔 곳에 있고, 다음에 필요한 사람이 쓸 수 있습니다.' : '시즌이 시작될 때까지 창고에 있습니다.' }
    }
    case 'asking': {
      const a = c.applicants[t.k]
      return { name: a ? a.name : '문 앞의 누군가', glyph: 'hire', line: a ? `월 ${F.money(a.ask)}에 일자리를 찾고 있습니다.` : '일자리를 찾고 있습니다.' }
    }
    case 'neighbour': return { name: t.k ? '이웃의 트럭' : '이웃', glyph: 'ask', line: '당신의 사람에게 더 많은 품값을 제안하러 왔습니다. 전보에 액수가 있습니다.' }
    case 'buyer': return { name: t.k ? '구매자의 차' : '청과 구매자', glyph: 'sell', line: '시세보다 비싸게 한 더미를 통째로 사러 왔습니다. 전보에 제안이 있습니다.' }
    case 'picker': return { name: '학생 일꾼', glyph: 'pickers', line: '작물을 캐는 동안 하루 단위로 고용된 도우미입니다.' }
    case 'cow': return { name: '이웃의 소들', glyph: 'rest', line: '집 마당 옆 목초지에서 풀을 뜯고 있습니다. 당신의 소가 아닙니다.' }
    case 'deer': return { name: '사슴', glyph: 'woods', line: '숲 가장자리에 있습니다. 누가 가까이 가면 나무 사이로 사라집니다.' }
    case 'yard': {
      const built = c.buildings.filter(b => b.yard === t.k && b.built).map(b => S.BUILDINGS[b.kind].name)
      const stands = t.k === S.HOME_YARD ? ['농가', '감자 저장고', ...built] : built
      return {
        name: t.k === S.HOME_YARD ? '집 마당' : '두푸르 마당', glyph: 'house',
        line: `${stands.length ? `${F.list(stands)}.` : '아직 지어진 것이 없습니다.'} 시즌 중에 여기에 지을 수 있습니다${touch ? '. 마당을 탭하세요' : '. Y를 누르거나 마당을 클릭하세요'}.`,
      }
    }
  }
}

export function whois(ctx: Ctx, layer: HTMLElement): Whois {
  const app = ctx.app
  const card = h('section', { class: 'whois sheet sys', testid: 'whois', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'whois-name', hidden: true })
  const tcard = h('section', { class: 'whois thing sheet sys', testid: 'thing-card', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'thing-name', hidden: true })
  const label = h('p', { class: 'hover-name', 'aria-hidden': 'true', hidden: true })
  const mark = h('i', { class: 'hover-mark', 'aria-hidden': 'true', hidden: true })
  const tied = { card: anchored(ctx, card), thing: anchored(ctx, tcard, { mark: true }) }
  const el = h('div', { class: 'whois-layer' }, mark, tied.card.parts, tied.thing.parts, label, card, tcard)
  layer.append(el)
  let shownFor = -1

  function phone(): boolean { return ctx.layout() === 'narrow' }

  // The person whose card is open: picked on the land, in any phase but the title. One card at a time: while a field
  // or a yard is in hand its card is the one up (orders given there still go to the person picked).
  function open(c: S.Campaign | null): S.PersonInfo | null {
    if (!c || app.screen === 'title' || app.unit < 0 || app.unitFrom !== 'land' || app.selection.length > 0 || app.yard !== 0) return null
    return S.peopleInfo(c).find(p => p.id === app.unit) ?? null
  }

  function run(cmd: S.Cmd, said: string): void {
    const r = ctx.run(cmd)
    if (r.ok) ctx.announce(said)
  }

  function body(c: S.Campaign, p: S.PersonInfo): Child {
    const farmer = p.kind === 'farmer'
    const name = farmer ? 'You' : p.name
    const ring = ringFor(c, p.id)
    const season = c.phase === 'season' && !!c.season
    // What they are at now, said as the time book says it (now.ts).
    const now = season ? personNow(c, p.id, S.jobWaits(app.world, c)) : null
    const busy = !!now && !['Idle', 'Waiting', 'Sunday'].includes(now.word)
    const lower = (t: string) => t.replace(/^./, x => x.toLowerCase())
    const detail = c.phase === 'cellar' ? lower(p.winterText) : !season ? 'waiting for the season to start' : now!.rest
    const sign = personSign(p, false)
    const best = [...S.SKILLS].sort((a, b) => p.skills[b] - p.skills[a])[0]
    const pulls = moodWhy(c, p)
    const keys = !ctx.touch()
    const place = ctx.view.unitPlace(p.id)
    return [
      h('header', { class: 'whois-head' },
        ringed(p, ring, 46),
        h('div', null,
          h('h2', { class: 't-head', id: 'whois-name', testid: 'whois-name' }, name),
          h('p', { class: 't-caption' }, farmer ? '농장주 · 모든 일, 품값 없음' : `${KIND_NAME[p.kind]}${p.traitName ? ` · ${p.traitName}` : ''}`)),
        h('button', { class: 'close', type: 'button', testid: 'whois-close', 'aria-label': `Close${keys ? ' (Escape)' : ''}`, onclick: () => app.selectUnit(-1) }, icon('close', 'i'))),
      h('div', { class: 'card-body', 'data-scroll': 'whois' },
      h('p', { class: 'whois-now', testid: 'whois-now' }, icon(now ? now.glyph : c.phase === 'cellar' ? 'winter' : 'idle', 'i'),
        h('span', null, h('b', null, now ? now.word : c.phase === 'cellar' ? '이번 겨울' : '봄'), ' ', h('span', { class: busy ? '' : 'quiet' }, detail))),
      // Where to look for them: on a machine they are its driver; off the land, indoors in the yard. Not said of
      // someone the line has at work in a field, which is where they are between days.
      place === 'machine' ? h('p', { class: 'whois-where quiet', testid: 'whois-where' }, icon('machine', 'i'), '운전 중이니 트랙터를 찾으세요.')
        : place === 'away' && c.phase !== 'cellar' && !(now && now.place >= 0 && busy) ? h('p', { class: 'whois-where quiet', testid: 'whois-where' }, icon('house', 'i'), '마당 실내에 있어 보이지 않습니다.') : null,
      h('dl', { class: 'whois-state' },
        h('div', null, h('dt', { class: p.tired >= S.HURT_TIRED ? 'c-red' : p.tired >= S.TIRED_SLOW_FROM ? 'c-ochre' : '' }, F.upper(p.tiredWord)),
          h('dd', null, sign?.glyph === 'hurt' ? `부상, ${F.date(c.year, p.hurtUntil, true)}에 복귀` : restWords(c, p))),
        h('div', null, h('dt', { class: p.quitIn >= 0 ? 'c-red' : p.mood < 0.45 ? 'c-ochre' : '' }, F.upper(p.moodWord)),
          h('dd', null, p.quitIn >= 0 ? `기분이 좋아지지 않으면 ${p.quitIn}일 후 그만둠` : pulls.length ? moodSaid(pulls.slice(0, 2)) : '뚜렷한 이유가 없음')),
        h('div', null, h('dt', null, '가장 잘함'), h('dd', null, `${SKILL_NAME[best]}, 10 중 ${p.skills[best]}`)),
        h('div', null, h('dt', null, '품값'), h('dd', { class: 'num' }, farmer ? '없음. 가족의 생활비는 연말에 나갑니다.' : `월 ${F.money(p.pay)}${p.foreman ? ', 작업반장' : ''}`))),
      // The work they take first: one press puts a kind of work first for them.
      c.phase === 'cellar' ? h('div', { class: 'whois-first', role: 'group', 'aria-label': `${name} this winter` },
        h('span', { class: 't-label' }, '이번 겨울'),
        S.winterInfo(c).people.find(x => x.id === p.id)?.choices.map(ch => h('button', {
          class: `btn${p.winter === ch.work ? ' is-on' : ''}`, type: 'button', testid: `whois-winter-${ch.work}`, 'aria-pressed': String(p.winter === ch.work), disabled: !ch.ok && p.winter !== ch.work, title: ch.why || undefined,
          onclick: () => run({ t: 'winter', unit: p.id, work: ch.work, field: ch.work === 'woods' ? S.timberTracts(c)[0] : undefined }, `${name}: 이번 겨울 ${WINTER_WORDS[ch.work]}.`),
        }, WINTER_WORDS[ch.work]))) : p.foreman ? null : h('div', { class: 'whois-first prio-first', role: 'group', 'aria-label': `${farmer ? '당신이' : S.iga(name)} 가장 먼저 하는 일` },
        h('span', { class: 't-label', title: keys ? `다른 무엇보다 먼저 하는 일입니다. 하나를 클릭해 가장 먼저 하게 하세요.` : undefined }, '최우선 일'),
        S.SKILLS.map(k => h('button', {
          class: `key-btn${p.prio[k] === 1 ? ' is-on' : ''}${p.prio[k] === 0 ? ' never' : ''}`, type: 'button', testid: `whois-first-${k}`, 'aria-pressed': String(p.prio[k] === 1),
          title: `${SKILL_NAME[k]} 먼저: ${skillCovers(k)}`,
          onclick: () => run({ t: 'priority', unit: p.id, work: k, level: 1 }, `${name}: ${SKILL_NAME[k]} 먼저.`),
        }, icon(SKILL_CUT[k], 'i'), h('span', { class: 'key-name' }, SKILL_SHORT[k]), h('span', { class: 'sr' }, ' 먼저')))),
      ),
      h('div', { class: 'card-foot' },
      restControl(ctx, c, p.id, 'whois-rest'),
      h('div', { class: 'whois-acts' },
        h('button', {
          class: `btn${ctx.view.followed() === p.id ? ' is-on' : ''}`, type: 'button', testid: 'whois-follow', 'aria-pressed': String(ctx.view.followed() === p.id),
          title: keys ? `카메라가 움직일 때까지 ${farmer ? '당신을' : '그 사람을'} 따라갑니다` : undefined,
          onclick: () => { const on = ctx.view.followed() === p.id; ctx.view.follow(on ? -1 : p.id); ctx.announce(on ? '따라가기를 멈췄습니다.' : `${farmer ? '당신을' : S.eulreul(name)} 따라갑니다. 카메라가 움직일 때까지 중심에 둡니다.`); ctx.dirty() },
        }, icon('scout', 'i'), ctx.view.followed() === p.id ? '따라가는 중' : '따라가기'),
        c.phase === 'season' && c.crew.length > 1 ? h('button', { class: 'btn', type: 'button', testid: 'whois-more', onclick: () => app.selectUnit(p.id, 'list') }, icon('people', 'i'), '자세히') : null,
        farmer ? null : h('button', {
          class: 'btn hazard', type: 'button', testid: 'whois-letgo',
          onclick: async () => {
            const yes = await confirmPaper(ctx, { title: `${firstName(p.name)}을(를) 내보낼까요?`, text: LET_GO_TEXT, yes: '내보내기', danger: true })
            if (!yes) return
            const r = ctx.run({ t: 'dismiss', unit: p.id })
            if (r.ok) { app.selectUnit(-1); ctx.announce(`${p.name}을(를) 내보냈습니다.`) }
          },
        }, icon('letgo', 'i'), '내보내기'))),
    ]
  }

  function update(): void {
    const c = app.campaign
    const p = open(c)
    el.classList.toggle('phone', phone())
    if (!p || !c) {
      card.hidden = true
      shownFor = -1
    } else {
      const was = card.hidden
      card.hidden = false
      patch(card, JSON.stringify([p, c.phase, c.season?.day, c.season?.jobs.map(j => [j.id, j.kind, j.field]), ctx.touch(), phone(), c.sundaysOff, ctx.view.followed(), c.crew.find(u => u.id === p.id)?.rest, ctx.view.unitPlace(p.id)]), () => body(c, p))
      card.setAttribute('aria-label', p.kind === 'farmer' ? 'You' : p.name)
      if (was || shownFor !== p.id) {
        shownFor = p.id
        ctx.announce(`${p.kind === 'farmer' ? 'You' : p.name}: ${doingWord(c, p, S.jobWaits(app.world, c))}.`)
        if (!ctx.reduced()) { card.classList.remove('in'); void card.offsetWidth; card.classList.add('in') }
      }
    }
    tied.card.update(card.hidden ? null : ties().unit())
    const t = c && app.screen !== 'title' ? app.thing : null
    tcard.hidden = !t
    if (t && c) {
      const w = thingWords(c, t.thing, ctx.touch())
      patch(tcard, JSON.stringify([t.thing, w, ctx.touch()]), () => [
        h('header', { class: 'whois-head' },
          h('span', { class: 'thing-ic' }, icon(w.glyph, 'i')),
          h('div', null, h('h2', { class: 't-head', id: 'thing-name', testid: 'thing-name' }, w.name), h('p', { class: 't-caption' }, w.line)),
          h('button', { class: 'close', type: 'button', testid: 'thing-close', 'aria-label': `Close${ctx.touch() ? '' : ' (Escape)'}`, onclick: () => app.inspect(null) }, icon('close', 'i'))),
        t.thing.kind === 'asking' && c.phase === 'plan' ? h('div', { class: 'whois-acts' }, h('button', { class: 'btn', type: 'button', testid: 'thing-hire', onclick: () => { app.inspect(null); openCrew(ctx) } }, icon('hire', 'i'), '고용하기')) : null,
        t.thing.holder >= 0 ? h('div', { class: 'whois-acts' }, h('button', { class: 'btn', type: 'button', testid: 'thing-holder', onclick: () => app.selectUnit(t.thing.holder, 'land') }, icon('people', 'i'), '누가 쓰는지 보기')) : null,
      ])
    }
    tied.thing.update(tcard.hidden ? null : ties().thing())
  }

  // On a phone the sheet covers the foot of the land: how much of it, so what is in hand is kept in view above it.
  function inset(): number {
    if (!phone()) return 0
    const up = [card, tcard].find(x => !x.hidden)
    return up ? innerHeight - up.getBoundingClientRect().top + 6 : 0
  }

  function frame(): void {
    const mode = phone() ? 'sheet' : 'float'
    tied.card.frame(mode)
    tied.thing.frame(mode)
    // Before the click: the name of the person or thing under the pointer, and a mark on the ground under a person.
    const pt = app.pointing
    const c = app.campaign
    let name = ''
    let at: { x: number; y: number; visible: boolean } | null = null
    if (pt && c && app.screen !== 'title' && !ctx.touch()) {
      if (pt.unit >= 0 && !(pt.unit === app.unit && !card.hidden)) {
        const nm = (id: number) => { const u = c.crew.find(x => x.id === id); return !u ? '' : u.kind === 'farmer' ? 'You' : firstName(u.name) }
        const p = c.crew.find(u => u.id === pt.unit)
        if (p) { name = pt.group && pt.group.length > 1 ? pt.group.map(nm).filter(Boolean).join(', ') : p.kind === 'farmer' ? 'You' : p.name; at = ctx.view.unitAnchor(pt.unit) }
      } else if (pt.thing && !(app.thing && app.thing.thing.kind === pt.thing.kind && app.thing.thing.k === pt.thing.k)) {
        name = thingWords(c, pt.thing).name
        at = ctx.view.thingAnchor(pt.thing)
      }
    }
    label.hidden = !name || !at?.visible
    if (!label.hidden && at) {
      if (label.textContent !== name) label.textContent = name
      label.style.transform = `translate3d(${(toLocal(at.x) + 24).toFixed(1)}px, ${(toLocal(at.y) - 44).toFixed(1)}px, 0)`
    }
    const foot = pt && pt.unit >= 0 && !label.hidden ? ctx.view.unitFoot(pt.unit) : null
    mark.hidden = !foot?.visible
    if (foot?.visible) mark.style.transform = `translate3d(${toLocal(foot.x).toFixed(1)}px, ${toLocal(foot.y).toFixed(1)}px, 0)`
  }

  const off = app.on(e => {
    // One card at a time: a field or a yard taken in hand puts a thing's name card away.
    if ((e.type === 'select' && app.selection.length > 0) || (e.type === 'yard' && e.yard !== 0)) app.inspect(null)
    if (e.type === 'unit' || e.type === 'inspect' || e.type === 'screen' || e.type === 'select' || e.type === 'yard') ctx.dirty()
  })

  return {
    el,
    update,
    frame,
    inset,
    escape() {
      if (!tcard.hidden) { app.inspect(null); return true }
      if (!card.hidden) { app.selectUnit(-1); return true }
      return false
    },
    dispose() { off(); el.remove() },
  }
}
