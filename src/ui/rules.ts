// The rules as the interface states them, worked out from the simulation's own constants so the copy cannot drift.
import type { Alert } from '../game/app.ts'
import * as S from '../sim/index.ts'
import * as F from './fmt.ts'

// F steps the clock's speed, so felling is X, for the axe.
export const JOB_KEY: Record<S.JobKind, string> = { plant: 'P', hill: 'H', scout: 'C', spray: 'S', water: 'W', rogue: 'R', sample: 'T', kill: 'K', dig: 'D', fell: 'L', rocks: 'O', brush: 'B', build: '', haul: '' }
export const KEY_JOB: Record<string, S.JobKind> = { p: 'plant', h: 'hill', c: 'scout', s: 'spray', w: 'water', r: 'rogue', t: 'sample', k: 'kill', d: 'dig', l: 'fell', o: 'rocks', b: 'brush' }
export const JOB_VERB: Record<S.JobKind, string> = {
  plant: '파종', hill: '북주기', scout: '살펴보기', spray: '살포', water: '물주기', rogue: '병든 포기 뽑기', sample: '시험 캐기', kill: '줄기 죽이기', dig: '캐기',
  fell: '벌목', rocks: '돌 줍기', brush: '덤불 자르기', build: '짓기', haul: '들이기',
}
// What the crew is doing, before the field's name.
export const JOB_DOING: Record<S.JobKind, string> = {
  plant: '파종', hill: '북주기', scout: '살펴보기', spray: '살포', water: '물주기', rogue: '병든 포기 뽑기', sample: '시험 캐기', kill: '줄기 죽이기', dig: '캐기',
  fell: '벌목', rocks: '돌 줍기', brush: '덤불 자르기', build: '짓기', haul: '들이기',
}

// An order in a few words: "Hilling North Ridge", "Building in the home yard". A build order's place is a yard.
export function jobText(j: { kind: S.JobKind; field: number }, c?: S.Campaign, building?: number): string {
  if (j.kind === 'build') {
    const b = c && building !== undefined ? c.buildings.find(x => x.id === building) : undefined
    return b ? `${S.BUILDINGS[b.kind].name} 짓기` : `${S.placeName(j.field)} ${JOB_DOING.build}`
  }
  return `${S.placeName(j.field)} ${JOB_DOING[j.kind]}`
}

// One line each: what the job does.
export function jobWhat(kind: S.JobKind): string {
  switch (kind) {
    case 'plant': return '종자 감자를 심습니다.'
    case 'hill': return '이랑에 흙을 덮어 감자를 빛과 역병에서 멀리하고 잡초를 묻습니다.'
    case 'scout': return '가까이에서만 보이는 역병을 찾으며 이랑을 걸어 살핍니다.'
    case 'spray': return '역병이 번지지 못하게 잎에 약을 뿌립니다. 이미 걸린 포기는 낫게 하지 못합니다.'
    case 'water': return `밭에 ${inch()}의 물을 줍니다.`
    case 'rogue': return '찾아낸 병든 포기를 뽑아 봉지에 담아, 나머지에 포자가 퍼지는 것을 막습니다.'
    case 'sample': return '한 포기를 캐내 감자가 몇 개인지, 얼마나 큰지, 무엇이 잘못됐는지 봅니다.'
    case 'kill': return '줄기를 죽여 감자가 자라는 것을 멈추고 수확할 수 있게 껍질을 굳힙니다.'
    case 'dig': return '작물을 캐내 밭에서 통에 담습니다.'
    case 'fell': return '나무를 베어 통나무를 마당으로 가져옵니다.'
    case 'rocks': return '밭에서 돌을 주워 마당에 필드스톤으로 쌓습니다.'
    case 'brush': return '밭 둘레의 산울타리를 잘라냅니다.'
    case 'build': return '하루치씩 일하며 건물을 짓습니다.'
    case 'haul': return '통을 밭에서 감자 저장고로 들여 작물을 계근합니다.'
  }
}

// What an order does and when a careful grower gives it, in two short sentences, for the one page of help.
export function orderHelp(kind: S.JobKind): string {
  switch (kind) {
    case 'plant': return `종자 감자를 심습니다. 흙이 ${F.temp(10)} 가까이 될 때까지 기다리세요. 더 찬 땅에서는 종자가 썩습니다.`
    case 'hill': return '이랑에 흙을 덮어 감자를 가리고 잡초를 묻습니다. 이랑이 닫히기 전에 두 번 하세요.'
    case 'scout': return '가까이에서만 보이는 역병을 찾으며 이랑을 걸어 살핍니다. 매주, 역병 경보 중에는 더 자주 하세요.'
    case 'spray': return '잎을 역병에서 지킵니다. 역병 날씨 전에 뿌리세요. 역병을 낫게 하지는 못하고 비와 새 잎에 약이 닳습니다.'
    case 'water': return `밭에 ${inch()}의 물을 줍니다. 감자가 굵어지는 동안 흙이 마르면 쓰세요.`
    case 'rogue': return '찾아낸 병든 포기를 뽑아 봉지에 담습니다. 얼마 없을 때 하세요.'
    case 'sample': return '한 포기를 캐내 감자를 보여줍니다. 수확 전 작물을 볼 유일한 기회입니다.'
    case 'kill': return `줄기를 죽이면 감자가 자라는 것을 멈추고 ${S.SKIN_DAYS}일 만에 껍질이 굳습니다. 9월 초에, 역병이 우세하면 더 일찍 하세요.`
    case 'dig': return '작물을 캐내 통에 담습니다. 껍질이 굳은 후, 땅이 얼기 전에 하세요.'
    case 'fell': return '숲이나 덤불 구획을 개간합니다. 새 밭의 첫걸음입니다. 시즌 중에는 느리고 겨울에는 빠릅니다.'
    case 'rocks': return '밭에서 돌을 줍습니다. 돌 많은 땅은 파종과 캐기를 느리게 하고 작물에 멍을 입힙니다. 작물이 없을 때만 하세요.'
    case 'brush': return '산울타리를 잘라내면 역병 날씨와 서리가 줄지만 마르는 바람이 조금 늘어납니다. 다시 자랍니다.'
    case 'build': return '당신의 일꾼들이 건물을 짓습니다. 마당에서 지시하세요.'
    case 'haul': return '수확한 작물을 들여옵니다. 밭에 남은 통은 얼거나 녹변할 수 있습니다.'
  }
}

// The whole of the teaching: a sentence or two the first time each kind of badge appears.
export function hint(kind: S.JobKind): string {
  switch (kind) {
    case 'plant': return `흙이 ${F.temp(10)}에 이르러 심을 만큼 따뜻해졌습니다. 더 찬 땅에서는 종자가 그냥 썩습니다.`
    case 'hill': return '북주기는 이랑에 흙을 덮어 막 맺히려는 감자를 가리고 잡초를 묻습니다. 이랑이 닫히기 전에 두 번 하세요.'
    case 'scout': return '살펴보기는 이랑을 걸어 살피는 일입니다. 역병은 가까이에서만 보이고, 일주일 지난 확인은 추측일 뿐입니다.'
    case 'spray': return '역병 날씨 전에 뿌리세요. 역병이 번지는 것을 막지만 낫게 하지는 못하고, 비와 새 잎에 약이 닳습니다.'
    case 'water': return `감자가 굵어지는 동안 마른 흙은 수확을 깎고 더부룩병을 부릅니다. 물주기는 ${inch()}를 더합니다.`
    case 'rogue': return '병든 포기 뽑기는 찾아낸 병든 포기를 뽑아 봉지에 담아, 나머지에 포자가 퍼지는 것을 막습니다.'
    case 'sample': return '시험 캐기는 한 포기를 캐내 감자를 보여줍니다. 수확 전에 볼 유일한 기회입니다.'
    case 'kill': return `작물이 다 자라면 줄기를 죽이세요. 감자는 자라는 것을 멈추고 껍질은 ${S.SKIN_DAYS}일 만에 굳습니다.`
    case 'dig': return '캐기는 작물을 통에 담습니다. 서리가 허락하면 껍질이 굳기를 기다리세요. 얇은 껍질의 감자는 저장되지 않습니다.'
    case 'fell': return '구획 벌목은 새 밭의 첫걸음입니다. 그다음 그루터기를 뽑고 돌을 줍고 심습니다.'
    case 'rocks': return '돌은 파종과 캐기를 느리게 하고 작물에 멍을 입힙니다. 줍는 데는 사람과 시간이 듭니다.'
    case 'brush': return '무성한 산울타리는 밭에 습기와 서리를 머물게 합니다. 잘라내면 바람이 통합니다.'
    case 'build': return '당신의 일꾼들이 밭일이 필요 없을 때 건물을 짓습니다.'
    case 'haul': return '수확한 작물은 들여올 때까지 통에 있습니다. 매서운 서리가 밭에 남은 통 일부를 망칠 수 있습니다.'
  }
}

function inch(): string {
  return F.metric() ? `약 ${S.IRRIGATION_MM}mm` : '약 1인치'
}

export function isJob(act: S.Advice['act'] | undefined): act is S.JobKind {
  return !!act && act !== 'wait' && act !== 'sell' && act !== 'close'
}

// A blight reading is a guess once the field has gone a week unwalked.
export function isStale(f: S.FieldInfo): boolean {
  return f.scoutAge < 0 || f.scoutAge >= 7
}

export function hillWord(passes: number): string {
  return passes >= 2 ? '두 번' : passes === 1 ? '한 번, 한 번 남음' : '아직'
}

// The glyph for where a field is in its year.
export function stageGlyph(f: S.FieldInfo): string {
  switch (f.status) {
    case 'rest': return 'rest'
    case 'idle': return 'idle'
    case 'planted': return 'planted'
    case 'growing': return f.stage === '잎 키우는 중' ? 'leaf' : f.stage === '줄기 마르는 중' ? 'down' : f.bloom > 0.2 ? 'bloom' : 'bulk'
    case 'dead': return 'dead'
    case 'digging': return 'dig'
    case 'dug': return 'dug'
    case 'off': return 'rest'
    case 'lost': return 'close'
  }
}

// An alert in a few words, for the strip by the land. The whole sentence is in the diary.
export function alertShort(a: Alert): { text: string; glyph: string } {
  const name = a.field >= 0 ? `${S.FIELD_NAMES[a.field]}: ` : ''
  const n = /(\d+)/.exec(a.text)?.[1] ?? ''
  switch (a.type) {
    case 'plantAsk': return { text: '흙이 준비됐습니다. 밭에서 파종을 눌러 파종을 시작하세요', glyph: 'plant' }
    case 'plantWord': return { text: a.text, glyph: 'plant' }
    case 'killCall': return { text: a.text, glyph: 'kill' }
    case 'emerged': return { text: `${name}${a.level === 'warn' ? '싹이 올라왔지만 드묾' : '싹이 올라옴'}`, glyph: 'leaf' }
    case 'ti': return { text: `${name}감자가 맺히기 시작함`, glyph: 'bulk' }
    case 'mature': return { text: `${name}줄기가 마르기 시작함`, glyph: 'down' }
    case 'vinesDead': return { text: `${name}${a.text.includes('서리') ? '서리가 줄기를 죽임' : a.text.includes('역병') ? '역병이 줄기를 죽임' : '줄기가 다 마름'}`, glyph: 'dead' }
    case 'skinSet': return { text: `${name}껍질이 굳음`, glyph: 'dig' }
    case 'frost': return { text: `${name}잎에 서리`, glyph: 'frost' }
    case 'dry': return { text: `${name}마르고 있음`, glyph: 'dry' }
    case 'logged': return { text: `${name}고인 물`, glyph: 'water' }
    case 'blightSeen': return { text: `${name}길에서 역병 목격`, glyph: 'blight' }
    case 'scout': return { text: a.level === 'bad' ? `${name}역병 ${typeof a.data?.found === 'number' ? a.data.found : Number(n)}포기 발견` : `${name}살펴봄, 역병 없음`, glyph: a.level === 'bad' ? 'blight' : 'scout' }
    case 'watch': return { text: '역병 경보 발령', glyph: 'blight' }
    case 'sample': return { text: `${name}시험 캐기에서 감자 ${/감자 (\d+)개/.exec(a.text)?.[1] ?? n}개`, glyph: 'sample' }
    case 'dug': return { text: `${name}${a.level === 'bad' ? '다 캐기 전에 얼었음' : '모두 캐냄'}`, glyph: 'dig' }
    case 'lost': return { text: a.field >= 0 ? `${name}작물 손실` : a.text, glyph: 'close' }
    case 'freeze': return { text: '땅이 얼었습니다', glyph: 'frost' }
    case 'dropped': {
      // An order the morning took off the list, and why: the reason is the whole point of saying it.
      const why = typeof a.data?.why === 'string' && a.data.why ? `. ${a.data.why.replace(/\.$/, '')}` : ''
      return { text: `${name}작업 목록에서 내려짐${why}`, glyph: 'warn' }
    }
    case 'sold': return { text: a.text.replace(/^.*을\(를\) (\$[\d,]+)에 팔았습니다.*$/, `${name}$1에 판매`), glyph: 'check' }
    case 'delivered': return { text: a.text.replace(/^.*(\$[\d,]+)를 지불했습니다.*$/, `${name}납품 $1`), glyph: 'deliver' }
    case 'contractShort': case 'contractFilled': return { text: a.text.replace(/\.$/, ''), glyph: 'contract' }
    case 'hired': return { text: a.text.replace(/^(.+?)이\(가\).*$/, '$1 고용됨'), glyph: 'hire' }
    case 'dismissed': return { text: a.text.replace(/\.$/, ''), glyph: 'crew' }
    case 'quit': return { text: `${who(a.text)} 그만둠`, glyph: 'unhappy' }
    case 'unhappy': return { text: `${whoIs(a.text)} 불만`, glyph: 'unhappy' }
    case 'wornOut': return { text: `${whoIs(a.text)} 지침`, glyph: 'tired' }
    case 'hurt': return { text: `${who(a.text)} 다침${/쉬고 (.+?)에 복귀합니다/.exec(a.text) ? `, ${/쉬고 (.+?)에 복귀합니다/.exec(a.text)![1]}에 복귀` : ''}`, glyph: 'hurt' }
    case 'poached': return { text: `${who(a.text)} 이웃에게 떠남`, glyph: 'unhappy' }
    case 'skillUp': return { text: a.text.replace(/: (\d+)레벨\.$/, ', 이제 $1/10'), glyph: 'rise' }
    case 'breakdown': return { text: '트랙터가 고장 났습니다', glyph: 'tractor' }
    case 'repaired': return { text: '트랙터가 다시 움직입니다', glyph: 'tractor' }
    case 'building': return { text: a.text.replace(/^.+에 (.+?) 공사를 시작.*$/, '$1 공사 시작'), glyph: 'build' }
    case 'built': return { text: a.text.replace(/^.+에 (.+?)이\(가\) (?:겨울 동안 지어졌습니다|완성됐습니다).*$/, '$1 완성'), glyph: 'build' }
    case 'felled': return { text: `${name}나무 벌어냄`, glyph: 'fell' }
    case 'stumped': return { text: `${name}그루터기 뽑음`, glyph: 'stump' }
    case 'tiled': return { text: `${name}암거 배수관 매설`, glyph: 'tile' }
    case 'rocks': return { text: `${name}돌 주워냄`, glyph: 'rocks' }
    case 'brushed': return { text: `${name}덤불 정리`, glyph: 'brush' }
    case 'brushBack': return { text: a.text.replace(/\.$/, ''), glyph: 'brush' }
    case 'pondDry': return { text: '연못이 말랐습니다', glyph: 'pond' }
    case 'frostBarrels': {
      const cwt = [...a.text.matchAll(/([\d,]+) cwt in /g)].reduce((t, m) => t + Number(m[1].replace(/,/g, '')), 0)
      return { text: `오늘 밤 서리, 통 속 ${cwt ? F.localize(`${cwt} cwt`) : '작물'}`, glyph: 'frost' }
    }
    case 'barrelsOut': return { text: a.text.replace(/^.*통이 (\d+)일째.*?([\d,]+) cwt가 햇볕에.*$/, (_, d: string, g: string) => `${name}통 $1일째 밖에 있음, ${F.localize(`${g.replace(/,/g, '')} cwt`)} 녹변`), glyph: 'warn' }
    case 'frozenInField': return { text: `${name}통이 얼었음${typeof a.data?.cwt === 'number' && a.data.cwt > 0 ? `, ${F.localize(`${a.data.cwt} cwt`)}` : ''}`, glyph: 'frost' }
    case 'weighed': return { text: `${name}계근 완료`, glyph: 'ticket' }
    case 'pickers': return { text: a.text.startsWith('학생 일꾼을') ? '학생 일꾼 고용' : '학생 일꾼 귀가', glyph: 'pickers' }
    case 'logsSold': return { text: a.text.replace(/^통나무 .+? (\$[\d,]+)에 팔았습니다\.$/, '통나무 판매 $1'), glyph: 'logs' }
    case 'incident': return { text: F.localize(a.text.split('. ')[0]), glyph: 'ask' }
    case 'need': {
      const more = Array.isArray(a.data?.fields) ? a.data.fields.length - 1 : 0
      return { text: `${a.text.replace(/\.$/, '')}${more > 0 ? ` 외 ${more}개 밭` : ''}`, glyph: typeof a.data?.act === 'string' ? a.data.act : 'warn' }
    }
    case 'incidentDone': return { text: a.text.replace(/\.$/, ''), glyph: 'ask' }
    case 'foreman': return { text: a.text.split('. ')[0].replace(/\.$/, ''), glyph: 'foreman' }
    default: return { text: a.text, glyph: a.level === 'bad' ? 'blight' : a.level === 'warn' ? 'warn' : a.level === 'good' ? 'check' : 'flat' }
  }
}

// The person an alert is about: the name it starts with.
function who(text: string): string {
  return /^(.+?)(?:이\(가\)|은\(는\)|을\(를\)|이|가|은|는) /.exec(text)?.[1] ?? text.split(' ')[0]
}

function whoIs(text: string): string {
  const w = who(text)
  return w === S.FARMER_NAME ? '당신은' : `${w}은(는)`
}

// Days until the ground is fit to plant (S.plantingIn).
export const plantingIn = S.plantingIn

// Killing the vines before they are due is warned of once it gives up this much, cwt an acre (a farm can lose half
// again or half as much as S.killCostToday says, so the warning says "about").
export const KILL_WARN_CWT = 5

export interface KillEarly { field: number; cost: S.KillCost; short: string; why: string; did: string }

// The worst of these fields to kill the vines on today, in words: the stamp's short line, its reason, and what the
// note says once it is ordered. null when no field would give up KILL_WARN_CWT an acre (the kill is due, the coach
// asked for it, or the potatoes have not formed).
export function killEarly(world: S.World, c: S.Campaign, fields: number[]): KillEarly | null {
  let worst: { field: number; cost: S.KillCost } | null = null
  for (const i of fields) {
    const cost = S.killCostToday(world, c, i)
    if (cost && cost.cwtPerAcre >= KILL_WARN_CWT && (!worst || cost.cwtPerAcre > worst.cost.cwtPerAcre)) worst = { field: i, cost }
  }
  if (!worst) return null
  const { field, cost } = worst
  const early = `${cost.days}일 일찍`
  const where = fields.length > 1 ? `${S.FIELD_NAMES[field]}에서 ` : ''
  const lost = `약 ${F.perArea(cost.cwtPerAcre)}`
  const due = F.date(c.year, cost.dueDay)
  const then = S.standingBy(c, 'kill', field) ? `일꾼들이 ${due}에 합니다.` : `예정일은 ${due}입니다.`
  return {
    field, cost, short: early,
    why: `감자가 아직 자라고 있어 ${where}줄기를 ${early} 죽이면 ${lost}을(를) 잃습니다. ${then}`,
    did: `${where}줄기를 ${early} 죽이는 중이며, ${lost}을(를) 잃습니다.`,
  }
}

// Seed that rotted in cold ground, as a loss on the weigh ticket: what it cost the field, cwt (stand: the share of the
// seed that came up; total: the crop dug, cwt), and a phrase with the planting day. Seed rots only in cold soil before
// it comes up. null when the stand is not known or no seed worth saying rotted.
export function coldSeed(c: S.Campaign, lot: S.Lot, stand: number | null, total: number): { cwt: number; phrase: string } | null {
  if (stand === null || !(stand > 0) || 1 - stand < 0.01) return null
  const cwt = total * (1 - stand) / stand
  if (cwt / S.FIELD_ACRES < 0.5) return null
  const s = c.season
  const day = s && s.year === lot.year ? s.fields[lot.field]?.plantDay ?? -1 : -1
  const early = day >= 0 && day < S.dayIndex(lot.year, S.PLANT_FROM.month, S.PLANT_FROM.dom)
  const share = F.pct(1 - stand)
  return {
    cwt,
    phrase: day < 0 ? `${share}, 찬 흙에서 썩음` : early ? `${share}, ${F.date(lot.year, day)}의 이른 파종` : `${share}, 흙이 차가워진 뒤, ${F.date(lot.year, day)} 파종`,
  }
}

// What the five-day forecast says the sky will do, from its own chance of rain.
export function forecastSky(d: S.ForecastDay): string {
  if (d.rainChance >= 60) return d.hi <= 1 ? 'snow' : d.rainMm >= 20 ? 'storm' : 'rain'
  return d.rainChance >= 30 ? 'shower' : 'clear'
}

export const SKY_WORD: Record<string, string> = {
  clear: '맑음', cloud: '구름 조금', overcast: '흐림', rain: '비', storm: '폭우', fog: '안개로 습함', snow: '눈', shower: '소나기 가능',
}
export const BLIGHT_RISK = ['none', 'some', 'high', 'severe']

// The usual price through the season relative to the season average (USDA monthly record, as the simulation holds it).
function usualFactor(day: number): number {
  const c = S.SEASON_CURVE
  if (day <= c[0][0]) return c[0][1]
  for (let i = 1; i < c.length; i++) {
    if (day <= c[i][0]) return c[i - 1][1] + ((day - c[i - 1][0]) / (c[i][0] - c[i - 1][0])) * (c[i][1] - c[i - 1][1])
  }
  return c[c.length - 1][1]
}

// What a large tuber brings against a US No. 1 of the same variety.
function largeRatio(world: S.World, c: S.Campaign, id: S.VarietyId): number {
  const lot = { variety: id, sprouted: false } as S.Lot
  const no1 = S.gradePrice(world, c, lot, 'no1')
  return no1 > 0 ? S.gradePrice(world, c, lot, 'chef') / no1 : 1
}

export function largeRule(world: S.World, c: S.Campaign, id: S.VarietyId, short = false): string {
  const r = largeRatio(world, c, id)
  if (short) return r >= 1 ? `베이커용으로 ${F.pct(r - 1)} 더` : `${F.pct(1 - r)} 덜`
  return r >= 1 ? `1등급 가격보다 ${F.pct(r - 1)} 높음, 베이커용` : `1등급 가격보다 ${F.pct(1 - r)} 낮음`
}

// The cellar month a pile dug on dugDay starts to sprout in: an index into CELLAR_MONTHS, past its end when it never does.
export function sproutMonth(year: number, dugDay: number, id: S.VarietyId, vent: boolean): number {
  const keeps = S.variety(id).dormancy + S.COOL_CELLAR_DAYS + (vent ? S.VENT_DAYS : 0)
  const before = S.dayIndex(year, 10, 1) - dugDay
  return Math.max(1, Math.floor((keeps - before) / 30) + 1)
}

export function sproutText(m: number): string {
  return m < S.CELLAR_MONTHS.length ? `${S.CELLAR_MONTHS[m]} 초에 싹이 나기 시작합니다` : '5월에 저장고를 비우기 전에는 싹이 나지 않습니다'
}

// For a crop dug at the usual time, around September 25.
export function keepsUntil(year: number, id: S.VarietyId, vent: boolean): string {
  const m = sproutMonth(year, S.dayIndex(year, 8, 25), id, vent)
  return m < S.CELLAR_MONTHS.length ? `${S.CELLAR_MONTHS[m - 1]}` : '5월 또는 이후'
}

// How heavy a crop the variety can make: its daily growth times the length of its bulking season.
export function yieldWord(v: S.Variety): string {
  const k = v.bulk * (v.matPd - v.tiPd)
  return k < 430 ? '적음' : k < 520 ? '보통' : k < 620 ? '많음' : '9월이 온화하면 최고'
}

// How many tubers a hill sets, and so how they size: '' when it is nothing out of the ordinary.
export function setWord(v: S.Variety): string {
  return v.set <= 6 ? '괴경이 적어 크게 자람' : v.set >= 9 ? '괴경이 많아 작게 자람' : ''
}

// Each trait in full for a line of prose, or short for a table whose column says what it is about.
export function blightWord(v: S.Variety, short = false): string {
  return (short ? ['저항', '약간 저항', '취약', '매우 취약'] : ['잎 역병에 저항', '잎 역병에 다소 저항', '잎이 역병에 취약', '잎이 역병에 매우 취약'])[blightMark(v)]
}

// 0 resists .. 3 very prone.
export function blightMark(v: S.Variety): number {
  return v.blightLeaf < 0.6 ? 0 : v.blightLeaf < 0.95 ? 1 : v.blightLeaf < 1.2 ? 2 : 3
}

export function scabWord(v: S.Variety, short = false): string {
  const k = v.scab < 0.7 ? 0 : v.scab < 1.1 ? 1 : v.scab < 1.8 ? 2 : 3
  return (short ? ['저항', '보통', '취약', '매우 취약'] : ['더부룩병에 저항', '더부룩병 저항 보통', '더부룩병 취약', '더부룩병 매우 취약'])[k]
}

export function droughtWord(v: S.Variety, short = false): string {
  const k = v.drought >= 0.55 ? 0 : v.drought >= 0.35 ? 1 : 2
  return (short ? ['잘 견딤', '보통', '피해'] : ['가뭄을 잘 견딤', '가뭄에 보통', '가뭄에 피해'])[k]
}

export function seedWord(v: S.Variety, short = false): string {
  const k = v.virus <= 0.5 ? 0 : v.virus >= 0.9 ? 2 : 1
  return (short ? ['잘 버팀', '바이러스 약간 감염', '바이러스 빨리 감염'] : ['저장 종자로 잘 버팀', '저장 종자로 쓰면 바이러스를 약간 얻음', '저장 종자로 쓰면 바이러스가 빨리 퍼짐'])[k]
}

export function varietyName(id: string): string {
  const v = S.VARIETIES.find(x => x.id === id)
  return v ? v.name : F.upper(id)
}

export function soilWord(soil: number): string {
  return soil >= 0.85 ? '쉰 땅' : soil >= 0.4 ? '지친 땅' : '소모된 땅'
}

export const POSITION_NOTE = [
  '골짜기 땅은 물을 머금고 늦게 덥혀집니다. 서리가 모이고 축축해서 역병이 좋아합니다.',
  '중턱이라 물과 서리가 대략 보통입니다.',
  '마루 땅은 물이 빨리 빠지고 일찍 덥혀지지만 잘 마릅니다.',
]

// The year's price level as far as the market has shown it, in plain words.
export function moodText(world: S.World, c: S.Campaign): string {
  const s = c.season
  if (c.phase === 'season' && s && s.day < S.dayIndex(c.year, 7, 1)) {
    return '시장이 어떻게 갈지 말하기엔 아직 이릅니다. 8월이 되어야 올해 감자가 부족한지 풍부한지 보이기 시작하고, 가격은 11월까지 계속 움직일 수 있습니다.'
  }
  const d = S.levelNow(world, c) - 1
  const how = Math.abs(d) < 0.015 ? '보통 해와 비슷하게' : `보통 해보다 약 ${F.pct(Math.abs(d))} ${d > 0 ? '높게' : '낮게'}`
  const open = c.phase === 'season' && s && s.day < S.dayIndex(c.year, 10, 1)
  return `지금까지 가격은 ${how} 움직이고 있습니다${open ? '. 나머지 수확이 들어오는 11월까지 아직 움직일 수 있습니다' : ''}.`
}

// Where prices usually go from today, during the season.
export function outlookText(c: S.Campaign): string {
  const s = c.season
  const low = Math.min(...S.SEASON_CURVE.map(p => p[1]))
  const nov = S.MONTH_CURVE[0], apr = S.MONTH_CURVE[5]
  const base = `가격은 보통 9~10월에 가장 낮습니다. 11월은 그보다 약 ${F.pct(nov / low - 1)} 높고 4월은 약 ${F.pct(apr / low - 1)} 높습니다.`
  if (c.phase !== 'season' || !s) return base
  const now = usualFactor(s.day)
  return `${base} 오늘 가격과 비교하면 11월은 ${F.versus(nov / now)}, 4월은 ${F.versus(apr / now)}입니다.`
}

// What keeping a lot would really bring, in a phrase, from the storage outlook: the best month ahead at the usual
// prices, after the cellar's charge, shrink and sprouting, against what selling pays today.
export function storePhrase(o: { now: number; best: S.StoreMonth | null }): string {
  const b = o.best
  if (!b) return '저장할 만한 달이 남지 않았습니다'
  const d = b.net - o.now
  if (d < 0.5) return `보관비와 감모를 빼면 오늘보다 더 주는 달이 없고, 가장 나은 것은 ${b.name}의 약 ${F.money(b.net)}입니다`
  return `${b.name}까지 저장하면 보관비와 감모를 빼고 약 ${F.money(b.net)}을(를) 받아 오늘보다 ${F.money(d)} 많습니다${b.sprouted ? '. 다만 싹이 난 뒤입니다' : ''}`
}

export function storageText(c: S.Campaign, cwt: number): string {
  const shrink = c.upgrades.vent ? S.SHRINK_VENT : S.SHRINK
  return `보관비는 수확일부터 ${F.storeRate(S.STORE_COST)}이며 이 작물은 한 달에 약 ${F.money(cwt * S.STORE_COST)}입니다. 더미도 한 달에 약 ${F.num(shrink * 100, 1)}%씩${c.upgrades.vent ? ' 환기 장치로' : ''} 줄고, 싹이 나면 더 빨라집니다.`
}

export function contractText(v: S.Variety): string {
  return `${v.name}은(는) 칩용 감자입니다. 계약이 없으면 가공가만 받아 평소 가격보다 ${offContract()} 낮고, 겨울 내내 거의 움직이지 않아 저장하면 보관비와 감모만 듭니다. 칩 공장 계약으로 납품하면 계약가를 받습니다.`
}

// How far under its usual price the chipping variety sells with no contract.
export function offContract(): string {
  return `${F.pct(1 - S.PROCESSING_PRICE)}`
}

// ---------------------------------------------------------------- crews

export const KIND_GLYPH: Record<S.UnitKind, string> = { farmer: 'farmer', hand: 'hand', operator: 'tractor' }
export const KIND_NAME: Record<S.UnitKind, string> = { farmer: '농장주', hand: '밭 일꾼', operator: '트랙터 기사' }

// What a kind of crew can be given, in words.
export function kindDoes(kind: S.UnitKind): string {
  if (kind === 'farmer') return '모든 일을 합니다.'
  return `${F.list(S.UNIT_JOBS[kind].map(j => JOB_NOUN[j]))}을(를) 합니다.`
}

const JOB_NOUN: Record<S.JobKind, string> = {
  plant: '파종', hill: '북주기', scout: '살펴보기', spray: '살포', water: '물주기', rogue: '병든 포기 뽑기', sample: '시험 캐기', kill: '줄기 죽이기', dig: '캐기',
  fell: '벌목', rocks: '돌 줍기', brush: '덤불 자르기', build: '건축', haul: '운반',
}

export function initial(name: string): string {
  return name.slice(0, 1).toUpperCase()
}

// ---------------------------------------------------------------- people

// What letting someone go means, on every card that asks.
export const LET_GO_TEXT = '오늘 떠나며 돌아오지 않습니다. 이미 낸 이번 달 품값은 돌려받지 못합니다.'

export const SKILL_NAME: Record<S.Skill, string> = { machine: '기계', field: '밭일', woods: '임업', build: '건축', pack: '포장' }
export const SKILL_GLYPH: Record<S.Skill, string> = { machine: 'tractor', field: 'scout', woods: 'fell', build: 'build', pack: 'packing' }

// The orders each kind of work covers, from the simulation's own table.
export function skillCovers(skill: S.Skill): string {
  const jobs = (Object.keys(S.JOB_SKILL) as S.JobKind[]).filter(k => S.JOB_SKILL[k] === skill)
  return jobs.length ? F.list(jobs.map(j => JOB_NOUN[j])) : '겨울 동안 포장 창고에서 저장 작물 포장'
}

// A priority as a cell shows it: 1 first .. 4, and a dash for never.
export function prioMark(level: number): string {
  return level <= 0 ? '–' : String(level)
}

export function prioWord(level: number): string {
  return level <= 0 ? '안 함' : level === 1 ? '가장 먼저' : `${level}순위`
}

// The next priority a click gives: 1, 2, 3, 4, never, and round again.
export function prioNext(level: number, back = false): number {
  const order = [1, 2, 3, 4, 0]
  const k = order.indexOf(level)
  return order[(k + (back ? order.length - 1 : 1)) % order.length]
}

export function firstName(name: string): string {
  return name === S.FARMER_NAME ? '당신' : name.split(' ')[0]
}

// Why a person's mood is where it is: the pulls on it the grower can see, the strongest first.
export function moodWhy(c: S.Campaign, p: S.PersonInfo): { up: boolean; text: string }[] {
  const out: { up: boolean; text: string; size: number }[] = []
  if (p.kind !== 'farmer') {
    if (p.bed) out.push({ up: true, text: '숙소의 침대', size: S.MOOD_BED })
    if (p.ask > 0 && p.wage !== p.ask) {
      const d = (p.wage - p.ask) / p.ask
      out.push({ up: d > 0, text: `요구보다 ${F.pct(Math.abs(d))} ${d > 0 ? '많이' : '적게'} 받음`, size: Math.abs(d) * S.MOOD_PAY })
    }
  }
  if (p.tired > S.MOOD_TIRED_FROM) out.push({ up: false, text: '일에 지쳐 감', size: S.MOOD_TIRED * (p.tired - S.MOOD_TIRED_FROM) })
  const s = c.season
  const fieldsIn = s && c.phase === 'season' ? s.fields.filter(f => f.status === 'dug').length : 0
  if (fieldsIn > 0) out.push({ up: true, text: `밭 ${fieldsIn}개 수확 완료`, size: S.MOOD_PER_FIELD * fieldsIn })
  const cheer = c.crew.filter(u => u.id !== p.id && u.trait === 'cheerful').length
  if (cheer > 0) out.push({ up: true, text: '명랑한 동료', size: S.CHEERFUL_OTHERS * cheer })
  return out.filter(x => x.size >= 0.01).sort((a, b) => b.size - a.size).slice(0, 3).map(({ up, text }) => ({ up, text }))
}

// Where a person's mood is heading: the target it moves toward a little each day, against where it stands.
export function moodHeading(c: S.Campaign, p: S.PersonInfo): 'rising' | 'falling' | '' {
  const u = c.crew.find(x => x.id === p.id)
  if (!u) return ''
  const fieldsIn = c.season && c.phase === 'season' ? c.season.fields.filter(f => f.status === 'dug').length : 0
  const t = S.moodTarget(c, u, fieldsIn)
  return t > p.mood + 0.03 ? 'rising' : t < p.mood - 0.03 ? 'falling' : ''
}

// What tiredness is doing to a person, and what brings it down, in whole sentences.
export function tiredWhy(c: S.Campaign, p: S.PersonInfo): string {
  const slow = p.tired > S.TIRED_SLOW_FROM ? S.TIRED_SLOW * (p.tired - S.TIRED_SLOW_FROM) / (1 - S.TIRED_SLOW_FROM) : 0
  const rest = c.sundaysOff ? '일요일 휴식이 도움됩니다.' : '일요일에도 일하면 쉬는 날이 없습니다.'
  const are = p.kind === 'farmer' ? '당신은' : '그 사람은'
  if (p.tired >= S.HURT_TIRED) return `${are} ${F.pct(slow)} 느려지고 기계나 숲에서 다칠 수 있습니다. ${rest}`
  if (slow > 0.005) return `${are} ${F.pct(slow)} 느려집니다. ${rest}`
  return p.tired >= 0.3 ? `일주일의 일이 쌓입니다. ${rest}` : ''
}

// The quiet sign on a person's chip, the most pressing first: hurt, about to quit, worn out, unhappy, tired, idle.
export type Sign = { glyph: string; cls: 'bad' | 'warn'; text: string } | null

export function personSign(p: S.PersonInfo, idle: boolean): Sign {
  if (p.hurtUntil >= 0) return { glyph: 'hurt', cls: 'bad', text: '부상' }
  if (p.quitIn >= 0) return { glyph: 'unhappy', cls: 'bad', text: `${p.quitIn}일 후 그만둠` }
  if (p.tired >= S.HURT_TIRED) return { glyph: 'tired', cls: 'bad', text: '탈진' }
  if (p.mood < 0.45) return { glyph: 'unhappy', cls: 'warn', text: p.moodWord }
  if (p.tired >= S.TIRED_SLOW_FROM) return { glyph: 'tired', cls: 'warn', text: '피로' }
  if (idle) return { glyph: 'stale', cls: 'warn', text: '일이 기다리는데 놀고 있음' }
  return null
}

// ---------------------------------------------------------------- buildings and land

export const BUILD_GLYPH: Record<S.BuildingKind, string> = {
  house: 'house', shed: 'shed', bunk: 'bunk', packing: 'packing', pond: 'pond', stand: 'stand', station: 'station', road: 'road',
}

// The steps a tract goes through, as its card's track shows them.
export const CLEAR_STEPS: { stage: S.ClearStage; word: string; glyph: string }[] = [
  { stage: 'fell', word: '그대로', glyph: 'woods' },
  { stage: 'stump', word: '벌목됨', glyph: 'stump' },
  { stage: 'rocks', word: '그루터기 뽑음', glyph: 'rocks' },
  { stage: 'done', word: '밭', glyph: 'idle' },
]

// What stones cost a field, in a few words: slower planting and digging, and bruising at the dig.
export function stonesText(stones: number): string {
  const slow = 1 - S.stoneSpeed(stones)
  const bruise = S.stoneBruise(stones, null)
  const parts = [slow > 0.005 ? `파종·캐기 ${F.pct(slow)} 느려짐` : slow < -0.005 ? `파종·캐기 ${F.pct(-slow)} 빨라짐` : '', bruise > 0.002 ? `수확 시 약 ${F.pct(bruise)} 멍듦` : '']
  return parts.filter(Boolean).join(', ')
}

export function stonesWord(stones: number): string {
  return stones >= 0.6 ? '돌이 매우 많음' : stones >= 0.4 ? '돌이 많음' : stones >= 0.2 ? '돌이 조금' : '깨끗함'
}

// What saved seed carries, for the stock in hand.
export function savedSeedText(stock: S.SeedStock[]): string {
  const fields = stock.reduce((a, x) => a + x.fields, 0)
  const virus = fields > 0 ? stock.reduce((a, x) => a + x.virus * x.fields, 0) / fields : 0
  const blight = stock.some(x => x.blight > 0.01)
  return `저장 종자는 공짜지만 저장할 때마다 해마다 바이러스가 늘어납니다. 이 종자에서는 약 ${F.pct(virus)}의 포기가 위축되어 올라오고(인증 종자는 약 ${F.pct(S.VIRUS_CERTIFIED)}), 위축된 포기는 약 ${F.pct(1 - S.VIRUS_VIGOR)} 적게 수확됩니다.${blight ? ' 역병도 이 감자와 함께 저장고에 들어갔고, 일부가 밭에서 되돌아올 것입니다.' : ''}`
}

// How a season is counted on the way to keeping the farm: "Year 2 of 5".
export function seasonCount(c: S.Campaign): string {
  return c.yearIdx < c.goalYears ? `${c.goalYears}년 중 ${c.yearIdx + 1}년 차` : `${c.yearIdx + 1}년 차`
}

// Every farm counts its years from its first spring, whatever year its weather was made for.
let firstYear = S.FARM_YEAR0 + 1
export function countYearsFrom(c: S.Campaign): void {
  firstYear = c.startYear
}

// A year as a heading names it: "Year 2".
export function yearName(year: number): string {
  return `${yearShort(year)}년 차`
}

// The same in a sentence: "year 2".
export function yearWord(year: number): string {
  return `${yearShort(year)}년 차`
}

// The same where there is room only for a figure: a column of years, the axis of a chart.
export function yearShort(year: number): string {
  return String(year - firstYear + 1)
}

// "Years 1 to 5", or "Year 3" when they are the same.
export function yearSpan(a: number, b: number): string {
  if (a === b) return yearName(a)
  return `${yearShort(a)}~${yearShort(b)}년 차`
}

// Why blight got into a field the crew keeps sprayed, said with the find, from how the leaf stood: nothing where the
// spraying is the player's own, who knows when they sprayed.
export function blightWhy(c: S.Campaign, field: number): string {
  const s0 = c.season
  if (!s0 || S.sprayWayNow(c) !== 'auto') return ''
  const f = s0.fields[field]
  if (!f || f.lastSpray < 0) return '첫 살포 전에 들어옴'
  const days = s0.day - f.lastSpray
  if (S.fieldInfo(c, field).protect < 0.35) return days <= 4 ? '비에 약이 씻겼음' : `${days}일 전 살포, 약효가 사라짐`
  return '살포는 역병을 늦출 뿐 다 막지 못함'
}
