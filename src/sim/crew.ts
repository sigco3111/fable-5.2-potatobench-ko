// The farm's crews: hiring, the work a hire is taken on for, and the time lost on the road between places.
import { distance } from './farm.ts'
import * as P from './params.ts'
import { hallHire, hiredCount, housingLimit, newFarmer as farmer } from './people.ts'
import type { Campaign, JobKind, Unit, UnitKind } from './types.ts'

export const UNIT_LABEL: Record<UnitKind, string> = { farmer: '농장주', hand: '밭일 일꾼', operator: '트랙터 기사' }

// The work a hire of this kind is taken on for. What a person actually does is set by their priorities.
export function canDo(kind: UnitKind, job: JobKind): boolean {
  return P.UNIT_JOBS[kind].includes(job)
}

// Share of a day a crew spends on the road from one place to another.
export function travelDays(from: number, to: number): number {
  return from === to ? 0 : distance(from, to) * P.TRAVEL_DAYS_PER_UNIT
}

export function newFarmer(): Unit {
  return farmer()
}

export function crewCount(c: Campaign, kind: UnitKind): number {
  let n = 0
  for (const u of c.crew) if (u.kind === kind) n++
  return n
}

// Why nobody more can be hired now, or '' when someone can.
export function hireRoom(c: Campaign): string {
  if (c.phase !== 'plan' && c.phase !== 'season') return '봄이나 시즌 중에 고용할 수 있습니다.'
  if (c.phase === 'season' && (!c.season || c.season.frozen)) return '시즌이 끝났습니다.'
  const limit = housingLimit(c)
  if (hiredCount(c) >= limit) {
    return limit <= P.HOUSED_OUT ? `외부에 살 수 있는 고용 인원은 ${P.HOUSED_OUT}명뿐이고, 그 이상은 숙소 침대가 필요합니다.` : `숙소 침대가 다 찼습니다. 이 농장은 고용 인원 ${limit}명까지만 수용합니다.`
  }
  return ''
}

// Why a unit of this kind cannot be hired now, or '' when it can.
export function hireBlock(c: Campaign, kind: UnitKind): string {
  if (kind === 'farmer') return '농장주는 한 명, 바로 당신뿐입니다.'
  if (kind !== 'hand' && kind !== 'operator') return '이 농장에는 그런 일이 없습니다.'
  return hireRoom(c)
}

export function newUnit(c: Campaign, kind: 'hand' | 'operator'): Unit {
  return hallHire(c, kind)
}

// The order crews take their turns when they have the same share of the day left: the hands, then the operator,
// then the farmer, who can do anything and so goes last; within a kind, in the order hired.
const TURN: Record<UnitKind, number> = { hand: 0, operator: 1, farmer: 2 }

export function turnBefore(a: Unit, b: Unit): boolean {
  return TURN[a.kind] !== TURN[b.kind] ? TURN[a.kind] < TURN[b.kind] : a.id < b.id
}
