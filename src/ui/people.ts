// People (design/people.html): a page of the time book for one person, and the work grid with the farm's rules.
import * as S from '../sim/index.ts'
import { keepSprayedLine } from './spray-words.ts'
import { confirmPaper, EXIT_MS, patch, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { BLOCK_NAME } from './map.ts'
import { personNow } from './now.ts'
import * as R from './rules.ts'
import { tens } from './system/parts.ts'
import { portrait as bust, ringed, ringOf } from './system/people.ts'
import { nextGoal } from '../game/goals.ts'

// A head and shoulders in the colours the figure on the land wears: the system's portrait (src/ui/system/people.ts).
// Old screens size it with their own class.
export function portrait(who: { name: string }, cls = 'portrait'): SVGElement {
  return bust(who, 24, cls)
}

// What a person did on the last day worked, or null. Between days most hold no order, so this is what they are at.
function lastWorked(c: S.Campaign, id: number): { kind: S.JobKind; field: number } | null {
  const w = c.season?.worked.filter(x => x.unit === id) ?? []
  return w.length ? w[w.length - 1] : null
}

// What a person is doing, as a glyph and in words: as the time book says it (now.ts).
export function doingGlyph(c: S.Campaign, p: S.PersonInfo, waits: Record<number, string> = {}): string {
  return personNow(c, p.id, waits).glyph
}

export function doingText(c: S.Campaign, p: S.PersonInfo, waits: Record<number, string> = {}): string {
  return personNow(c, p.id, waits).line
}

// Whether someone stood idle through the last working day while orders they could take waited on the list: their
// priorities hold them back, or there was no tractor free.
export function idleWithWork(c: S.Campaign, p: S.PersonInfo, waits: Record<number, string>): boolean {
  const s0 = c.season
  if (!s0 || c.phase !== 'season' || s0.frozen || s0.day <= s0.startDay || p.job || p.travelling || p.foreman || p.hurtUntil >= 0 || !S.workday(c, s0)) return false
  if (lastWorked(c, p.id)) return false
  const u = c.crew.find(x => x.id === p.id)
  // An order someone else worked on the last day is theirs: one person holds an order at a time.
  const others = new Set(s0.worked.filter(w => w.unit !== p.id).map(w => `${w.kind}|${w.field}`))
  const held = new Set(c.crew.filter(x => x.id !== p.id).map(x => x.job))
  return !!u && s0.jobs.some(j => !waits[j.id] && !held.has(j.id) && (j.unit < 0 || j.unit === p.id) && S.willDo(u, j.kind) && !others.has(`${j.kind}|${j.field}`))
}

const SKILL_SHORT: Record<S.Skill, string> = { machine: '기계', field: '밭일', woods: '산일', build: '건축', pack: '포장' }
const SKILL_CUT: Record<S.Skill, string> = { machine: 'machine', field: 'field', woods: 'woods', build: 'hammer', pack: 'pack' }

// A person's ring, by the order they joined the farm.
function ringOfId(c: S.Campaign, id: number): string {
  return ringOf(Math.max(0, c.crew.findIndex(u => u.id === id)))
}

// The next wage a raise offers: what they asked, or a tenth more, to the nearest $10.
function raiseTo(p: S.PersonInfo): number {
  return p.wage < p.ask ? p.ask : Math.round(p.wage * 1.1 / 10) * 10
}

// A card or sheet that is laid down and taken away the way MOTION.md has it.
function layIn(ctx: Ctx, el: HTMLElement, was: boolean): void {
  if (was && !ctx.reduced()) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in') }
}
function takeAway(ctx: Ctx, el: HTMLElement): void {
  if (!el.hidden && !ctx.reduced()) {
    el.classList.add('out')
    setTimeout(() => { if (!el.classList.contains('out')) return; el.hidden = true; el.classList.remove('out') }, EXIT_MS)
  } else el.hidden = true
}

export interface PersonCard {
  el: HTMLElement
  update(c: S.Campaign, show: boolean): void
}

// How rested a person is, in words, with what follows from it: resting today, or slower, or a fall likelier.
export function restWords(c: S.Campaign, p: S.PersonInfo): string {
  const u = c.crew.find(x => x.id === p.id)
  if (u && S.resting(u) && c.phase === 'season') return u.rest === 'now' ? '회복될 때까지 쉬는 중' : '지쳐서 오늘 쉽니다'
  if (p.tired >= S.HURT_TIRED) return u?.rest === 'push' ? '지쳤지만 계속 일하는 중' : '지쳐서 내일 쉽니다'
  return p.tired >= S.TIRED_SLOW_FROM ? (p.kind === 'farmer' ? '쉬는 날이 필요합니다' : '쉬는 날이 필요함') : '일할 상태'
}

// What lifts a person's mood and what lowers it, in a line: "happy about a bed in the bunkhouse, unhappy about the pay".
export function moodSaid(why: { up: boolean; text: string }[]): string {
  const ups = why.filter(x => x.up).map(x => x.text), downs = why.filter(x => !x.up).map(x => x.text)
  return [ups.length ? `${F.list(ups)}에 만족` : '', downs.length ? `${F.list(downs)}에 불만` : ''].filter(Boolean).join(', ')
}

// When a person rests: by themselves once worn out (the farm's way unless told), now until fresh, or never.
export function restControl(ctx: Ctx, c: S.Campaign, id: number, testid: string): HTMLElement | null {
  const u = c.crew.find(x => x.id === id)
  if (!u || c.phase !== 'season') return null
  const mode = u.rest ?? 'auto'
  const name = u.kind === 'farmer' ? '당신' : R.firstName(u.name)
  const will = name === '당신' ? '당신은' : `${name}은(는)`
  const opt = (m: S.RestMode, word: string, tip: string, said: string) => h('button', {
    class: `btn${mode === m ? ' is-on' : ''}`, type: 'button', testid: `${testid}-${m}`, 'aria-pressed': String(mode === m), title: ctx.touch() ? undefined : tip,
    onclick: () => { const r = ctx.run({ t: 'rest', unit: id, mode: m }); if (r.ok) ctx.announce(`${will} ${said}.`) },
  }, word)
  return h('div', { class: 'rest-keys', role: 'group', 'aria-label': `${name}의 휴식 방식`, testid },
    h('span', { class: 't-label' }, '휴식'),
    opt('auto', '지치면 쉼', '지치면 알아서 하루 쉬고 다시 일합니다.', '지치면 쉽니다'),
    opt('now', '지금 쉼', '회복될 때까지 쉽니다.', '회복될 때까지 쉽니다'),
    opt('push', '쉬지 않음', '지쳐도 계속 일하는데, 느려지고 다칠 가능성이 커집니다.', '지쳐도 계속 일합니다'))
}

// ---------------------------------------------------------------- spraying this season, asked once

export type SprayWay = 'auto' | 'ask' | 'none'
// What the player chose for spraying this season, if asked yet (the simulation keeps it).
export function sprayWay(c: S.Campaign): SprayWay | null {
  return S.sprayWayNow(c)
}

// When blight weather first comes the player is asked once how spraying is to be done this season, on the telegram
// card with its three numbered replies (incident.ts), the clock stopped: kept up by the crew by itself (with about
// what it costs), asked each time, or not this year. It is asked again from Who does what and from a field's card.
let sprayOpen = false
export function askSpray(ctx: Ctx): void { sprayOpen = true; ctx.dirty() }
export function sprayAsking(): boolean { return sprayOpen }
export function putSprayAway(ctx: Ctx): boolean { if (!sprayOpen) return false; sprayOpen = false; ctx.dirty(); return true }

export const SPRAY_WAYS: { id: SprayWay; glyph: string; name: string }[] = [
  { id: 'auto', glyph: 'spray', name: '밭에 계속 살포' },
  { id: 'ask', glyph: 'ask', name: '매번 물어보기' },
  { id: 'none', glyph: 'close', name: '올해는 하지 않음' },
]

export function sprayDoes(ctx: Ctx, c: S.Campaign, way: SprayWay): string {
  if (way === 'ask') return '살포가 필요한 밭에 도장이 뜨고, 당신이 지시합니다.'
  if (way === 'none') return '살포하지 않고, 도장도 뜨지 않습니다. 역병이 오면 막을 수 없습니다.'
  return keepSprayedLine(ctx.app.world, c)
}

export function answerSpray(ctx: Ctx, c: S.Campaign, way: SprayWay): void {
  const r = sprayWay(c) === way ? { ok: true } : ctx.run({ t: 'sprayWay', way })
  if (r.ok) ctx.announce(way === 'auto' ? '작업반이 자동으로 밭에 살포를 유지합니다.' : way === 'ask' ? '밭에 살포가 필요할 때마다 물어봅니다.' : '올해는 살포하지 않습니다.')
  putSprayAway(ctx)
}

// Asked for from outside the card (a tutorial note's Show me): the foreman's key, brought into view and lit.
let foremanAsked = -1e9
export function showForemanKey(): void { foremanAsked = performance.now() }

export function personCard(ctx: Ctx): PersonCard {
  const app = ctx.app
  const el = h('section', { class: 'person-card sheet sys', testid: 'person-card', 'aria-label': '사람', hidden: true })
  let foreman = false
  let shownFor = -1
  let flashed: { text: string; until: number } | null = null
  const FOREMAN_KEY = '[data-testid="person-foreman"]'
  // A control of the foreman's ringed for a few seconds, through every redraw of the card. The key, its choices and
  // its answer are in the card's pinned foot, so they are in view without scrolling.
  let lit: { sel: string; until: number } | null = null
  function lightUp(sel: string): void {
    const mine = lit = { sel, until: performance.now() + 4000 }
    setTimeout(() => ctx.dirty(), 4050)
    ctx.dirty()
    // Under the keyboard once the card has drawn it.
    requestAnimationFrame(() => requestAnimationFrame(() => { if (lit === mine) el.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true }) }))
  }
  function showLit(): void {
    for (const k of el.querySelectorAll('.goal-ring')) if (!lit || performance.now() >= lit.until || !k.matches(lit.sel)) k.classList.remove('goal-ring')
    if (!lit || performance.now() >= lit.until) { lit = null; return }
    el.querySelector<HTMLElement>(lit.sel)?.classList.add('goal-ring')
  }
  // Naming a foreman, or sending one back to the fields: said on the card (its key, and the line under it), and as
  // a note where the player is looking; the key stays in view.
  function nameForeman(p: S.PersonInfo, block: S.BlockId | null): void {
    foreman = false
    const r = app.do({ t: 'foreman', unit: p.id, block })
    if (!r.ok) { flash(r.err); return }
    ctx.say(F.localize(r.events[0]?.text ?? ''), 'good')
    lightUp(FOREMAN_KEY)
  }

  function flash(text: string): void {
    flashed = { text: F.localize(text), until: performance.now() + 5000 }
    ctx.announce(flashed.text)
    setTimeout(() => ctx.dirty(), 5100)
  }

  function run(cmd: S.Cmd, said?: string): boolean {
    const r = app.do(cmd)
    if (!r.ok) { flash(r.err); return false }
    if (said) ctx.announce(said)
    return true
  }

  function setPrio(p: S.PersonInfo, skill: S.Skill, level: number): void {
    if (p.prio[skill] === level) return
    run({ t: 'priority', unit: p.id, work: skill, level }, `${R.firstName(p.name)}, ${S.SKILL_LABEL[skill]}: ${R.prioWord(level)}.`)
  }

  function prioKey(e: KeyboardEvent, p: S.PersonInfo, skill: S.Skill): void {
    const k = e.key
    if (/^[0-4]$/.test(k)) { e.preventDefault(); e.stopPropagation(); setPrio(p, skill, Number(k)) }
    else if (k === 'ArrowRight' || k === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setPrio(p, skill, R.prioNext(p.prio[skill])) }
    else if (k === 'ArrowLeft' || k === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setPrio(p, skill, R.prioNext(p.prio[skill], true)) }
  }

  function body(c: S.Campaign, p: S.PersonInfo): Child {
    const farmer = p.kind === 'farmer'
    const why = R.moodWhy(c, p)
    const heading = R.moodHeading(c, p)
    const blocks = S.BLOCKS.filter(b => S.PARCELS.some((x, i) => x.block === b && S.held(c, i)))
    const waits = S.jobWaits(app.world, c)
    const doing = doingText(c, p, waits)
    const tiredWhy = R.tiredWhy(c, p)
    const best = Math.max(...S.SKILLS.map(k => p.skills[k]))
    const tiredCls = p.tired >= S.HURT_TIRED ? 'c-red' : p.tired >= S.TIRED_SLOW_FROM ? 'c-ochre' : ''
    const moodCls = p.quitIn >= 0 ? 'c-red' : p.mood < 0.45 ? 'c-ochre' : ''
    return [
      h('header', { class: 'pc-head' },
        ringed(p, ringOfId(c, p.id), 64),
        h('div', null,
          farmer ? null : h('p', { class: 't-label', testid: 'person-kind' }, p.foreman ? `작업반장, ${S.BLOCK_NAME[p.foreman]}` : R.KIND_NAME[p.kind]),
          h('h2', { class: 't-title pc-name', testid: 'person-name' }, farmer ? '당신, 농장주' : p.name),
          h('p', { class: 'pc-trait' }, farmer ? h('span', { class: 'quiet' }, '모든 일을 하고 품값을 받지 않습니다.') : [h('b', null, `${p.traitName}:`), ' ', h('span', { class: 'quiet' }, p.traitText.replace(/^./, x => x.toLowerCase()))])),
        h('span', { class: 'pc-tools' },
          h('button', { class: 'iconbtn', type: 'button', testid: 'person-show', 'aria-label': farmer ? '농장에서 당신 찾기' : '농장에서 이 사람 찾기', title: ctx.touch() ? undefined : farmer ? '농장에서 당신 찾기' : '농장에서 이 사람 찾기', onclick: () => { app.selectUnit(p.id, 'land'); ctx.view.follow(p.id) } }, icon('scout', 'i')),
          h('button', { class: 'close', type: 'button', testid: 'person-close', 'aria-label': `닫기${ctx.touch() ? '' : ' (Escape)'}`, onclick: () => app.selectUnit(-1) }, icon('close', 'i')))),
      h('div', { class: 'card-body', 'data-scroll': 'person' },
      h('p', { class: 'pc-doing', testid: 'person-doing' }, icon(doingGlyph(c, p, waits), 'i'), h('span', null, doing)),
      h('table', { class: 'skills' },
        h('caption', { class: 'sr' }, '10점 만점 기술과 각 일의 우선순위. 1이 가장 먼저, 빗금은 절대 안 함.'),
        h('tbody', null, S.SKILLS.map(k => {
          const lvl = p.skills[k]
          const pr = p.prio[k]
          return h('tr', { class: lvl === best && best >= 5 ? 'best' : '', k: `skill-${k}` },
            h('th', { scope: 'row', title: ctx.touch() ? undefined : R.skillCovers(k) }, icon(SKILL_CUT[k], 'i'), SKILL_SHORT[k]),
            h('td', { class: 'lv num' }, String(lvl)),
            h('td', null, tens(lvl, lvl < S.SKILL_MAX ? p.progress[k] : 0, { best: lvl === best && best >= 5, label: `${R.SKILL_NAME[k]}: ${lvl}레벨${lvl < S.SKILL_MAX ? `, ${lvl + 1}레벨까지 ${F.pct(p.progress[k])}` : ''}` })),
            h('td', { class: 'pr' }, h('button', {
              class: `prio key${pr === 0 ? ' never' : ''}${pr === 1 ? ' first' : ''}`, type: 'button', testid: `prio-${k}`,
              title: ctx.touch() ? undefined : `${R.skillCovers(k)}. 1이 가장 먼저, 빗금은 절대 안 함. 클릭하면 올라가고, 오른쪽 클릭하면 내려갑니다.`,
              onclick: () => setPrio(p, k, R.prioNext(pr, true)),
              oncontextmenu: (e: Event) => { e.preventDefault(); setPrio(p, k, R.prioNext(pr)) },
              onkeydown: (e: Event) => prioKey(e as KeyboardEvent, p, k),
            }, h('span', { class: 'sr' }, `${R.SKILL_NAME[k]} 우선순위 `), R.prioMark(pr),
            h('span', { class: 'sr' }, `: ${R.prioWord(pr)}. 누르면 ${R.prioWord(R.prioNext(pr, true))}. ${R.skillCovers(k)}.`))))
        }))),
      h('dl', { class: 'state' },
        h('div', { testid: 'person-tired' }, h('dt', { class: tiredCls }, F.upper(p.tiredWord)), h('dd', null, p.tired >= S.TIRED_SLOW_FROM ? `${F.upper(restWords(c, p))}.${tiredWhy ? ` ${tiredWhy}` : ''}` : tiredWhy || '충분히 쉬었습니다.')),
        h('div', { testid: 'person-mood' }, h('dt', { class: moodCls }, `${F.upper(p.moodWord)}${heading ? `, ${heading === 'rising' ? '좋아지는 중' : '나빠지는 중'}` : ''}`),
          h('dd', null, p.quitIn >= 0 ? `기분이 좋아지지 않으면 ${p.quitIn}일 안에 그만둡니다.` : why.length ? F.upper(`${moodSaid(why)}.`) : p.kind === 'farmer' ? '당신을 괴롭히는 것이 없습니다.' : '이 사람을 괴롭히는 것이 없습니다.')),
        p.hurtUntil >= 0 ? h('div', null, h('dt', { class: 'c-red' }, '부상'), h('dd', null, `${F.date(c.year, p.hurtUntil)}에 돌아옵니다.`)) : null),
      flashed && performance.now() < flashed.until ? h('p', { class: 'pc-flash c-red', role: 'status' }, flashed.text) : null),
      h('div', { class: 'card-foot' },
      restControl(ctx, c, p.id, 'person-rest'),
      farmer ? h('p', { class: 'pay quiet it' }, '당신은 품값을 받지 않습니다. 가족의 생활비는 연말에 나갑니다.') : [
        h('p', { class: 'pay lead' }, h('span', null, h('b', { class: 'num' }, F.money(p.pay)), ` 월${p.foreman ? ', 작업반장' : ''}`), h('span', { class: 'dots' }), p.ask ? h('span', { class: 'quiet num' }, `요구액 ${F.money(p.ask)}`) : null),
        h('div', { class: 'pc-actions' },
          h('button', {
            class: 'btn', type: 'button', testid: 'person-raise', title: ctx.touch() ? undefined : '요구한 것보다 10% 더 줄 때마다 기분이 1할쯤 올라갑니다.',
            onclick: () => run({ t: 'raise', unit: p.id, wage: raiseTo(p) }, `${R.firstName(p.name)}의 품값이 월 ${F.money(raiseTo(p))}이(가) 됐습니다.`),
          }, icon('raise', 'i'), h('span', null, '올려주기', h('span', { class: 'sub num' }, `${F.money(raiseTo(p))}(으)로`))),
          blocks.length ? h('button', {
            class: `btn${foreman ? ' is-on' : ''}`, type: 'button', testid: 'person-foreman', 'aria-expanded': String(foreman),
            title: ctx.touch() ? undefined : '작업반장은 일하는 아침마다 한 구역의 밭에 필요한 일을 작업 목록에 올리고, 밭일은 하지 않습니다. 품값은 40% 더 받습니다.',
            // Its choices open under it, brought into view with the first one lit.
            onclick: () => { foreman = !foreman; if (foreman) lightUp('.pc-blocks .btn'); else lit = null; ctx.dirty() },
          }, icon('foreman', 'i'), h('span', null, '작업반장', p.foreman ? h('span', { class: 'sub' }, BLOCK_NAME[p.foreman].replace(/^The /, '').split(',')[0]) : h('span', { class: 'sub' }, h('span', null, '품값 +40%,'), ' ', h('span', null, '밭일 안 함')))) : h('span'),
          h('button', {
            class: 'btn hazard', type: 'button', testid: 'person-dismiss',
            onclick: async () => {
              const yes = await confirmPaper(ctx, { title: `${R.firstName(p.name)}을(를) 보낼까요?`, text: R.LET_GO_TEXT, yes: '보내기', danger: true })
              if (yes && run({ t: 'dismiss', unit: p.id }, `${p.name}을(를) 보냈습니다.`)) app.selectUnit(-1)
            },
          }, icon('letgo', 'i'), h('span', null, '보내기', h('span', { class: 'sub' }, '오늘')))),
        p.foreman && !foreman ? h('p', { class: 'pc-fore', role: 'status', testid: 'foreman-said' }, icon('foreman', 'i'),
          h('span', null, `${S.BLOCK_NAME[p.foreman]}의 작업반장. ${R.firstName(p.name)}은(는) 매일 아침 그 밭들의 일을 작업 목록에 올리고 밭일은 하지 않습니다.`)) : null,
        foreman ? h('div', { class: 'pc-blocks', role: 'group', 'aria-label': '작업반장 구역' },
          h('p', { class: 'pc-fore', testid: 'foreman-what' }, h('span', null, `작업반장은 매일 아침 한 구역의 밭 일을 대신 작업 목록에 올려줍니다. 집에서 먼 밭까지 농사지으면 그 값을 합니다. ${R.firstName(p.name)}은(는) 품값이 40% 오르고 밭일을 그만합니다. 구역을 고르세요.`)),
          blocks.map(b => {
            const other = c.crew.find(u => u.foreman === b && u.id !== p.id)
            return h('button', {
              class: 'btn', type: 'button', testid: `foreman-${b}`, 'aria-pressed': String(p.foreman === b), disabled: !!other,
              title: other ? `${other.name}이(가) 이미 그곳의 작업반장입니다` : undefined,
              onclick: () => nameForeman(p, b),
            }, BLOCK_NAME[b].replace(/^The /, '').split(',')[0])
          }),
          p.foreman ? h('button', { class: 'btn', type: 'button', testid: 'foreman-none', onclick: () => nameForeman(p, null) }, '밭일로 복귀') : null) : null,
      ]),
    ]
  }

  function update(c: S.Campaign, show: boolean): void {
    const p = show ? S.peopleInfo(c).find(x => x.id === app.unit) : undefined
    if (!p) {
      takeAway(ctx, el)
      shownFor = -1
      foreman = false
      return
    }
    const was = el.hidden === true || el.classList.contains('out')
    el.classList.remove('out')
    el.hidden = false
    // Opened while the goal slip asks for a foreman: the key is brought into view, lit.
    const hand = p.kind !== 'farmer' && !p.foreman
    const asked = hand && (performance.now() - foremanAsked < 2000 || (shownFor !== p.id && nextGoal(c)?.id === 'foreman'))
    if (shownFor !== p.id) { shownFor = p.id; foreman = false; flashed = null; lit = null }
    if (asked) { foremanAsked = -1e9; lightUp(FOREMAN_KEY) }
    const s0 = c.season
    const model = {
      p, day: s0?.day, t: ctx.touch(), foreman, lit: lit && performance.now() < lit.until ? lit.sel : '', flash: flashed && performance.now() < flashed.until ? flashed.text : '',
      jobs: s0?.jobs.map(j => [j.id, j.unit]), crew: c.crew.map(u => [u.id, u.at, u.to, u.job, u.foreman, u.rest]), sun: c.sundaysOff,
    }
    patch(el, JSON.stringify(model), () => body(c, p))
    el.setAttribute('aria-label', p.kind === 'farmer' ? '당신, 농장주' : p.name)
    layIn(ctx, el, was)
    showLit()
  }

  return { el, update }
}

// ---------------------------------------------------------------- the work grid

export interface WorkGrid {
  el: HTMLElement
  update(c: S.Campaign): void
  toggle(on?: boolean): void
  isOpen(): boolean
}

export function workGrid(ctx: Ctx): WorkGrid {
  const app = ctx.app
  const el = h('section', { class: 'work sheet sys grid-panel', testid: 'work-grid', 'aria-labelledby': 'grid-title', hidden: true })
  let open = false
  let at = { row: 0, col: 0 }
  let note = ''

  function set(id: number, skill: S.Skill, level: number, name: string): void {
    const r = app.do({ t: 'priority', unit: id, work: skill, level })
    if (!r.ok) { note = F.localize(r.err); ctx.announce(note); ctx.dirty(); return }
    note = ''
    ctx.announce(`${name}, ${S.SKILL_LABEL[skill]}: ${R.prioWord(level)}.`)
  }

  function focusCell(): void {
    requestAnimationFrame(() => el.querySelector<HTMLElement>(`[data-cell="${at.row}-${at.col}"]`)?.focus({ preventScroll: true }))
  }

  function key(e: KeyboardEvent, people: S.PersonInfo[], row: number, col: number): void {
    const p = people[row]
    const skill = S.SKILLS[col]
    const k = e.key
    const move = (dr: number, dc: number) => {
      at = { row: Math.max(0, Math.min(people.length - 1, row + dr)), col: Math.max(0, Math.min(S.SKILLS.length - 1, col + dc)) }
      ctx.dirty()
      focusCell()
    }
    if (k === 'ArrowRight') move(0, 1)
    else if (k === 'ArrowLeft') move(0, -1)
    else if (k === 'ArrowDown') move(1, 0)
    else if (k === 'ArrowUp') move(-1, 0)
    else if (/^[0-4]$/.test(k)) set(p.id, skill, Number(k), R.firstName(p.name))
    else if (k === 'Delete' || k === 'Backspace' || k === '-') set(p.id, skill, 0, R.firstName(p.name))
    else if (k === 'Home') move(0, -col)
    else if (k === 'End') move(0, S.SKILLS.length - 1 - col)
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  // The farm's rules, under the grid: each a box ticked in pencil, with what it costs and what it gives.
  function rules(c: S.Campaign): Child {
    const l = S.labourInfo(c)
    const pickFrom = F.date(c.year, S.dayIndex(c.year, S.PICKERS_FROM.month, S.PICKERS_FROM.dom), true)
    const pickTo = F.date(c.year, S.dayIndex(c.year, S.PICKERS_TO.month, S.PICKERS_TO.dom), true)
    const rule = (testid: string, on: boolean, name: string, why: string, ok = true) => h('button', {
      class: 'check rule', type: 'button', testid, 'aria-pressed': String(on), disabled: !ok,
      onclick: () => { const r = ctx.run(testid === 'rule-sundays' ? { t: 'sundays', off: !l.sundaysOff } : { t: 'pickers', on: !l.pickers.on }); if (r.ok) ctx.announce(F.localize(r.events[0]?.text ?? '')) },
    }, h('i', { class: `tick${on ? ' on' : ''}`, 'aria-hidden': 'true' }), h('span', null, h('b', null, name), ' ', h('span', { class: 'quiet' }, why)))
    // Which jobs the crew puts on the list by itself, and which wait for the player.
    const routine = S.routineInfo(c)
    const sprayCost = c.phase === 'season' && c.season && !routine.some(r => r.kind === 'spray' && r.auto) ? Math.round(S.sprayOutlook(ctx.app.world, c).dollars / 100) * 100 : 0
    return h('div', { class: 'farm-rules', role: 'group', 'aria-label': '농장 규칙' },
      routine.length ? h('div', { class: 'routine', role: 'group', 'aria-label': '묻지 않고 작업반이 하는 일' },
        h('p', { class: 't-label' }, '자동, 또는 물어보기'),
        c.season && c.season.watchDay >= 0 ? h('button', { class: 'btn quiet spray-again', type: 'button', testid: 'spray-ask-open', onclick: () => askSpray(ctx) },
          icon('spray', 'i'), '올해 살포: ', h('b', null, sprayWay(c) === 'auto' ? '계속 살포' : sprayWay(c) === 'none' ? '올해 안 함' : '물어보기'), h('span', { class: 'quiet' }, ' · 바꾸기')) : null,
        h('div', { class: 'routine-keys' }, routine.map(r => h('button', {
          class: `btn${r.auto ? ' is-on' : ''}`, type: 'button', testid: `routine-${r.kind}`, 'aria-pressed': String(r.auto),
          title: ctx.touch() ? undefined : r.auto ? `${R.JOB_VERB[r.kind]}: 작업반이 알아서 작업 목록에 올립니다. 누르면 물어보는 쪽으로 바뀝니다.` : `${R.JOB_VERB[r.kind]}: 당신의 지시를 기다립니다. 누르면 작업반이 알아서 합니다.`,
          onclick: () => { const res = ctx.run({ t: 'routine', kind: r.kind as S.RoutineKind, auto: !r.auto }); if (res.ok) ctx.announce(`${R.JOB_VERB[r.kind]}: ${r.auto ? '물어보기' : '자동'}.`) },
        }, icon(r.kind, 'i'), R.JOB_VERB[r.kind], h('span', { class: 'sub' }, r.auto ? '자동' : r.kind === 'kill' ? '당신이 정하지만 작업반이 기한 일주일 뒤에 함'
            // (what keeping the fields sprayed would come to, before the press: a player threw the switch and saw $4,800 leave the year-end figure)
            : r.kind === 'spray' && sprayCost > 0 ? `물어보기 · 자동이면 이번 시즌 약 ${F.money(sprayCost)}` : '물어보기'))))) : null,
      rule('rule-sundays', l.sundaysOff, '일요일 휴식', l.sundaysOff ? '모두가 주에 하루 쉽니다. 일요일에 일하면 하루를 벌지만 모두가 지칩니다.' : '일요일에도 일해 주에 하루를 더 벌지만 모두가 지칩니다.'),
      // Pickers come forward a few weeks before the harvest break, when they can be thought about.
      l.pickers.ok || l.pickers.on || pickersNear(c)
        ? rule('rule-pickers', l.pickers.on, '학생 일꾼', `일한 날마다 ${F.money(l.pickers.perDay)}, 모든 캐기가 ${F.pct(l.pickers.digFaster - 1)} 빨라집니다. 학교가 쉬는 ${pickFrom}부터 ${pickTo}까지.`, l.pickers.ok || l.pickers.on) : null)
  }

  function pickersNear(c: S.Campaign): boolean {
    const s0 = c.season
    return !!s0 && c.phase === 'season' && s0.day >= S.dayIndex(s0.year, S.PICKERS_FROM.month, 1) && s0.day <= S.dayIndex(s0.year, S.PICKERS_TO.month, S.PICKERS_TO.dom)
  }

  function body(c: S.Campaign): Child {
    const people = S.peopleInfo(c)
    if (at.row >= people.length) at = { row: people.length - 1, col: at.col }
    return [
      h('header', { class: 'command-head work-head' },
        h('div', null, h('h2', { class: 't-title', id: 'grid-title' }, '누가 무엇을 하나'), h('p', { class: 't-caption', testid: 'grid-how' }, `1이 가장 먼저, 빗금은 절대 안 함. ${ctx.touch() ? '눌러서 일을 올리세요' : '클릭하면 올라가고, 오른쪽 클릭하면 내려가고, 숫자를 눌러도 됩니다'}. 막대는 기술을 보여줍니다.`)),
        h('button', { class: 'close', type: 'button', testid: 'grid-close', 'aria-label': `누가 무엇을 하나 닫기${ctx.touch() ? '' : ' (G)'}`, onclick: () => toggle(false) }, icon('close', 'i'))),
      h('div', { class: 'grid-scroll', 'data-scroll': 'grid' },
        h('table', { class: 'grid', role: 'grid', 'aria-labelledby': 'grid-title' },
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, h('span', { class: 'sr' }, '사람')),
            S.SKILLS.map(k => h('th', { scope: 'col', title: ctx.touch() ? undefined : R.skillCovers(k) }, icon(SKILL_CUT[k], 'i'), h('span', { class: 't-label' }, SKILL_SHORT[k]))))),
          h('tbody', null, people.map((p, row) => h('tr', { class: `${p.foreman ? 'foreman' : ''}${app.unit === p.id ? ' is-picked' : ''}`.trim(), k: `row-${p.id}` },
            h('th', { scope: 'row' },
              h('button', { class: 'w-who', type: 'button', testid: `grid-person-${p.id}`, tabindex: '-1', onclick: () => { app.selectUnit(p.id) } },
                ringed(p, ringOfId(c, p.id), 28), h('span', null, R.firstName(p.name)))),
            p.foreman ? h('td', { colspan: S.SKILLS.length, class: 'w-foreman' }, `${S.BLOCK_NAME[p.foreman]}의 작업반장이라 밭일은 하지 않음`)
              : S.SKILLS.map((k, col) => {
                const lvl = p.skills[k]
                const pr = p.prio[k]
                const here = at.row === row && at.col === col
                return h('td', { role: 'gridcell' }, h('button', {
                  class: `cell${pr === 0 ? ' never' : ''}${pr === 1 ? ' first' : ''}`, type: 'button', style: `--sk:${lvl}`, testid: `cell-${p.id}-${k}`, 'data-cell': `${row}-${col}`, tabindex: here ? '0' : '-1',
                  onclick: () => { at = { row, col }; set(p.id, k, R.prioNext(pr, true), R.firstName(p.name)) },
                  oncontextmenu: (e: Event) => { e.preventDefault(); at = { row, col }; set(p.id, k, R.prioNext(pr), R.firstName(p.name)) },
                  onkeydown: (e: Event) => key(e as KeyboardEvent, people, row, col),
                  onfocus: () => { if (at.row !== row || at.col !== col) { at = { row, col }; ctx.dirty() } },
                }, h('span', { class: 'sr' }, `${R.firstName(p.name)}, ${S.SKILL_LABEL[k]}, 기술 ${lvl}, 우선순위 `), h('span', { class: 'num' }, R.prioMark(pr)),
                h('span', { class: 'sr' }, `, ${R.prioWord(pr)}`)))
              })))))),
      note ? h('p', { class: 'pc-flash c-red', role: 'status' }, note) : null,
      rules(c),
    ]
  }

  function update(c: S.Campaign): void {
    if (!open) { if (!el.hidden) takeAway(ctx, el); return }
    const was = el.hidden === true || el.classList.contains('out')
    el.classList.remove('out')
    el.hidden = false
    const l = S.labourInfo(c)
    patch(el, JSON.stringify([c.crew.map(u => [u.id, u.name, u.prio, u.skills, u.foreman]), at, note, l.sundaysOff, l.pickers, ctx.touch(), app.unit, c.routine]), () => body(c))
    layIn(ctx, el, was)
  }

  function toggle(on = !open): void {
    if (on === open) return
    open = on
    note = ''
    ctx.dirty()
    if (on) focusCell()
  }

  return { el, update, toggle, isOpen: () => open }
}
