// What would get a waiting job done, from the farm as it stands: for each person who could do it, what stops them and
// the press that clears it; a day off; no machine running; nobody on the farm for the work; and waiting. Each says what
// it costs, the most useful first. Built for any kind of job, not one.
import { hireBlock } from './crew.ts'
import * as P from './params.ts'
import { eunneun, hurt, jobSkill, resting, SKILL_LABEL, speed } from './people.ts'
import { FIELD_NAMES, JOB_LABEL, tractorsRunning, workday } from './season.ts'
import { formatDay } from './calendar.ts'
import { fieldInfo } from './view.ts'
import type { Campaign, Cmd, JobKind, Unit } from './types.ts'

export interface Remedy {
  id: string                       // what kind of remedy: 'push', 'let', 'free', 'sunday', 'hire', 'wait'
  unit: number                     // the person it is about, or -1
  label: string                    // the key: "Let Lucien drive"
  cost: string                     // what it costs, in a few words
  cmds: Cmd[]                      // what a press does (none for waiting)
}

const first = (u: Unit) => u.name.split(' ')[0]
const whoP = (u: Unit, pred: string) => (u.kind === 'farmer' ? `당신은 ${pred}` : `${eunneun(first(u))} ${pred}`)

// The work, after "Let Lucien".
const DOES: Record<string, string> = { machine: '운전', field: '밭일', woods: '임업 작업', build: '건축', pack: '포장' }

export function remedies(c: Campaign, kind: JobKind, field: number): Remedy[] {
  const s = c.season
  if (!s || c.phase !== 'season') return []
  const skill = jobSkill(kind)
  const job = s.jobs.find(j => j.kind === kind && j.field === field)
  const out: Remedy[] = []
  const order: Cmd[] = job ? [] : [{ t: 'job', kind, field }]
  const people = c.crew.filter(u => !u.foreman && !hurt(u, s.day))
  // Pinned to someone who can't: anyone may take it.
  if (job && job.unit >= 0) {
    const u = c.crew.find(x => x.id === job.unit)
    if (u && (u.foreman || hurt(u, s.day) || resting(u) || u.prio[skill] <= 0)) out.push({ id: 'free', unit: u.id, label: '아무나 하게 하기', cost: `${whoP(u, '오늘은 할 수 없음')}`, cmds: [{ t: 'assign', id: job.id, unit: -1 }] })
  }
  // No machine running: nobody can do it until the repair.
  if (skill === 'machine' && tractorsRunning(c, s.day) === 0 && !(kind === 'haul' && c.upgrades.truck)) {
    const back = Math.min(...c.broken.filter(b => b > s.day))
    out.push({ id: 'wait', unit: -1, label: '트랙터 기다리기', cost: `${formatDay(s.year, back, true)}에 돌아옴`, cmds: order })
    return out
  }
  const able = people.filter(u => u.prio[skill] > 0 && !resting(u))
  // Someone can, but not today: a Sunday off, or the machine.
  if (able.length) {
    if (!workday(c, s)) out.push({ id: 'sunday', unit: -1, label: '일요일에도 일하기', cost: '모두 주 7일 일하게 되어 더 빨리 지칩니다', cmds: [...order, { t: 'sundays', off: false }] })
    else if (skill === 'machine') out.push({ id: 'wait', unit: -1, label: '트랙터 기다리기', cost: `${whoP(able[0], '비는 대로 맡음')}`, cmds: order })
    out.push({ id: 'wait', unit: -1, label: '기다리기', cost: waitCost(c, kind, field), cmds: [] })
    return dedupe(out)
  }
  // Resting, worn out: pushing on today.
  for (const u of people) {
    if (!resting(u) || u.prio[skill] <= 0) continue
    out.push({ id: 'push', unit: u.id, label: u.kind === 'farmer' ? '오늘은 계속하기' : `${first(u)}에게 오늘 계속해 달라 하기`, cost: `${u.kind === 'farmer' ? '당신' : first(u)}: 더 지치고 내일은 느려집니다`, cmds: [...order, { t: 'rest', unit: u.id, mode: 'push' }] })
  }
  // Set never to do this work: letting them, at their own speed for it.
  for (const u of people) {
    if (u.prio[skill] > 0 || resting(u)) continue
    out.push({ id: 'let', unit: u.id, label: u.kind === 'farmer' ? `${SKILL_LABEL[skill]} 직접 하기` : `${first(u)}에게 ${DOES[skill]} 맡기기`, cost: `${u.kind === 'hand' ? '밭일 일꾼' : u.kind === 'operator' ? '트랙터 기사' : '당신'}, ${SKILL_LABEL[skill]} ${u.skills[skill]}/10: 약 ${Math.round(speed(u, skill) * 10) * 10}% 속도`, cmds: [...order, { t: 'priority', unit: u.id, work: skill, level: 2 }] })
  }
  // Nobody on the farm for this work: hiring someone who does it.
  const hireKind = skill === 'machine' ? 'operator' : 'hand'
  if (!c.crew.some(u => !u.foreman && u.prio[skill] > 0 && u.kind !== 'farmer') && !hireBlock(c, hireKind) && (skill === 'machine' || skill === 'field')) {
    out.push({ id: 'hire', unit: -1, label: hireKind === 'operator' ? '트랙터 기사 고용' : '밭일 일꾼 고용', cost: `월 $${(hireKind === 'operator' ? P.OPERATOR_WAGE : P.HAND_WAGE).toLocaleString('en-US')}`, cmds: [...order, { t: 'hire', kind: hireKind }] })
  }
  out.push({ id: 'wait', unit: -1, label: '기다리기', cost: waitCost(c, kind, field), cmds: [] })
  return dedupe(out)
}

// One wait at most: waiting for the tractor says more than waiting.
function dedupe(out: Remedy[]): Remedy[] {
  return out.filter((m, k) => m.id !== 'wait' || out.findIndex(x => x.id === 'wait') === k)
}

// Why nobody takes the work, person by person: "You're resting, worn out, and Lucien is set never to drive."
// dayOff: whether a day off holds the job up (a frost haul goes out Sunday or not).
export function heldUpBy(c: Campaign, kind: JobKind, dayOff = true): string {
  const s = c.season
  if (!s) return ''
  const skill = jobSkill(kind)
  const parts: string[] = []
  if (dayOff && !workday(c, s)) parts.push('일요일은 쉬는 날')
  if (skill === 'machine' && tractorsRunning(c, s.day) === 0) parts.push('트랙터가 고장 남')
  for (const u of c.crew) {
    if (u.foreman) parts.push(`${whoP(u, '작업반장임')}`)
    else if (hurt(u, s.day)) parts.push(`${whoP(u, `${formatDay(s.year, u.out, true)}까지 부상`)}`)
    else if (u.prio[skill] <= 0) parts.push(`${whoP(u, `${DOES[skill]} 안 하기로 설정됨`)}`)
    else if (resting(u)) parts.push(`${whoP(u, '지쳐서 쉬는 중')}`)
  }
  if (!parts.length) return ''
  return `${parts.join(', ')}.`
}

// What waiting costs: for a spray, the protection left; otherwise what the season holds against it.
function waitCost(c: Campaign, kind: JobKind, field: number): string {
  if (kind === 'spray' && field >= 0) return `${FIELD_NAMES[field]}의 잎은 현재 ${Math.round(fieldInfo(c, field).protect * 100)}% 보호됨`
  return `${JOB_LABEL[kind]}: 할 수 있는 사람이 생길 때까지 기다립니다`
}
