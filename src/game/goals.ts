// The ladder: what a farm reaches for next, in the order a player can reach it. Worked out from the farm as it stands,
// so nothing extra is saved.
import { BUILDING_KINDS, forecast, FELL_DAYS, FIELD_COUNT, formatDay, goalCosts, isField, jobBlock, killOutlook, NOTE_PAYMENT, PARCELS, plantWordGiven, resting, ROCKS_ADVISE, spendable, sprayWayNow, standingBy, TRACTS, type Campaign, type World, type GoalCost, type JobKind } from '../sim/index.ts'

export interface Goal {
  id: string
  title: string                                  // a few words, for the line under the date
  why: string                                    // what it teaches or brings, in a line
  how: string                                    // the same line, under the name the year-end sheet reads
  done: boolean
  now: boolean                                   // it can be worked on in this part of the year
  when: string                                   // when it can, for the list when it cannot now
  progress: { n: number; of: number } | null
  long: boolean                                  // one of the long goals at the top of the ladder
  cost: number                                   // the cash the step takes (0: none)
  block: string                                  // why the farm cannot take the step now ('' when it can)
  short: number                                  // how much more cash than the farm has the step takes (0: it can pay)
}

type Price = { cost: number; block: string }
type Spec = Omit<Goal, 'done' | 'now' | 'progress' | 'long' | 'how' | 'cost' | 'block' | 'short'> & { done: boolean; now: boolean; progress?: { n: number; of: number } | null; long?: boolean; price?: Price }

// What a step that spends money costs and whether the farm can take it now, from the simulation (src/sim/outlook.ts):
// of several (a machine, a building) the cheapest it can take, or else the cheapest it cannot, with the reason.
function prices(c: Campaign): Record<string, Price> {
  const all = goalCosts(c)
  const one = (id: string): Price => { const g = all.find(x => x.id === id); return g ? { cost: g.cost, block: g.can ? '' : g.why } : { cost: 0, block: '' } }
  const cheapest = (list: GoalCost[]): Price => {
    const by = (a: GoalCost, b: GoalCost) => a.cost - b.cost
    const can = list.filter(g => g.can).sort(by)[0]
    if (can) return { cost: can.cost, block: '' }
    const open = list.filter(g => !/이미/.test(g.why)).sort(by)[0]
    return open ? { cost: open.cost, block: open.why } : { cost: 0, block: '' }
  }
  // A machine is a goal only while buying it keeps the note's worth in hand: equipment comes out of cash, and a farm
  // left with less than that at the start of a season goes into its year end short.
  const tool = cheapest(all.filter(g => g.id.startsWith('buy:')))
  const left = c.cash - tool.cost
  const floor = c.phase === 'plan' && !tool.block && tool.cost > 0 && left < NOTE_PAYMENT
    ? `그러면 ${money(left)}가 남아 연간 은행 상환금 ${money(NOTE_PAYMENT)}보다 적습니다.` : ''
  return {
    stump: one('stump'), hire: one('hire'), foreman: one('foreman'), land: one('rent'),
    tool: floor ? { cost: tool.cost, block: floor } : tool, build: cheapest(all.filter(g => g.id.startsWith('build:'))),
  }
}

function money(n: number): string {
  return `${n < 0 ? '-' : ''}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`
}

export function goals(c: Campaign, o: { thisSeason?: boolean } = {}): Goal[] {
  // thisSeason: the crop steps of this season alone, as if no year were behind the farm.
  const past = !o.thisSeason && c.history.length > 0
  const s = c.season
  const inSeason = c.phase === 'season' && !!s && !s.frozen
  const spring = c.phase === 'plan'
  const crop = spring || inSeason
  const fields = s && (c.phase === 'season' || c.phase === 'cellar' || c.phase === 'ledger') ? s.fields : []
  const potato: number[] = []
  for (let i = 0; i < FIELD_COUNT; i++) if (fields[i] && isField(c, i) && fields[i].status !== 'off' && fields[i].status !== 'rest') potato.push(i)
  const planted = potato.filter(i => fields[i].plantDay >= 0)
  const any = (f: (x: NonNullable<Campaign['season']>['fields'][number]) => boolean) => fields.some(f)
  const hired = c.crew.some(u => u.kind !== 'farmer')
  // A hand is a step only once the farm's work needs one: until then hiring is a choice, as the agent says in spring.
  const handNeeded = needsHand(c)
  // A foreman pays only where one hired hand can be spared from field work and there are fields away from home to
  // run: with fewer, the step is not on the ladder at all.
  const foremanPays = c.crew.filter(u => u.kind !== 'farmer').length >= 2 && c.fields.some((f, i) => i < TRACTS[0] && PARCELS[i].block !== 'home' && f.tenure !== 'none')
  const hasForeman = c.crew.some(u => u.foreman !== '')
  const tracts = TRACTS.map(i => ({ i, f: c.fields[i], held: c.fields[i].tenure !== 'none' }))
  const standingHeld = tracts.filter(t => t.held && (t.f.cover === 'woods' || t.f.cover === 'brush'))
  const felledMost = standingHeld.reduce((m, t) => Math.max(m, t.f.felled / FELL_DAYS[t.f.cover as 'woods' | 'brush']), 0)
  const building = c.buildings.find(b => !b.built)
  const kindsBuilt = new Set(c.buildings.filter(b => b.built).map(b => b.kind))
  const price = prices(c)

  // The first season, in the order the crop asks for it. A later step done means every earlier one is behind the farm.
  const season: Spec[] = [
    { id: 'plant', title: '밭에 심기', why: '흙이 따뜻해지면 파종할 수 있습니다. 일꾼들은 당신을 기다리니 한 밭에 파종을 지시하면 나머지도 심습니다.', when: '시즌 중',
      done: past || (potato.length > 0 && planted.length === potato.length) || any(f => f.tiDay >= 0), now: crop,
      progress: potato.length ? { n: planted.length, of: potato.length } : null },
    { id: 'walk', title: '밭을 돌며 역병 보기', why: '역병은 가까이에서만 보이니 밭을 돌아보면 작을 때 잡을 수 있습니다.', when: '열이 나오면',
      done: past || any(f => f.lastScout >= 0), now: crop },
    { id: 'hill', title: '북주기', why: '북주기(열에 흙을 덮기)는 감자를 햇볕과 역병에서 지킵니다.', when: '식물이 한 뼘 자라면',
      done: past || any(f => f.hillPasses > 0), now: crop,
      progress: planted.length ? { n: planted.filter(i => fields[i].hillPasses > 0).length, of: planted.length } : null },
    { id: 'spray', title: '역병 전에 살포', why: '약은 역병보다 먼저 닿은 잎만 지킵니다.', when: '줄기가 푸를 때',
      done: past || any(f => f.lastSpray >= 0), now: crop },
    { id: 'sample', title: '시험 캐기', why: '한 포기를 캐보면 감자가 어떻게 여물고 있는지 알 수 있습니다.', when: '감자가 맺히면',
      done: past || any(f => f.samples.length > 0), now: crop },
    { id: 'kill', title: '줄기 죽이기', why: '생장이 멈추고 껍질이 약 2주에 걸쳐 굳습니다.', when: '9월에',
      done: past || any(f => f.killDay >= 0 || f.deadDay >= 0), now: crop },
    { id: 'dig', title: '밭 수확', why: '수확기가 감자를 땅에서 들어 통에 담습니다.', when: '껍질이 굳으면',
      done: past || any(f => f.status === 'digging' || f.status === 'dug'), now: crop },
    { id: 'haul', title: '수확물 들이기', why: '감자는 실어 들일 때까지 통에서 기다리고, 강한 서리는 일부를 상하게 합니다. 모두 들어오면 밭마다 계근합니다.', when: '수확 후',
      done: past || any(f => f.weighed), now: crop },
    { id: 'sell', title: '감자 팔기', why: '지금 밭에서 바로 팔거나, 저장해 겨울에 팔 수 있습니다.', when: '계근 후',
      done: o.thisSeason ? c.lots.some(l => l.year === c.year && l.sold > 0) : c.lots.some(l => l.sold > 0) || c.history.some(y => y.cwtSold > 0), now: c.phase === 'season' || c.phase === 'cellar' },
    { id: 'year', title: '해 넘기기', why: '연말에 연간 은행 상환금을 내면 다시 봄이 옵니다.', when: '연말에',
      done: past && c.outcome !== 'lost', now: true },
  ]

  // The farmstead, opening up from the second spring.
  // The clearing steps are about the farm's own tracts: one it does not hold is no step of its, felled or not.
  const cleared = tracts.filter(t => t.f.cover === 'open')
  const mine = tracts.filter(t => t.held)
  const clearedMine = mine.filter(t => t.f.cover === 'open')
  const noTract = mine.length === 0
  const clearing: Spec[] = [
    // Felling waits until the crop is in the ground: in a season it is the work of the quiet weeks.
    { id: 'fell', title: '산벌하기', why: '나무를 베는 것이 새 밭의 첫걸음입니다. 통나무는 마당으로 가고, 이어서 그루터기와 돌을 치웁니다.', when: noTract ? '산을 소유하면 됩니다. 봄에 땅에서 살 수 있습니다' : '작물을 심은 후나 겨울에',
      done: mine.some(t => t.f.cover === 'stumps' || t.f.cover === 'open'), now: !noTract && ((inSeason && planted.length === potato.length) || c.phase === 'cellar'),
      progress: felledMost > 0 ? { n: Math.round(felledMost * 100), of: 100 } : null },
    { id: 'stump', title: '그루터기 뽑기', why: '불도저 업자가 비용을 받고 뽑아줍니다.', when: '봄이나 시즌 중',
      done: clearedMine.length > 0, now: spring || inSeason, price: price.stump },
    { id: 'rocks', title: '새 땅의 돌 고르기', why: '갓 개간한 땅은 돌투성이입니다. 카드의 돌 고르기로 치우면 심을 수 있고, 돌은 건축에 쓸 마당으로 갑니다.', when: '시즌 중',
      done: clearedMine.some(t => t.f.stones < ROCKS_ADVISE), now: inSeason && clearedMine.length > 0 },
    { id: 'newfield', title: '새 땅 일구기', why: '1년간 귀리와 클로버를 키운 뒤 새 흙에 감자를 심습니다.', when: '다음 봄부터',
      done: clearedMine.some(t => !t.f.raw || (inSeason && fields[t.i] && fields[t.i].status !== 'off')), now: (spring || inSeason) && clearedMine.length > 0 },
  ]

  const ladder: Spec[] = [
    ...chain(season),
    { id: 'tool', title: '기계 사기', why: '장비는 가장 중요한 일을 빠르게 합니다.', when: '봄, 시즌 중 또는 겨울',
      done: Object.values(c.upgrades).some(Boolean), now: spring || inSeason || c.phase === 'cellar', price: price.tool },
    ...(handNeeded || hired || c.history.some(y => y.wages > 0) ? [{ id: 'hire', title: '일꾼 고용', why: '손이 하나 더 있으면 작업 목록을 감당할 수 있습니다.', when: '봄이나 시즌 중',
      done: hired || c.history.some(y => y.wages > 0), now: spring || inSeason, price: price.hire }] : []),
    { id: 'contract', title: '계약 맺기', why: '구매자가 가격을 확정하고, 당신은 감자를 납품해야 합니다.', when: '봄에',
      done: c.contracts.length > 0 || c.history.some(y => y.contracts > 0), now: spring },
    { id: 'land', title: '더 많은 땅 일구기', why: '집 여섯 밭 너머의 밭을 임차하거나 사세요.', when: '봄에, 땅 메뉴',
      done: c.fields.some((f, i) => i < TRACTS[0] && PARCELS[i].block !== 'home' && f.tenure !== 'none') || c.history.some(y => y.rent > 0 || y.land > 0), now: spring, price: price.land },
    ...chain(clearing),
    { id: 'build', title: '건물 짓기', why: '일꾼들이 당신의 통나무와 돌로 짓습니다.', when: '봄, 시즌 중 또는 겨울',
      done: c.buildings.some(b => b.built), now: spring || inSeason || c.phase === 'cellar',
      progress: building ? { n: Math.round(building.done), of: building.need } : null, price: building ? undefined : price.build },
    ...(foremanPays || hasForeman ? [{ id: 'foreman', title: '작업반장 임명', why: '작업반장이 매일 아침 외지 밭의 일을 지시하니 거기서는 당신을 기다리지 않습니다. 품값이 40% 오르고 밭일은 그만둡니다.', when: '두 명을 고용하고 외지 밭을 일구면',
      done: hasForeman, now: foremanPays, price: price.foreman }] : []),
    { id: 'five', title: '농장을 5년 지키기', why: '5년을 버티면 농장은 완전히 당신의 것입니다.', when: '매년 연말',
      done: c.outcome === 'kept', now: true, progress: { n: Math.min(c.goalYears, c.history.length), of: c.goalYears } },
    { id: 'cleared', title: '모든 구역 개간', why: '모든 수림·습지·탄 언덕을 밭으로 만듭니다.', when: '아무 해나', long: true,
      done: cleared.length === TRACTS.length, now: true, progress: { n: cleared.length, of: TRACTS.length } },
    { id: 'map', title: '지도 전체 일구기', why: '지도의 모든 밭과 구역을 소유하거나 임차합니다.', when: '아무 봄이나', long: true,
      done: c.fields.every(f => f.tenure !== 'none'), now: true, progress: { n: c.fields.filter(f => f.tenure !== 'none').length, of: FIELD_COUNT } },
    { id: 'crew', title: '열 명의 일꾼 고용', why: '열 명을 고용하고 각자 잘 자리를 마련합니다.', when: '아무 해나', long: true,
      done: c.crew.length >= 10, now: true, progress: { n: Math.min(10, c.crew.length), of: 10 } },
    { id: 'every', title: '모든 종류의 건물 짓기', why: '감자 저장고, 창고, 숙소, 포장실, 연못, 직판장, 관측소, 길을 짓습니다.', when: '아무 해나', long: true,
      done: kindsBuilt.size === BUILDING_KINDS.length, now: true, progress: { n: kindsBuilt.size, of: BUILDING_KINDS.length } },
  ]
  return ladder.map(({ price: p, ...g }) => {
    const cost = g.done || !p ? 0 : p.cost
    const block = g.done || !p ? '' : p.block
    // Money is the reason when the farm has less in hand than the step costs.
    const short = block && cost > spendable(c) ? Math.ceil(cost - spendable(c)) : 0
    return { ...g, how: g.why, progress: g.done ? null : g.progress ?? null, long: !!g.long, cost, block, short }
  })
}

// A step further on means every step before it in the same run is behind the farm too.
function chain(steps: Spec[]): Spec[] {
  for (let k = steps.length - 2; k >= 0; k--) if (steps[k + 1].done) steps[k].done = true
  return steps
}

// The goal to show: the first not yet reached that the farm can take. When that waits for another part of the year, the
// first step that can be taken now comes forward in its place; the long goals and the five years never jump the queue.
// A step the farm cannot pay for or cannot take now (no bed free, nobody hired) is passed over; the ladder says why.
// At the year end it is the coming spring's goal, so the one the book shows is the one the spring opens on.
export function nextGoal(c: Campaign): Goal | null {
  if (c.phase === 'ledger' && c.outcome === '') return nextGoal({ ...c, phase: 'plan' })
  const all = goals(c).filter(g => !g.done)
  const open = all.filter(g => !(g.now && g.block))
  const first = open[0] ?? all[0]
  if (!first || first.now) return first ?? null
  return open.find(g => g.now && !g.long && g.id !== 'five') ?? first
}

// How many fields of potatoes one person farms alone, as the first year's plan has it.
export const ALONE_FIELDS = 4

// Whether the farm's work needs a hired hand: more potato fields than one person plants and digs, or fields away
// from home. With less, the farmer can farm alone, and hiring is not asked for.
export function needsHand(c: Campaign): boolean {
  let potato = 0
  for (let i = 0; i < FIELD_COUNT; i++) if (c.fields[i].tenure !== 'none' && isField(c, i) && c.plans[i]?.crop === 'potato') potato++
  return potato > ALONE_FIELDS || c.fields.some((f, i) => i < TRACTS[0] && PARCELS[i].block !== 'home' && f.tenure !== 'none')
}

// While the season's next step is the crew's own work (planting after the word, walking, hilling, digging), the slip
// says what the player is waiting for in the player's terms: the progress of the planting they ordered, or their next
// decision and when it comes. Never a job that is not theirs. Null when the next step is the player's own to take.
// What the forecast says about blight, for the line under a spray decision: the day it comes, or that none is in sight.
function blightAhead(world: World | undefined, c: Campaign): string {
  if (!world) return '역병 날씨가 예보되면'
  const k = forecast(world, c, 6).findIndex(d => d.blight >= 2)
  return k < 0 ? '예보에 역병 날씨가 없음' : `역병 날씨 ${k === 0 ? '오늘' : k === 1 ? '내일' : `${k}일 후`}`
}

export function waitingFor(c: Campaign, world?: World): { title: string; when: string } | null {
  const s = c.season
  if (c.phase !== 'season' || !s || s.frozen) return null
  const potato: number[] = []
  for (let i = 0; i < FIELD_COUNT; i++) if (isField(c, i) && s.fields[i].status !== 'off' && s.fields[i].status !== 'rest') potato.push(i)
  if (!potato.length) return null
  const crew = (kind: JobKind) => potato.every(i => !!standingBy(c, kind, i))
  const planted = potato.filter(i => s.fields[i].plantDay >= 0).length
  if (planted < potato.length) {
    if (!crew('plant') || !plantWordGiven(s)) return null
    return { title: `파종: ${potato.length}개 밭 중 ${planted}개`, when: '일꾼들이 나머지를 알아서 심습니다' }
  }
  if (!crew('hill') || !crew('scout')) return null
  const up = potato.filter(i => { const f = s.fields[i]; return (f.status === 'planted' || f.status === 'growing') && f.deadDay < 0 })
  const kills = up.map(i => ({ i, k: killOutlook(c, i), listed: s.jobs.some(j => j.kind === 'kill' && j.field === i) }))
  const due = kills.map(x => x.k).filter((k): k is NonNullable<typeof k> => !!k).sort((a, b) => a.day - b.day)[0]
  // While the spraying is the player's (not left to the crew), a spray is their next decision until the vine kill
  // comes near: before the first one it comes with the first blight weather, after it with each new forecast of it.
  if (up.length && !crew('spray') && sprayWayNow(c) !== 'none' && !(due && due.day - s.day <= KILL_NEAR)) {
    if (!s.fields.some(f => f.lastSpray >= 0)) return { title: '작물이 자라는 중', when: '일꾼들이 돌봅니다. 다음 결정은 살포, 역병 날씨가 올 때' }
    return { title: '다음: 살포', when: blightAhead(world, c) }
  }
  if (up.length && !crew('kill')) {
    // Due and not yet ordered: the decision is the player's now, and the goal or the stamp says so.
    if (kills.some(x => x.k?.asked && !x.listed)) return null
    // Ordered, and the vines not yet down: how far along it is, as the planting was.
    if (kills.some(x => x.listed)) {
      const dead = potato.filter(i => s.fields[i].killDay >= 0 || s.fields[i].deadDay >= 0).length
      return { title: `줄기 죽이기: ${potato.length}개 밭 중 ${dead}개`, when: '작업 목록에 있음' }
    }
    // (two viewers who knew nothing of potatoes read "killing the vines" as a disaster: the line says what it is for)
    return { title: '다음: 수확을 위한 줄기 죽이기', when: due ? `수확할 수 있게 껍질을 굳히려고 ${formatDay(c.year, due.day, true)}쯤 예정` : '9월에, 수확할 수 있게 껍질을 굳히려고' }
  }
  if (!crew('dig') || !crew('haul')) return null
  if (potato.some(i => !s.fields[i].weighed && s.fields[i].status !== 'lost')) return up.length ? { title: '작물이 자라는 중', when: '일꾼들이 줄기를 죽이고 캐냅니다. 그다음 팔거나 저장하세요' } : { title: '수확이 들어오는 중', when: '일꾼들이 캐고 운반합니다. 그다음 팔거나 저장하세요' }
  return null
}

// Work on the land for people with nothing to do: the jobs to offer them, or null when everyone has work, when an
// order on the list has nobody at it yet (those people are about to go to it), when work on the land is already on
// the list, or when there is none to give. The crop's own work comes first whatever is ordered here. At most two
// are offered: a short job on a field (the hedgerow round a crop in the ground, lowest land first; else the stones
// of a field with no crop in it, stoniest first), and a tract to fell, brush before woods.
// who: the people with nothing to do, by id; gain: what the work is for, as a sentence.
export interface FreeWork { kind: 'brush' | 'rocks' | 'fell'; field: number; who: number[]; gain: string }
const LAND: JobKind[] = ['brush', 'rocks', 'fell']
export function idleWork(c: Campaign): { who: number[]; options: FreeWork[] } | null {
  const s = c.season
  if (c.phase !== 'season' || !s || s.frozen || !plantWordGiven(s)) return null
  // (someone resting, worn out, has not "nothing to do": a slip asked a player to keep busy a crew shown worn out)
  const who = c.crew.filter(u => u.foreman === '' && u.job < 0 && u.help === undefined && (u.out < 0 || u.out <= s.day) && !resting(u)).map(u => u.id)
  if (!who.length || s.jobs.some(j => LAND.includes(j.kind) || !c.crew.some(u => u.job === j.id))) return null
  const can = (kind: JobKind, i: number) => c.fields[i].tenure !== 'none' && jobBlock(c, kind, i) === ''
  const all = c.fields.map((_, i) => i)
  const crop = (i: number) => { const st = s.fields[i].status; return st === 'planted' || st === 'growing' }
  const options: FreeWork[] = []
  const brush = all.filter(i => crop(i) && can('brush', i)).sort((a, b) => c.fields[a].elev - c.fields[b].elev || a - b)[0]
  const rocks = all.filter(i => can('rocks', i) && c.fields[i].stones >= ROCKS_ADVISE).sort((a, b) => c.fields[b].stones - c.fields[a].stones || a - b)[0]
  if (brush !== undefined) options.push({ kind: 'brush', field: brush, who, gain: '밭 둘레의 무성한 산울타리를 잘라냅니다. 그 작물에 역병 날씨와 서리가 줄어듭니다.' })
  else if (rocks !== undefined) options.push({ kind: 'rocks', field: rocks, who, gain: '그곳의 파종과 캐기가 빨라지고 멍이 줄며, 건축에 쓸 돌이 생깁니다.' })
  const fell = all.filter(i => can('fell', i)).sort((a, b) => Number(c.fields[a].cover !== 'brush') - Number(c.fields[b].cover !== 'brush') || a - b)[0]
  if (fell !== undefined) options.push({ kind: 'fell', field: fell, who, gain: '건축하거나 제재소에 팔 통나무가 생기고, 새 밭의 첫걸음입니다.' })
  return options.length ? { who, options } : null
}
// The first of them.
export function freeWork(c: Campaign): FreeWork | null {
  return idleWork(c)?.options[0] ?? null
}

// How near the vine kill is, in days, before it is the player's next decision ahead of another spray.
const KILL_NEAR = 14

const CROP = new Set(['plant', 'walk', 'hill', 'spray', 'sample', 'kill', 'dig', 'haul'])

// In a season after the first, the crop's own next step this season: said ahead of a farmstead goal (fell a woodlot),
// which waits in the line under it. Null outside a season, or once the crop is in.
export function seasonStep(c: Campaign): Goal | null {
  if (c.phase !== 'season' || !c.season || c.season.frozen) return null
  return goals(c, { thisSeason: true }).find(g => CROP.has(g.id) && !g.done) ?? null
}
