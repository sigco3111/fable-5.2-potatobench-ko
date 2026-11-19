// What a person is doing now, said once: the time book's word under their face, their card's line and the name the
// pointer shows all print from this. It reads the farm as it stands between days: the order they hold, or the one
// they worked on the last day and have not finished, where they are, what holds them up, and, with nothing ahead of
// them, the work they finished that day.
import * as S from '../sim/index.ts'
import { JOB_DOING, jobText } from './rules.ts'

export interface Now {
  glyph: string
  word: string          // one word, for the time book: "Spraying", "Heading", "Waiting", "Idle"
  rest: string          // the rest of the line after the word: "Brook Field", "to Brook Field to spray"
  line: string          // the whole line: word and rest
  place: number         // where it happens: a field, or a yard
  progress: number      // how far through the order, 0..1
}

// What holds the work up, by the word the season gives, after "Waiting for".
const WAIT_FOR: Partial<Record<string, string>> = {
  raining: '비가 그치기를', 'ground too wet': '땅이 마르기를', 'heavy rain': '비가 약해지기를', 'too windy': '바람이 잦아들기를',
  'the soil is too cold': '흙이 덥혀지기를', 'waiting for the digger': '캐는 기계가 작물을 더 들어올리기를',
}

// The work, after "Heading to Brook Field to".
const TO_DO: Record<S.JobKind, string> = {
  plant: '심으러', hill: '북을 올리러', scout: '이랑을 살피러', spray: '살포하러', water: '물을 주러', rogue: '병든 포기를 뽑으러', sample: '시험 캐기를 하러',
  kill: '줄기를 죽이러', dig: '캐러', fell: '나무를 베러', rocks: '돌을 주우러', brush: '덤불을 자르러', build: '지으러', haul: '작물을 들이러',
}

// Work finished on the last day worked, by someone with nothing ahead of them: said as done, never as idle. The land
// shows that day's work while the next one waits, so "Idle" under someone seen spraying would be two tellings.
const DID: Record<S.JobKind, [string, (name: string) => string]> = {
  plant: ['심음', n => n], hill: ['북을 올림', n => n], scout: ['살펴봄', n => `${n}의 이랑`], spray: ['살포함', n => n], water: ['물을 줌', n => n],
  rogue: ['뽑음', n => `${n}의 병든 포기`], sample: ['캐냄', n => `${n}의 시험 포기`], kill: ['죽임', n => `${n}의 줄기`], dig: ['캐냄', n => n],
  fell: ['벌어냄', n => `${n}의 나무`], rocks: ['주움', n => `${n}의 돌`], brush: ['잘라냄', n => `${n} 주변의 덤불`], build: ['지음', n => `${n}에서`],
  haul: ['들였음', n => `${n}의 작물`],
}

function said(glyph: string, word: string, rest: string, place: number, progress = 0): Now {
  return { glyph, word, rest, line: rest ? `${rest} ${word}` : word, place, progress }
}

export function personNow(c: S.Campaign, id: number, waits: Record<number, string>): Now {
  const u = c.crew.find(x => x.id === id)
  const s = c.season
  const at = u?.at ?? S.HOME_YARD
  if (!u || !s || c.phase !== 'season') return said('stale', '한가함', '', at)
  if (u.foreman) return said('foreman', '작업반장', `${S.BLOCK_NAME[u.foreman]} 담당`, at)
  if (S.hurt(u, s.day)) return said('hurt', '부상', `${S.formatDay(s.year, u.out, true)}까지 누워 있음`, at)
  if (s.frozen) return said('frost', '동결', '땅이 얼어 끝남', at)
  if (!S.workday(c, s)) return said('sunday', '일요일', '휴식', at)
  if (S.resting(u)) return said('tired', '휴식', '오늘, 지쳐서', at)
  // (tired enough to leave the felling for a day: not idle, and not to be given more work)
  if (S.sparingToday(c, u)) return said('tired', '휴식', '오늘, 작물을 위해 체력 비축', at)
  const others = (j: S.Job) => c.crew.some(o => o !== u && o.job === j.id)
  // The order they hold, or the one they worked on the last day and have not finished.
  const held = u.job >= 0 ? s.jobs.find(j => j.id === u.job) : undefined
  const last = s.worked.filter(w => w.unit === id).at(-1)
  // (an order they let go that is held up today is waited for below, not gone on with)
  const went = last ? s.jobs.find(j => j.kind === last.kind && j.field === last.field && (j.unit < 0 || j.unit === id) && !others(j) && !waits[j.id]) : undefined
  const going = held ?? went
  if (going) {
    const progress = going.need > 0 ? going.done / going.need : 0
    if (u.road <= 0 && u.at === going.field) {
      return said(going.kind, JOB_DOING[going.kind], S.placeName(going.field), going.field, progress)
    }
    return said('go', '이동 중', `${S.ro(S.placeName(going.field))} ${TO_DO[going.kind]}`, going.field, progress)
  }
  // Lending a hand with an order someone else holds.
  const helped = u.help !== undefined ? s.jobs.find(j => j.id === u.help) : undefined
  if (helped) {
    const progress = helped.need > 0 ? helped.done / helped.need : 0
    if (u.road <= 0 && u.at === helped.field) return said(helped.kind, '거드는 중', `${S.placeName(helped.field)}에서 ${TO_DO[helped.kind]}`, helped.field, progress)
    return said('go', '이동 중', `${S.ro(S.placeName(helped.field))} 거들러`, helped.field, progress)
  }
  if (u.road > 0) return said('go', '이동 중', `${S.ro(S.placeName(u.to))} 가는 중`, u.to)
  // Work they could take: held up, or theirs to start on the next working morning.
  const could = s.jobs.filter(j => (j.unit < 0 || j.unit === id) && S.willDo(u, j.kind) && !others(j))
  // Machine work waits for a machine while everyone else's hold all the farm has running (season.ts books their hours).
  const tractors = S.tractorsRunning(c, s.day)
  const free = (j: S.Job) => S.jobSkill(j.kind) !== 'machine' || c.crew.filter(o => o !== u && o.rig === 'tractor').length < tractors ||
    (j.kind === 'haul' && c.upgrades.truck && !c.crew.some(o => o !== u && o.rig === 'truck'))
  const next = could.find(j => !waits[j.id] && free(j))
  if (next) return said(next.kind, '다음', jobText(next, c, next.building), next.field)
  if (could.some(j => !waits[j.id])) return said('stale', '기다림', tractors > 1 ? '트랙터' : '그 트랙터', at)
  // (for what holds the work up itself: hauling that waits for the digger waits for what the digger waits for)
  const stuck = could.find(j => waits[j.id] !== 'waiting for the digger') ?? could[0]
  if (stuck) return said('stale', '기다림', `${WAIT_FOR[waits[stuck.id]] ?? waits[stuck.id]}`, at)
  // Nothing ahead of them, and they worked the last day through: what they did.
  if (last) { const [word, rest] = DID[last.kind]; return said(last.kind, word, rest(S.placeName(last.field)), last.field, 1) }
  const where = at === S.HOME_YARD ? '' : `${S.placeName(at)}에서 `
  // "Idle" is for someone standing while work is on the list; with the list empty they are simply free.
  return said('stale', s.jobs.length ? '놀고 있음' : '한가함', `${where}${s.jobs.length ? `${u.kind === 'farmer' ? '당신' : '그 사람'}에게 줄 일이 작업 목록에 없음` : '작업 목록이 비어 있음'}`, at)
}
