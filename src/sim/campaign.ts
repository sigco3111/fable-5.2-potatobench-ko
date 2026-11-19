// The campaign: planning, the season, the cellar and the year-end ledger, all driven through apply().
import { asks, frostAhead, killCalled, noteKillAsks, plantAsked, standingOrders, wordToPlant } from './advice.ts'
import { contractOffers } from './buyers.ts'
import { hireBlock, hireRoom, newFarmer, newUnit } from './crew.ts'
import { BLOCK_NAME, BLOCKS, DUFOUR_YARD, HOME_FIELDS, HOME_YARD, PARCELS, YARDS, type BlockId } from './farm.ts'
import { lotCwt } from './harvest.ts'
import { sellLot } from './market.ts'
import * as P from './params.ts'
import { applicantsFor, fromApplicant, gainXp, jobSkill, payOf, SKILL_LABEL, speed, subject, willDo } from './people.ts'
import { heldUpBy } from './remedies.ts'
import { hash32 } from './rng.ts'
import {
  addJob, buildable, buildJob, closeIncidents, FIELD_NAMES, holdsDufour, JOB_LABEL, leftInField, letGo, releaseJob, removePerson, resolveIncident, seasonDone, sheltering,
  haulByDark, haulRate, placeName, startSeason, stepDay, tractorsRunning, unitBlock, workDay, workday,
} from './season.ts'
import { CHOICE_LABEL } from './incidents.ts'
import { article, buildBlock, buildCost, buildingAt, buildWork, buyLandBlock, hasBuilt, spendBlock, startBuilding, travel, YARD_NAME } from './buildings.ts'
import { brushedNow, COVER_WORD, fell, isField, standing } from './land.ts'
import type { Campaign, Cmd, Contract, Due, FieldPlan, GameEvent, Incident, JobKind, Lot, Result, RoutineKind, Season, SprayWay, Unit, UpgradeId, WinterWork, World, YearSummary } from './types.ts'
import { variety } from './varieties.ts'
import { dayIndex, formatDay, withCommas } from './calendar.ts'
import { ageLot, finishLot } from './harvest.ts'
import { hasYear } from './weather.ts'
import { yearLabel } from './climate.ts'

const REST_PLAN: FieldPlan = { crop: 'rest', variety: 'katahdin', seed: 'certified' }

export function lastStartYear(world: World): number {
  const ys = world.weather.playable
  return ys[ys.length - 1] - (P.GOAL_YEARS - 1)
}

export function startYears(world: World): number[] {
  const ys = world.weather.playable
  return ys.filter(y => {
    for (let k = 0; k < P.GOAL_YEARS; k++) if (!ys.includes(y + k)) return false
    return true
  })
}

export function held(c: Campaign, field: number): boolean {
  const f = c.fields[field]
  return !!f && f.tenure !== 'none'
}

function defaultPlan(c: Campaign, i: number): FieldPlan {
  // New ground rests a year first: its first potato crop on raw ground would grow less.
  if (!isField(c, i) || c.fields[i].raw) return { ...REST_PLAN }
  return { crop: c.fields[i].streak >= 2 ? 'rest' : 'potato', variety: 'katahdin', seed: 'certified' }
}

export function defaultPlans(c: Campaign): FieldPlan[] {
  return c.fields.map((_, i) => defaultPlan(c, i))
}

export function createCampaign(world: World, opts: { seed: number; startYear: number }): Campaign {
  if (!hasYear(world, opts.startYear)) throw new Error(`no weather for ${opts.startYear}`)
  const c: Campaign = {
    v: P.SAVE_VERSION,
    seed: opts.seed | 0,
    rng: hash32(opts.seed, opts.startYear, 77),
    startYear: opts.startYear, year: opts.startYear, yearIdx: 0, goalYears: P.GOAL_YEARS,
    phase: 'plan', outcome: '',
    cash: P.START_CASH,
    fields: PARCELS.map((p, i) => ({
      elev: p.elev, soil: Math.max(0, 1 - 0.5 * p.streak), vert: p.vert, streak: p.streak,
      tenure: i < HOME_FIELDS || p.holding === 'owned' ? 'owned' : 'none',
      cover: p.cover, stones: p.cover === 'open' ? p.stones : 0, raw: false, felled: 0, brushed: -1, tiled: false, works: null,
    })),
    plans: [],
    upgrades: { boom: false, harvester: false, vent: false, reel: false, tractor2: false, house2: false, tractor3: false, truck: false },
    seedStock: [], season: null, lots: [], nextLot: 1,
    crew: [newFarmer()], nextUnit: 1, applicants: [], sundaysOff: true, logs: 0, stone: 0, mortgages: [], buildings: [], nextBuilding: 1, pond: 0,
    incidents: [], nextIncident: 1, broken: [], heard: [], routine: { ...P.ROUTINE_DEFAULT },
    offers: [], contracts: [],
    month: 0,
    yearRevenue: 0, yearCosts: 0, yearRest: 0, yearStorage: 0,
    yearWages: 0, yearRent: 0, yearLand: 0, yearContracts: 0, yearPenalties: 0, yearLogs: 0, yearMortgage: 0, yearWorks: 0,
    yearBuilding: 0, yearStand: 0, yearPacking: 0,
    history: [], steps: 0,
  }
  c.plans = defaultPlans(c)
  c.offers = contractOffers(c.seed, c.year)
  c.applicants = springApplicants(c)
  return c
}

function springApplicants(c: Campaign): ReturnType<typeof applicantsFor> {
  return applicantsFor(c.seed, c.year, new Set(c.crew.map(u => u.name)))
}

export interface PlanCosts { fields: number; rent: number; wages: number; total: number }

// What beginning the season costs: growing each held field, the year's rent, and the first month of every hired wage.
export function planCosts(c: Campaign): PlanCosts {
  let fields = 0, rent = 0, wages = 0
  for (let i = 0; i < c.plans.length; i++) {
    if (!isField(c, i)) continue
    const p = c.plans[i]
    if (p.crop === 'rest') fields += P.REST_COST
    else fields += P.FIELD_COST + (p.seed === 'certified' ? P.SEED_CWT_PER_FIELD * P.CERT_SEED_PER_CWT : 0)
    if (c.fields[i].tenure === 'rented') rent += PARCELS[i].rent
  }
  for (const u of c.crew) wages += payOf(u)
  return { fields, rent, wages, total: fields + rent + wages }
}

export function planCost(c: Campaign): number {
  return planCosts(c).total
}

function savedSeedShort(c: Campaign): string {
  const need: Record<string, number> = {}
  c.plans.forEach((p, i) => { if (held(c, i) && p.crop === 'potato' && p.seed === 'saved') need[p.variety] = (need[p.variety] ?? 0) + 1 })
  for (const id of Object.keys(need)) {
    const have = c.seedStock.filter(s => s.variety === id).reduce((a, s) => a + s.fields, 0)
    if (have < need[id]) return `자가 ${variety(id as FieldPlan['variety']).name} 종자가 부족합니다. 저장고에는 ${have}개 밭 분량뿐입니다.`
  }
  return ''
}

export interface PotatoHouse { name: string; at: number; cwt: number }

// The potato houses the farm has now: the home house, a second one at home once built, the Dufour house and one
// built there while Dufour land is held. Ventilation is in the home houses.
export function potatoHouses(c: Campaign): PotatoHouse[] {
  const home = c.upgrades.vent ? P.CELLAR_CWT_VENT : P.CELLAR_CWT
  const out: PotatoHouse[] = [{ name: '집 감자 저장고', at: HOME_YARD, cwt: home }]
  if (hasBuilt(c, 'house', HOME_YARD)) out.push({ name: '두 번째 감자 저장고', at: HOME_YARD, cwt: home })
  if (holdsDufour(c)) {
    out.push({ name: '뒤푸르 감자 저장고', at: DUFOUR_YARD, cwt: YARDS[1].cellar })
    if (hasBuilt(c, 'house', DUFOUR_YARD)) out.push({ name: '새 뒤푸르 감자 저장고', at: DUFOUR_YARD, cwt: P.HOUSE_CWT })
  }
  return out
}

export function cellarCapacity(c: Campaign): number {
  let cap = 0
  for (const h of potatoHouses(c)) cap += h.cwt
  return cap
}

export function openLots(c: Campaign): Lot[] {
  return c.lots.filter(l => l.open)
}

function ok(events: GameEvent[] = []): Result { return { ok: true, err: '', events } }
function fail(err: string): Result { return { ok: false, err, events: [] } }

function note(c: Campaign, type: string, level: GameEvent['level'], text: string, field = -1): GameEvent {
  const e: GameEvent = { day: c.season ? c.season.day : 0, type, field, text, level }
  if (c.season) c.season.log.push(e)
  return e
}

function cost(c: Campaign, amount: number): void {
  c.cash -= amount
  c.yearCosts += amount
}

// Contracts that fall due now: what was not delivered costs CONTRACT_PENALTY of its contract value.
// Puts US No. 1 and large tubers of a lot against a contract, up to what it still needs. Returns the cwt and the money.
function deliverLot(c: Campaign, lot: Lot, k: Contract): { take: number; money: number } {
  if (c.phase === 'season' && c.season) ageLot(c, lot, c.season.day)
  const have = lot.grades.no1 + lot.grades.chef
  const take = Math.min(have, Math.max(0, k.cwt - k.delivered))
  if (take <= 1e-6) return { take: 0, money: 0 }
  const keep = 1 - take / have
  lot.grades.no1 *= keep
  lot.grades.chef *= keep
  const money = take * k.price
  k.delivered += take
  k.paid += money
  lot.sold += take
  lot.revenue += money
  c.cash += money
  c.yearRevenue += money
  c.yearContracts += money
  if (lotCwt(lot) < 0.5) lot.open = false
  return { take, money }
}

function settleContracts(c: Campaign, due: Due | 'all', out: GameEvent[]): void {
  for (const k of c.contracts) {
    if (k.settled || (due !== 'all' && k.due !== due)) continue
    // On the due date the buyer takes what is still owed from the crop in the potato houses, before any shortfall.
    for (const lot of openLots(c)) {
      if (k.cwt - k.delivered <= 1e-6) break
      if (lot.variety !== k.variety || (c.season && c.phase === 'season' && !c.season.fields[lot.field]?.weighed)) continue
      const d = deliverLot(c, lot, k)
      if (d.take > 1e-6) out.push(note(c, 'delivered', 'good', `${k.buyer}이(가) 계약분으로 당신의 감자 저장고에서 ${variety(k.variety).name} ${withCommas(d.take)} cwt를 가져가고 $${withCommas(d.money)}를 지불했습니다.`, lot.field))
    }
    k.settled = true
    const short = k.cwt - k.delivered
    const name = variety(k.variety).name
    if (short > 1e-6) {
      const pen = short * k.price * P.CONTRACT_PENALTY
      k.penalty = pen
      cost(c, pen)
      c.yearPenalties += pen
      out.push(note(c, 'contractShort', 'bad', `${k.buyer.toLowerCase()} 계약에 ${name} ${withCommas(short)} cwt가 모자라 위약금은 $${withCommas(pen)}입니다.`))
    } else {
      out.push(note(c, 'contractFilled', 'good', `${k.buyer}의 ${name} ${withCommas(k.cwt)} cwt 계약이 이행됐습니다.`))
    }
  }
}

function endSeason(world: World, c: Campaign): GameEvent[] {
  const s = c.season!
  const out: GameEvent[] = []
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const f = s.fields[i]
    if (f.status === 'off') continue
    if (f.status === 'rest') {
      c.cash += P.REST_INCOME
      c.yearRevenue += P.REST_INCOME
      c.yearRest += P.REST_INCOME
    } else if (f.status !== 'dug' && f.status !== 'lost') {
      if (f.status === 'digging') {
        const lot = c.lots.find(l => l.id === f.lotId)
        if (lot) finishLot(c, f, lot)
      }
      f.status = f.status === 'digging' ? 'dug' : 'lost'
      if (f.status === 'lost') out.push(f.plantDay < 0
        ? note(c, 'lost', 'warn', `${FIELD_NAMES[i]}은(는) 심지 않았습니다.`, i)
        : note(c, 'lost', 'bad', `${FIELD_NAMES[i]}이(가) 땅에 남겨졌습니다.`, i))
    }
  }
  leftInField(c, s, out, '통에 남겨져')
  closeIncidents(c, s, out)
  s.jobs = []
  // The crews go home for the winter.
  for (const u of c.crew) { letGo(u); delete u.help; u.at = HOME_YARD; u.to = HOME_YARD; u.road = 0; u.tired = 0 }
  s.pickers = false
  settleContracts(c, 'harvest', out)
  // The potato houses only hold so much: the overflow is sold off the field.
  const cap = cellarCapacity(c)
  let total = openLots(c).reduce((a, l) => a + lotCwt(l), 0)
  if (total > cap) {
    const lots = openLots(c).sort((a, b) => lotCwt(b) - lotCwt(a))
    for (const lot of lots) {
      if (total <= cap) break
      const have = lotCwt(lot)
      const frac = Math.min(1, (total - cap) / have)
      const money = sellLot(world, c, lot, frac)
      total -= have * frac
      out.push(note(c, 'overflow', 'warn', `저장고가 가득 차 ${variety(lot.variety).name} ${withCommas(have * frac)} cwt가 밭에서 바로 $${withCommas(money)}에 팔렸습니다.`, lot.field))
    }
  }
  // What was kept has been sitting in the cellar since its dig: that time is charged and shrinks the pile too.
  const nov1 = dayIndex(c.year, 10, 1)
  let rent = 0, kept = 0
  for (const lot of openLots(c)) {
    rent += ageLot(c, lot, nov1)
    kept += lotCwt(lot)
  }
  if (rent > 0) {
    out.push(note(c, 'stored', 'info', `${withCommas(kept)} cwt가 저장고에 있습니다. 수확 후 저장 비용으로 $${withCommas(rent)}이 들었습니다.`))
  }
  const rest = c.yearRest
  if (rest > 0) out.push(note(c, 'rest', 'info', `귀리와 클로버가 $${withCommas(rest)}를 벌어들였습니다.`))
  c.phase = 'cellar'
  c.month = 0
  return out
}


function storeMonth(c: Campaign, out: GameEvent[]): void {
  const vent = c.upgrades.vent
  for (const lot of openLots(c)) {
    const v = variety(lot.variety)
    lot.months++
    let shrink = vent ? P.SHRINK_VENT : P.SHRINK
    if (lot.months === 1) shrink += 0.03 * (1 - lot.skin)
    const stored = dayIndex(lot.year, 10, 1) - lot.dugDay + lot.months * 30
    if (!lot.sprouted && stored > v.dormancy + P.COOL_CELLAR_DAYS + (vent ? P.VENT_DAYS : 0)) {
      lot.sprouted = true
      out.push(note(c, 'sprout', 'warn', `${FIELD_NAMES[lot.field]}의 ${v.name}에 싹이 트기 시작했습니다.`, lot.field))
    }
    if (lot.sprouted) shrink += P.SPROUT_SHRINK
    let rotLoss = 0
    if (lot.rot > 0) {
      const grow = lot.rot * (vent ? P.ROT_GROW_VENT : P.ROT_GROW)
      rotLoss = Math.min(0.5, grow)
      lot.rot = Math.min(0.9, lot.rot + grow)
      if (!lot.broke && lot.rot >= P.ROT_BREAK) {
        lot.broke = true
        rotLoss = 0.55
        lot.rot = 0.06
        const seed = lot.seedHeld > 0 ? ' 남겨둔 종자도 잃었습니다.' : ''
        lot.seedHeld = 0
        out.push(note(c, 'breakdown', 'bad', `${FIELD_NAMES[lot.field]}의 ${v.name}에 부패가 퍼져 절반 이상이 사라졌습니다.${seed}`, lot.field))
      }
    }
    const keep = (1 - shrink) * (1 - rotLoss)
    const before = lotCwt(lot)
    const rent = Math.round(before * P.STORE_COST)
    c.cash -= rent
    c.yearCosts += rent
    c.yearStorage += rent
    lot.grades.no1 *= keep; lot.grades.chef *= keep; lot.grades.b *= keep; lot.grades.no2 *= keep; lot.skinned *= keep
    lot.loss.rot += before * (1 - shrink) * rotLoss
    if (lotCwt(lot) < 0.5) lot.open = false
  }
}

export const WINTER_WORKS: WinterWork[] = ['off', 'woods', 'pack', 'build']
export const WINTER_LABEL: Record<WinterWork, string> = {
  off: '겨울 해고', woods: '숲 벌목', pack: '포장실 포장', build: '건축',
}

// Whether today falls in the harvest break, when the schools close and pickers can be had.
export function pickersWindow(c: Campaign): boolean {
  const s = c.season
  if (!s) return false
  return s.day >= dayIndex(s.year, P.PICKERS_FROM.month, P.PICKERS_FROM.dom) && s.day <= dayIndex(s.year, P.PICKERS_TO.month, P.PICKERS_TO.dom)
}

// Puts a new person on the books: in season their first month is paid now; in spring it is part of the plan.
// This spring's purchases and hires, kept so they can be taken back until the season starts.
function springOf(c: Campaign): NonNullable<Campaign['spring']> {
  return (c.spring ??= { bought: [], hired: [] })
}

function takeOn(c: Campaign, u: Unit): GameEvent {
  if (c.phase === 'season' && c.season) {
    const pay = payOf(u)
    cost(c, pay)
    c.yearWages += pay
    u.paidTo = c.season.day + P.WAGE_DAYS
  }
  c.crew.push(u)
  const as = u.kind === 'hand' ? '밭일꾼' : '트랙터 운전자'
  // What a hand will do, so the farmer keeps to the machines.
  const does = u.kind === 'hand' && u.prio.field > 0 ? ` ${u.name.split(' ')[0]}이(가) 순찰, 병든 포기 뽑기, 시험 캐기를 맡습니다${u.prio.machine > 0 ? ', 당신이 못할 때는 운전도 합니다' : ''}. 트랙터에만 집중하세요.` : ''
  return note(c, 'hired', 'info', `${u.name}이(가) ${as}(으)로 고용됐습니다. 품값은 월 $${withCommas(u.wage)}입니다.${does}`)
}

// The tracts the farm holds with standing woods or brush to fell.
export function timberTracts(c: Campaign): number[] {
  const out: number[] = []
  for (let i = 0; i < c.fields.length; i++) if (c.fields[i].tenure !== 'none' && standing(c.fields[i].cover)) out.push(i)
  return out
}

// Why a person cannot be set to this winter work, or '' when they can. Woods work names the tract to fell.
export function winterBlock(c: Campaign, u: Unit, work: WinterWork, field = -1): string {
  if (work === 'off') return ''
  if (u.trait === 'homebody') return `${u.name}은(는) 집을 좋아해 겨울 일은 하지 않습니다.`
  switch (work) {
    case 'woods': {
      if (!Number.isInteger(field) || field < 0 || field >= P.FIELD_COUNT) {
        return timberTracts(c).length ? '벨 구역을 고르세요.' : '농장에 벨 만한 수림이 없습니다.'
      }
      if (c.fields[field].tenure === 'none') return `${FIELD_NAMES[field]}은(는) 당신의 땅이 아닙니다.`
      if (!standing(c.fields[field].cover)) return `${FIELD_NAMES[field]}에는 더 벨 것이 없습니다.`
      return ''
    }
    case 'pack':
      if (!hasBuilt(c, 'packing')) return '포장하려면 포장실이 필요합니다.'
      return unpacked(c) >= 1 ? '' : '포장할 저장 물량이 남지 않았습니다.'
    case 'build':
      return c.buildings.some(b => buildable(c, b)) ? '' : '짓고 있는 것이 없습니다.'
  }
  return '그런 겨울 일이 없습니다.'
}

// One month of winter. Someone kept on is paid and puts in WINTER_DAYS crew-days at their skill; the farmer works
// unpaid, FARMER_WINTER_DAYS. Anyone laid off is not paid and comes back in spring; so is someone whose winter work
// has run out, from the month it runs out.
function winterMonth(c: Campaign, out: GameEvent[]): void {
  for (const u of c.crew) {
    if (u.winter === 'off') continue
    const why = winterBlock(c, u, u.winter, u.winterField)
    if (why) {
      out.push(note(c, 'winterIdle', 'info', `${winterOff(u)}. ${why}`))
      u.winter = 'off'
      u.winterField = -1
      continue
    }
    if (u.kind !== 'farmer') {
      const pay = payOf(u)
      cost(c, pay)
      c.yearWages += pay
    }
    const skill = WINTER_SKILL[u.winter]
    const time = u.kind === 'farmer' ? P.FARMER_WINTER_DAYS : P.WINTER_DAYS
    winterWork(c, u, time * speed(u, skill), out)
    for (const level of gainXp(u, skill, time)) out.push(note(c, 'skillUp', 'good', `${subject(u, `${SKILL_LABEL[skill]}이(가) 늘었습니다: ${level}레벨`)}.`))
  }
  // Work that ran out this month lays its people off now, not a month on, so the winter's lines say what they do.
  for (const u of c.crew) {
    if (u.winter === 'off') continue
    const why = winterBlock(c, u, u.winter, u.winterField)
    if (!why) continue
    const other = u.winter === 'woods' ? timberTracts(c).filter(i => i !== u.winterField) : []
    const more = other.length ? ` 더 벌목하려면 ${FIELD_NAMES[other[0]]}이(가) 아직 서 있습니다.` : ''
    out.push(note(c, 'winterIdle', 'info', `${winterOff(u)}. ${why}${more}`))
    u.winter = 'off'
    u.winterField = -1
  }
}

function winterOff(u: Unit): string {
  return subject(u, '남은 겨울 동안 해고됐습니다', '')
}

const WINTER_SKILL: Record<Exclude<WinterWork, 'off'>, 'woods' | 'pack' | 'build'> = { woods: 'woods', pack: 'pack', build: 'build' }

// What a month of winter work does, in standard crew-days.
function winterWork(c: Campaign, u: Unit, days: number, out: GameEvent[]): void {
  if (u.winter === 'pack') pack(c, days * P.PACK_PER_DAY)
  if (u.winter === 'build') {
    let left = days
    for (const b of c.buildings) {
      if (!buildable(c, b) || left <= 0) continue
      const use = Math.min(left, b.need - b.done)
      left -= use
      if (buildWork(c, b, use)) out.push(note(c, 'built', 'good', `${YARD_NAME[b.yard]}에 ${P.BUILDINGS[b.kind].name}이(가) 겨울 동안 지어졌습니다. ${P.BUILDINGS[b.kind].does}`))
    }
  }
  if (u.winter === 'woods') {
    const i = u.winterField
    if (fell(c, i, days, u)) {
      out.push(note(c, 'felled', 'good', `${FIELD_NAMES[i]}이(가) 겨울 동안 벌목됐습니다. 그루터기는 남아 있고 업자가 뽑을 수 있습니다.${sheltering(c, i)}`, i))
    }
  }
}

// Cwt of No. 1 and B size in store not yet packed.
export function unpacked(c: Campaign): number {
  let cwt = 0
  for (const l of openLots(c)) cwt += (l.grades.no1 + l.grades.b) * (1 - l.packed)
  return cwt
}

// Packs up to cwt of the stored No. 1 and B size, the oldest lots first, at the packing charge.
function pack(c: Campaign, cwt: number): void {
  let left = cwt
  for (const l of openLots(c)) {
    const base = l.grades.no1 + l.grades.b
    const take = Math.min(left, base * (1 - l.packed))
    if (take <= 0) continue
    l.packed = Math.min(1, l.packed + take / base)
    left -= take
    const charge = take * P.PACK_CHARGE
    cost(c, charge)
    c.yearPacking += charge
    if (left <= 0) break
  }
}

// Dollars still owed on the land mortgage.
export function mortgageOwed(c: Campaign): number {
  let owed = 0
  for (const m of c.mortgages) owed += m.owed
  return owed
}

// What the bank takes at this year end: a set share of each purchase's loan, and interest on what is still owed.
export function mortgageDue(c: Campaign): { principal: number; interest: number } {
  let principal = 0, interest = 0
  for (const m of c.mortgages) {
    interest += m.owed * P.MORTGAGE_RATE
    principal += Math.min(m.owed, m.loan * P.MORTGAGE_PRINCIPAL)
  }
  return { principal, interest }
}

export function netWorth(c: Campaign): number {
  let w = c.cash
  for (const id of Object.keys(c.upgrades) as UpgradeId[]) if (c.upgrades[id]) w += P.UPGRADES[id].cost * 0.5
  for (let i = HOME_FIELDS; i < c.fields.length; i++) if (c.fields[i].tenure === 'owned') w += PARCELS[i].price * P.LAND_WORTH
  w -= mortgageOwed(c)
  return Math.round(w)
}

function closeYear(world: World, c: Campaign, out: GameEvent[]): void {
  const s = c.season!
  settleContracts(c, 'all', out)
  let interest = 0
  const lots = c.lots.filter(l => l.year === c.year)
  let potatoFields = 0, market = 0, culled = 0, peak = 0, sprays = 0
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const f = s.fields[i]
    if (f.status === 'off') continue
    if (c.plans[i].crop === 'potato' && f.plantDay >= 0) potatoFields++
    if (f.sevPeak > peak) peak = f.sevPeak
    sprays += f.sprays ?? 0
  }
  for (const lot of lots) {
    market += lot.sold
    culled += lot.loss.green + lot.loss.blight + lot.loss.frost + lot.loss.rot + lot.loss.small
  }
  // The land mortgage: a share of each loan and the interest on what is still owed, part of the year's costs.
  if (c.mortgages.length) {
    const due = mortgageDue(c)
    const pay = due.principal + due.interest
    cost(c, pay)
    c.yearMortgage += pay
    for (const m of c.mortgages) m.owed -= Math.min(m.owed, m.loan * P.MORTGAGE_PRINCIPAL)
    c.mortgages = c.mortgages.filter(m => m.owed > 0.005)
    out.push(note(c, 'mortgage', 'info', `은행이 땅 담보 대출로 $${withCommas(pay)}를 가져갔습니다. 원금 $${withCommas(due.principal)}, 이자 $${withCommas(due.interest)}입니다. 남은 빚은 $${withCommas(mortgageOwed(c))}입니다.`))
  }
  c.cash -= P.NOTE_PAYMENT + P.LIVING
  if (c.cash < 0) {
    interest = Math.round(-c.cash * P.CREDIT_RATE)
    c.cash -= interest
  }
  const sum: YearSummary = {
    year: c.year,
    cashStart: c.history.length ? c.history[c.history.length - 1].cashEnd : P.START_CASH,
    cashEnd: c.cash,
    revenue: c.yearRevenue, costs: c.yearCosts, note: P.NOTE_PAYMENT, living: P.LIVING, interest,
    restIncome: c.yearRest, storage: c.yearStorage,
    wages: c.yearWages, rent: c.yearRent, land: c.yearLand, penalties: c.yearPenalties, contracts: c.yearContracts,
    logs: c.yearLogs, mortgage: c.yearMortgage, works: c.yearWorks, building: c.yearBuilding, stand: c.yearStand, packing: c.yearPacking,
    cwtSold: market, cwtCulled: culled,
    yieldCwtAcre: potatoFields ? market / (potatoFields * P.FIELD_ACRES) : 0,
    potatoFields, blightPeak: peak, sprays, lots,
  }
  c.history.push(sum)

  // Seed held back comes out of the cellar as next year's stock.
  c.seedStock = []
  for (const lot of lots) {
    if (lot.seedHeld > 0 && !lot.broke) {
      c.seedStock.push({ variety: lot.variety, fields: lot.seedHeld, virus: lot.virus, blight: lot.blightSeed })
    }
  }
  // Frost heaves stones up through the winter in every open field the farm holds.
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const fp = c.fields[i]
    if (fp.tenure !== 'none' && fp.cover === 'open') fp.stones = Math.min(1, fp.stones + P.HEAVE)
  }
  // Soil remembers what grew, on the land the farm held this year; new ground has had its first year.
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    if (s.fields[i].status === 'off') continue
    const fp = c.fields[i]
    fp.raw = false
    const odds = fp.vert / (1 - fp.vert)
    // A potato field that was never planted lay fallow: it counts as a year out of potatoes.
    if (c.plans[i].crop === 'potato' && s.fields[i].plantDay >= 0) {
      fp.soil = Math.max(0, fp.soil + P.SOIL_AFTER_POTATO)
      fp.streak++
      const o = odds * P.VERT_GROW
      fp.vert = Math.min(0.95, o / (1 + o))
    } else {
      fp.soil = 1
      fp.streak = 0
      const o = odds * P.VERT_REST
      fp.vert = Math.max(0.01, o / (1 + o))
    }
  }
  c.phase = 'ledger'
  if (c.cash < P.CREDIT_LIMIT) {
    c.outcome = 'lost'
    out.push(note(c, 'lost', 'bad', '은행이 대출 회수에 들어갔고, 농장이 경매에 넘어갑니다.'))
  } else if (c.outcome === '' && c.yearIdx + 1 >= c.goalYears) {
    c.outcome = 'kept'
    out.push(note(c, 'kept', 'good', '다섯 시즌을 버텨냈고, 농장은 여전히 당신의 것입니다.'))
  }
}

function nextYear(world: World, c: Campaign): Result {
  if (c.outcome === 'lost') { c.phase = 'over'; return ok() }
  if (!world.weather.playable.includes(c.year + 1)) { c.phase = 'over'; return ok() }
  c.year++
  c.yearIdx++
  c.yearRevenue = 0
  c.yearCosts = 0
  c.yearRest = 0
  c.yearStorage = 0
  c.yearWages = 0
  c.yearRent = 0
  c.yearLand = 0
  c.yearContracts = 0
  c.yearPenalties = 0
  c.yearLogs = 0
  c.yearMortgage = 0
  c.yearWorks = 0
  c.yearBuilding = 0
  c.yearStand = 0
  c.yearPacking = 0
  delete c.yearEquip
  c.month = 0
  c.season = null
  c.lots = []
  c.contracts = []
  c.offers = contractOffers(c.seed, c.year)
  c.applicants = springApplicants(c)
  // A neighbour's offer for someone is made once while they work here; the rest may come again next year.
  c.heard = c.heard.filter(k => k.startsWith('poach:'))
  c.phase = 'plan'
  // Carry the plan forward with the rotation flipped where the soil asks for it, and drop seed that is not there.
  // Rented land and the hired crew carry forward too, until they are released or dismissed.
  c.plans = c.plans.map((p, i) => {
    if (!isField(c, i) || c.fields[i].raw) return { ...REST_PLAN }
    const fp = c.fields[i]
    const crop = p.crop === 'potato' && fp.streak >= 2 ? 'rest' : p.crop === 'rest' ? 'potato' : p.crop
    return { crop, variety: p.variety, seed: 'certified' } as FieldPlan
  })
  // Hedgerows cut back BRUSH_YEARS ago have grown back.
  const out: GameEvent[] = []
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const fp = c.fields[i]
    if (fp.brushed >= 0 && !brushedNow(c, i)) {
      fp.brushed = -1
      if (fp.tenure !== 'none') out.push(note(c, 'brushBack', 'info', `${FIELD_NAMES[i]}을(를) 따라 관목이 다시 자랐습니다.`, i))
    }
  }
  return ok(out)
}

function fieldIndex(field: number): boolean {
  return Number.isInteger(field) && field >= 0 && field < P.FIELD_COUNT
}

export function apply(world: World, c: Campaign, cmd: Cmd): Result {
  const opened = openRoutine(c)
  const r = command(world, c, cmd)
  if (opened && r.ok) r.events.unshift(opened)
  if (r.ok) r.events.push(...lapsedBuyers(c))
  return r
}

// A buyer's offer for a lot that has since been sold, delivered or used up goes with it, so no telegram offers to buy
// what is not there.
function lapsedBuyers(c: Campaign): GameEvent[] {
  const out: GameEvent[] = []
  for (const inc of [...c.incidents]) {
    if (inc.kind !== 'buyer') continue
    const lot = c.lots.find(l => l.id === inc.lot)
    if (lot && lot.open && lotCwt(lot) >= P.BUYER_MIN_CWT) continue
    c.incidents.splice(c.incidents.indexOf(inc), 1)
    out.push(note(c, 'incidentDone', 'info', `구매자가 지나갔습니다. ${lot ? `${FIELD_NAMES[lot.field]}의 ${variety(lot.variety).name}` : '그 물량'}이(가) 더는 없기 때문입니다.`))
  }
  return out
}

// A game saved before the routine opens with it on, and says so once.
function openRoutine(c: Campaign): GameEvent | null {
  c.heard ??= []
  for (const j of c.season?.jobs ?? []) j.by ??= 'you'
  for (const u of c.crew) u.rest ??= 'auto'
  if (c.routine) return null
  c.routine = { ...P.ROUTINE_DEFAULT }
  return note(c, 'routine', 'info', '이제 일꾼들이 일과를 따릅니다. 파종, 북주기, 밭 순찰, 시험 캐기, 캐기, 운반이 작업 목록에 자동으로 오릅니다. 살포, 물 주기, 줄기 죽이기는 당신이 결정합니다. \'역할 분담\'에서 바꿀 수 있습니다.')
}

// The year the date falls in now: from January the winter's cellar months, and the ledger closed in spring, are
// in the year after the season's. The ledger itself is the season's year.
export function yearNow(c: Campaign): number {
  return c.year + ((c.phase === 'cellar' && c.month >= 2) || c.phase === 'ledger' ? 1 : 0)
}

// "Year 2" (or the record's year) for the date now.
export function yearNowLabel(c: Campaign): string {
  return yearLabel(yearNow(c))
}

// Whether this kind of work goes on the list by itself.
export function routineOn(c: Campaign, kind: JobKind): boolean {
  return (P.ROUTINE_KINDS as JobKind[]).includes(kind) && (c.routine?.[kind as RoutineKind] ?? P.ROUTINE_DEFAULT[kind as RoutineKind])
}

// How spraying is done this season, or null when the player has not said this year.
export function sprayWayNow(c: Campaign): SprayWay | null {
  return c.sprayWay && c.sprayWay.year === c.year ? c.sprayWay.way : null
}

// The farm's standing orders, in the order they are listed.
export function routineInfo(c: Campaign): { kind: JobKind; auto: boolean }[] {
  return P.ROUTINE_KINDS.map(kind => ({ kind, auto: routineOn(c, kind) }))
}

function command(world: World, c: Campaign, cmd: Cmd): Result {
  switch (cmd.t) {
    case 'plan': {
      if (c.phase !== 'plan') return fail('계획은 봄에만 바꿀 수 있습니다.')
      if (!fieldIndex(cmd.field)) return fail('그런 밭이 없습니다.')
      if (!held(c, cmd.field)) return fail(`${FIELD_NAMES[cmd.field]}은(는) 당신의 땅이 아닙니다. 먼저 임차하거나 사세요.`)
      if (!isField(c, cmd.field)) return fail(`${FIELD_NAMES[cmd.field]}은(는) 아직 ${COVER_WORD[c.fields[cmd.field].cover]}입니다. 먼저 개간하세요.`)
      const v = variety(cmd.plan.variety)
      if (cmd.plan.crop === 'potato' && v.released > c.year) return fail(`${v.name}은(는) ${v.released}년에야 나옵니다.`)
      const before = c.plans[cmd.field]
      c.plans[cmd.field] = { crop: cmd.plan.crop, variety: cmd.plan.variety, seed: cmd.plan.seed }
      const short = savedSeedShort(c)
      if (short) { c.plans[cmd.field] = before; return fail(short) }
      return ok()
    }
    case 'buy': {
      if (c.phase !== 'plan' && c.phase !== 'season' && c.phase !== 'cellar') return fail('장비는 봄, 시즌 중, 또는 겨울에 살 수 있습니다.')
      const u = P.UPGRADES[cmd.upgrade]
      if (!u) return fail('그런 장비가 없습니다.')
      if (c.upgrades[cmd.upgrade]) return fail('이미 갖고 있습니다.')
      if ((cmd.upgrade === 'tractor2' || cmd.upgrade === 'tractor3') && !hasBuilt(c, 'shed')) return fail('트랙터를 더 두려면 기계 창고가 필요합니다.')
      if (cmd.upgrade === 'tractor3' && !c.upgrades.tractor2) return fail('먼저 두 번째 트랙터를 사세요.')
      if (cmd.upgrade === 'house2' && buildingAt(c, 'house', HOME_YARD)) return fail('집에 두 번째 감자 저장고가 이미 있거나 짓는 중입니다.')
      const short = spendBlock(c, u.cost, 'equipment')
      if (short) return fail(short)
      c.cash -= u.cost
      c.yearCosts += u.cost
      c.yearEquip = (c.yearEquip ?? 0) + u.cost
      c.upgrades[cmd.upgrade] = true
      const bought: { upgrade: UpgradeId; building?: number } = { upgrade: cmd.upgrade }
      // A contractor puts up the second potato house at once.
      if (cmd.upgrade === 'house2') {
        bought.building = c.nextBuilding
        c.buildings.push({ id: c.nextBuilding++, kind: 'house', yard: HOME_YARD, done: P.BUILDINGS.house.days, need: P.BUILDINGS.house.days, built: true })
      }
      // (a spring's purchase can be taken back until the season starts; one made later is made)
      if (c.phase === 'plan') springOf(c).bought.push(bought)
      return ok([note(c, 'bought', 'info', `${u.name}을(를) $${withCommas(u.cost)}에 샀습니다.${c.phase === 'plan' ? ' 시즌 시작 전까지 취소할 수 있습니다.' : ''}`)])
    }
    case 'unbuy': {
      const k = c.phase === 'plan' ? c.spring?.bought.findIndex(b => b.upgrade === cmd.upgrade) ?? -1 : -1
      if (k < 0) return fail(c.phase === 'plan' ? '올봄에 산 것이 아니라 취소할 수 없습니다.' : '구입 취소는 시즌 시작 전 봄에만 할 수 있습니다.')
      if (cmd.upgrade === 'tractor2' && c.upgrades.tractor3) return fail('먼저 세 번째 트랙터를 취소하세요.')
      const u = P.UPGRADES[cmd.upgrade]
      const b = c.spring!.bought.splice(k, 1)[0]
      c.cash += u.cost
      c.yearCosts -= u.cost
      c.yearEquip = (c.yearEquip ?? 0) - u.cost
      c.upgrades[cmd.upgrade] = false
      if (b.building !== undefined) c.buildings = c.buildings.filter(x => x.id !== b.building)
      return ok([note(c, 'unbought', 'info', `${u.name} 구입을 취소했고, $${withCommas(u.cost)}가 현금으로 돌아왔습니다.`)])
    }
    case 'answer': {
      const s = c.season
      const inc = c.incidents.find(i => i.id === cmd.incident)
      if (!inc || c.phase !== 'season' || !s) return fail('그 물음은 더는 답을 기다리지 않습니다.')
      if (!inc.choices.includes(cmd.choice)) return fail(`선택지는 다음과 같습니다: ${inc.choices.map(ch => CHOICE_LABEL[ch]).join(', ')}.`)
      const why = answerBlock(c, inc, cmd.choice)
      if (why) return fail(why)
      const out: GameEvent[] = []
      answer(world, c, s, inc, cmd.choice, out)
      return ok(out)
    }
    case 'build': {
      const why = buildBlock(c, cmd.kind, cmd.yard, holdsDufour(c))
      if (why) return fail(why)
      const cost = buildCost(c, cmd.kind)
      const b = startBuilding(c, cmd.kind, cmd.yard)
      if (c.phase === 'season' && c.season) c.season.jobs.push(buildJob(c.season, b))
      const spec = P.BUILDINGS[cmd.kind]
      const bought = cost.buyLogs > 0 || cost.buyStone > 0 ? `, 사야 하는 ${[cost.buyLogs > 0 ? `통나무 ${Math.ceil(cost.buyLogs)}트럭` : '', cost.buyStone > 0 ? `돌 ${Math.ceil(cost.buyStone)}트럭` : ''].filter(Boolean).join('과(와) ')} 포함,` : ''
      const when = c.phase === 'season' ? '건축을 맡은 사람의 작업 목록에 오릅니다.' : c.phase === 'cellar' ? '겨울에 남겨둔 사람이 지을 수 있습니다.' : '시즌이 시작되면 작업 목록에 오릅니다.'
      return ok([note(c, 'building', 'info', `${YARD_NAME[cmd.yard]}에 ${spec.name} 공사를 시작했습니다. 비용은 $${withCommas(cost.total)}${bought}이고 건축 ${spec.days}인일이 걸립니다. ${when}`)])
    }
    case 'rent': {
      if (c.phase !== 'plan') return fail('땅은 봄에만 임차할 수 있습니다.')
      if (!fieldIndex(cmd.field)) return fail('그런 밭이 없습니다.')
      const fp = c.fields[cmd.field]
      const name = FIELD_NAMES[cmd.field]
      if (fp.tenure === 'owned') return fail(`이미 ${name}을(를) 소유하고 있습니다.`)
      if (fp.tenure === 'rented') return fail(`이미 올해 ${name}을(를) 임차했습니다.`)
      if (PARCELS[cmd.field].holding !== 'field') return fail(`${name}은(는) 임차할 수 없습니다. 사는 것만 가능합니다.`)
      fp.tenure = 'rented'
      c.plans[cmd.field] = defaultPlan(c, cmd.field)
      return ok([note(c, 'rented', 'info', `${name}을(를) 올해 임차했습니다. 임차료 $${withCommas(PARCELS[cmd.field].rent)}는 시즌 시작 때 냅니다.`, cmd.field)])
    }
    case 'release': {
      if (c.phase !== 'plan') return fail('임차한 땅은 봄에만 포기할 수 있습니다.')
      if (!fieldIndex(cmd.field)) return fail('그런 밭이 없습니다.')
      const fp = c.fields[cmd.field]
      const name = FIELD_NAMES[cmd.field]
      if (fp.tenure === 'owned') return fail(`${name}을(를) 소유하고 있고, 땅은 되팔 수 없습니다.`)
      if (fp.tenure === 'none') return fail(`${name}은(는) 당신의 땅이 아닙니다.`)
      fp.tenure = 'none'
      c.plans[cmd.field] = { ...REST_PLAN }
      return ok([note(c, 'released', 'info', `${name} goes back to its owner.`, cmd.field)])
    }
    case 'buyLand': {
      if (!fieldIndex(cmd.field)) return fail('그런 밭이 없습니다.')
      const blocked = buyLandBlock(c, cmd.field, holdsDufour(c))
      if (blocked) return fail(blocked)
      const fp = c.fields[cmd.field]
      const name = FIELD_NAMES[cmd.field]
      const price = PARCELS[cmd.field].price
      const down = Math.round(price * P.MORTGAGE_DOWN)
      const was = fp.tenure
      cost(c, down)
      c.yearLand += down
      c.mortgages.push({ field: cmd.field, loan: price - down, owed: price - down })
      fp.tenure = 'owned'
      if (was === 'none') c.plans[cmd.field] = defaultPlan(c, cmd.field)
      return ok([note(c, 'landBought', 'good', `${name}이(가) 당신의 것이 됐습니다. $${withCommas(price)}에 샀고, 계약금 $${withCommas(down)}, 땅 담보 대출 $${withCommas(price - down)}입니다.`, cmd.field)])
    }
    case 'stump': {
      const why = stumpBlock(c, cmd.field)
      if (why) return fail(why)
      cost(c, P.STUMP_FEE)
      c.yearWorks += P.STUMP_FEE
      c.fields[cmd.field].works = { kind: 'stump', left: P.STUMP_DAYS }
      return ok([note(c, 'stumping', 'info', `업자가 ${FIELD_NAMES[cmd.field]}의 그루터기를 뽑습니다. 비용은 $${withCommas(P.STUMP_FEE)}이고 시즌 약 ${P.STUMP_DAYS}일 걸립니다.`, cmd.field)])
    }
    case 'tile': {
      const why = tileBlock(c, cmd.field)
      if (why) return fail(why)
      cost(c, P.TILE_FEE)
      c.yearWorks += P.TILE_FEE
      c.fields[cmd.field].works = { kind: 'tile', left: P.TILE_DAYS }
      return ok([note(c, 'tiling', 'info', `업자가 ${FIELD_NAMES[cmd.field]} 아래에 암거 배수관을 깝니다. 비용은 $${withCommas(P.TILE_FEE)}이고 시즌 약 ${P.TILE_DAYS}일 걸립니다.`, cmd.field)])
    }
    case 'sellLogs': {
      if (c.phase !== 'plan' && c.phase !== 'season' && c.phase !== 'cellar') return fail('통나무는 봄, 시즌 중, 또는 겨울에 팔 수 있습니다.')
      if (!Number.isFinite(cmd.loads) || cmd.loads <= 0) return fail('팔 트럭 수를 고르세요.')
      if (cmd.loads > c.logs + 1e-9) return fail(`마당에 통나무가 ${Math.floor(c.logs * 10) / 10}트럭뿐입니다.`)
      const loads = Math.min(cmd.loads, c.logs)
      const money = loads * P.LOG_PRICE
      c.logs -= loads
      if (c.logs < 1e-9) c.logs = 0
      c.cash += money
      c.yearRevenue += money
      c.yearLogs += money
      return ok([note(c, 'logsSold', 'good', `통나무 ${Math.round(loads * 10) / 10}트럭을 제재소에 $${withCommas(money)}에 팔았습니다.`)])
    }
    case 'payMortgage': {
      if (c.phase !== 'plan') return fail('추가 상환은 봄에만 할 수 있습니다.')
      const owed = mortgageOwed(c)
      if (owed <= 0) return fail('땅에 남은 빚이 없습니다.')
      if (!Number.isFinite(cmd.amount) || cmd.amount <= 0) return fail('상환할 금액을 고르세요.')
      if (cmd.amount > owed + 1e-6) return fail(`남은 빚은 $${withCommas(owed)}뿐입니다.`)
      if (c.cash - cmd.amount < 0) return fail('현금이 부족합니다.')
      let left = Math.min(cmd.amount, owed)
      const paid = left
      for (const m of c.mortgages) {
        const take = Math.min(m.owed, left)
        m.owed -= take
        left -= take
      }
      c.mortgages = c.mortgages.filter(m => m.owed > 0.005)
      cost(c, paid)
      c.yearMortgage += paid
      return ok([note(c, 'mortgagePaid', 'good', `땅 담보 대출에서 $${withCommas(paid)}를 갚았고 아직 $${withCommas(mortgageOwed(c))}가 남았습니다.`)])
    }
    case 'accept': {
      if (c.phase !== 'plan') return fail('계약은 봄에만 맺을 수 있습니다.')
      const k = c.offers.findIndex(o => o.id === cmd.offer)
      if (k < 0) return fail('그런 제안이 없습니다.')
      const [o] = c.offers.splice(k, 1)
      const signed: Contract = { ...o, delivered: 0, paid: 0, penalty: 0, settled: false }
      c.contracts.push(signed)
      return ok([note(c, 'accepted', 'info', `${o.buyer.toLowerCase()}와(과) ${variety(o.variety).name} ${withCommas(o.cwt)} cwt를 cwt당 $${o.price.toFixed(2)}에 계약했습니다.`)])
    }
    case 'begin': {
      if (c.phase !== 'plan') return fail('시즌이 이미 시작됐습니다.')
      const short = savedSeedShort(c)
      if (short) return fail(short)
      const pc = planCosts(c)
      if (c.cash - pc.total < P.OPERATING_LIMIT) return fail('The bank won\'t lend that much for spring. Rest a field, or plant saved seed, which is free but carries virus.')
      cost(c, pc.total)
      c.yearRent += pc.rent
      c.yearWages += pc.wages
      c.offers = []
      c.applicants = []
      delete c.spring
      startSeason(world, c)
      c.phase = 'season'
      return ok()
    }
    case 'hire': {
      if ('applicant' in cmd) {
        const why = hireRoom(c)
        if (why) return fail(why)
        const a = c.applicants.find(x => x.id === cmd.applicant)
        if (!a) return fail(c.phase === 'plan' ? 'No such applicant.' : 'The people who asked for work in spring have found other work.')
        c.applicants = c.applicants.filter(x => x !== a)
        const u = fromApplicant(c, a)
        if (c.phase === 'plan') springOf(c).hired.push({ unit: u.id, applicant: a })
        return ok([takeOn(c, u)])
      }
      const why = hireBlock(c, cmd.kind)
      if (why) return fail(why)
      const u = newUnit(c, cmd.kind as 'hand' | 'operator')
      if (c.phase === 'plan') springOf(c).hired.push({ unit: u.id })
      return ok([takeOn(c, u)])
    }
    case 'unhire': {
      const k = c.phase === 'plan' ? c.spring?.hired.findIndex(x => x.unit === cmd.unit) ?? -1 : -1
      const u = c.crew.find(x => x.id === cmd.unit)
      if (k < 0 || !u) return fail(c.phase === 'plan' ? '올봄에 고용한 사람이 아니라 취소할 수 없습니다.' : '고용 취소는 시즌 시작 전 봄에만 할 수 있습니다.')
      const h = c.spring!.hired.splice(k, 1)[0]
      removePerson(c, u)
      if (h.applicant) c.applicants.push(h.applicant)
      return ok([note(c, 'unhired', 'info', `${u.name} 고용이 취소됐고 품값은 없습니다.`)])
    }
    case 'dismiss': {
      if (c.phase !== 'plan' && c.phase !== 'season') return fail('해고는 봄이나 시즌 중에 할 수 있습니다.')
      const u = c.crew.find(x => x.id === cmd.unit)
      if (!u) return fail('그런 일꾼이 없습니다.')
      if (u.kind === 'farmer') return fail('당신은 농장주라 남습니다.')
      removePerson(c, u)
      return ok([note(c, 'dismissed', 'info', `${u.name}을(를) 보냈습니다.`)])
    }
    case 'raise': {
      if (c.phase === 'over') return fail('농장이 없어졌습니다.')
      const u = c.crew.find(x => x.id === cmd.unit)
      if (!u) return fail('그런 사람이 없습니다.')
      if (u.kind === 'farmer') return fail('농장주는 품값을 받지 않습니다. 가족 생계비는 연말에 나갑니다.')
      if (!Number.isFinite(cmd.wage)) return fail('품값을 정하세요.')
      const wage = Math.round(cmd.wage)
      if (wage < P.WAGE_MIN || wage > P.WAGE_MAX) return fail(`품값은 월 $${withCommas(P.WAGE_MIN)}~$${withCommas(P.WAGE_MAX)} 사이여야 합니다.`)
      if (wage === u.wage) return fail(`${u.name}은(는) 이미 월 $${withCommas(wage)}를 받습니다.`)
      const was = u.wage
      u.wage = wage
      return ok([note(c, 'raise', 'info', `${u.name}의 품값이 월 $${withCommas(was)}에서 $${withCommas(wage)}로 바뀝니다. 요구는 $${withCommas(u.ask)}였습니다.`)])
    }
    case 'priority': {
      if (c.phase === 'over') return fail('농장이 없어졌습니다.')
      const u = c.crew.find(x => x.id === cmd.unit)
      if (!u) return fail('그런 사람이 없습니다.')
      if (!P.SKILLS.includes(cmd.work)) return fail('그런 일이 없습니다.')
      if (!Number.isInteger(cmd.level) || cmd.level < 0 || cmd.level > P.PRIORITY_MAX) return fail(`우선순위는 1(맨 먼저)~${P.PRIORITY_MAX}, 안 하려면 0입니다.`)
      if (u.prio[cmd.work] === cmd.level) return fail(`${subject(u, `${SKILL_LABEL[cmd.work]} 우선순위가 이미 ${cmd.level}입니다`)}.`)
      u.prio[cmd.work] = cmd.level
      if (cmd.level === 0) {
        // Set never to do this work: orders of that kind pinned to them are anyone's, and one held goes back.
        for (const j of c.season?.jobs ?? []) {
          if (jobSkill(j.kind) !== cmd.work) continue
          if (j.unit === u.id) j.unit = -1
          if (u.job === j.id) letGo(u)
        }
      }
      return ok()
    }
    case 'foreman': {
      if (c.phase === 'over') return fail('농장이 없어졌습니다.')
      const u = c.crew.find(x => x.id === cmd.unit)
      if (!u) return fail('그런 사람이 없습니다.')
      if (u.kind === 'farmer') return fail('당신은 농장주라 이미 농장 전체를 맡고 있습니다. 작업반장은 고용한 사람이어야 합니다.')
      if (cmd.block === null) {
        if (!u.foreman) return fail(`${u.name}은(는) 작업반장이 아닙니다.`)
        u.foreman = ''
        return ok([note(c, 'foreman', 'info', `${u.name}은(는) 밭일로 돌아갑니다.`)])
      }
      const block = cmd.block as BlockId
      if (!BLOCKS.includes(block)) return fail('그런 구역이 없습니다.')
      if (u.foreman === block) return fail(`${u.name}은(는) 이미 그곳의 작업반장입니다.`)
      if (!PARCELS.some((p, i) => p.block === block && held(c, i))) return fail('그곳에 가진 땅이 없습니다.')
      const other = c.crew.find(x => x.foreman === block)
      if (other) return fail(`${other.name}이(가) 이미 그곳의 작업반장입니다.`)
      u.foreman = block
      for (const j of c.season?.jobs ?? []) if (j.unit === u.id) j.unit = -1
      letGo(u)
      delete u.help
      return ok([note(c, 'foreman', 'info', `${u.name}이(가) ${BLOCK_NAME[block]}의 작업반장이 됐습니다. 그 밭에 필요한 일을 작업 목록에 올리고, 직접 밭일은 하지 않습니다.`)])
    }
    case 'sundays': {
      if (c.phase === 'over') return fail('농장이 없어졌습니다.')
      if (typeof cmd.off !== 'boolean') return fail('일요일 휴일 여부를 고르세요.')
      if (c.sundaysOff === cmd.off) return fail(cmd.off ? '일요일은 이미 휴일입니다.' : '농장은 이미 일요일에도 일합니다.')
      c.sundaysOff = cmd.off
      return ok([note(c, 'sundays', 'info', cmd.off ? '이제 일요일은 쉽니다.' : '이제 일요일에도 일합니다. 주에 하루가 더 생기지만 모두 더 빨리 지칩니다.')])
    }
    case 'pickers': {
      const s = c.season
      if (c.phase !== 'season' || !s || s.frozen) return fail('학생 일꾼은 수확기에 고용할 수 있습니다.')
      if (typeof cmd.on !== 'boolean') return fail('학생 일꾼 고용 여부를 고르세요.')
      if (s.pickers === cmd.on) return fail(cmd.on ? '학생 일꾼들이 이미 와 있습니다.' : '돌려보낼 학생 일꾼이 없습니다.')
      if (cmd.on && !pickersWindow(c)) return fail('학교는 9월 20일~10월 10일 수확기에만 휴업합니다.')
      s.pickers = cmd.on
      return ok([note(c, 'pickers', 'info', cmd.on ? `학생 일꾼을 고용했습니다. 일한 날마다 $${withCommas(P.PICKER_DAY)}이고 캐기가 빨라집니다.` : '학생 일꾼들을 돌려보냈습니다.')])
    }
    case 'winter': {
      if (c.phase === 'over') return fail('농장이 없어졌습니다.')
      const u = c.crew.find(x => x.id === cmd.unit)
      if (!u) return fail('그런 사람이 없습니다.')
      if (!WINTER_WORKS.includes(cmd.work)) return fail('그런 겨울 일이 없습니다.')
      const field = cmd.work === 'woods' ? cmd.field ?? -1 : -1
      if (u.winter === cmd.work && u.winterField === field) return fail(`${subject(u, '이미 그렇게 겨울을 보내기로 했습니다')}.`)
      const why = winterBlock(c, u, cmd.work, field)
      if (why) return fail(why)
      u.winter = cmd.work
      u.winterField = field
      return ok([note(c, 'winterSet', 'info', cmd.work === 'off' ? subject(u, '겨울 동안 품값 없이 해고되고 봄에 돌아옵니다.', '')
        : `${subject(u, `이번 겨울에도 남아 ${WINTER_LABEL[cmd.work]}을(를) 합니다`)}.`)])
    }
    case 'job': {
      // The coach's ask is read before the order goes on the list, where it stops asking.
      const asked = cmd.kind === 'kill' ? asks(world, c) : []
      const why = addJob(c, cmd.kind, cmd.field, cmd.unit ?? -1, 'you')
      if (why) return fail(why)
      noteKillAsks(world, c, asked)
      if (cmd.kind === 'kill') delete c.season!.fields[cmd.field].keepVines
      // The year's first planting order is the word the crew waits for.
      const word = cmd.kind === 'plant' ? wordToPlant(c, cmd.field) : null
      return ok(word ? [word] : [])
    }
    case 'rest': {
      if (c.phase === 'over') return fail('농장이 없어졌습니다.')
      const u = c.crew.find(x => x.id === cmd.unit)
      if (!u) return fail('그런 사람이 없습니다.')
      const mode = cmd.mode ?? 'now'
      if (mode !== 'now' && mode !== 'auto' && mode !== 'push') return fail('하나를 고르세요: 지금 쉬기, 지치면 쉬기, 계속 일하기.')
      if (u.rest === mode) return fail(mode === 'now' ? `${subject(u, '이미 쉬고 있습니다')}.` : mode === 'push' ? `${subject(u, '이미 계속 일하라고 했습니다')}.` : `${subject(u, '이미 지치면 쉽니다')}.`)
      u.rest = mode
      if (mode === 'now') { letGo(u); delete u.help }
      return ok([note(c, 'rest', 'info', mode === 'now' ? `${subject(u, '나을 때까지 쉽니다')}.` : mode === 'push' ? `${subject(u, '아무리 지쳐도 계속 일합니다. 느려지고 기계나 숲에서 다칠 위험이 있습니다')}.` : `${subject(u, '지치면 알아서 쉽니다')}.`)])
    }
    case 'keepVines': {
      if (c.phase !== 'season' || !c.season) return fail('시즌이 아직 시작되지 않았습니다.')
      const f = fieldIndex(cmd.field) ? c.season.fields[cmd.field] : undefined
      if (!f) return fail('그런 밭이 없습니다.')
      if (typeof cmd.keep !== 'boolean') return fail('줄기를 계속 키울지 고르세요.')
      if (!!f.keepVines === cmd.keep) return fail(cmd.keep ? '이미 줄기를 계속 키웁니다.' : '일꾼들이 이미 때가 되면 줄기를 죽입니다.')
      if (cmd.keep) {
        f.keepVines = true
        for (const j of c.season.jobs.filter(x => x.kind === 'kill' && x.field === cmd.field && x.by === 'routine')) { c.season.jobs.splice(c.season.jobs.indexOf(j), 1); releaseJob(c, j.id) }
      } else delete f.keepVines
      return ok([note(c, 'keepVines', 'info', cmd.keep ? `${FIELD_NAMES[cmd.field]}의 줄기는 죽이라고 지시할 때까지 그대로 둡니다. ${formatDay(c.year, dayIndex(c.year, P.DIG_GREEN.month, P.DIG_GREEN.dom))}까지 그대로면 덜 마른 채로 캡니다.`
        : `일꾼들이 때가 되면 ${FIELD_NAMES[cmd.field]}의 줄기를 알아서 죽입니다.`)])
    }
    case 'sprayWay': {
      if (c.phase === 'over') return fail('농장이 없어졌습니다.')
      if (cmd.way !== 'auto' && cmd.way !== 'ask' && cmd.way !== 'none') return fail('하나를 고르세요: 살포 유지, 매번 묻기, 올해는 안 함.')
      if (sprayWayNow(c) === cmd.way) return fail('올해 살포는 이미 그렇게 하고 있습니다.')
      c.sprayWay = { year: c.year, way: cmd.way }
      c.routine.spray = cmd.way === 'auto'
      // Not this year: the sprays the routine put on the list come off it; the player's own orders stand.
      if (cmd.way === 'none' && c.season) {
        for (const j of c.season.jobs.filter(x => x.kind === 'spray' && x.by === 'routine')) { c.season.jobs.splice(c.season.jobs.indexOf(j), 1); releaseJob(c, j.id) }
      }
      return ok([note(c, 'routine', 'info', cmd.way === 'auto' ? '이제 필요한 밭에 살포가 자동으로 작업 목록에 오릅니다.'
        : cmd.way === 'ask' ? '이제 살포는 지시를 기다립니다.' : '올해는 살포하지 않습니다. 어떤 밭도 살포하라고 묻지 않고, 역병이 오면 막을 것이 없습니다.')])
    }
    case 'routine': {
      if (c.phase === 'over') return fail('농장이 없어졌습니다.')
      if (!(P.ROUTINE_KINDS as JobKind[]).includes(cmd.kind)) return fail(`${JOB_LABEL[cmd.kind] ?? '그 일'}은(는) 자동 지시가 안 됩니다.`)
      if (typeof cmd.auto !== 'boolean') return fail('자동으로 할지 고르세요.')
      const kind = cmd.kind as RoutineKind
      if (c.routine[kind] === cmd.auto && !(kind === 'spray' && sprayWayNow(c) === 'none')) return fail(cmd.auto ? `${JOB_LABEL[kind]}은(는) 이미 자동으로 합니다.` : `${JOB_LABEL[kind]}은(는) 이미 지시를 기다립니다.`)
      c.routine[kind] = cmd.auto
      if (kind === 'spray') c.sprayWay = { year: c.year, way: cmd.auto ? 'auto' : 'ask' }
      return ok([note(c, 'routine', 'info', cmd.auto ? `${JOB_LABEL[kind]}이(가) 필요한 밭에 자동으로 작업 목록에 오릅니다.` : `${JOB_LABEL[kind]}은(는) 이제 지시를 기다립니다.`)])
    }
    case 'assign': {
      if (c.phase !== 'season' || !c.season) return fail('지금 작업 목록이 없습니다.')
      const job = c.season.jobs.find(j => j.id === cmd.id)
      if (!job) return fail('그런 작업이 없습니다.')
      if (!Number.isInteger(cmd.unit) || cmd.unit < -1) return fail('그런 일꾼이 없습니다.')
      const why = unitBlock(c, job.kind, cmd.unit)
      if (why) return fail(why)
      job.unit = cmd.unit
      for (const u of c.crew) if (u.job === job.id && cmd.unit >= 0 && u.id !== cmd.unit) letGo(u)
      return ok()
    }
    case 'cancel': {
      if (c.phase !== 'season' || !c.season) return fail('지금 작업 목록이 없습니다.')
      const k = c.season.jobs.findIndex(j => j.id === cmd.id)
      if (k < 0) return fail('그런 작업이 없습니다.')
      if (c.season.jobs[k].kind === 'haul') return fail('밭의 작물은 들여와야 해서 운반은 취소할 수 없습니다.')
      if (c.season.jobs[k].kind === 'build') return fail('건축비는 이미 냈으니 지어질 때까지 작업 목록에 남습니다.')
      if (c.season.jobs[k].kind === 'dig' && c.season.jobs[k].done > 0) return fail('수확기가 이미 밭에 들어가 취소하기엔 늦었습니다.')
      // A vine kill taken off the list is the player keeping the vines up: the crew does not kill them by itself.
      if (c.season.jobs[k].kind === 'kill') c.season.fields[c.season.jobs[k].field].keepVines = true
      c.season.jobs.splice(k, 1)
      releaseJob(c, cmd.id)
      return ok()
    }
    case 'bump': {
      if (c.phase !== 'season' || !c.season) return fail('지금 작업 목록이 없습니다.')
      const k = c.season.jobs.findIndex(j => j.id === cmd.id)
      if (k < 0) return fail('그런 작업이 없습니다.')
      const [job] = c.season.jobs.splice(k, 1)
      c.season.jobs.unshift(job)
      return ok()
    }
    case 'haulNow': {
      // Frost on the barrels: the haul goes first for whoever brings in most by dark, today, Sunday or not.
      const s = c.season
      if (c.phase !== 'season' || !s) return fail('시즌이 아직 시작되지 않았습니다.')
      const f = s.fields[cmd.field]
      if (!f || f.inField < 0.5) return fail('그곳에 운반할 통이 없습니다.')
      let job = s.jobs.find(j => j.kind === 'haul' && j.field === cmd.field)
      if (!job) {
        const why = addJob(c, 'haul', cmd.field)
        if (why) return fail(why)
        job = s.jobs.find(j => j.kind === 'haul' && j.field === cmd.field)!
      }
      s.jobs.unshift(...s.jobs.splice(s.jobs.indexOf(job), 1))
      const name = FIELD_NAMES[cmd.field]
      const by = haulByDark(c, cmd.field)
      if (!by) {
        const why = heldUpBy(c, 'haul', false)
        const fix = c.crew.some(x => !x.foreman && x.prio.machine <= 0) ? ' 기계 일 우선순위를 정해 운반하게 하세요.' : ''
        const out = why ? `${why} 오늘 밤 ${name}의 통은 밖에 남습니다.` : `농장에 운전할 사람이 없어 오늘 밤 ${name}의 통은 밖에 남습니다.`
        return ok([note(c, 'haulNow', 'warn', `${out}${fix}`)])
      }
      // A day off gives way to the frost, as on a morning the frost is forecast (workday); the extra day tires them.
      const off = !workday(c, s)
      s.frostHaul = s.day
      let u = c.crew.find(x => x.id === by.unit)!
      let cwt = by.cwt
      let stops = ''
      let stopsWork = false
      // Every machine held for other work by those who will carry on with it first thing: one of them stops for the haul.
      const holders = c.crew.filter(o => o.rig === 'tractor' && o.job >= 0 && o.job !== job!.id)
      const truck = !!c.upgrades.truck && !c.crew.some(o => o.rig === 'truck')
      if (!truck && holders.length >= tractorsRunning(c, s.day) && !holders.includes(u)) {
        const h = holders.find(o => willDo(o, 'haul'))
        if (!h) return ok([note(c, 'haulNow', 'warn', `모든 트랙터가 운반하지 않는 사람과 다른 일에 나가 있어, 오늘 밤 ${name}의 통은 밖에 남습니다.`)])
        u = h
        cwt = Math.min(f.inField, haulRate(c, u, cmd.field, 'tractor') * Math.max(0, 1 - travel(c, u.at, cmd.field)))
        stopsWork = true
      }
      // Whoever hauls drops what they were on, and the answer says so: "Wendell stops digging Lower Middle for it."
      const was = u.job >= 0 && u.job !== job.id ? s.jobs.find(x => x.id === u.job) : undefined
      if (was) stops = ` ${u.kind === 'farmer' ? '당신은' : `${u.name.split(' ')[0]}은(는)`} 그것 때문에 ${was.field === cmd.field ? '거기서' : `${placeName(was.field)}에서`} ${JOB_LABEL[was.kind]}을(를) 멈춥니다.`
      job.unit = u.id
      if (u.job >= 0 && u.job !== job.id) letGo(u)
      const about = (x: number) => withCommas(Math.max(50, Math.round(x / 50) * 50))
      const left = f.inField - cwt
      const brings = `${by.rig === 'truck' && !stopsWork ? '트럭이' : '트랙터 한 대가'} 어둑해질 때까지 약 ${about(cwt)} cwt를 들여옵니다`
      const tires = off ? ` 쉬는 날이라 ${u.kind === 'farmer' ? '당신도' : '그도'} 일하는 날만큼 지칩니다.` : ''
      const now = `${u.kind === 'farmer' ? '당신은' : `${u.name.split(' ')[0]}은(는)`} 지금 ${name}을(를) 운반 중입니다.${stops}${tires} `
      return ok([note(c, 'haulNow', 'info', `${now}${brings}.${left >= 25 ? ` 약 ${about(left)} cwt는 밖에 남습니다.` : ' 전부 들어옵니다.'}`)])
    }
    case 'day': {
      if (c.phase !== 'season' || !c.season) return fail('시즌이 아직 시작되지 않았습니다.')
      if (c.season.frozen) return fail('땅이 얼었습니다. 시즌을 마무리하세요.')
      // (a day already begun has had its morning)
      const orders = c.season.clock ? [] : standingOrders(world, c)
      const day = stepDay(world, c)
      return ok([...orders, ...day, ...frostAhead(world, c), ...plantAsked(world, c), ...killCalled(world, c)])
    }
    case 'work': {
      if (c.phase !== 'season' || !c.season) return fail('시즌이 아직 시작되지 않았습니다.')
      if (c.season.frozen) return fail('땅이 얼었습니다. 시즌을 마무리하세요.')
      const orders = c.season.clock ? [] : standingOrders(world, c)
      return ok([...orders, ...workDay(world, c, Math.max(0, Math.min(1, cmd.to)))])
    }
    case 'endSeason': {
      if (c.phase !== 'season' || !c.season) return fail('시즌이 아직 시작되지 않았습니다.')
      return ok(endSeason(world, c))
    }
    case 'sell': {
      if (c.phase !== 'season' && c.phase !== 'cellar') return fail('지금 팔 것이 없습니다.')
      const lot = c.lots.find(l => l.id === cmd.lot)
      if (!lot || !lot.open) return fail('그 물량은 사라졌습니다.')
      if (Number.isNaN(cmd.frac)) return fail('팔 양을 고르세요.')
      if (c.phase === 'season' && c.season) {
        const f = c.season.fields[lot.field]
        if (f.status === 'digging') return fail('아직 수확 중입니다.')
        if (f.status === 'dug' && !f.weighed) return fail('아직 밭의 통에 있습니다. 실어 들이고 계근한 후에 팔 수 있습니다.')
        ageLot(c, lot, c.season.day)
      }
      const owed = -c.cash
      const money = sellLot(world, c, lot, cmd.frac)
      const loan = owed <= 0 ? '' : c.cash < 0 ? ` 대출은 $${withCommas(-c.cash)}로 줄었습니다.` : ` 대출을 다 갚았고 현금 $${withCommas(c.cash)}가 있습니다.`
      return ok([note(c, 'sold', 'good', `${FIELD_NAMES[lot.field]}의 ${variety(lot.variety).name}을(를) $${withCommas(money)}에 팔았습니다.${loan}`, lot.field)])
    }
    case 'deliver': {
      if (c.phase !== 'season' && c.phase !== 'cellar') return fail('지금 납품할 것이 없습니다.')
      const lot = c.lots.find(l => l.id === cmd.lot)
      if (!lot || !lot.open) return fail('그 물량은 사라졌습니다.')
      const k = c.contracts.find(x => x.id === cmd.contract)
      if (!k) return fail('그런 계약이 없습니다.')
      if (k.settled) return fail('그 계약은 끝났습니다.')
      const name = variety(lot.variety).name
      if (k.variety !== lot.variety) return fail(`${k.buyer}은(는) ${name}이(가) 아니라 ${variety(k.variety).name}을(를) 원합니다.`)
      const need = k.cwt - k.delivered
      if (need <= 1e-6) return fail('그 계약은 이미 이행됐습니다.')
      if (c.phase === 'season' && c.season && c.season.fields[lot.field].status === 'digging') return fail('아직 수확 중입니다.')
      if (c.phase === 'season' && c.season && !c.season.fields[lot.field].weighed) return fail('아직 밭의 통에 있습니다. 실어 들이고 계근한 후에 납품할 수 있습니다.')
      if (lot.grades.no1 + lot.grades.chef <= 1e-6) return fail('그 물량에 US No. 1 또는 대구경 감자가 남지 않았습니다.')
      const { take, money } = deliverLot(c, lot, k)
      return ok([note(c, 'delivered', 'good', `${FIELD_NAMES[lot.field]}의 ${name} ${withCommas(take)} cwt를 ${k.buyer.toLowerCase()}에 $${withCommas(money)}로 납품했습니다.`, lot.field)])
    }
    case 'seed': {
      if (c.phase !== 'cellar') return fail('작물이 저장고에 들어온 후에만 종자를 남길 수 있습니다.')
      const lot = c.lots.find(l => l.id === cmd.lot)
      if (!lot || !lot.open) return fail('그 물량은 사라졌습니다.')
      if (lot.broke) return fail('그 더미는 부패가 지나가 종자로 쓸 수 없습니다.')
      const n = Math.floor(cmd.fields)
      if (!(n >= 1)) return fail('적어도 한 밭 분량의 종자를 남기세요.')
      const need = n * P.SEED_CWT_PER_FIELD
      const have = lot.grades.b + lot.grades.no1
      if (have < need) return fail(`온전한 감자가 부족합니다. 이 물량은 최대 ${Math.floor(have / P.SEED_CWT_PER_FIELD)}개 밭 분량입니다.`)
      const fromB = Math.min(lot.grades.b, need)
      lot.grades.b -= fromB
      lot.grades.no1 -= need - fromB
      lot.seedHeld += n
      if (lotCwt(lot) < 0.5) lot.open = false
      return ok()
    }
    case 'month': {
      if (c.phase !== 'cellar') return fail('지금 저장 단계가 아닙니다.')
      const out: GameEvent[] = []
      if (openLots(c).length === 0 || c.month >= P.MONTH_CURVE.length - 1) {
        for (const lot of openLots(c)) sellLot(world, c, lot, 1)
        // The rest of the winter passes.
        for (let m = c.month; m < P.WINTER_MONTHS; m++) winterMonth(c, out)
        closeYear(world, c, out)
        return ok(out)
      }
      winterMonth(c, out)
      storeMonth(c, out)
      c.month++
      if (c.month === P.CONTRACT_WINTER_MONTH) settleContracts(c, 'winter', out)
      return ok(out)
    }
    case 'next': {
      if (c.phase !== 'ledger') return fail('The year isn\'t closed yet.')
      return nextYear(world, c)
    }
  }
  return fail('No such command.')
}

// Why this answer cannot be given now, or '' when it can.
export function answerBlock(c: Campaign, inc: Incident, choice: string): string {
  switch (choice) {
    case 'hire': return hireRoom(c)
    case 'rush': return c.season && inc.back! <= c.season.day + 1 ? 'The part arrives tomorrow anyway.' : ''
    case 'match': {
      const u = c.crew.find(x => x.id === inc.unit)
      return u ? '' : 'They\'ve already left.'
    }
    case 'take': {
      const lot = c.lots.find(l => l.id === inc.lot)
      if (!lot || !lot.open) return 'That lot is gone.'
      return ''
    }
  }
  return ''
}

// Carries out an answer. The passive choices are the defaults, shared with the season's day.
function answer(world: World, c: Campaign, s: Season, inc: Incident, choice: string, out: GameEvent[]): void {
  const done = () => { c.incidents = c.incidents.filter(i => i !== inc) }
  switch (choice) {
    case 'hire': {
      done()
      out.push(takeOn(c, fromApplicant(c, inc.applicant!)))
      return
    }
    case 'match': {
      done()
      const u = c.crew.find(x => x.id === inc.unit)!
      const was = u.wage
      u.wage = inc.wage!
      out.push(note(c, 'incidentDone', 'info', `${u.name} is staying, and their wage goes from $${withCommas(was)} to $${withCommas(u.wage)} a month.`))
      return
    }
    case 'rush': {
      done()
      cost(c, P.RUSH_PART)
      const k = c.broken.indexOf(inc.back!)
      if (k >= 0) c.broken[k] = s.day + 1
      out.push(note(c, 'incidentDone', 'info', `You paid $${withCommas(P.RUSH_PART)} for a rush part, so the tractor will be back tomorrow.`))
      return
    }
    case 'take': {
      done()
      const lot = c.lots.find(l => l.id === inc.lot)!
      ageLot(c, lot, s.day)
      const money = sellLot(world, c, lot, 1)
      const bonus = money * P.BUYER_PREMIUM
      c.cash += bonus
      c.yearRevenue += bonus
      lot.revenue += bonus
      out.push(note(c, 'incidentDone', 'good', `Sold the ${variety(lot.variety).name} from ${FIELD_NAMES[lot.field]} to the buyer for $${withCommas(money + bonus)}, 10% over the market price.`, lot.field))
      return
    }
  }
  resolveIncident(c, s, inc, choice, out)
}

// Why the stumps cannot be pulled on this tract now, or '' when they can.
export function stumpBlock(c: Campaign, field: number): string {
  const why = worksPhase(c)
  if (why) return why
  if (!fieldIndex(field)) return 'No such field.'
  const fp = c.fields[field]
  const name = FIELD_NAMES[field]
  if (fp.tenure === 'none') return `${name} isn't yours.`
  if (standing(fp.cover)) return `${name} is still ${COVER_WORD[fp.cover]}. Fell it first.`
  if (fp.cover !== 'stumps') return `There are no stumps on ${name}.`
  if (fp.works) return 'The contractor is already there.'
  if (spendBlock(c, P.STUMP_FEE, 'contractors')) return `You can't afford the contractor yet. It costs $${withCommas(P.STUMP_FEE)}.`
  return ''
}

// Why tile cannot go in under this field now, or '' when it can.
export function tileBlock(c: Campaign, field: number): string {
  const why = worksPhase(c)
  if (why) return why
  if (!fieldIndex(field)) return 'No such field.'
  const fp = c.fields[field]
  const name = FIELD_NAMES[field]
  if (fp.tenure !== 'owned') return 'Tile drains can only go under your own land.'
  if (fp.cover !== 'open') return `${name} is still ${COVER_WORD[fp.cover]}. Clear it first.`
  if (fp.elev !== 0) return 'Only bottom land needs tile, because the slopes drain on their own.'
  if (fp.tiled) return `${name} is already tiled.`
  if (fp.works) return 'The contractor is already there.'
  const st = c.season?.fields[field].status
  if (c.phase === 'season' && (st === 'planted' || st === 'growing' || st === 'dead' || st === 'digging')) return 'Tile can only be laid when no crop is in the ground.'
  if (spendBlock(c, P.TILE_FEE, 'contractors')) return `You can't afford the contractor yet. It costs $${withCommas(P.TILE_FEE)}.`
  return ''
}

// Contractors are taken on in spring or in the season, and work season days.
function worksPhase(c: Campaign): string {
  if (c.phase === 'plan') return ''
  if (c.phase === 'season' && c.season && !c.season.frozen) return ''
  return 'Contractors only work during the season, so order it in spring.'
}

export function canEndSeason(c: Campaign): boolean {
  return c.phase === 'season' && seasonDone(c)
}
