// The top of the screen (design/season.html): two anchored boards. On the left the almanac board: the date leaf, six
// days of forecast and the season ruled under them, with the canary goal slip hung below. On the right the bank
// board: the balance, the clock's keys and the menu, and the contracts as ranges.
import { goals, idleWork, nextGoal, seasonStep, waitingFor, type FreeWork, type Goal } from '../game/goals.ts'
import { SPEED_X } from '../game/app.ts'
import * as S from '../sim/index.ts'
import { contractRows } from './contracts.ts'
import { count, patch, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { BORROWED_SAYS, causeLine, LOAN_NOTE, loanNoteNow, rangeSays, REMEDY, signedMoney, sumLines } from './money-words.ts'
import { BLIGHT_RISK, firstName, forecastSky, JOB_DOING, JOB_VERB, jobText, plantingIn, SKY_WORD, yearName } from './rules.ts'
import { fist } from './system/parts.ts'

export const PHASE_LABEL: Record<S.Phase, string> = {
  plan: '봄 계획', season: '농사 시즌', cellar: '저장고에서', ledger: '연말 결산', over: '끝',
}

const SPEED_NAME = ['일시 정지', `${SPEED_X[1]}`, `${SPEED_X[2]}`, `${SPEED_X[3]}`]

// The date leaf: in the season the day, its month and weekday; outside it, one word for where the year is.
function leaf(c: S.Campaign): HTMLElement {
  const year = h('span', { class: 'year t-label tb-year num' }, yearName(c.year))
  if (c.phase === 'season' && c.season) {
    const d = c.season.day
    const { month, dom } = S.monthDay(c.year, d)
    return h('div', { class: 'leaf' },
      h('span', { class: 'date', testid: 'date' },
        h('span', { class: 'day num' }, String(dom)),
        h('span', { class: 'month' }, S.MONTHS[month]),
        // (the hour of a long day, written in as it passes: src/ui/index.ts)
        h('span', { class: 'weekday', 'data-day': F.weekday(c.year, d) }, F.weekday(c.year, d), h('span', { class: 'hour num', testid: 'hour' }))),
      year)
  }
  const word = c.phase === 'cellar' ? S.CELLAR_MONTHS[c.month] : c.phase === 'plan' ? '봄' : c.phase === 'ledger' ? '연말' : '끝'
  return h('div', { class: 'leaf word' }, h('span', { class: 'date', testid: 'date' }, word), year)
}

// How far through the season it is, with the frosts and the start of the blight watch marked on it.
function seasonTrack(c: S.Campaign): HTMLElement | null {
  const ss = c.season
  if (!ss) return null
  const y = c.year
  const a = S.dayIndex(y, S.SEASON_START.month, S.SEASON_START.dom)
  const b = S.dayIndex(y, S.SEASON_LAST.month, S.SEASON_LAST.dom)
  const x = (d: number) => `${(Math.max(0, Math.min(1, (d - a) / (b - a))) * 100).toFixed(1)}%`
  const now = Math.min(ss.day, b)
  const frosts = ss.log.filter(e => e.type === 'frost').map(e => e.day).filter((d, k, all) => all.indexOf(d) === k)
  // On a phone the board has no room for a row of phases: the track's own ends say where the year is, and what is next.
  const at = PHASES.findIndex(p => p.id === phaseNow(c))
  const ends = (month: string, phase: string) => h('span', { class: 't-label' }, h('span', { class: 'mo' }, month), h('span', { class: 'ph' }, phase))
  return h('div', { class: 'season-track' },
    ends(F.monthName(S.SEASON_START.month, true), PHASES[at]?.short ?? ''),
    h('span', {
      class: 'bar', role: 'img',
      'aria-label': `시즌은 ${F.date(y, a)}부터 ${F.date(y, b)}까지이고 ${Math.round(((now - a) / (b - a)) * 100)}% 지났습니다.${ss.watchDay >= 0 ? ` 역병 감시는 ${F.date(y, ss.watchDay)}에 시작했습니다.` : ''}`,
    },
    h('i', { style: `width:${x(now)}` }),
    frosts.map(d => h('u', { class: 'frost', style: `left:${x(d)}` })),
    ss.watchDay >= 0 ? h('u', { class: 'watch', style: `left:${x(ss.watchDay)}` }) : null,
    h('b', { style: `left:${x(now)}` })),
    ends(F.monthName(S.SEASON_LAST.month, true), PHASES[at + 1] ? `다음 ${PHASES[at + 1].short}` : ''))
}

// What the year asks, in order: where the farm is in it, and what comes next. For every player.
const PHASES: { id: string; glyph: string; name: string; short: string; from: [number, number]; says: string }[] = [
  { id: 'plant', glyph: 'plant', name: '심기', short: '심기', from: [S.SEASON_START.month, S.SEASON_START.dom], says: '심기. 5월에 흙이 충분히 따뜻해지면, 당신이 말할 때 일꾼들이 밭마다 심습니다.' },
  { id: 'tend', glyph: 'hill', name: '돌보기', short: '돌보기', from: [6, 1], says: '돌보기. 일꾼들이 북주기를 하고 밭을 살핍니다. 역병 날씨가 오면 살포는 당신의 결정입니다.' },
  { id: 'kill', glyph: 'kill', name: '줄기 죽이기', short: '죽이기', from: [9, 1], says: '줄기 죽이기. 9월에 하며, 수확 전에 껍질이 굳도록 합니다.' },
  { id: 'dig', glyph: 'dig', name: '수확', short: '캐기', from: [9, 20], says: '수확. 일꾼들이 밭마다 캐고 날라오며, 작물은 감자 저장고에서 달아봅니다.' },
  { id: 'sell', glyph: 'ticket', name: '판매 또는 저장', short: '판매', from: [10, 20], says: '판매 또는 저장. 달아본 작물은 바로 팔거나 저장해 겨울에 팔 수 있습니다.' },
]

// The phase the farm is in, by what the fields show, not by the date alone.
export function phaseNow(c: S.Campaign): string {
  const ss = c.season
  if (!ss) return ''
  const pot = c.plans.map((p, i) => (p?.crop === 'potato' && S.held(c, i) ? i : -1)).filter(i => i >= 0)
  const f = (i: number) => ss.fields[i]
  if (pot.some(i => f(i).plantDay < 0 && f(i).status !== 'dug')) return 'plant'
  if (pot.length && pot.every(i => f(i).weighed || f(i).status === 'off')) return 'sell'
  if (pot.some(i => f(i).status === 'digging' || f(i).status === 'dug' || f(i).inField >= 0.5)) return 'dig'
  if (pot.some(i => f(i).killDay >= 0 || f(i).status === 'dead' || !!S.killOutlook(c, i)?.asked)) return 'kill'
  return 'tend'
}

function phaseRow(c: S.Campaign): HTMLElement | null {
  if (!c.season) return null
  const y = c.year
  const now = phaseNow(c)
  const at = PHASES.findIndex(p => p.id === now)
  const end = S.dayIndex(y, S.SEASON_LAST.month, S.SEASON_LAST.dom)
  const start = (k: number) => (k < PHASES.length ? S.dayIndex(y, PHASES[k].from[0], PHASES[k].from[1]) : end)
  return h('ol', { class: 'phases', testid: 'phases', 'aria-label': `한 해의 단계. 현재: ${PHASES[at]?.name ?? ''}.${PHASES[at + 1] ? ` 다음: ${PHASES[at + 1].name}.` : ''}` },
    PHASES.map((p, k) => h('li', {
      class: `term${k === at ? ' now' : k < at ? ' past' : ''}`, style: `flex:${start(k + 1) - start(k)} 0 auto`, tabindex: '0', 'data-tip': p.says, 'aria-current': k === at ? 'step' : null,
    }, icon(p.glyph, 'i'), k === at ? p.short : h('span', { class: 'sr' }, p.name))))
}

interface Cell { day: string; sky: string; hi: number; rain: number; blight: number; frost: number; said: string }

function cells(ctx: Ctx, c: S.Campaign): Cell[] {
  const t = S.today(ctx.app.world, c)
  if (!t) return []
  const d = t.day
  const out: Cell[] = [{
    day: '오늘', sky: t.sky, hi: d.tmax, rain: -1, blight: Math.min(3, t.severity), frost: d.tmin <= 0 ? 100 : 0,
    said: `오늘: ${SKY_WORD[t.sky]}, 최고 ${F.temp(d.tmax)}, 최저 ${F.temp(d.tmin)}${d.prcp >= 0.5 ? `, 비 ${F.rain(d.prcp)}` : ''}${t.severity > 0 ? ', 역병 날씨' : ''}.`,
  }]
  for (const f of S.forecast(ctx.app.world, c, 5)) {
    out.push({
      day: F.weekday(c.year, f.day, true), sky: forecastSky(f), hi: f.hi, rain: f.rainChance, blight: f.blight, frost: f.frostChance,
      said: `${F.weekday(c.year, f.day)}: 최고 약 ${F.temp(f.hi)}, 최저 약 ${F.temp(f.lo)}, 비 올 확률 ${f.rainChance}%${f.blight > 0 ? `, 역병 위험 ${BLIGHT_RISK[f.blight]}` : ''}${f.frostChance >= 30 ? `, 서리 확률 ${f.frostChance}%` : ''}.`,
    })
  }
  return out
}

// The clock, as a strategy game has it: pause, and three speeds, a key each. On a phone (compact), pause and one key
// that steps through the three, and the menu beside them when onMenu is given.
export function clock(ctx: Ctx, compact: boolean, onMenu?: () => void): HTMLElement {
  const app = ctx.app
  const c = app.campaign!
  if (S.seasonDone(c) && !ctx.awaiting) {
    return h('div', { class: 'clock sys done' }, h('button', { class: 'btn go wide', type: 'button', testid: 'end-season', onclick: () => ctx.run({ t: 'endSeason' }) }, '시즌 마무리하기', icon('arrow', 'i')),
      onMenu ? menuKey(ctx, onMenu) : null)
  }
  const keys = !ctx.touch()
  const paused = app.speed === 0
  // While paused, the speed the clock will go on at is marked, so Space is never a surprise.
  const at = paused ? app.resumeSpeed || 1 : app.speed
  const pause = h('button', {
    class: `k${paused ? ' stopped' : ''}`, type: 'button', testid: compact ? 'speed-toggle' : 'speed-0', 'aria-pressed': String(paused),
    'aria-label': paused ? `일시 정지됨. ${SPEED_X[at]}로 재개${keys ? ' (Space)' : ''}` : `일시 정지${keys ? ' (Space)' : ''}`,
    title: keys ? (paused ? `${SPEED_X[at]}로 재개 (Space)` : '일시 정지 (Space)') : undefined,
    onclick: () => { if (!app.pressPause()) ctx.announce(`게임이 ${SPEED_X[app.speed]} 속도로 돌아갑니다.`) },
  }, icon(paused ? 'play' : 'pause'))
  if (compact) {
    const next = (at % 3 + 1) as 1 | 2 | 3
    return h('div', { class: 'clock sys compact', role: 'group', 'aria-label': '게임 속도' }, pause,
      h('button', { class: 'k speed-x num', type: 'button', testid: 'speed-cycle', 'aria-pressed': String(!paused), onclick: () => app.setSpeed(next) },
        SPEED_X[at], h('span', { class: 'sr' }, ` 속도${paused ? ', 일시 정지됨' : ''}. ${SPEED_NAME[next]} 속도로 변경`)),
      onMenu ? menuKey(ctx, onMenu) : null)
  }
  return h('div', { class: 'clock sys', role: 'group', 'aria-label': '게임 속도' }, pause,
    ([1, 2, 3] as const).map(k => h('button', {
      class: `k speed-x num${paused && k === at ? ' armed' : ''}`, type: 'button', testid: `speed-${k}`, 'aria-pressed': String(app.speed === k),
      title: keys ? `${SPEED_NAME[k]} 속도 (F로 속도를 순환하거나 +와 −로 변경)` : undefined,
      onclick: () => app.setSpeed(k),
    }, SPEED_X[k], h('span', { class: 'sr' }, ` 속도${paused && k === at ? ', 게임이 재개될 속도' : ''}`))),
    onMenu ? menuKey(ctx, onMenu) : null)
}

function menuKey(ctx: Ctx, onMenu: () => void): HTMLElement {
  return h('button', { class: 'menu', type: 'button', testid: 'menu-open', 'aria-label': `메뉴${ctx.touch() ? '' : ' (M)'}`, title: ctx.touch() ? undefined : '메뉴 (M)', onclick: () => onMenu() }, icon('menu'))
}

// How far along a goal is, in a figure: "2/4", or "40%".
function progressText(g: Goal): string {
  return g.progress ? (g.progress.of === 100 ? `${g.progress.n}%` : `${g.progress.n}/${g.progress.of}`) : ''
}

// The one figure that answers "am I all right?" through a season: what the farm would have after the year-end bills
// if every lot and the crop in the ground sold today (S.moneyNow), with how it is made up.
// Before the tubers set there is no crop to count: the figure is then what the year end takes before the crop pays,
// said as that, not as a verdict.
export interface Outlook {
  figure: number; label: string; before: boolean; risk: S.MoneyNow['callRisk']; look: S.MoneyLook
  lines: S.MoneyPart[]             // the sum from the year's opening cash to the figure, each to the $100
  head: string                     // what the sum assumes
  spread: number                   // half the range while crop is still unweighed, else 0
  reach: boolean                   // the range reaches past the bank's limit: the board shows its give-or-take
  says: string                     // the range and the bank's verdict, in sentences
  why: string                      // all of it in words, for a screen reader
}

export function outlook(ctx: Ctx, c: S.Campaign): Outlook {
  const world = ctx.app.world
  const m = S.moneyNow(world, c)
  const s = c.season
  const figure = Math.round(m.after / 100) * 100
  const lines = sumLines(m.parts, figure)
  // The crop is counted from the season's first day (S.moneyNow), so the only warning is the bank's own: callRisk.
  const limit = F.money(-S.CREDIT_LIMIT)
  const verdict = m.callRisk === 'likely' ? ` 좋은 작물이라도 ${limit} 이상 적자가 나면 은행이 농장을 넘겨받습니다.`
    : m.callRisk === 'possible' ? ` 평년 작물로는 연말에 ${limit} 이상 적자가 되는데, 그것이 은행의 한도입니다.` : ''
  // While some crop is not yet weighed, where the figure is likely to end (S.moneyNow's range); none once all is in.
  const unweighed = c.phase === 'season' && !!s && s.fields.some((f, i) => S.isField(c, i) && f.status !== 'rest' && f.status !== 'off' && f.status !== 'lost' && !f.weighed)
  const spread = unweighed ? Math.round((m.range.hi - m.range.lo) / 2 / 100) * 100 : 0
  const range = spread ? rangeSays(m.range) : ''
  const head = c.phase === 'cellar' ? '저장한 것을 오늘 모두 판다면:' : '작물을 오늘 판다면:'
  const says = `${range}${verdict}`.trim()
  return {
    figure, before: false, spread, risk: m.callRisk, label: '연말 현금', look: S.moneyLook(world, c), lines, head, says,
    reach: !!spread && m.range.lo < S.CREDIT_LIMIT,
    why: `${head} ${lines.map(p => `${p.label} ${signed(p.amount)}`).join(', ')}, 연말 결산 뒤 ${F.money(figure)}이(가) 됩니다. ${says}`.trim(),
  }
}

// A part of the sum with its sign: "+$43,700", "−$19,000".
const signed = (n: number) => `${n > 0 ? '+' : ''}${F.money(n)}`

// Said before logs are sold: the buildings not yet up that would take them, and what buying them back costs.
export function logsWanted(c: S.Campaign): string {
  const want = S.BUILDING_KINDS.filter(k => S.BUILDINGS[k].logs > 0 && !S.buildingAt(c, k, S.HOME_YARD))
    .map(k => ({ name: S.BUILDINGS[k].name.toLowerCase(), logs: S.BUILDINGS[k].logs })).sort((a, b) => b.logs - a.logs).slice(0, 2)
  if (!want.length) return ''
  return `일부는 건축에 남기세요. ${F.list(want.map(w => `${w.name}에는 통나무 ${w.logs}적재분이 듭니다`))}. 통나무는 적재분당 ${F.money(S.MILL_PRICE)}에 다시 사야 합니다.`
}

// A goal's when, run into a line: its first word lower-cased, a month's name left as it is.
const lowerFirst = (t: string) => t ? t[0].toLowerCase() + t.slice(1) : t

// The year's money, by what it was for, from the campaign's own running totals: what moved between two looks.
const MONEY_PARTS: [keyof S.Campaign, string, 1 | -1][] = [
  ['yearWages', '임금', -1], ['yearStorage', '저장', -1], ['yearRent', '임차료', -1], ['yearLand', '땅', -1], ['yearMortgage', '모기지', -1],
  ['yearWorks', '도급', -1], ['yearBuilding', '건축', -1], ['yearPacking', '포장', -1], ['yearPenalties', '위약금', -1],
  ['yearContracts', '납품', 1], ['yearLogs', '통나무', 1], ['yearStand', '직판장', 1], ['yearRest', '오트', 1],
]
type MoneyLook = Record<string, number>

function moneyLook(c: S.Campaign): MoneyLook {
  const out: MoneyLook = { cash: c.cash, revenue: c.yearRevenue, costs: c.yearCosts }
  for (const [k] of MONEY_PARTS) out[k] = Number(c[k]) || 0
  return out
}

// What the money did between two looks, a word for each part: "wages −$380, orders −$110" (orders: seed, equipment and jobs).
export function moneyMoved(a: MoneyLook, b: MoneyLook): string {
  const parts: string[] = []
  let named = 0, namedIn = 0
  for (const [k, word, sign] of MONEY_PARTS) {
    const d = (b[k] ?? 0) - (a[k] ?? 0)
    if (Math.abs(d) < 0.5) continue
    if (sign < 0) named += d
    else namedIn += d
    parts.push(`${word} ${sign < 0 ? '−' : '+'}${F.money(Math.abs(d))}`)
  }
  const otherOut = (b.costs - a.costs) - named
  const otherIn = (b.revenue - a.revenue) - namedIn
  if (otherOut >= 0.5) parts.push(`주문 −${F.money(otherOut)}`)
  if (otherIn >= 0.5) parts.push(`판매 +${F.money(otherIn)}`)
  const rest = (b.cash - a.cash) - ((b.revenue - a.revenue) - (b.costs - a.costs))
  if (Math.abs(rest) >= 0.5) parts.push(`${rest < 0 ? '은행' : '기타'} ${rest < 0 ? '−' : '+'}${F.money(Math.abs(rest))}`)
  return parts.join(', ')
}

const MOMENT_MS = 1600
const MOVED_MS = 4000
// How many season days the cause of a move of the year-end figure stays under it.
const WHY_DAYS = 7
// A point in the year to time that by: the season's day, or past it, the winter's month.
const stampOf = (c: S.Campaign) => c.phase === 'cellar' ? 1000 + c.month : c.season?.day ?? 0
// The goals that are a field's job: put on the list by the player, or by the crew's routine.
const GOAL_ROUTINE: Record<string, S.JobKind> = { plant: 'plant', walk: 'scout', hill: 'hill', sample: 'sample', dig: 'dig', haul: 'haul', spray: 'spray', kill: 'kill' }
// The season's calls that are the player's to make (the routine sees to the rest), first to last.
const CALLS: Partial<Record<string, number>> = { rogue: 0, spray: 1, kill: 2, water: 3 }
// A call on the slip: what it is, where, why it cannot wait, and the one command that sees to it when there is one.
interface Call { id: string; act: string; field: number; text: string; why: string; fix: S.Cmd | null; fixLabel: string; line?: string; done?: string }

// Who a priority fix puts first, as the slip says it: "You" for the farmer, else their first name.
function whoFirst(c: S.Campaign, fix: S.Cmd): string {
  const u = c.crew.find(x => x.id === (fix as { unit: number }).unit)
  return !u ? '누군가' : u.kind === 'farmer' ? '당신' : firstName(u.name)
}

// Brings a control forward once the screen has drawn it: in view, ringed, under the keyboard.
export function light(selector: string, o: { open?: boolean; top?: boolean } = { open: true }): void {
  let tries = 0
  const go = () => {
    const el = document.querySelector<HTMLElement>(`#ui ${selector.split(', ').join(', #ui ')}`)
    if (!el) { if (++tries < 20) requestAnimationFrame(go); return }
    if (o.open && el.getAttribute('aria-expanded') === 'false') el.click()
    el.classList.add('goal-ring')
    el.scrollIntoView({ block: o.top ? 'start' : 'nearest' })
    el.focus({ preventScroll: true })
    setTimeout(() => el.classList.remove('goal-ring'), 4000)
  }
  requestAnimationFrame(go)
}
// Where a spring goal's Show me ends: the fold that holds its control, brought to the top of the sheet and ringed.
const FOLD_OF: Partial<Record<string, string>> = { tool: 'equipment-open', hire: 'crew-open', contract: 'contracts-open', land: 'land-open' }
// A goal named by a word a newcomer has not met says what it is, in a clause.
const GLOSS: Partial<Record<string, string>> = { foreman: '집에서 떨어진 밭을 맡아 돌보는 일꾼' }
// The crop's own steps: in spring they wait for the season to start.
const CROP_STEPS = new Set(['plant', 'walk', 'hill', 'spray', 'sample', 'kill', 'dig', 'haul'])

export interface TopBar {
  el: HTMLElement
  update(): void
  // Gives people with nothing to do a job on the land, as an idle key under the slip does.
  free(w: FreeWork): void
  // Closes the goal list or the materials, if one is open.
  escape(): boolean
}

// show: takes the player to where the goal is reached (a field, the yard, the hiring), when the screen knows one.
// The phone's season screen carries the clock and the menu at the thumb (season.ts): there the bank board leaves them out.
export function topBar(ctx: Ctx, o: { onMenu: () => void; onAlmanac?: () => void; onBuild?: () => void; show?: (g: Goal) => boolean; canShow?: (g: Goal) => boolean }): TopBar {
  const el = h('header', { class: 'topbar sys' })
  const app = ctx.app
  const contracts = contractRows(ctx)
  let cashWas: number | null = null
  let lookWas: MoneyLook | null = null
  let moved: { text: string; until: number } | null = null
  let lastMoved = ''
  let shown: Goal | null = null
  let met: { goal: Goal; until: number } | null = null
  let fresh = ''
  let pop: '' | 'goals' | 'materials' | 'money' = ''
  // The money breakdown opened by the pointer resting on its key closes when the pointer leaves; a press keeps it.
  let popBy: 'press' | 'hover' = 'press'
  let callShown = ''
  let callsFor: unknown = null
  let callList: Call[] = []
  let callsJobs = -1
  let viewFor: unknown = null
  let viewNow: ReturnType<typeof outlook> | null = null
  let viewCash = 0
  let whyNow: { text: string; at: number; ask: boolean; cause: S.MoneyCause } | null = null
  // The look the last cause was said from, the year the sum was first opened (until then a cause offers "Why?"), and
  // the year the loan's note was said.
  let watch: S.MoneyWatch | null = null
  let openedIn = -1
  let loanSaid = -1
  const closePop = (e: Event) => { if (pop && !(e.target as HTMLElement).closest?.('.tb-pop, .goal, .materials, .after-key, .why-key, [data-testid="bar-money"]')) { pop = ''; ctx.dirty() } }
  const openMoney = (by: 'press' | 'hover') => { if (pop === 'money' && by === 'press' && popBy === 'press') pop = ''; else { pop = 'money'; popBy = by; openedIn = app.campaign?.year ?? -1; if (whyNow) whyNow.ask = false } ctx.dirty() }
  // A cause's remedy: its field, with its card open and the order that helps lit.
  const fix = (why: S.MoneyCause) => {
    if (why.field === undefined || !why.remedy) return
    app.select(why.field)
    app.focus(why.field)
    light(`[data-testid="order-${why.remedy}"]`, { open: false })
  }
  // Whether the remedy the board offers is already on the work list, or can no longer be ordered (rain has wet the
  // ground since): its key goes.
  const remedied = (c: S.Campaign): boolean => !!whyNow?.cause.remedy && whyNow.cause.field !== undefined
    && (!!c.season?.jobs.some(j => j.kind === whyNow!.cause.remedy && j.field === whyNow!.cause.field) || S.jobBlock(c, whyNow.cause.remedy, whyNow.cause.field) !== '')
  // The board's own key for it gives the order, at the cost printed on the key. If the order cannot be given (it is on
  // the list already, nobody can do it), the field is shown instead, with why.
  const order = (why: S.MoneyCause) => {
    if (why.field === undefined || !why.remedy) return
    const r = app.order(why.remedy, { fields: [why.field], unit: -1 })[0]
    if (r?.ok) ctx.say(`${S.FIELD_NAMES[why.field]} ${JOB_DOING[why.remedy]}을(를) 작업 목록에 올렸습니다.`, 'info')
    else { fix(why); if (r?.err) ctx.say(`${S.FIELD_NAMES[why.field]}: ${r.err}`, 'info') }
  }
  let leaving = 0
  const leaveMoney = () => { if (pop !== 'money' || popBy !== 'hover') return; clearTimeout(leaving); leaving = window.setTimeout(() => { if (pop === 'money' && popBy === 'hover' && !el.querySelector('.money-pop:hover, .after-key:hover')) { pop = ''; ctx.dirty() } }, 250) }
  document.addEventListener('pointerdown', closePop, true)

  // A goal met is marked: the line strikes through, then the next one writes itself in.
  function goalNow(c: S.Campaign): { g: Goal | null; met: Goal | null } {
    const next = nextGoal(c)
    const now = performance.now()
    if (shown && next?.id !== shown.id && goals(c).find(x => x.id === shown!.id)?.done) {
      met = { goal: shown, until: now + (ctx.reduced() ? 0 : MOMENT_MS) }
      fresh = next?.id ?? ''
      ctx.announce(`완료: ${shown.title}.${next ? ` 다음: ${next.title}.` : ''}`)
      setTimeout(() => ctx.dirty(), MOMENT_MS + 30)
    }
    shown = next
    if (met && now >= met.until) met = null
    return { g: next, met: met?.goal ?? null }
  }

  function ladder(c: S.Campaign, g: Goal | null): Child {
    const all = goals(c)
    const steps = all.filter(x => !x.long)
    const reached = steps.filter(x => x.done)
    const ahead = steps.filter(x => !x.done && x.id !== g?.id).slice(0, 4)
    // Every step that can be taken now leads to its control; one the farm cannot pay for says what it costs.
    const row = (x: Goal, cls: string) => h('li', { class: `gl ${cls}`, k: `gl-${x.id}` },
      x.done ? h('i', { class: 'tick on', 'aria-hidden': 'true' }) : cls === 'now' ? fist() : h('i', { class: 'tick', 'aria-hidden': 'true' }),
      h('span', { class: `gl-t${x.done ? ' struck' : ''}` }, x.title),
      x.progress ? h('span', { class: 'gl-n num' }, progressText(x)) : null,
      cls === 'now' ? h('span', { class: 'gl-why' }, x.why, !x.now ? ` ${x.when}.` : '') : cls === 'later' ? h('span', { class: 'gl-when' }, x.block && x.now ? notYet(c, x) : x.when) : null,
      cls === 'now' && x.block ? h('span', { class: 'gl-when c-red' }, F.localize(x.block)) : null,
      !x.done && x.now && !x.block && o.show && o.canShow?.(x)
        ? h('button', { class: 'btn', type: 'button', testid: cls === 'now' ? 'goal-show' : `goal-show-${x.id}`, onclick: () => showGoal(x) }, icon('arrow', 'i'), '보여주기') : null)
    return h('div', { class: 'tb-pop goals-pop sheet', testid: 'goals', role: 'dialog', 'aria-label': '목표' },
      h('p', { class: 't-label' }, '당신의 목표'),
      h('ol', { class: 'gls' },
        reached.length > 3 ? h('li', { class: 'gl done more' }, h('i', { class: 'tick on', 'aria-hidden': 'true' }), h('span', { class: 'gl-t' }, `${reached.length - 3}개 더 완료`)) : null,
        reached.slice(-3).map(x => row(x, 'done')),
        g && !g.long ? row(g, 'now') : null,
        ahead.map(x => row(x, 'later'))),
      c.history.length ? [h('p', { class: 't-label' }, '장기 목표'),
        h('ol', { class: 'gls' }, all.filter(x => x.long).map(x => row(x, x.done ? 'done' : x.id === g?.id ? 'now' : 'long')))] : null)
  }

  function materials(c: S.Campaign): Child {
    const m = S.materialsInfo(c)
    const some = Math.min(5, Math.floor(m.logs))
    const sell = (loads: number) => { const r = ctx.run({ t: 'sellLogs', loads }); if (r.ok) ctx.announce(F.localize(r.events[0]?.text ?? '')) }
    return h('div', { class: 'tb-pop mat-pop sheet', testid: 'materials-pop', role: 'dialog', 'aria-label': '통나무와 돌' },
      h('p', { class: 'mat-row' }, icon('logs', 'i'), h('b', { class: 'num' }, `통나무 ${F.num(m.logs, m.logs % 1 && m.logs < 10 ? 1 : 0)}적재분`)),
      h('p', { class: 't-caption' }, `제재소에서 적재분당 ${F.money(m.logPrice)}를 줍니다.`),
      logsWanted(c) ? h('p', { class: 't-caption c-red', testid: 'logs-wanted' }, logsWanted(c)) : null,
      m.sellWhy ? h('p', { class: 't-caption' }, m.sellWhy) : h('div', { class: 'mat-sell' },
        some >= 1 && some < m.logs - 0.05 ? h('button', { class: 'btn', type: 'button', testid: 'sell-logs-some', onclick: () => sell(some) }, `${some} 판매`, h('span', { class: 'sub num' }, F.money(some * m.logPrice))) : null,
        h('button', { class: 'btn', type: 'button', testid: 'sell-logs-all', onclick: () => sell(m.logs) }, '모두 판매', h('span', { class: 'sub num' }, F.money(m.logs * m.logPrice)))),
      h('p', { class: 'mat-row' }, icon('stone', 'i'), h('b', { class: 'num' }, `돌 ${F.num(m.stone, m.stone % 1 && m.stone < 10 ? 1 : 0)}적재분`)),
      h('p', { class: 't-caption' }, `건축에 씁니다. 채석장에서 사면 적재분당 ${F.money(m.quarryPrice)}입니다.`))
  }

  // The season's call that cannot wait for a goal: a field's spray, water, roguing or vine kill, or any work marked
  // urgent. The one shown stays while it is still wanted, so the slip never swaps between two.
  // First the simulation's pressing work (not ordered, or nobody will take it), with its one-click fix; then a field's
  // own call from the advice.
  function pressing(c: S.Campaign): Call | null {
    if (c.phase !== 'season' || !c.season) { callShown = ''; return null }
    // Worked out again only when the farm has changed (the advice is cached on the same revision).
    const needs = app.needs()
    const jobs = c.season.jobs.length
    if (needs !== callsFor || jobs !== callsJobs) { callsFor = needs; callsJobs = jobs; callList = callsNow(c) }
    const list = callList
    if (!list.length) { callShown = ''; return null }
    const pick = list.find(x => x.id === callShown) ?? list[0]
    callShown = pick.id
    return pick
  }

  function callsNow(c: S.Campaign): Call[] {
    const urgent: Call[] = S.pressing(app.world, c).map(p => ({
      id: `p-${p.kind}-${p.field}`, act: p.kind, field: p.field, text: `${JOB_VERB[p.kind]} ${S.FIELD_NAMES[p.field]}`, why: `${F.upper(p.why)}. ${p.inWay}`,
      line: p.kind === 'kill' ? p.inWay.replace(/, so .*$/, '').replace(/\.$/, '') : undefined,
      fix: p.fix, fixLabel: p.fix?.t === 'job' ? '지시하기' : p.fix?.t === 'priority' ? (whoFirst(c, p.fix) === '당신' ? '직접 다음으로 하기' : `${whoFirst(c, p.fix)}이(가) 다음으로 하게 하기`) : '보여주기',
      done: p.fix?.t === 'priority' ? `${whoFirst(c, p.fix) === '당신' ? '당신의' : whoFirst(c, p.fix) + '의'} 다음 차례: ${jobText(p)}.` : p.fix?.t === 'job' ? `${jobText(p)}을(를) 작업 목록에 올렸습니다.` : undefined,
    }))
    const calls: Call[] = app.needs().map((n, field) => ({ need: n.need!, field }))
      .filter(x => x.need && x.need.act !== 'close' && x.need.act !== 'wait' && x.need.act !== 'sell' && (CALLS[x.need.act] !== undefined || x.need.urgent))
      .sort((a, b) => (CALLS[a.need.act] ?? 9) - (CALLS[b.need.act] ?? 9) || Number(b.need.urgent) - Number(a.need.urgent))
      .map(x => ({ id: x.need.id, act: x.need.act, field: x.field, text: F.localize(x.need.text), why: F.localize(x.need.why), fix: null, fixLabel: '보여주기' }))
    return [...urgent, ...calls.filter(x => !urgent.some(u => u.act === x.act && u.field === x.field))]
  }

  function takeCall(call: Call): void {
    // What the fix did is said where the player looks, not only to a screen reader.
    if (call.fix) { const r = ctx.run(call.fix); if (r.ok) ctx.say(call.done ?? F.localize(r.events[0]?.text ?? `완료: ${call.text}.`), 'good') }
    if (call.field >= 0) { app.select(call.field); app.focus(call.field) }
    ctx.dirty()
  }

  // People with nothing to do (the owner, 14 November, of a slip that said "Everyone is idle" beside a key that said
  // "Order it": "order it? order what?"): who they are, and each job they can be given as a key that names it. A
  // key pressed puts the order on the list, says what it is for, and shows its place. Build opens the build menu.
  function giveFree(w: FreeWork): void {
    const r = app.order(w.kind, { fields: [w.field] })[0]
    if (r?.ok) ctx.say(`${S.FIELD_NAMES[w.field]} ${JOB_DOING[w.kind]}을(를) 작업 목록에 올렸습니다. ${w.gain}`, 'good')
    else ctx.say(`${S.FIELD_NAMES[w.field]}: ${r?.err ?? '지금은 지시할 수 없습니다.'}`, 'info')
    app.setHover(-1)
    app.focus(w.field)
    ctx.dirty()
  }
  function idleRow(c: S.Campaign): HTMLElement | null {
    const idle = c.phase === 'season' ? idleWork(c) : null
    if (!idle) return null
    const one = c.crew.find(u => u.id === idle.who[0])
    const who = idle.who.length === c.crew.length && c.crew.length > 1 ? '모두 한가합니다' : idle.who.length === 1 && one ? (one.kind === 'farmer' ? '당신은 한가합니다' : `${firstName(one.name)}은(는) 한가합니다`) : `${idle.who.length}명이 한가합니다`
    // (one line: who, and each job as a key that names it; its place is on the key's slip, lit on the land under the
    // pointer, and said when the order is given)
    return h('div', { class: 'idle-row', testid: 'idle', role: 'group', 'aria-label': '할 일이 없는 사람들' },
      h('span', { class: 'sr' }, `${who}. `),
      idle.options.map((w, k) => h('button', {
        class: 'btn idle-key', type: 'button', testid: `idle-do-${k}`, 'data-kind': w.kind, 'aria-label': `${w.kind === 'fell' ? '나무 베기: 통나무' : w.kind === 'brush' ? '덤불 자르기: 서리 감소' : '돌 줍기: 돌'}, ${S.FIELD_NAMES[w.field]}`,
        title: ctx.touch() ? undefined : `${S.FIELD_NAMES[w.field]}. ${w.gain} 작물 작업이 먼저입니다. 거기 필요한 사람은 이 일을 내려놓습니다.`,
        onclick: () => giveFree(w),
        onpointerenter: (e: Event) => { if ((e as PointerEvent).pointerType === 'mouse') app.setHover(w.field) }, onpointerleave: () => { if (app.hover === w.field) app.setHover(-1) },
      }, icon(w.kind, 'i'), w.kind === 'fell' ? '나무 베기: 통나무' : w.kind === 'brush' ? '덤불 자르기: 서리 감소' : '돌 줍기: 돌')))
  }

  // Why a goal is not the fist's to point at now, in a few words.
  function notYet(c: S.Campaign, g: Goal): string {
    const act = GOAL_ROUTINE[g.id]
    if (!g.now) return lowerFirst(g.when)
    if (g.block) return F.localize(g.block).replace(/\.$/, '')
    if (act && c.season?.jobs.some(j => j.kind === act)) return '작업 목록에 있음'
    // The vine kill: the day the coach expects to ask for it on the first field due (S.killOutlook).
    if (g.id === 'kill' && c.season) {
      const due = c.season.fields.map((_, i) => S.isField(c, i) ? S.killOutlook(c, i) : null).filter((k): k is S.KillOutlook => !!k).sort((a, b) => a.day - b.day)[0]
      if (due) return due.asked ? `${F.date(c.year, due.day, true)}부터 해야 함` : `${F.date(c.year, due.day, true)}쯤 해야 함`
    }
    if (act && S.routineInfo(c).some(r => r.kind === act && r.auto)) return '작업반이 자동으로 처리함'
    if (g.id === 'hire') { const why = S.hireRoom(c); if (why) return F.localize(why).replace(/\.$/, '').toLowerCase() }
    return lowerFirst(g.when)
  }

  // A goal's "Show me": to the control where it is reached. A foreman is named on the person's card, its key lit.
  function showGoal(g: Goal): void {
    pop = ''
    o.show?.(g)
    ctx.dirty()
    if (g.id === 'foreman') light('[data-testid="person-foreman"], .cat-foreman .btn')
    else if (FOLD_OF[g.id] && app.campaign?.phase === 'plan') light(`[data-testid="${FOLD_OF[g.id]}"]`, { top: true })
  }

  // The fist's slip: the one next thing, with the fist; a goal just met is struck through above it.
  function goalSlip(c: S.Campaign, g: Goal | null, gone: Goal | null, season: boolean): Child {
    const line = g ?? gone
    if (!line) return null
    // In a later season the crop's own next step comes ahead of a farmstead goal, which waits in the line under it.
    let later: Goal | null = null
    if (season && g && !CROP_STEPS.has(g.id)) { const st = seasonStep(c); if (st) { later = g; g = st } }
    // The line under it names the farmstead goal only while that goal can be taken: not a contract in July.
    const then = later && later.now && !later.block ? `그다음 ${later.title}${GLOSS[later.id] ? ` (${GLOSS[later.id]})` : ''}` : ''
    const gloss = g && GLOSS[g.id] ? GLOSS[g.id]! : ''
    // Before the ground is fit, the planting goal says plainly how long it will be, counting down by the day.
    // (Once the word is given the planting is under way: the slip says how far along it is, not the soil again.)
    const wait = g && g.id === 'plant' && season && !(c.season && S.plantWordGiven(c.season)) && !app.needs().some(n => n.need?.act === 'plant') ? plantingIn(app.world, c) : -1
    // The one planting rule (S.plantReady) gives the temperature and the reason, as the field's card and the guide do.
    const first = season ? c.plans.findIndex((p, i) => S.isField(c, i) && p.crop === 'potato') : -1
    const ready = wait > 0 && first >= 0 ? S.plantReady(app.world, c, first) : null
    // The soil fit and the crew standing ready: the year's first planting waits for the player's word.
    const word = !!g && g.id === 'plant' && season && !!c.season && !S.plantWordGiven(c.season) && app.needs().some(n => n.need?.act === 'plant')
    // On the spring plan the one way on is Start the season: the slip names that key, not what comes after it.
    const toStart = c.phase === 'plan' && !!g && CROP_STEPS.has(g.id) && g.now
    const title = toStart ? '시즌 시작하기' : ready ? `흙이 ${F.temp(ready.need)}에 이르면 심기` : word ? '심기 시작하기' : g?.title ?? ''
    const n = wait > 1 ? `약 ${wait}일` : wait === 1 ? '곧' : g ? progressText(g) : ''
    const when = !g ? null : !g.now ? h('span', { class: 'goal-when' }, lowerFirst(g.when))
      : toStart ? h('span', { class: 'goal-when' }, '계획이 준비됐고 나머지는 선택입니다')
        : ready && !then ? h('span', { class: 'goal-when' }, `오늘 ${F.temp(ready.soilT)}입니다`)
          : null
    // While the soil warms there is nothing to do but wait: a key beside the slip lets the weeks go by at 3x.
    const faster = wait > 0 && app.speed < 3 && !S.seasonDone(c)
      ? h('button', { class: 'btn goal-go', type: 'button', testid: 'goal-faster', title: ctx.touch() ? undefined : '결정할 일이 생길 때까지 빠르게 돌리고 원래 속도로 돌아갑니다', onclick: () => app.skipAhead() },
        icon('fast', 'i'), '앞으로 건너뛰기') : null
    // The fist points only at what can be done now and paid for: the season's pressing call first (a long goal waits
    // in the quiet line under it), then the goal when its control can be reached; anything else is said quietly.
    const reach = !!g && wait <= 0 && g.now && !g.block && (o.canShow?.(g) ?? false)
    const call = season ? pressing(c) : null
    const callFirst = call && !(g && reach && GOAL_ROUTINE[g.id] === call.act)
    // The next step is the crew's own: what the player is waiting for, in their terms, never the crew's job, whether
    // or not a "Show me" could reach it. With something asked of the player now, that comes first.
    const mine = !call && season && g && wait <= 0 && CROP_STEPS.has(g.id) ? waitingFor(c, app.world) : null
    // What comes after the pressing call: the next goal, unless that is work the crew does by itself.
    const crewOwn = (x: Goal) => { const act = GOAL_ROUTINE[x.id]; return !!act && S.routineInfo(c).some(r => r.kind === act && r.auto) }
    // While the player waits on the crop and somebody is idle, the slip is the thing to do now, and the line under
    // it what is waited for; the keys that give the work hang right under it. (Four fresh viewers of the two
    // together: which is the task?)
    const busy = !callFirst && !!mine && !!idleWork(c)
    if (callFirst || mine || (season && g && !reach && wait <= 0)) {
      const quiet = h('button', {
        class: `goal${callFirst || busy ? '' : ' later'}`, type: 'button', testid: 'goal', k: callFirst ? `goal-call-${call!.id}` : `goal-${busy ? 'busy' : 'later'}-${g!.id}`, 'data-waiting': mine ? 'crew' : undefined, 'aria-expanded': String(pop === 'goals'),
        title: ctx.touch() ? undefined : callFirst ? F.localize(call!.why) : g!.why,
        onclick: () => { pop = pop === 'goals' ? '' : 'goals'; ctx.dirty() },
      }, callFirst || busy ? fist() : null, h('span', { class: 'goal-body' }, h('span', { class: 'sr' }, callFirst || busy ? '지금: ' : '다음 목표: '),
        h('b', { class: 'goal-t' }, callFirst ? F.localize(call!.text).replace(/\.$/, '') : busy ? '일꾼을 바쁘게 두기' : mine ? mine.title : g!.title),
        callFirst ? (call!.line ? h('span', { class: 'goal-when' }, call!.line) : g && !crewOwn(g) ? h('span', { class: 'goal-when' }, `그다음 ${g.title}${reach ? '' : ` (${notYet(c, g)})`}`) : null) : h('span', { class: 'goal-when' }, busy ? `${mine!.title}${/^due /.test(mine!.when) ? `, ${F.localize(mine!.when.split(',')[0])}` : ''}` : `${mine ? F.localize(mine.when) : notYet(c, g!)}${then ? ` · ${then}` : ''}`)),
      h('span', { class: 'sr' }, `. ${callFirst ? F.localize(call!.why) : g!.why} 누르면 목표가 열립니다.`))
      const go = callFirst ? h('button', { class: 'btn goal-go', type: 'button', testid: 'goal-do', onclick: () => takeCall(call!) }, icon(call!.fix ? 'check' : 'arrow', 'i'), call!.fixLabel)
        // Waiting on the crop with nothing to decide: the same key as while the soil warms. (Round ten: all three players'
        // first complaint was the waiting, "a 'skip to the next thing that needs me' button".)
        // (at a wide desk only: beside the slip on a smaller window the key took 48 px of height from a card opened
        // under it, and a hired hand's card lost its last key there)
        : mine && !busy && season && !S.seasonDone(c) && app.skipBack === 0 && ctx.layout() === 'wide' ? h('button', { class: 'btn goal-go', type: 'button', testid: 'goal-faster', title: ctx.touch() ? undefined : '결정할 일이 생길 때까지 날을 빠르게 돌리고 원래 속도로 돌아갑니다', onclick: () => app.skipAhead() },
          icon('fast', 'i'), '앞으로 건너뛰기')
          : null
      return go ? h('div', { class: 'goal-row' }, quiet, go) : quiet
    }
    const doIt = g && reach && o.show ? h('button', { class: 'btn goal-go', type: 'button', testid: 'goal-do', onclick: () => showGoal(g) }, icon('arrow', 'i'), '보여주기') : null
    // A goal that waits for another part of the year, or for money the farm has not got, is said without the fist.
    const quiet = !!g && (!g.now || !!g.block)
    const slip = h('button', {
      class: `goal${gone ? ' met' : g && g.id === fresh ? ' fresh' : ''}${quiet && !gone ? ' later' : ''}`, type: 'button', testid: 'goal', k: `goal-${g?.id ?? ''}${gone ? `-was-${gone.id}` : ''}`,
      'aria-expanded': String(pop === 'goals'), title: ctx.touch() || !g ? undefined : ready ? F.localize(ready.why) : g.why,
      onclick: () => { pop = pop === 'goals' ? '' : 'goals'; ctx.dirty() },
    },
    gone ? h('span', { class: 'was struck' }, h('span', { class: 'sr' }, '완료: '), gone.title) : null,
    g ? [quiet ? null : fist(), h('span', { class: 'goal-body' },
      h('span', { class: 'sr' }, '다음 목표: '), h('b', { class: 'goal-t' }, title), quiet ? h('span', { class: 'goal-when' }, `${notYet(c, g)}${then ? ` · ${then}` : ''}`) : when ?? (then || gloss ? h('span', { class: 'goal-when' }, then || gloss) : null)),
    n ? h('span', { class: 'count goal-n num', testid: wait > 0 ? 'goal-wait' : undefined }, n) : null,
    h('span', { class: 'sr' }, `. ${g.why} 누르면 목표가 열립니다.`)] : null)
    return faster || doIt ? h('div', { class: 'goal-row' }, slip, faster ?? doIt) : slip
  }

  function update(): void {
    const c = app.campaign
    if (!c) return
    const layout = ctx.layout()
    const season = c.phase === 'season' && !!c.season
    const low = layout === 'narrow' || layout === 'short'
    const fc = season ? cells(ctx, c) : []
    const days = layout === 'narrow' ? 3 : layout === 'short' ? 4 : 6
    // On a phone in the season the clock and the menu are at the thumb (season.ts), not on the board.
    const withClock = season && !low
    const withMenu = !(season && low)
    const { g, met: gone } = goalNow(c)
    const counted = season || c.phase === 'cellar'
    if (counted && (app.needs() !== viewFor || viewCash !== Math.round(c.cash))) {
      // The first time in a season the spring loan grows, a note says what it is.
      if (loanNoteNow(c, viewCash, loanSaid)) { loanSaid = c.year; ctx.notes.push({ text: LOAN_NOTE, offer: true, glyph: 'bank' }) }
      viewFor = app.needs(); viewCash = Math.round(c.cash)
      viewNow = outlook(ctx, c)
      // A move of the year-end figure since the last one said, however slowly it came, says its cause under it for a
      // week of the season or the winter's month; the first in a year offers the breakdown with "Why?".
      const r = S.moneyWatch(watch, viewNow.look)
      watch = r.watch
      const why = r.cause
      // A move that only takes back the last one said is no change of the figure: its line goes, and nothing is said.
      if (r.cancel) whyNow = null
      const ask = !!why && openedIn !== c.year
      // An upright phone's board has no room for it (a fifth of the height): there it is an alert, which goes to the
      // field on the order that helps, or else opens the sum.
      if (why && season && low) ctx.notes.push({ text: causeLine(why, true), go: () => why.remedy ? fix(why) : openMoney('press'), offer: true })
      else if (why) whyNow = { text: causeLine(why), at: stampOf(c), ask, cause: why }
    }
    if (whyNow && (!counted || stampOf(c) - whyNow.at > (season ? WHY_DAYS : 0) || stampOf(c) < whyNow.at)) whyNow = null
    if (pop === 'money' && !counted) pop = ''
    const view = counted ? viewNow : null
    // When the money moves, what moved it shows under the balance for a moment, and stays on the balance's hover.
    const look = moneyLook(c)
    const now = performance.now()
    if (lookWas && lookWas.year === c.year && Math.abs(look.cash - lookWas.cash) >= 0.5) {
      const text = moneyMoved(lookWas, look)
      if (text) { lastMoved = text; moved = { text, until: now + MOVED_MS }; setTimeout(() => ctx.dirty(), MOVED_MS + 30) }
    }
    lookWas = { ...look, year: c.year }
    if (moved && now >= moved.until) moved = null
    const mats = c.logs >= 0.05 || c.stone >= 0.05
    if (pop === 'materials' && !mats) pop = ''
    const stopped = season && app.speed === 0 && (c.incidents.length > 0 || ctx.awaiting > 0)
    const model = {
      p: c.phase, y: c.year, day: c.season?.day, m: c.month, cash: Math.round(c.cash), sp: app.speed, at: app.resumeSpeed, done: season && S.seasonDone(c) && !ctx.awaiting, layout,
      w: c.season?.watchDay, f: c.season?.log.filter(e => e.type === 'frost').length, u: app.settings.units, t: ctx.touch(), days, withClock, withMenu, stopped,
      g: g ? [g.id, progressText(g), g.now] : 0, gone: gone?.id ?? '', fresh, pop, wait: season && g?.id === 'plant' ? plantingIn(app.world, c) : -1, mats: mats ? [Math.round(c.logs * 10), Math.round(c.stone * 10)] : 0,
      ladder: pop === 'goals' ? goals(c).map(x => [x.id, x.done, progressText(x), x.block, x.now && !x.done && !!o.canShow?.(x)]) : 0, reach: g ? !!o.canShow?.(g) : false,
      call: season ? pressing(c)?.id ?? '' : '', block: g?.block ?? '', view: view?.why ?? '', moved: moved?.text ?? '', last: lastMoved, why: whyNow ? [whyNow.text, whyNow.ask, remedied(c)] : '', by: popBy,
      jobs: season ? [...new Set(c.season!.jobs.map(j => j.kind))].sort().join() : '', auto: season ? S.routineInfo(c).filter(r => r.auto).map(r => r.kind).join() : '',
      k: season || c.phase === 'cellar' ? contracts.key() : 0, ph: season ? phaseNow(c) : '', mine: season ? waitingFor(c, app.world) : 0, free: season ? idleWork(c) : 0, skip: app.skipBack,
    }
    el.dataset.phase = c.phase
    el.dataset.layout = layout
    // On an upright phone in the season there is one board: the balance is its third column (design/season.phone.html).
    const phone = season && layout === 'narrow'
    // A low window's board keeps to its figures: its lines are said by the alerts, and it never grows or shrinks.
    const lines = !(season && low)
    patch(el, JSON.stringify(model), () => {
      // Through the season and the winter, beside the cash and at its weight: what the farm has after the year-end
      // bills, so the cash is never read as what the farm will keep.
      // Its label is the key to the sum that makes it; the give-or-take shows only while it reaches the bank's limit.
      const after = view ? h('div', { class: `after${view.risk === 'likely' ? ' bad' : view.risk === 'possible' ? ' warn' : ''}`, testid: 'outlook' },
        h('button', {
          class: 'after-key t-label', type: 'button', testid: 'outlook-key', 'aria-expanded': String(pop === 'money'), 'aria-controls': 'money-pop',
          onclick: () => openMoney('press'), onpointerenter: (e: Event) => { if ((e as PointerEvent).pointerType === 'mouse' && pop !== 'money') openMoney('hover') }, onpointerleave: leaveMoney,
        }, h('span', { class: 'long' }, view.label), h('span', { class: 'short', 'aria-hidden': 'true' }, view.before ? '수확 전' : '결산 후'), h('span', { class: 'sr' }, '. 누르면 구성을 봅니다.')),
        h('span', { class: 't-figure num' }, F.money(view.figure)),
        view.reach ? h('span', { class: 'give num', testid: 'outlook-spread', 'aria-hidden': 'true' }, `±${F.money(view.spread)}`) : h('span', { class: 'give idle', 'aria-hidden': 'true' }, '\u00a0'),
        h('span', { class: 'sr' }, `. ${view.why}`)) : null
      // Cash below zero through the season and the winter is what the bank has lent, said as that, not as a loss.
      const borrowed = !!after && c.cash < 0
      const balance = h('div', { class: `balance${after ? ' two' : ''}` },
        h('span', { class: `t-label when${c.cash < 0 ? ' owed' : ''}` }, borrowed ? '빚' : c.cash < 0 ? '적자' : after ? '현금' : '잔액'),
        h('span', {
          class: `t-figure cash${c.cash < 0 && !borrowed ? ' neg' : ''}${c.cash < 0 ? ' owed' : ''}`, testid: 'cash',
          title: ctx.touch() ? undefined : `${c.cash >= 0 ? '' : borrowed ? BORROWED_SAYS : '봄 융자로 진 빚이며 작물이 갚아줍니다. 연말에 적자가 너무 크면 은행이 농장을 넘겨받습니다.'}${lastMoved ? ` 마지막 변동: ${lastMoved}.` : ''}` || undefined,
        }, h('span', { class: 'sr' }, borrowed ? '은행 빚: ' : '현금: '), h('span', { class: 'cash-v num' }, F.money(borrowed ? -c.cash : c.cash))),
        moved && lines ? h('span', { class: 'cash-moved', testid: 'cash-moved', role: 'status' }, moved.text) : null,
        // The cash's line and the figure's line keep their rows whether they say anything or not, so the keys under
        // the board never move.
        after && lines && !moved ? h('span', { class: 'cash-moved idle', 'aria-hidden': 'true' }, '\u00a0') : null,
        after,
        // Under the figure, what moved it; and while nothing has, the goal it is read against (two fresh viewers of
        // the board, 14 November: "the screen never says" what the goal is).
        after && lines ? h('span', { class: `after-why${whyNow ? '' : ' goal-line'}`, testid: whyNow ? 'outlook-why' : 'outlook-goal', role: whyNow ? 'status' : undefined },
          whyNow ? [h('span', { class: 'why-t' }, whyNow.cause.text), Math.abs(whyNow.cause.amount) < 0.5 ? null : h('span', { class: 'why-amt num' }, `: ${signedMoney(whyNow.cause.amount)}`),
            whyNow.cause.remedy && !remedied(c) ? [' ', h('button', { class: 'why-key fix-key', type: 'button', testid: 'outlook-fix', onclick: () => (REMEDY[whyNow!.cause.remedy!] ? order(whyNow!.cause) : fix(whyNow!.cause)) },
              REMEDY[whyNow.cause.remedy] ? [REMEDY[whyNow.cause.remedy], ' ', h('span', { class: 'num' }, F.money(S.jobCost(c, whyNow.cause.remedy, whyNow.cause.field ?? -1)))] : '보여주기')] : null,
            whyNow.ask ? [' ', h('button', { class: 'why-key', type: 'button', testid: 'outlook-why-open', 'aria-label': '왜?', title: ctx.touch() ? undefined : '왜?', 'aria-expanded': String(pop === 'money'), onclick: () => openMoney('press') }, icon('help', 'i'))] : null]
            : h('span', { class: 'why-t' }, `목표: 연말에 $0 이상으로 끝내기`)) : null)
      // The sum that makes the figure, under the board, clear of the speed keys.
      const money = pop === 'money' && view ? h('div', {
        class: 'tb-pop money-pop sheet', id: 'money-pop', testid: 'money-pop', role: 'dialog', 'aria-label': '연말 수치의 구성',
        onpointerleave: leaveMoney,
      }, h('p', { class: 'mp-head it' }, view.head),
      h('table', { class: 'mp-sum' }, h('tbody', null, view.lines.map((p, i) => h('tr', { class: p.id === 'spent' ? 'spent' : null },
        h('th', { scope: 'row' }, p.label, p.of?.length ? h('span', { class: 'mp-of' }, ` (${p.of.map(q => `${q.label} ${F.money(q.amount)}`).join(', ')})`) : null),
        h('td', { class: 'num' }, i ? signed(p.amount) : F.money(p.amount))))),
      h('tfoot', null, h('tr', { class: 'total' }, h('th', { scope: 'row' }, view.label), h('td', { class: 'num' }, F.money(view.figure))))),
      view.says ? h('p', { class: 't-caption' }, view.says) : null) : null
      return [
        h('section', { class: 'almanac', 'aria-label': '날짜, 날씨와 다음 목표' },
          h('div', { class: 'mount' },
            h('div', { class: `face${season ? '' : ' plain'}` },
              leaf(c),
              season ? h('button', { class: 'forecast', type: 'button', testid: 'forecast', onclick: () => o.onAlmanac?.() },
                // The figures are for the eye; a screen reader gets the days in words.
                h('span', { class: 'sr' }, `${fc.map(x => x.said).join(' ')} 누르면 연감에서 전체 예보를 봅니다.`),
                // (each day says itself under the pointer: a player hovered the red blight mark and got nothing)
                fc.slice(0, days).map(x => h('span', { class: 'd', 'aria-hidden': 'true', title: ctx.touch() ? undefined : x.said },
                  h('span', { class: 't-label' }, x.day),
                  icon(x.sky, 'i'),
                  h('span', { class: 'hi num' }, `${F.degrees(x.hi)}°`),
                  h('span', { class: 'wet num' },
                    // (a day's column keeps its width: with a mark for blight or frost the chance of rain is left to the
                    // sky drawn above it, and to the almanac)
                    x.rain >= 30 && !(x.blight > 0 || x.frost >= 30) ? h('span', { class: 'pct' }, `${x.rain}%`) : null,
                    x.blight > 0 ? icon('blight', 'i risk') : null,
                    x.frost >= 30 ? icon('frost', 'i cold') : null)))) : null,
              phone ? balance : null),
            season ? seasonTrack(c) : null,
            season ? phaseRow(c) : null),
          // (with somebody idle the slip and the keys that give them work are one card: one thing to do, said once)
          ...((): Child[] => { const slip = goalSlip(c, g, gone, season), idle = season ? idleRow(c) : null; return idle ? [h('div', { class: 'goal-stack' }, slip, idle)] : [slip] })(),
          pop === 'goals' ? ladder(c, g) : null,
          phone ? money : null),
        phone ? null : h('section', { class: 'bank', 'aria-label': '돈, 게임 속도와 계약' },
          h('div', { class: 'mount' },
            h('div', { class: 'face' },
              balance,
              withClock ? clock(ctx, layout === 'mid' && innerWidth < 1100, withMenu ? o.onMenu : undefined)
                : withMenu ? h('div', { class: 'clock plan' }, h('span', { class: 't-label season-word' }, PHASE_LABEL[c.phase]), menuKey(ctx, o.onMenu)) : null,
              mats ? h('button', {
                class: 'materials', type: 'button', testid: 'materials', 'aria-expanded': String(pop === 'materials'),
                onclick: () => { pop = pop === 'materials' ? '' : 'materials'; ctx.dirty() },
              }, c.logs >= 0.05 ? [icon('logs', 'i'), h('span', { class: 'num' }, `통나무 ${Math.floor(c.logs)}`)] : null,
              c.logs >= 0.05 && c.stone >= 0.05 ? h('span', { class: 'sr' }, ' 및 ') : null, c.stone >= 0.05 ? [icon('stone', 'i'), h('span', { class: 'num' }, `돌 ${F.num(Math.floor(c.stone))}`)] : null,
              h('span', { class: 'sr' }, ' 마당에 있습니다(적재분 기준). 누르면 보거나 통나무를 팝니다.')) : null,
              season || c.phase === 'cellar' ? contracts.part(c) : null)),
          pop === 'materials' && mats ? materials(c) : null,
          money,
          stopped ? h('p', { class: 'stopped-tag', role: 'status' }, icon('pause', 'i'), '당신을 기다리는 중') : null),
      ]
    })
    // Out of season the cash moves in a few large steps: each one counts, so it is seen to move.
    const cash = Math.round(c.cash)
    const v = el.querySelector<HTMLElement>('.cash-v')
    if (v && !season && cashWas !== null && cashWas !== cash) count(v, cashWas, cash, n => F.money(n))
    cashWas = cash
  }
  return {
    el, update, free: giveFree,
    escape() { if (!pop) return false; pop = ''; ctx.dirty(); return true },
  }
}
