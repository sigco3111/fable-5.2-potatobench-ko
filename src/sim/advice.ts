// Reference practice: what a careful Aroostook grower would do next, from what the grower can see.
// The in-game coach shows it, and the reference bot follows it. It tends the fields the farm holds; it has nothing
// to say about land, hiring or contracts.
import { dayIndex, formatDay, withCommas } from './calendar.ts'
import * as P from './params.ts'
import { jobSkill, SKILL_LABEL, willDo } from './people.ts'
import type { Campaign, GameEvent, JobKind, KillWhy, World } from './types.ts'
import { fieldInfo, forecast, today } from './view.ts'
import { openLots, sprayWayNow } from './campaign.ts'
import { newPotatoWindow } from './market.ts'
import { addJob, awaitsWord, FIELD_NAMES, JOB_LABEL, letGo, plantWordGiven, seasonDone, standingBy, workday } from './season.ts'
import { hasBuilt } from './buildings.ts'
import { forecastFor } from './weather.ts'
import { plantReady } from './outlook.ts'

export interface Advice {
  id: string
  field: number                    // -1 when not about one field
  act: JobKind | 'wait' | 'sell' | 'close'
  lot: number                      // for 'sell'
  text: string                     // what to do
  why: string                      // the reason, in the grower's terms
  urgent: boolean
  kill?: KillWhy                   // for 'kill': why the vines should come off now
}


export function advise(world: World, c: Campaign): Advice[] {
  return withinReach(c, everything(world, c))
}

// Everything reference practice asks for now, before the cap on how much goes on the list at once.
export function asks(world: World, c: Campaign): Advice[] {
  return everything(world, c)
}

// The day the crew kills this field's vines by itself, or -1: only where the dig is the routine's and the kill the
// player's call, while the coach asks for it (all: what it asks now), the vines are up and the player has not kept
// them up. KILL_WAIT days after this run of asking began, and no later than leaves the skins two weeks to set before
// the green dig.
export function killByItself(c: Campaign, field: number, all: Advice[]): number {
  const s = c.season
  const f = s?.fields[field]
  if (!s || !f || f.keepVines || f.status !== 'growing' || f.deadDay >= 0) return -1
  if (standingBy(c, 'kill', field) || !standingBy(c, 'dig', field)) return -1
  if (!all.some(a => a.act === 'kill' && a.field === field)) return -1
  const since = f.killSince ?? s.day
  const latest = dayIndex(s.year, P.DIG_GREEN.month, P.DIG_GREEN.dom) - P.SKIN_DAYS
  return Math.max(since, Math.min(since + P.KILL_WAIT, latest))
}

// Each morning: the day the coach's present run of asking for a field's kill began, cleared when it stops asking.
function noteKillRun(c: Campaign, all: Advice[]): void {
  const s = c.season!
  s.fields.forEach((f, i) => {
    if (all.some(a => a.act === 'kill' && a.field === i)) f.killSince ??= s.day
    else if (!s.jobs.some(j => j.kind === 'kill' && j.field === i)) delete f.killSince
  })
}

// The first day reference practice asks for each field's vines to be killed, and why, kept on the field so the
// weigh ticket can tell a kill the season asked for from one ahead of it (outlook.ts, killTiming).
export function noteKillAsks(world: World, c: Campaign, all: Advice[] = everything(world, c)): void {
  const s = c.season
  if (!s) return
  for (const a of all) {
    if (a.act !== 'kill' || s.fields[a.field].killAsked !== undefined) continue
    s.fields[a.field].killAsked = s.day
    s.fields[a.field].killWhy = a.kill
  }
}

// Everything reference practice would do now, before the cap on what the crews can get round to.
function everything(world: World, c: Campaign): Advice[] {
  const s = c.season
  if (c.phase !== 'season' || !s) return []
  const out: Advice[] = []
  const t = today(world, c)!
  const fc = forecast(world, c, 5)
  const year = s.year
  const queued = (kind: JobKind, field: number) => s.jobs.some(j => j.kind === kind && j.field === field)
  const add = (field: number, act: Advice['act'], text: string, why: string, urgent = false, lot = -1, kill?: KillWhy) => {
    if (act !== 'wait' && act !== 'sell' && act !== 'close' && queued(act, field)) return
    out.push({ id: `${act}:${field}:${lot}`, field, act, lot, text, why, urgent, ...(kill ? { kill } : {}) })
  }
  const rainSoon = fc.slice(0, 3).some(d => d.rainChance >= 60 && d.rainMm >= 8)
  const blightSoon = fc.slice(0, 3).some(d => d.blight >= 2)
  const frostSoon = fc.slice(0, 2).some(d => d.frostChance >= 50)
  // Dead vines wait for set skins until the date a green crop is dug, so the crop is in before the freeze-up.
  const digNow = s.day >= dayIndex(year, P.DIG_GREEN.month, P.DIG_GREEN.dom)
  const anyBlight = s.fields.some((_, i) => fieldInfo(c, i).blightHills > 0)
  const killBy = dayIndex(year, P.KILL_BY.month, P.KILL_BY.dom)
  const noSpray = sprayWayNow(c) === 'none'

  const spring = s.day < dayIndex(year, 5, 15)
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const f = fieldInfo(c, i)
    const n = f.name
    // A very stony field gets its rocks picked in spring, before the planter goes over it or while it rests.
    if ((f.status === 'idle' || f.status === 'rest') && spring && f.stones >= P.ROCKS_ADVISE && !f.works) {
      add(i, 'rocks', `${n}의 돌을 골라내세요.`, '겨울 동안 서리가 새 돌을 밀어 올렸습니다. 파종기와 수확기를 느려지게 하고, 수확 때 감자를 상하게 합니다.')
    }
    if (f.status === 'idle') {
      // One rule for planting, the same the field's card and the forecast line read (plantReady).
      const ready = plantReady(world, c, i)
      if (ready.ok) add(i, 'plant', `${n}에 심으세요.`, ready.why, s.day > dayIndex(year, 5, 1))
      else add(i, 'wait', f.tooWet && ready.soilT >= ready.need ? `${n}은(는) 너무 젖어 심을 수 없습니다.` : `${n} 파종을 미루세요.`, ready.why)
      continue
    }
    if (f.status === 'growing') {
      const s0 = s.fields[i]
      const up = s0.emergeDay >= 0
      const blightWinning = f.blightKnown >= 0.2
      const made = s0.matureDay >= 0 && s.day - s0.matureDay >= P.KILL_MADE_DAYS
      const frostKill = frostSoon && s.day >= dayIndex(year, 8, 1)
      const killDue = s0.tiDay >= 0 && (s.day >= killBy || made || blightWinning || frostKill)
      // Once the vines are coming off there is nothing left to tend.
      const tending = !killDue && !queued('kill', i) && !queued('dig', i)
      if (tending && up && f.hillPasses === 0 && f.canopy >= 0.08 && f.canopy < P.CLOSURE) {
        add(i, 'hill', `${n}에 북주기를 하세요.`, '포기가 한 뼘만큼 자랐습니다. 지금 북을 주면 곧 맺힐 감자를 덮어 주고 잡초를 묻습니다.', f.canopy > 0.4)
      } else if (tending && up && f.hillPasses === 1 && f.canopy >= 0.42 && f.canopy < P.CLOSURE) {
        add(i, 'hill', `${n}에 두 번째 북주기를 하세요.`, '줄이 닫히기 전 마지막 기회입니다. 두둑을 충분히 올리면 감자가 빛과 역병에서 멀어집니다.', f.canopy > 0.7)
      }
      const scoutEvery = t.watch ? 5 : 8
      if (tending && up && (f.scoutAge < 0 || f.scoutAge >= scoutEvery)) {
        add(i, 'scout', `${n}을(를) 살펴보세요.`, t.watch ? '역병 날씨입니다. 반점은 감염 며칠 뒤에야 가까이에서 보입니다.' : '일주일에 한 번 둘러보면 문제가 작을 때 잡을 수 있습니다.')
      }
      if (tending && up && f.blightHills > 0 && f.blightHills <= 8 && f.blightKnown < 0.04) {
        add(i, 'rogue', `${n}의 병든 포기 ${f.blightHills}개를 뽑으세요.`, `포기 ${f.blightHills}개가 포자를 흘리고 있습니다. 역병이 번지기 전에 뽑으세요.`, true)
      }
      if (tending && up && f.protect < 0.35 && !noSpray && (t.watch || (blightSoon && t.sv >= 12) || anyBlight)) {
        const why = anyBlight ? '농장에 역병이 들어왔습니다. 약은 역병보다 먼저 닿은 잎만 지켜 주니 미루지 마세요.'
          : !t.watch ? '역병 날씨가 예보되었고 경보가 가까우니, 포자가 오기 전에 잎에 약을 입히세요.'
            : f.protect > 0.02 ? '역병 경보가 발령됐고 지난번 약이 다해 갑니다.' : '역병 경보가 발령됐고 잎에 보호가 없습니다.'
        add(i, 'spray', `${n}에 약을 치세요.`, why, anyBlight || blightSoon)
      }
      // Most Aroostook potatoes are rain-fed: watering is advised only with a reel, or when the crop is wilting.
      if (tending && s0.tiDay >= 0 && s0.matureDay < 0 && !rainSoon && t.day.prcp < 2 && !f.tooWet) {
        if (f.moisture < (c.upgrades.reel ? 0.38 : 0.2)) {
          add(i, 'water', `${n}에 물을 주세요.`, c.upgrades.reel ? '땅이 말랐고 비 소식이 없습니다. 감자가 굵어질 때 마른 흙은 수량을 줄이고 궤양병을 부릅니다.' : '포기가 시들고 있고 비 소식이 없습니다. 물을 실어 나르는 건 느리지만, 이 밭은 작물을 잃고 있습니다.')
        } else if (!c.upgrades.reel && f.moisture < 0.38) {
          add(i, 'wait', `${n}이(가) 말랐습니다.`, '비가 가장 싼 해결책입니다. 관수 릴이 없으면 물 주기에 밭 하나당 하루 종일과 $300이 들어서, 여기 농가 대부분은 비를 기다리고 궤양병쯤은 감수합니다.')
        }
      }
      if (tending && s0.tiDay >= 0 && s.day - s0.tiDay >= 28 && (f.estimate?.digs ?? 0) < 1) {
        add(i, 'sample', `${n}에서 시험 캐기를 하세요.`, '포기 하나를 캐보면 잎을 일주일 보는 것보다 작물을 더 잘 압니다.')
      } else if (tending && s0.tiDay >= 0 && s.day - s0.tiDay >= 50 && (f.estimate?.digs ?? 0) < 2) {
        add(i, 'sample', `${n}에서 다시 시험 캐기를 하세요.`, '두 번째 포기가 줄기 죽이기 시기를 정하기 전에 추정을 정확하게 해 줍니다.')
      }
      if (killDue) {
        const kill: KillWhy = blightWinning ? 'blight' : s.day >= killBy ? 'late' : made ? 'made' : 'frost'
        const why = kill === 'blight' ? '여기는 역병이 이기고 있습니다. 줄기를 죽이면 남은 생장을 포기하지만, 포자가 감자로 씻겨 내려가는 것을 막습니다.'
          : kill === 'late' ? '껍질은 줄기가 죽은 뒤 2주가 지나야 굳어지는데, 10월은 짧습니다.'
            : kill === 'made' ? '작물이 다 자랐으니 줄기를 죽이고 껍질을 굳게 하세요.'
              : '서리가 예보됐습니다. 지금 줄기를 죽이면 생장을 조금 포기하지만 껍질이 먼저 굳기 시작합니다.'
        add(i, 'kill', `${n}의 줄기를 죽이세요.`, why, blightWinning, -1, kill)
      }
      // Vines still up this late will not leave time for the skins to set before the ground freezes: dig them green.
      if (s0.tiDay >= 0 && s.day >= dayIndex(year, P.DIG_GREEN.month, P.DIG_GREEN.dom) && !queued('kill', i)) {
        add(i, 'dig', `${n}을(를) 줄기가 있는 채로 캐세요.`, '땅이 얼기 전에 껍질이 굳기에는 너무 늦었습니다. 껍질 얇은 감자는 저장이 나쁘지만, 언 감자는 아예 저장이 안 됩니다.', true)
      }
    }
    if ((f.status === 'digging' || f.status === 'dug') && f.inField >= 0.5 && !f.weighed) {
      const frost = frostOnBarrels(world, c, i)
      add(i, 'haul', `${n}에서 수확물을 실어 오세요.`, frost ? `오늘 밤 서리가 예보됐고, 통에 담긴 ${Math.round(f.inField)} cwt의 5분의 1이 얼 수 있습니다.` : `${Math.round(f.inField)} cwt가 밭의 통에 있고, 실어 올 때까지 서리와 햇볕에 조금씩 상합니다.`, frost)
    }
    if (f.status === 'dead') {
      if (f.skin >= 1 || digNow) {
        add(i, 'dig', `${n}을(를) 캐세요.`, f.skin >= 1 ? '껍질이 굳었으니 캘 준비가 됐습니다.' : '강한 서리가 가까웠습니다. 얇은 껍질이 언 감자보다는 낫습니다.', digNow)
      } else {
        add(i, 'wait', `${n}을(를) 그대로 두세요.`, `껍질이 ${Math.round(f.skin * 100)}% 굳었습니다. 지금 캐면 껍질이 벗겨지고, 벗겨진 감자는 저장이 안 됩니다.`)
      }
    }
  }
  for (const lot of openLots(c)) {
    const f = s.fields[lot.field]
    if (f.status !== 'dug' || !f.weighed) continue
    if (newPotatoWindow(c, lot) && lot.skinned > 20) {
      add(lot.field, 'sell', `${fieldInfo(c, lot.field).name} 작물을 지금 파세요.`, '껍질 얇은 햇감자는 이번 주에 웃돈을 받지만 저장이 안 됩니다.', true, lot.id)
    } else if (lot.loss.blight > 0.03 * (lot.grades.no1 + lot.grades.b + lot.grades.no2 + lot.grades.chef + lot.grades.cull)) {
      add(lot.field, 'sell', `${fieldInfo(c, lot.field).name} 작물을 밭에서 바로 파세요.`, '선별대에서 역병 감자가 나왔습니다. 더미 안에 더 있고, 저장하면 썩습니다.', false, lot.id)
    }
  }
  if (seasonDone(c)) {
    add(-1, 'close', '시즌을 마무리하세요.', '작물이 모두 들어왔으니 이제 저장 단계입니다.', true)
  }
  out.sort((a, b) => Number(b.urgent) - Number(a.urgent))
  return out
}

// No more of any job than the crews could get round to: as many fields at once as the home farm has, for each
// crew able to do it, counting what is already on the list. The most urgent come first, then the fields in order.
function withinReach(c: Campaign, out: Advice[]): Advice[] {
  const s = c.season
  if (!s) return out
  const room = new Map<JobKind, number>()
  return out.filter(a => {
    if (a.act === 'wait' || a.act === 'sell' || a.act === 'close') return true
    const kind = a.act
    let left = room.get(kind)
    if (left === undefined) {
      let crews = 0
      for (const u of c.crew) if (willDo(u, kind)) crews++
      left = P.ADVICE_FIELDS_PER_CREW * crews
      for (const j of s.jobs) if (j.kind === kind) left--
    }
    room.set(kind, left - 1)
    return left > 0
  })
}

const MACHINE_WORK: JobKind[] = ['plant', 'hill', 'spray', 'water', 'kill', 'dig']

// Whether a frost is forecast tonight cold enough to reach the barrels in this field: the forecast the farm had
// yesterday for today, at the field's own frost offset.
export function frostOnBarrels(world: World, c: Campaign, field: number): boolean {
  const s = c.season
  if (!s) return false
  const f = forecastFor(world, c.seed, s.year, s.day, 1, hasBuilt(c, 'station') ? P.STATION_ERROR : 1)
  return f.frostChance >= P.FROST_HAUL_CHANCE || f.lo + P.FROST_OFFSET[c.fields[field].elev] * 0.7 <= P.FROST_HAUL_C
}

// Each working morning the farm's standing orders put on the list what reference practice wants, for the kinds of work
// the routine does by itself, on every held field; a foreman does every kind on their block, the calls included. The
// player can still order, cancel and bump. Ahead of a frost, the crop in the barrels is hauled first; the evening
// before says so (frostAhead).
export function standingOrders(world: World, c: Campaign): GameEvent[] {
  const s = c.season
  const out: GameEvent[] = []
  if (c.phase !== 'season' || !s || s.frozen) return out
  // A frost coming on crop in barrels is hauled ahead of, Sunday or not; the evening before said so (frostAhead).
  if (s.fields.some((f, i) => f.inField >= 0.5 && !f.weighed && frostOnBarrels(world, c, i))) s.frostHaul = s.day
  const all = everything(world, c)
  noteKillAsks(world, c, all)
  noteKillRun(c, all)
  if (!workday(c, s)) return out
  // A frost forecast for tonight: a lone hauler digs no more than the rest of the day can haul in (season.ts, work).
  s.frostLow = forecastFor(world, c.seed, s.year, s.day, 1, hasBuilt(c, 'station') ? P.STATION_ERROR : 1).lo
  // The year's first planting waits for the player's word (plantAsked said the crew stands ready). With no word
  // PLANT_WORD_DAYS later, the crew starts by itself this morning, and says so.
  const fit = all.filter(a => a.act === 'plant' && awaitsWord(c, 'plant', a.field))
  if (fit.length && s.plantAsk !== undefined && s.day - s.plantAsk >= P.PLANT_WORD_DAYS) {
    s.plantWord = s.day
    s.plantWordBy = 'crew'
    out.push(said(s, 'plantWord', fit[0].field, `일꾼들이 ${P.PLANT_WORD_DAYS}일을 기다린 뒤 스스로 파종을 시작했습니다.`))
  }
  for (const a of withinReach(c, all)) {
    if (a.field < 0 || a.act === 'wait' || a.act === 'sell' || a.act === 'close') continue
    if (a.act === 'kill' && s.fields[a.field].keepVines) continue
    if (awaitsWord(c, a.act, a.field)) continue
    const by = standingBy(c, a.act, a.field)
    if (by) addJob(c, a.act, a.field, -1, by)
  }
  // The vines' kill, overdue where the dig is the routine's: the crew sees to it rather than dig green.
  // Said in one line, so stamps the player had not pressed are seen to go to the list, not to vanish.
  const killing: number[] = []
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const when = killByItself(c, i, all)
    if (when >= 0 && s.day >= when && !s.jobs.some(j => j.kind === 'kill' && j.field === i) && !addJob(c, 'kill', i, -1, 'routine')) killing.push(i)
  }
  if (killing.length) {
    out.push({ day: s.day, type: 'crewKill', field: killing[0], level: 'info', data: { fields: killing },
      text: `일꾼들이 ${killing.length > 1 ? `${killing.length}개 밭의` : `${FIELD_NAMES[killing[0]]}의`} 줄기 죽이기를 작업 목록에 올렸습니다. 수확 전에 껍질이 굳도록요.` })
  }
  const cold: string[] = []
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const f = s.fields[i]
    if (f.inField < 0.5 || f.weighed || !frostOnBarrels(world, c, i)) continue
    cold.push(`${FIELD_NAMES[i]}의 ${withCommas(f.inField)} cwt`)
    const k = s.jobs.findIndex(j => j.kind === 'haul' && j.field === i)
    if (k > 0 && standingBy(c, 'haul', i)) s.jobs.unshift(...s.jobs.splice(k, 1))
  }
  if (cold.length) {
    // Whoever is on other machine work leaves it for the barrels; the work done stays with the order.
    for (const u of c.crew) {
      const j = u.job >= 0 ? s.jobs.find(x => x.id === u.job) : undefined
      if (j && j.kind !== 'haul' && MACHINE_WORK.includes(j.kind) && s.jobs.some(x => x.kind === 'haul' && standingBy(c, 'haul', x.field))) letGo(u)
    }
  }
  return out
}

function said(s: NonNullable<Campaign['season']>, type: string, field: number, text: string, data?: GameEvent['data']): GameEvent {
  const e: GameEvent = { day: s.day, type, field, level: 'info', text, ...(data ? { data } : {}) }
  s.log.push(e)
  return e
}

// The evening the first field comes fit to plant, with the planting waiting for the player's word: the crew says it
// stands ready, once, dated the morning the stamps are up, and the days to its own start count from there.
export function plantAsked(world: World, c: Campaign): GameEvent[] {
  const s = c.season
  if (c.phase !== 'season' || !s || s.frozen || s.plantAsk !== undefined || plantWordGiven(s)) return []
  const fit = everything(world, c).find(a => a.act === 'plant' && awaitsWord(c, 'plant', a.field))
  if (!fit) return []
  s.plantAsk = s.day
  return [said(s, 'plantAsk', fit.field, `흙이 준비됐고 일꾼들이 당신을 기다립니다. 아무 감자밭에나 심기를 지시하세요. 그렇지 않으면 ${P.PLANT_WORD_DAYS}일 뒤에 스스로 시작합니다.`)]
}

// The player's first planting order of the year is the word the crew waits for: said back, with what follows.
export function wordToPlant(c: Campaign, field: number): GameEvent | null {
  const s = c.season
  if (!s || s.plantWord !== undefined || standingBy(c, 'plant', field) !== 'routine') return null
  const first = !s.fields.some(f => f.plantDay >= 0) && s.jobs.filter(j => j.kind === 'plant').length === 1
  s.plantWord = s.day
  s.plantWordBy = 'you'
  if (!first) return null
  let others = 0
  for (let i = 0; i < P.FIELD_COUNT; i++) if (i !== field && c.plans[i]?.crop === 'potato' && c.fields[i].tenure !== 'none' && s.fields[i].plantDay < 0 && standingBy(c, 'plant', i) === 'routine') others++
  return said(s, 'plantWord', field, others ? `파종이 시작됐습니다. 일꾼들이 나머지 ${others}개 밭도 심을 겁니다.` : '파종이 시작됐습니다.')
}

// The evening a field's vine kill comes due and is the player's to give, said once for each field. Where the crew
// would not kill by itself (the kill and the dig are both the player's own orders): the day reference practice first
// asks for it. Where the player keeps the vines up: KILL_CALL_DAYS before the last day a kill still leaves the skins
// time to set. A kill the routine, a foreman or the crew's own date takes care of is never said.
export function killCalled(world: World, c: Campaign): GameEvent[] {
  const s = c.season
  if (c.phase !== 'season' || !s || s.frozen) return []
  const latest = dayIndex(s.year, P.DIG_GREEN.month, P.DIG_GREEN.dom) - P.SKIN_DAYS
  // The fields whose kill would be the player's alone, before asking whether it is due.
  const theirs: number[] = []
  s.fields.forEach((f, i) => {
    if (f.killCall !== undefined || f.status !== 'growing' || f.deadDay >= 0 || standingBy(c, 'kill', i)) return
    if (f.keepVines ? s.day < latest - P.KILL_CALL_DAYS : !!standingBy(c, 'dig', i)) return
    if (!s.jobs.some(j => j.kind === 'kill' && j.field === i)) theirs.push(i)
  })
  if (!theirs.length) return []
  const all = everything(world, c)
  const due: number[] = []
  const kept: number[] = []
  for (const i of theirs) {
    if (!all.some(a => a.act === 'kill' && a.field === i)) continue
    s.fields[i].killCall = s.day
    ;(s.fields[i].keepVines ? kept : due).push(i)
  }
  const names = (list: number[]) => { const n = list.map(i => FIELD_NAMES[i]); return n.join(', ') }
  const out: GameEvent[] = []
  if (due.length) out.push(said(s, 'killCall', due[0], `${names(due)}의 줄기를 죽일 때가 됐고, 그 결정은 당신의 몫입니다. 그곳에 줄기 죽이기를 지시하지 않으면 줄기는 그대로 둡니다.`, { fields: due }))
  if (kept.length) out.push(said(s, 'killCall', kept[0], `${names(kept)}의 줄기를 살려 두고 있습니다. 수확 전에 껍질이 굳으려면 ${formatDay(s.year, latest)}까지 죽이세요. 아니면 푸른 채로 캐게 됩니다.`, { fields: kept }))
  return out
}

// The evening before a frost on crop still in barrels, once for a cold spell: the one warning, dated the day the
// barrels are hauled in ahead of it, so the player hears of it while there is still a day to act.
export function frostAhead(world: World, c: Campaign): GameEvent[] {
  const s = c.season
  if (c.phase !== 'season' || !s || s.frozen) return []
  const cold: string[] = []
  for (let i = 0; i < P.FIELD_COUNT; i++) {
    const f = s.fields[i]
    if (f.inField >= 0.5 && !f.weighed && frostOnBarrels(world, c, i)) cold.push(`${FIELD_NAMES[i]}의 ${withCommas(f.inField)} cwt`)
  }
  if (!cold.length || s.frostHaul === s.day - 1) return []
  const e: GameEvent = { day: s.day, type: 'frostBarrels', field: -1, level: 'warn',
    text: `통에 남은 작물에 서리가 예보됐습니다: ${cold.join(', ')}. 일꾼들이 일요일에도 먼저 실어 나릅니다. 다 들어올 때까지요.` }
  s.log.push(e)
  return [e]
}

// For each field: what reference practice wants of the player now (need), or why it is leaving the field alone
// (hold). Work the routine or a foreman puts on the list by itself is no need, unless nobody on the farm will do it.
export function fieldNeeds(world: World, c: Campaign): { need: Advice | null; hold: Advice | null }[] {
  const raw = everything(world, c)
  const all = withinReach(c, raw)
  const job = (a: Advice) => a.field >= 0 && a.act !== 'wait' && a.act !== 'sell' && a.act !== 'close'
  const nobody = (kind: JobKind) => !c.crew.some(u => willDo(u, kind))
  return c.fields.map((_, i) => {
    const mine = all.filter(a => a.field === i)
    // The planting that waits for the player's word is theirs to give, on every field that is fit.
    const need = raw.find(a => a.field === i && a.act === 'plant' && awaitsWord(c, 'plant', i))
      ?? mine.find(a => a.act !== 'wait' && !(job(a) && standingBy(c, a.act as JobKind, i)))
      ?? raw.filter(a => a.field === i && job(a) && standingBy(c, a.act as JobKind, i) && nobody(a.act as JobKind))
        .map(a => ({ ...a, why: `${a.why} 농장에 ${SKILL_LABEL[jobSkill(a.act as JobKind)]}을(를) 할 사람이 없으니, 누군가의 우선순위를 정해 주세요.` }))[0]
      ?? null
    const auto = mine.find(a => job(a) && standingBy(c, a.act as JobKind, i) && !awaitsWord(c, a.act as JobKind, i))
    const hold = mine.find(a => a.act === 'wait')
      ?? (auto ? { ...auto, act: 'wait' as const, text: `${JOB_LABEL[auto.act as JobKind]}이(가) 작업 목록에 자동으로 오릅니다.`, why: `지시할 필요가 없습니다. ${auto.why}`, urgent: false } : null)
    return { need: need ?? null, hold }
  })
}
