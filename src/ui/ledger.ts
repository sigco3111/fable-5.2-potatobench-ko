// Year end (design/ledger.html): the account book, open over the land. The money and the people on its left page,
// what the farm is worth, its crop beside the neighbor's, its cash and its goals on the right. The two occasions (the
// farm kept after five seasons, the farm lost) and the end are the same book: the years as rows, the cash at each
// year end as an ink line, what was built. On a phone the book shows one page at a time.
import * as S from '../sim/index.ts'
import { count, patch, type Ctx, type Screen } from './core.ts'
import { h, s, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { term } from './glossary.ts'
import { icon } from './icons.ts'
import { verdictSays, yearWalk } from './money-words.ts'
import { soilWord, varietyName, yearName, yearShort, yearSpan, yearWord } from './rules.ts'
import { goals, nextGoal } from '../game/goals.ts'
import { startNewFarm } from './title.ts'
import { openForeman } from './spring.ts'
import { light, topBar } from './top.ts'
import { againstUsual } from './usual-year.ts'
import { fist, stamp } from './system/parts.ts'
import { portrait } from './system/people.ts'

const phoneLike = (ctx: Ctx) => ctx.layout() === 'narrow' || ctx.layout() === 'short'

// ---------------------------------------------------------------- the left page: the cash book

// A line of the cash book: money in on the left column, money out on the right, in red.
function cashLine(label: Child, v: number, o: { testid?: string; always?: boolean; none?: boolean } = {}): HTMLElement | null {
  if (!v && !o.always) return null
  const figure = o.none ? h('span', { class: 'it quiet' }, '없음') : F.num(Math.abs(Math.round(v)))
  return h('tr', { testid: o.testid },
    h('th', { scope: 'row' }, label),
    h('td', { class: 'm num' }, v >= 0 || o.none ? figure : null),
    h('td', { class: 'm num out' }, v < 0 && !o.none ? figure : null))
}


function cashBook(y: S.YearSummary, lost: boolean): HTMLElement {
  const rest = y.restIncome ?? 0
  const storage = y.storage ?? 0
  const contracts = y.contracts ?? 0
  const wages = y.wages ?? 0, rent = y.rent ?? 0, land = y.land ?? 0, penalties = y.penalties ?? 0
  const logs = y.logs ?? 0, stand = y.stand ?? 0, mortgage = y.mortgage ?? 0, works = y.works ?? 0, building = y.building ?? 0, packing = y.packing ?? 0
  const sold = y.cwtSold >= 0.5
  return h('table', { class: 'cashbook' },
    h('caption', { class: 'sr' }, `돈, ${yearWord(y.year)}`),
    h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, h('span', { class: 't-label' }, '돈')),
      h('th', { scope: 'col', class: 'm' }, h('span', { class: 't-label' }, '들어옴')),
      h('th', { scope: 'col', class: 'm' }, h('span', { class: 't-label' }, '나감')))),
    h('tbody', null,
      cashLine('연초 현금', y.cashStart, { always: true }),
      cashLine(contracts ? '시장 판매' : sold ? `감자 판매, ${F.mass(y.cwtSold)}` : '감자 판매', sold ? y.revenue - rest - contracts - logs - stand : 0, { always: true, none: !sold }),
      cashLine('계약 납품', contracts, { testid: 'ledger-contracts' }),
      cashLine('직판장', stand, { testid: 'ledger-stand' }),
      cashLine('제재소에 판 통나무', logs, { testid: 'ledger-logs' }),
      cashLine('오트와 클로버', rest),
      cashLine('재배: 종자, 밭, 작업, 장비', -(y.costs - storage - wages - rent - land - penalties - mortgage - works - building - packing), { always: true }),
      cashLine('임금', -wages, { testid: 'ledger-wages' }),
      cashLine('임차료', -rent, { testid: 'ledger-rent' }),
      cashLine('땅, 계약금', -land, { testid: 'ledger-land' }),
      cashLine('땅 모기지', -mortgage, { testid: 'ledger-mortgage' }),
      cashLine('건물', -building, { testid: 'ledger-building' }),
      cashLine('도급', -works, { testid: 'ledger-works' }),
      cashLine('포장', -packing, { testid: 'ledger-packing' }),
      cashLine('계약 위약금', -penalties, { testid: 'ledger-penalties' }),
      cashLine('저장', -storage),
      cashLine([term('은행 납부', 'the note'), y.note > 0 && !lost ? stamp('납부', { ink: 'violet', small: true }) : null], -y.note, { always: true }),
      cashLine(term('생활비', 'the household'), -y.living, { always: true }),
      cashLine('빚 이자', -y.interest)),
    h('tfoot', null,
      h('tr', { class: 'total' }, h('td', null, '연말 현금'), h('td', { class: `m num${y.cashEnd < 0 ? ' c-red' : ''}`, colspan: 2, 'data-cash': '' }, F.money(y.cashEnd))),
      lost ? h('tr', { class: 'call' }, h('td', null, '은행이 융자를 회수하는 기준'), h('td', { class: 'm num', colspan: 2 }, F.money(S.CREDIT_LIMIT))) : null))
}

// 시뮬의 한국어 기록에서 사람과 내용을 가른다: "이름은(는) ...", "이름이(가) ...".
const SKILL_UP = /^(.*)은\(는\) (.*)이\(가\) 늘었습니다: (\d+)레벨\.$/
const SOMEONE = /^(.+?)(?:은\(는\)|이\(가\)|을\(를\)) (.+)$/

interface Deed { who: string | null; text: string; icon?: string }

// What happened to the farm and its people this year, from the year's own record.
function yearDeeds(c: S.Campaign): Deed[] {
  const log = c.season?.log ?? []
  const out: Deed[] = []
  const FARM_ICON: Record<string, string> = { built: 'build', felled: 'fell', stumped: 'stump' }
  for (const e of log) {
    if (!['built', 'felled', 'stumped', 'quit', 'poached', 'dismissed', 'hurt', 'hired'].includes(e.type)) continue
    const text = F.localize(e.text.split('. ')[0].replace(/\.$/, '') + '.')
    const m = FARM_ICON[e.type] ? null : SOMEONE.exec(text)
    out.push(m ? { who: m[1], text: m[2] } : { who: null, text, icon: FARM_ICON[e.type] })
  }
  const learned = new Map<string, Map<string, number>>()
  for (const e of log) {
    const m = e.type === 'skillUp' ? SKILL_UP.exec(e.text) : null
    if (!m) continue
    const who = m[1]
    if (!learned.has(who)) learned.set(who, new Map())
    learned.get(who)!.set(m[2], Math.max(Number(m[3]), learned.get(who)!.get(m[2]) ?? 0))
  }
  for (const [who, skills] of learned) out.push({ who, text: `${F.list([...skills].map(([k, n]) => `${k}(${n})`))}이(가) 늘었습니다.` })
  return out
}

// The year on the farm: a line for each person, their portrait beside it, then what was built and cleared.
function yearOnFarm(c: S.Campaign): HTMLElement | null {
  const deeds = yearDeeds(c)
  const people = new Map<string, string[]>()
  for (const u of c.crew) if (u.kind !== 'farmer') people.set(u.name, [])
  for (const d of deeds) if (d.who) { if (!people.has(d.who)) people.set(d.who, []); people.get(d.who)!.push(d.text) }
  // Who is on the books now: the year's wages are not kept person by person.
  const paid = new Map(c.crew.filter(u => u.kind !== 'farmer').map(u => [u.name, `월 ${F.money(S.payOf(u))}에 고용됐고, ${u.winter === 'off' ? '겨울에는 쉽니다' : '겨울에도 남습니다'}.`]))
  const farm = deeds.filter(d => !d.who)
  if (!deeds.length && !people.size) return null
  return h('section', { class: 'b-people', testid: deeds.length ? 'ledger-deeds' : undefined },
    h('div', { class: 'sec-h' }, h('h2', null, '농장의 한 해')),
    [...people].map(([who, all]) => {
      // The hire is said once: in the line of what they're paid, with the job they were hired for.
      const hire = all.map(t => /^(.+?)\(으\)로 고용됐습니다/.exec(t)?.[1]).find(Boolean)
      const lines = paid.has(who) ? all.filter(t => !/\(으\)로 고용됐습니다/.test(t)) : all
      const pay = ((p: string | undefined) => p && hire ? `${hire}(으)로 ${p}` : p)(paid.get(who))
      // Someone on the books: their pay first, joined to their name, then what else the year held, each a sentence.
      const said = pay ? [pay, ...lines.map(t => F.upper(t))].join(' ') : lines.map((t, k) => k ? F.upper(t) : t).join(' ')
      return h('p', { class: 'ppl' }, portrait(who, 30), h('span', null, h('b', null, who), pay ? `, ${said}` : ` ${said}`))
    }),
    farm.map(d => h('p', { class: 'ppl' }, icon(d.icon ?? 'yard', 'i'), h('span', null, d.text))))
}

// ---------------------------------------------------------------- the right page

// What the farm owns beyond the home place under the note: the land bought, the machines, the buildings, less what is
// owed on the land. A second potato house at home is counted once, with the equipment.
function worth(c: S.Campaign): HTMLElement {
  const ids = Object.keys(S.UPGRADES) as S.UpgradeId[]
  const equip = ids.reduce((a, id) => a + (c.upgrades[id] ? S.UPGRADES[id].cost * 0.5 : 0), 0)
  let land = 0
  for (let i = S.HOME_FIELDS; i < S.FIELD_COUNT; i++) if (c.fields[i].tenure === 'owned') land += S.PARCELS[i].price * S.LAND_WORTH
  const standing = c.buildings.filter(b => b.built && !(b.kind === 'house' && b.yard === S.HOME_YARD))
  const built = standing.reduce((a, b) => a + S.BUILDINGS[b.kind].cash, 0)
  const owed = S.mortgageOwed(c)
  const total = S.netWorth(c) + built
  const line = (label: string, v: number) => h('p', { class: 'lead' }, h('span', null, label), h('span', { class: 'dots' }), h('span', { class: `num${v < 0 ? ' c-red' : ''}` }, F.money(v)))
  return h('section', { class: 'worth', testid: 'ledger-worth' },
    h('div', null, h('p', { class: 't-label' }, '농장 가치'), h('p', { class: `t-display num${total < 0 ? ' c-red' : ''}` }, F.money(total))),
    h('p', { class: 'it quiet b-worth-note' }, '가진 것에서', h('br'), '빚을 뺀 값'),
    h('div', { class: 'lines' },
      land ? line('산 땅, 살 때 가격으로', land) : null,
      equip ? line('장비, 산 값의 절반', equip) : null,
      built ? line(`건물 ${standing.length}채, 현금 비용으로`, built) : null,
      owed ? line('땅에 남은 빚', -owed) : null,
      line('현금', c.cash)))
}

// The crop beside the neighbor's, as bars in the printer's tints.
function crop(ctx: Ctx, y: S.YearSummary): HTMLElement {
  const nb = ctx.app.world.neighbor[String(y.year)]
  const head = h('div', { class: 'sec-h' }, h('h2', null, '작물'), h('span', { class: 't-caption' }, `같은 날씨에서 판 ${F.perAreaUnit()}`))
  if (!y.potatoFields) return h('section', { class: 'compare' }, head, h('p', { class: 'b-plain' }, `${yearWord(y.year)}에는 감자를 심지 않아 팔 작물이 없습니다.`))
  const rows: [string, number, string][] = [['당신의 농장', y.yieldCwtAcre, '']]
  if (nb) rows.push(['이웃', nb.yieldCwtAcre, ' n'])
  const max = Math.max(...rows.map(r => r[1]), 1) * 1.1
  return h('section', { class: 'compare' }, head,
    rows.map(([label, v, cls]) => h('p', null, h('span', null, label),
      h('span', { class: `cbar${cls}`, role: 'img', 'aria-label': `${label}: ${F.perArea(v)}` }, h('i', { style: `width:${(v / max * 100).toFixed(1)}%` })),
      h('b', { class: 'num' }, F.num(F.perAreaValue(v), F.metric() ? 1 : 0)))),
    h('p', { class: 't-caption', testid: 'crop-sprays' }, `불량 처리 ${F.mass(y.cwtCulled)}. ${y.sprays !== undefined && y.potatoFields > 0 ? `밭마다 약 ${F.times(Math.round(y.sprays / y.potatoFields))} 살포했습니다${nb ? `, 이웃은 ${F.times(nb.sprays)}` : ''}. ` : ''}${nb ? `이웃은 ${varietyName(nb.variety)}을(를) ${F.date(y.year, nb.plant)}에 심어 ${F.date(y.year, nb.dig)}부터 캤습니다.` : ''}${F.cwtNote()}`))
}

const kilo = (v: number) => v === 0 ? '0' : `${v < 0 ? '−' : ''}${Math.abs(v / 1000)}k`

// Cash at the start and at each year end, an ink line against the line the bank calls the note at. The book keeps
// nothing finer, so nothing finer is drawn.
function cashChart(c: S.Campaign): HTMLElement {
  const pts = [c.history[0].cashStart, ...c.history.map(y => y.cashEnd)]
  const step = 20000
  const lo = Math.floor((Math.min(S.CREDIT_LIMIT, ...pts) - 2000) / step) * step
  const hi = Math.ceil((Math.max(...pts, 0) + 2000) / step) * step
  const W = 440, H = 176, L = 46, Rt = 434, T = 10, B = H - 24
  const x = (k: number) => L + (k / Math.max(1, pts.length - 1)) * (Rt - L)
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (B - T)
  const grid: number[] = []
  for (let v = hi; v >= lo; v -= step) grid.push(v)
  const label = (k: number) => k === 0 ? '시작' : yearName(c.history[k - 1].year)
  return h('section', { class: 'chart' },
    h('div', { class: 'sec-h' }, h('h2', null, '해마다 연말 현금')),
    s('svg', {
      viewBox: `0 0 ${W} ${H}`, role: 'img',
      'aria-label': `현금 ${F.money(pts[0])}으로 시작했습니다. 해마다 연말: ${c.history.map(z => `${yearWord(z.year)} ${F.money(z.cashEnd)}`).join(', ')}. ${F.money(S.CREDIT_LIMIT)} 아래면 은행이 융자를 회수합니다.`,
    },
    grid.map(v => [
      s('line', { class: v === 0 ? 'zero' : v === S.CREDIT_LIMIT ? 'ax' : 'grid-l', x1: L, x2: Rt, y1: y(v).toFixed(1), y2: y(v).toFixed(1) }),
      s('text', { x: L - 6, y: (y(v) + 4).toFixed(1), 'text-anchor': 'end' }, kilo(v))]),
    s('text', { class: 'lab', x: L + 6, y: (y(S.CREDIT_LIMIT) + 16).toFixed(1), style: 'paint-order:stroke;stroke:var(--paper);stroke-width:4px' }, '이 선 아래면 은행이 융자를 회수합니다'),
    pts.map((_, k) => s('text', { x: x(k).toFixed(1), y: H - 4, 'text-anchor': k === 0 ? 'start' : k === pts.length - 1 ? 'end' : 'middle' }, label(k))),
    s('polyline', { class: 'ln', points: pts.map((v, k) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(' ') }),
    pts.map((v, k) => s('circle', { cx: x(k).toFixed(1), cy: y(v).toFixed(1), r: 3.5, style: `fill:var(${k === pts.length - 1 && v < 0 ? '--red' : '--ink'})` }))),
    h('p', { class: 't-caption' }, c.history.length > 1 ? '장부에는 달별이 아니라 해마다 연말의 현금이 적힙니다.' : '장부에는 달별이 아니라 연초와 연말의 현금이 적힙니다.'))
}

// The goals met so far, struck through in pencil.
function goalsMet(c: S.Campaign): HTMLElement | null {
  const met = goals(c).filter(g => g.done && !g.long)
  if (!met.length) return null
  const shown = met.slice(-4)
  return h('section', { class: 'b-goals' },
    h('div', { class: 'sec-h' }, h('h2', null, '이룬 목표')),
    h('p', null, h('span', { class: 'met-list' }, shown.map(g => `\u2713 ${g.title}`).join(' \u00b7 ')),
      met.length > shown.length ? h('span', { class: 'quiet' }, `, 그 전에 ${met.length - shown.length}개 더`) : null))
}

// What next spring brings, in a few lines, and the soil it starts from.
function yearAhead(c: S.Campaign, y: S.YearSummary): HTMLElement {
  const tired = S.FIELD_NAMES.filter((_, i) => S.isField(c, i) && c.plans[i].crop === 'potato' && c.fields[i].streak >= 2)
  const standing = S.tractInfo(c).filter(t => t.tenure !== 'none' && t.stage !== 'done').map(t => t.name)
  const m = S.mortgageInfo(c)
  const lines = [
    `다음 봄에는 ${S.APPLICANTS}명이 일을 찾아오고, 바이어가 계약을 제안하며, 빌리거나 살 땅이 나옵니다.`,
    tired.length ? `${F.list(tired)}은(는) 2년 연속 감자를 길러 다음 해 계획에서는 쉽니다.` : '',
    standing.length ? `${F.list(standing)}은(는) 아직 개간을 기다립니다.` : '',
    m.owed > 0 ? `땅 모기지로 다음 해 말에 ${F.money(m.principal + m.interest)}이(가) 듭니다.` : '',
  ].filter(Boolean)
  const fields = Array.from({ length: S.FIELD_COUNT }, (_, i) => S.fieldInfo(c, i)).filter(f => f.tenure !== 'none' && f.cover === 'open')
  return h('section', { class: 'b-ahead', testid: 'year-ahead' },
    h('div', { class: 'sec-h' }, h('h2', null, '다음 해')),
    h('ul', { class: 'b-lines' }, lines.map(t => h('li', null, t))),
    h('p', { class: 't-label b-soil-h' }, `${yearWord(y.year + 1)}에 들어가는 흙`),
    h('ul', { class: 'b-soil' }, fields.map(f => h('li', null,
      h('b', null, f.name), ' ', h('span', { class: f.soil < 0.4 ? 'c-ochre' : '' }, `흙 ${soilWord(f.soil)}`),
      h('span', { class: `num${f.vert >= 0.15 ? ' c-ochre' : ' quiet'}` }, `, 조기 고사병 ${F.pct(f.vert)}`)))),
    h('p', { class: 't-caption' }, '감자를 해마다 기르면 흙이 지치고 ', term('조기 고사병'), '이(가) 쌓입니다. 휴경은 흙을 바로 회복시키고 조기 고사병을 서서히 줄입니다.'))
}

// ---------------------------------------------------------------- the occasions and the end

// Every year played, set against the neighbor's crop.
function yearsTable(ctx: Ctx, c: S.Campaign): HTMLElement {
  const world = ctx.app.world
  const cell = (x: number | null | undefined) => x != null ? F.num(F.perAreaValue(x), F.metric() ? 1 : 0) : '–'
  return h('section', { class: 'b-years' },
    h('div', { class: 'sec-h' }, h('h2', null, '해마다의 농장')),
    h('div', { class: 'b-years-wrap', tabindex: '0', role: 'group', 'aria-label': '해마다의 농장' },
      h('table', { class: 'cashbook years' },
        h('caption', { class: 'sr' }, '해마다의 농장'),
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, h('span', { class: 't-label' }, '해')),
          h('th', { scope: 'col', class: 'm' }, h('span', { class: 't-label' }, '들어옴')),
          h('th', { scope: 'col', class: 'm' }, h('span', { class: 't-label' }, '나감')),
          h('th', { scope: 'col', class: 'm' }, h('span', { class: 't-label' }, '연말')),
          h('th', { scope: 'col', class: 'm' }, h('span', { class: 't-label' }, '수량')),
          h('th', { scope: 'col', class: 'm' }, h('span', { class: 't-label' }, '이웃')))),
        h('tbody', null, c.history.map(y => h('tr', null,
          h('th', { scope: 'row' }, yearShort(y.year)),
          h('td', { class: 'm num' }, F.num(Math.round(y.revenue))),
          h('td', { class: 'm num out' }, F.num(Math.round(y.costs + y.note + y.living + y.interest))),
          h('td', { class: `m num${y.cashEnd < 0 ? ' c-red' : ''}` }, F.money(y.cashEnd)),
          h('td', { class: 'm num' }, y.potatoFields ? cell(y.yieldCwtAcre) : '–'),
          h('td', { class: 'm num' }, cell(world.neighbor[String(y.year)]?.yieldCwtAcre))))))),
    h('p', { class: 't-caption' }, `수량은 판매한 ${F.perAreaUnit()} 기준입니다.${F.cwtNote()} 이웃은 같은 날씨에서 보통의 좋은 방식으로 운영되는 옆집 농장입니다.`))
}

// The farm as it stands: what was built up, for the sheets that close the game.
function farmBuilt(c: S.Campaign): HTMLElement | null {
  const held = S.FIELD_NAMES.filter((_, i) => S.isField(c, i)).length
  const cleared = S.TRACTS.filter(i => c.fields[i].tenure !== 'none' && c.fields[i].cover === 'open').length
  const standing = c.buildings.filter(b => b.built).map(b => S.BUILDINGS[b.kind].name.toLowerCase())
  const people = c.crew.filter(u => u.kind !== 'farmer').map(u => u.name)
  const machines = (Object.keys(S.UPGRADES) as S.UpgradeId[]).filter(id => c.upgrades[id] && id !== 'house2').map(id => S.UPGRADES[id].name.toLowerCase())
  const rows: [string, string, string][] = [
    ['field', '밭', `${held}곳 사용 중${held > S.HOME_FIELDS ? `, 시작할 때의 ${S.HOME_FIELDS}곳보다 ${held - S.HOME_FIELDS}곳 더` : ''}`],
    ...(cleared ? [['stump', '개간', `숲과 덤불 ${cleared}구획을 밭으로`] as [string, string, string]] : []),
    ...(standing.length ? [['build', '지은 것', F.upper(F.list(standing))] as [string, string, string]] : []),
    ...(people.length ? [['people', '사람들', F.list(people)] as [string, string, string]] : []),
    ...(machines.length ? [['machine', '기계', F.upper(F.list(machines))] as [string, string, string]] : []),
  ]
  if (rows.length < 2) return null
  return h('section', { class: 'b-built', testid: 'farm-built' },
    h('div', { class: 'sec-h' }, h('h2', null, '일군 것')),
    h('dl', null, rows.map(([ic, k, v]) => h('div', null, h('dt', null, icon(ic, 'i'), h('span', { class: 't-label' }, k)), h('dd', null, v)))))
}

// The head of a closing book: the years, what became of the farm, its stamp, and the bank's last word.
function closingHead(c: S.Campaign, o: { won: boolean; testid?: string; outcome: string }): HTMLElement {
  return h('header', { class: 'book-head', testid: o.testid },
    h('p', { class: 't-label' }, yearSpan(c.startYear, c.year)),
    h('div', { class: 'b-title-row' },
      h('h1', { class: 't-title book-title' }, o.won ? '농장은 당신의 것' : '농장이 팔렸습니다'),
      o.won ? stamp('지킴', { ink: 'violet' }) : stamp('회수됨', { ink: 'red' })),
    h('p', { class: 'it b-verdict', testid: 'outcome' }, o.outcome))
}

// ---------------------------------------------------------------- the book

interface BookParts { tabs: [string, string]; left: Child; right: Child; foot: Child }

// The book over the land: two pages side by side on a desk, one at a time on a phone with the page names above to
// turn them, and the foot (the next goal, the way on) always in reach.
function bookLeaves(ctx: Ctx, book: HTMLElement, p: BookParts): Child {
  const turn = (k: number) => {
    const leaves = book.querySelector<HTMLElement>('.book-leaves')
    if (!leaves) return
    leaves.scrollTo({ left: k * leaves.clientWidth, behavior: ctx.reduced() ? 'auto' : 'smooth' })
    mark(k)
  }
  const mark = (k: number) => {
    book.querySelectorAll<HTMLElement>('.book-tabs .btn').forEach((b, i) => b.setAttribute('aria-pressed', String(i === k)))
  }
  const onScroll = (e: Event) => {
    const x = e.currentTarget as HTMLElement
    if (x.clientWidth) mark(Math.round(x.scrollLeft / x.clientWidth))
  }
  return [
    h('div', { class: 'book-tabs seg', role: 'group', 'aria-label': '쪽' },
      p.tabs.map((t, k) => h('button', { class: 'btn', type: 'button', k: `page-${k}`, 'aria-pressed': String(k === 0), onclick: () => turn(k) }, t))),
    h('div', { class: 'book-leaves', onscroll: onScroll },
      // Each page scrolls when it runs long, so each can take the keyboard's focus.
      h('div', { class: 'page-l', 'data-scroll': 'page-l', tabindex: '0', role: 'region', 'aria-label': p.tabs[0] }, p.left),
      h('div', { class: 'page-r' },
        h('div', { class: 'page-body', 'data-scroll': 'page-r', tabindex: '0', role: 'region', 'aria-label': p.tabs[1] }, p.right),
        h('footer', { class: 'book-next' }, p.foot))),
  ]
}

// The next goal at the foot of the book. One that can be taken here (naming a foreman) is a button to it; one that waits
// for spring says so, without the fist.
function nextGoalSlip(ctx: Ctx, c: S.Campaign): HTMLElement | null {
  const goal = nextGoal(c)
  if (!goal) return null
  const here = goal.id === 'foreman' && c.crew.some(u => u.kind !== 'farmer')
  const body = [here || goal.now ? fist() : null, h('span', null, h('span', { class: 'b-next-w' }, '다음: '), h('b', null, goal.title),
    h('span', { class: 't-caption b-how' }, here ? `${goal.how} 지금 한 사람 정하세요.` : goal.now ? goal.how : `${goal.how} ${goal.when}.`))]
  return here
    ? h('button', { class: 'next-goal sheet laid s-canary', type: 'button', testid: 'next-goal', onclick: () => { openForeman(ctx); light('.cat-foreman .btn') } }, body)
    : h('p', { class: 'next-goal sheet laid s-canary', testid: 'next-goal' }, body)
}

function bookInsets(ctx: Ctx, top: HTMLElement, book: HTMLElement): [number, number, number, number] {
  const t = top.getBoundingClientRect().bottom
  // On a desk the land lies behind the open book, as in the frame; on a phone it shows above the page.
  return phoneLike(ctx) ? [t, 0, Math.max(0, innerHeight - book.getBoundingClientRect().top), 0] : [t, 0, 0, 0]
}

export function ledgerScreen(ctx: Ctx, o: { onMenu: () => void }): Screen {
  const app = ctx.app
  const top = topBar(ctx, o)
  const book = h('section', { class: 'book ledger-sheet sys', 'aria-label': '연말' })
  const el = h('main', { class: 'ledger-screen' }, top.el, book)
  let counted = ''
  const screen: Screen = {
    el,
    update() {
      const c = app.campaign
      if (!c) return
      top.update()
      const y = c.history[c.history.length - 1]
      if (!y) return
      const layout = ctx.layout()
      book.dataset.layout = layout
      const kept = c.outcome === 'kept'
      const lost = c.outcome === 'lost'
      // The year the fifth season closes is the farm's own moment; after it the ledger is an ordinary one again.
      const won = kept && c.yearIdx + 1 === c.goalYears
      const left = c.goalYears - (c.yearIdx + 1)
      const more = app.world.weather.playable.includes(c.year + 1)
      const occasion = won || lost
      book.classList.toggle('occasion', occasion)
      book.classList.toggle('is-lost', lost)
      book.setAttribute('aria-label', occasion ? (won ? '농장은 당신의 것' : '농장이 팔렸습니다') : `장부, ${yearWord(y.year)}`)
      const closest = c.history.reduce((a, z) => z.cashEnd < a.cashEnd ? z : a, c.history[0])
      const goal = nextGoal(c)
      const key = JSON.stringify([c.year, c.history.length, c.outcome, app.settings.units, goal?.id, layout])
      const foot = [
        !lost ? nextGoalSlip(ctx, c) : null,
        kept ? h('button', { class: 'btn', type: 'button', testid: 'new-farm', onclick: () => startNewFarm(ctx) }, '새 농장 시작하기') : null,
        h('button', { class: 'btn go', type: 'button', testid: 'year-next', onclick: () => ctx.run({ t: 'next' }) },
          lost ? '장부 닫기' : !more ? '어떻게 끝났는지 보기' : won ? `${yearWord(y.year + 1)}에 농사 계속하기` : `${yearWord(y.year + 1)} 계획하기`, icon('arrow', 'i')),
      ]
      patch(book, key, () => {
        if (occasion) {
          return bookLeaves(ctx, book, {
            tabs: [won ? '다섯 시즌' : '지나온 해', `장부, ${yearWord(y.year)}`],
            left: [
              closingHead(c, {
                won, testid: won ? 'kept-moment' : 'lost-moment',
                outcome: won ? `다섯 시즌을 버텨 해마다 은행에 갚았습니다. ${F.money(y.cashEnd)}을(를) 남기고 끝냈습니다.`
                  : `은행이 융자를 회수했습니다. ${c.history.length}시즌 만에 땅과 집, 감자 저장고가 경매에 넘어갑니다.`,
              }),
              cashChart(c),
              c.history.length > 1 ? h('p', { class: 'b-plain' }, won
                ? `가장 아슬아슬했던 해는 ${yearName(closest.year)}입니다. 그해를 ${closest.cashEnd < 0 ? `${F.money(-closest.cashEnd)} 빚으로` : `현금 ${F.money(closest.cashEnd)}으로`} 끝냈고, 은행의 한도는 ${F.money(S.CREDIT_LIMIT)}입니다.`
                : `${F.money(S.CREDIT_LIMIT)} 선 아래면 은행이 융자를 회수합니다.`) : null,
              yearsTable(ctx, c),
            ],
            right: [
              farmBuilt(c),
              h('div', { class: 'sec-h' }, h('h2', null, `장부, ${yearWord(y.year)}`)),
              cashBook(y, lost),
              won ? yearAhead(c, y) : null,
            ],
            foot,
          })
        }
        return bookLeaves(ctx, book, {
          tabs: ['돈', '농장'],
          left: [
            h('header', { class: 'book-head' },
              h('p', { class: 't-label' }, `${c.goalYears}년 중 ${c.yearIdx + 1}년째`),
              h('h1', { class: 't-title book-title' }, `장부, ${yearWord(y.year)}`),
              h('p', { class: 'it b-verdict', testid: 'outcome' }, verdictSays(y, left, kept)),
              h('p', { class: 'b-plain', testid: 'year-sentence' }, `${yearWalk(y)} ${againstUsual(y.cashEnd - y.cashStart)}`)),
            cashBook(y, false),
            y.cashEnd < 0 ? h('p', { class: 'b-debt' }, h('b', { class: 'c-red' }, '빚이 있지만,'), ` 은행의 한도 안입니다. `, h('span', { class: 'num nowrap' }, F.money(S.CREDIT_LIMIT)), ' 아래에서만 융자를 회수합니다.') : null,
            yearOnFarm(c),
            yearAhead(c, y),
          ],
          right: [worth(c), crop(ctx, y), cashChart(c), goalsMet(c)],
          foot,
        })
      })
      // The year-end figure counts up once, when the book first opens.
      const year = `${c.year}:${c.history.length}`
      if (counted !== year && book.isConnected) {
        counted = year
        const total = book.querySelector<HTMLElement>('[data-cash]')
        if (total && !occasion) count(total, y.cashStart, y.cashEnd, n => F.money(n))
      }
    },
    insets: () => bookInsets(ctx, top.el, book),
  }
  // Drawn at once, so the way on is there the moment the last screen's is gone.
  screen.update()
  return screen
}

export function overScreen(ctx: Ctx, o: { onMenu: () => void }): Screen {
  const app = ctx.app
  const top = topBar(ctx, o)
  const book = h('section', { class: 'book ledger-sheet occasion sys', 'aria-label': '끝' })
  const el = h('main', { class: 'ledger-screen' }, top.el, book)
  const screen: Screen = {
    el,
    update() {
      const c = app.campaign
      if (!c) return
      top.update()
      const layout = ctx.layout()
      book.dataset.layout = layout
      const lost = c.outcome === 'lost'
      book.classList.toggle('is-lost', lost)
      const last = c.history[c.history.length - 1]
      const years = c.history.length
      patch(book, JSON.stringify([c.history.length, c.outcome, app.settings.units, layout]), () => bookLeaves(ctx, book, {
        tabs: ['지나온 해', lost && last ? `마지막 해, ${yearWord(last.year)}` : '일군 것'],
        left: [
          closingHead(c, {
            won: !lost,
            outcome: lost
              ? `${years}시즌 뒤 은행이 융자를 회수했습니다. 땅과 집, 감자 저장고가 경매로 팔렸습니다${last ? `(농장은 ${F.money(-last.cashEnd)} 빚)` : ''}.`
              : `${years}시즌 동안 농장을 지켰습니다${last ? `. ${F.money(last.cashEnd)}을(를) 남기고 끝냈습니다` : ''}. 이 농장에서 더 할 해는 없습니다.`,
          }),
          years ? cashChart(c) : null,
          years ? yearsTable(ctx, c) : null,
        ],
        right: [
          farmBuilt(c),
          last && lost ? [h('div', { class: 'sec-h' }, h('h2', null, `마지막 해, ${yearWord(last.year)}`)), cashBook(last, true)] : null,
        ],
        foot: [
          h('button', { class: 'btn', type: 'button', testid: 'over-title', onclick: () => app.quitToTitle() }, '타이틀로'),
          h('button', { class: 'btn go', type: 'button', testid: 'new-farm', onclick: () => startNewFarm(ctx) }, '새 농장 시작하기', icon('arrow', 'i')),
        ],
      }))
    },
    insets: () => bookInsets(ctx, top.el, book),
  }
  // Drawn at once, so the way on is there the moment the last screen's is gone.
  screen.update()
  return screen
}
