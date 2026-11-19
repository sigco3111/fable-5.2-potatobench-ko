// Winter's work (design/winter.html): a page of the time book, a line for each person with what they do until spring,
// then the yard, the mortgage and the buildings being raised.
import * as S from '../sim/index.ts'
import { type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { term } from './glossary.ts'
import { icon } from './icons.ts'
import { effectSays } from './money-words.ts'
import { fold, meter } from './system/parts.ts'
import { portrait } from './system/people.ts'
import { logsWanted } from './top.ts'

const WORK_LABEL: Record<S.WinterWork, string> = { off: '쉼', woods: '산벌', pack: '포장', build: '건축' }
const WORK_SKILL: Record<Exclude<S.WinterWork, 'off'>, S.Skill> = { woods: 'woods', pack: 'pack', build: 'build' }

// Months of winter work still to come, this one included.
function monthsLeft(c: S.Campaign): number {
  return Math.max(0, S.WINTER_MONTHS - c.month)
}

// Crew-days a month this person puts into their winter work, at their skill.
function monthly(c: S.Campaign, u: S.Unit, p: S.PersonInfo): number {
  if (u.winter === 'off') return 0
  return (u.kind === 'farmer' ? S.FARMER_WINTER_DAYS : S.WINTER_DAYS) * p.speed[WORK_SKILL[u.winter]]
}

// "by February", or "by spring" when it takes the whole winter or more.
function byMonth(c: S.Campaign, months: number): string {
  const m = c.month + Math.ceil(months) - 1
  return m < S.WINTER_MONTHS - 1 ? `${S.CELLAR_MONTHS[m]} 말까지` : '봄까지'
}

// What the winter's work comes to by spring, for this person, counted with everyone else on the same work.
function outcome(c: S.Campaign, u: S.Unit, people: S.PersonInfo[]): string {
  const left = monthsLeft(c)
  const pay = u.kind === 'farmer' ? '품값 없음' : `한 달 ${F.money(S.payOf(u))}`
  if (u.winter === 'off') return u.kind === 'farmer' ? '봄까지 쉽니다.' : '품값 없이 쉬고 봄에 돌아옵니다.'
  const crew = c.crew.filter(x => x.winter === u.winter && (u.winter !== 'woods' || x.winterField === u.winterField))
  const rate = crew.reduce((a, x) => a + monthly(c, x, people.find(y => y.id === x.id)!), 0)
  if (u.winter === 'woods') {
    const need = S.fellLeft(c, u.winterField)
    const logs = need > 0 ? Math.min(need, rate * left) / S.FELL_DAYS[c.fields[u.winterField].cover as 'woods' | 'brush'] * S.TIMBER[c.fields[u.winterField].cover as 'woods' | 'brush'] * S.fellYield(u) : 0
    const done = rate > 0 && rate * left >= need
    return `${S.FIELD_NAMES[u.winterField]}: ${done ? `${byMonth(c, need / rate)} 벌채 끝` : `봄까지 약 ${F.pct(Math.min(1, (rate * left) / Math.max(1, need)))} 벌채`}, 통나무 ${Math.round(logs)}적재분. ${pay}.`
  }
  if (u.winter === 'pack') {
    const cwt = Math.min(S.unpacked(c), rate * left * S.PACK_PER_DAY)
    return `봄까지 약 ${F.mass(cwt)} 포장, cwt당 ${F.money(S.PACK_CHARGE)}. ${pay}.`
  }
  const going = c.buildings.filter(b => !b.built && (b.yard === S.HOME_YARD || S.holdsDufour(c)))
  const need = going.reduce((a, b) => a + b.need - b.done, 0)
  const first = going[0]
  return `${first ? `${S.BUILDINGS[first.kind].name}${going.length > 1 ? ` 외 ${going.length - 1}개` : ''}` : '건축'}: ${rate > 0 && rate * left >= need ? `${byMonth(c, need / rate)} 완공` : `봄까지 인일 ${Math.round(rate * left)}/${Math.round(need)}일`}. ${pay}.`
}

// The words of a line, with what it is about in bold: "Home Woodlot: felled by ...".
function gets(text: string, work: S.WinterWork): Child {
  const at = text.indexOf(': ')
  if (work === 'off' || at < 0) return text
  return [h('b', null, text.slice(0, at + 1)), text.slice(at + 1)]
}

function personRow(ctx: Ctx, c: S.Campaign, u: S.Unit, p: S.PersonInfo, people: S.PersonInfo[], choices: S.WinterChoice[], shared: Set<string>): HTMLElement {
  const tracts = S.timberTracts(c)
  const set = (work: S.WinterWork, field?: number) => {
    if (u.winter === work && (work !== 'woods' || u.winterField === field)) return
    if (ctx.run({ t: 'winter', unit: u.id, work, field }).ok) ctx.dirty()
  }
  const name = u.kind === 'farmer' ? '당신' : u.name
  const homebody = u.trait === 'homebody'
  const best = S.bestSkill(p.skills)
  // Why a choice is voided, under the line; a reason that holds for everyone is said once under all the lines.
  const why = homebody ? [S.TRAITS.homebody.text] : voided(u, choices).filter(x => !shared.has(x))
  return h('li', { class: 'wrow', testid: `winter-${u.id}` },
    portrait(u, 46),
    h('p', { class: 'who' }, h('b', null, name), h('span', null, homebody ? S.TRAITS.homebody.name.toLowerCase() : term(`${best} ${p.skills[best]}`, 'skill'))),
    h('div', { class: 'seg', role: 'group', 'aria-label': u.kind === 'farmer' ? '당신의 겨울 일' : `${name}의 겨울 일` }, choices.map(ch => {
      const on = u.winter === ch.work
      return h('button', {
        class: 'btn', type: 'button', testid: `winter-${u.id}-${ch.work}`, 'aria-pressed': String(on), disabled: !ch.ok && !on,
        title: ch.why || (on ? undefined : effectSays(S.moneyEffect(ctx.app.world, c, { t: 'winter', unit: u.id, work: ch.work, field: ch.work === 'woods' ? tracts[0] : undefined })).replace(/^y/, 'Y') || undefined),
        onclick: () => set(ch.work, ch.work === 'woods' ? (u.winter === 'woods' ? tracts[(tracts.indexOf(u.winterField) + 1) % tracts.length] : tracts[0]) : undefined),
      }, WORK_LABEL[ch.work])
    })),
    h('p', { class: 'gets' }, gets(outcome(c, u, people), u.winter), why.length ? h('span', { class: 'quiet' }, ` ${why.join(' ')}`) : null))
}

function voided(u: S.Unit, choices: S.WinterChoice[]): string[] {
  return [...new Set(choices.filter(ch => !ch.ok && ch.work !== u.winter).map(ch => ch.why))]
}

// The yard's materials, with logs one press from the mill.
function yardPart(ctx: Ctx, c: S.Campaign): Child {
  const m = S.materialsInfo(c)
  const loads = Math.floor(m.logs)
  const mort = S.mortgageInfo(c)
  return h('section', { class: 'w-yard' },
    h('div', { class: 'sec-h' }, h('h2', null, '자재 마당')),
    m.logs >= 0.5 || m.stone >= 0.5 ? h('p', { class: 'yard-stock', testid: 'yard-materials' },
      h('span', null, icon('logs', 'i'), h('b', { class: 'num' }, F.num(Math.round(m.logs))), '적재분의 통나무'),
      h('span', null, icon('stone', 'i'), h('b', { class: 'num' }, F.num(Math.round(m.stone))), '적재분의 막돌'))
      : h('p', { class: 'yard-stock quiet' }, '마당에 통나무나 막돌이 없습니다.'),
    loads >= 1 && !m.sellWhy ? h('button', { class: 'btn', type: 'button', testid: 'sell-logs', onclick: () => { if (ctx.run({ t: 'sellLogs', loads }).ok) ctx.dirty() } },
      icon('sell', 'i'), `통나무 ${loads}적재분 팔기`, h('span', { class: 'sub num' }, F.money(loads * m.logPrice))) : null,
    loads >= 1 && !m.sellWhy && logsWanted(c) ? h('p', { class: 't-caption c-red', testid: 'logs-wanted' }, logsWanted(c)) : null,
    mort.owed > 0 ? h('p', { class: 't-caption w-mortgage', testid: 'winter-mortgage' },
      `땅에 ${F.money(mort.owed)}의 빚이 있습니다. 은행은 연말에 ${F.money(mort.principal + mort.interest)}을(를) 가져가며, 봄에 더 갚을 수 있습니다.`) : null)
}

// Buildings going up, each with how far along it is and who is on it; then what could be raised, folded.
function raisePart(ctx: Ctx, c: S.Campaign, raise: boolean, onRaise: () => void): Child {
  const info = S.buildingInfo(c)
  const up = info.filter(b => b.state === 'building')
  const rows = info.filter(b => b.state === 'none' && (b.yard === S.HOME_YARD || S.holdsDufour(c)))
  if (!up.length && !rows.length) return null
  const builders = c.crew.filter(u => u.winter === 'build').map(u => u.kind === 'farmer' ? '당신' : u.name)
  return h('section', { class: 'w-raise' },
    h('div', { class: 'sec-h' }, h('h2', null, '건물 짓기'), h('span', { class: 't-caption' }, '건축으로 지정한 사람들이 짓습니다')),
    up.length ? h('ul', { class: 'raise' }, up.map(b => h('li', { testid: `building-${b.kind}` },
      h('div', null,
        h('b', null, `${b.name}, ${b.yardName}`),
        h('p', { class: 'num' }, `${F.pct(b.progress)} · 인일 ${Math.ceil(b.daysLeft)}일 남음 · ${builders.length ? F.list(builders) : '작업 중인 사람 없음'}`)),
      meter(b.progress, { label: `${b.name} 완공`, text: `${F.pct(b.progress)}, 인일 ${Math.ceil(b.daysLeft)}일 남음` })))) : null,
    rows.length ? fold({
      icon: 'raise', name: `${rows.length}개 중 선택`,
      open: raise, controls: raise ? 'raise-list' : undefined, testid: 'raise-open', onclick: onRaise,
    }) : null,
    raise && rows.length ? h('ul', { class: 'raise', id: 'raise-list' }, rows.map(b => {
      const bought = [b.buyLogs > 0 ? `통나무 ${Math.ceil(b.buyLogs)}` : '', b.buyStone > 0 ? `막돌 ${Math.ceil(b.buyStone)}` : ''].filter(Boolean)
      return h('li', { testid: `raise-${b.kind}-${-b.yard}` },
        h('div', null,
          h('b', null, b.name, b.yard !== S.HOME_YARD ? `, ${b.yardName}` : ''),
          h('p', { class: 'num' }, `${F.money(b.cash)}, 통나무 ${b.logs}적재분, 막돌 ${b.stone}적재분${bought.length ? ` (${F.list(bought)} 구입)` : ''}, 인일 ${b.days}일. ${b.does}`),
          b.catch ? h('p', { class: 'c-ochre' }, b.catch) : null),
        h('button', {
          class: 'btn', type: 'button', testid: `build-${b.kind}-${-b.yard}`, disabled: !b.ok, title: b.why || undefined,
          onclick: () => { if (ctx.run({ t: 'build', kind: b.kind, yard: b.yard }).ok) ctx.dirty() },
        }, '짓기', h('span', { class: 'sub num' }, F.money(b.total))))
    })) : null)
}

// The whole of winter's work: the people's lines, then the yard and the buildings. raise: whether the list of
// buildings that could be raised is open. after: what follows them on the page.
export function winterWork(ctx: Ctx, c: S.Campaign, raise: boolean, onRaise: () => void, after: Child = null): HTMLElement {
  const w = S.winterInfo(c)
  const people = S.peopleInfo(c)
  const choicesOf = (u: S.Unit) => w.people.find(p => p.id === u.id)!.choices
  const workers = c.crew.filter(u => u.trait !== 'homebody')
  const lists = workers.map(u => voided(u, choicesOf(u)))
  const shared = new Set(workers.length > 1 ? lists[0].filter(x => lists.every(l => l.includes(x))) : [])
  return h('section', { class: 'w-work', 'aria-label': '겨울 일', testid: 'winter' },
    h('ul', { class: 'w-rows' }, c.crew.map(u => personRow(ctx, c, u, people.find(p => p.id === u.id)!, people, choicesOf(u), shared))),
    shared.size ? h('p', { class: 't-caption w-why' }, [...shared].join(' ')) : null,
    h('div', { class: 'winter-foot' }, yardPart(ctx, c), raisePart(ctx, c, raise, onRaise)),
    after)
}
