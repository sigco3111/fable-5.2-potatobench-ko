// Frost on the barrels, pressed: the haul goes first for whoever can drive, today, Sunday or not, and the answer says
// how much one tractor brings in by dark.
import { describe, expect, it } from 'vitest'
import * as S from '../src/sim/index.ts'
import { SUNDAY, weekday } from '../src/sim/calendar.ts'
import { loadWorld } from '../tools/balance/world.ts'

const world = loadWorld()

// The fixed farm, the farmer alone, left to its routine to the first Sunday off with crop out in barrels.
function sundayWithBarrels(): { c: S.Campaign; field: number } {
  const c = S.createCampaign(world, { seed: 7, startYear: 1990 })
  expect(S.apply(world, c, { t: 'begin' }).ok).toBe(true)
  for (let g = 0; g < 400 && c.phase === 'season' && !S.seasonDone(c); g++) {
    c.incidents = []
    const s = c.season!
    const field = s.fields.findIndex(f => f.inField >= 200 && !f.weighed)
    if (field >= 0 && weekday(s.year, s.day) === SUNDAY && s.frostHaul !== s.day) return { c, field }
    expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
  }
  throw new Error('no Sunday with barrels out')
}

describe('haul it in now', () => {
  it('on a Sunday off, puts the haul first and someone drives that day', () => {
    const { c, field } = sundayWithBarrels()
    const s = c.season!
    expect(S.workday(c, s)).toBe(false)
    const before = s.fields[field].inField
    const r = S.apply(world, c, { t: 'haulNow', field })
    expect(r.ok, r.err).toBe(true)
    expect(s.jobs[0]).toMatchObject({ kind: 'haul', field, unit: 0 })
    expect(S.workday(c, s)).toBe(true)
    expect(r.events[0].text).toMatch(/^당신은 지금 .+을\(를\) 운반 중입니다\. 쉬는 날이라 당신도 일하는 날만큼 지칩니다\. 트랙터 한 대가 어둑해질 때까지 약 [\d,]+ cwt를 들여옵니다\.( 약 [\d,]+ cwt는 밖에 남습니다\.| 전부 들어옵니다\.)$/)
    const by = S.haulByDark(c, field)!
    expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
    expect(s.worked.some(w => w.kind === 'haul' && w.field === field && w.unit === 0)).toBe(true)
    // What came in that day is what was said, give or take what the digger added and the rounding.
    const hauled = before - s.fields[field].inField
    expect(hauled).toBeGreaterThan(by.cwt * 0.8)
    expect(hauled).toBeLessThanOrEqual(by.cwt + 1)
  })

  it('says exactly why when nobody on the farm will drive', () => {
    const { c, field } = sundayWithBarrels()
    expect(S.apply(world, c, { t: 'priority', unit: 0, work: 'machine', level: 0 }).ok).toBe(true)
    const r = S.apply(world, c, { t: 'haulNow', field })
    expect(r.ok, r.err).toBe(true)
    expect(r.events[0].text).toBe(`당신은 운전 안 하기로 설정됨. 오늘 밤 ${S.FIELD_NAMES[field]}의 통은 밖에 남습니다. 기계 일 우선순위를 정해 운반하게 하세요.`)
    expect(S.workday(c, c.season!)).toBe(false)
  })

  it('says who is hurt or resting when that is why', () => {
    const { c, field } = sundayWithBarrels()
    const s = c.season!
    c.crew[0].out = s.day + 4
    const r = S.apply(world, c, { t: 'haulNow', field })
    expect(r.ok, r.err).toBe(true)
    expect(r.events[0].text).toMatch(new RegExp(`^당신은 .+까지 부상\\. 오늘 밤 ${S.FIELD_NAMES[field]}의 통은 밖에 남습니다\\.$`))
    c.crew[0].out = 0
    c.crew[0].rest = 'now'
    expect(S.apply(world, c, { t: 'haulNow', field }).events[0].text).toBe(`당신은 지쳐서 쉬는 중. 오늘 밤 ${S.FIELD_NAMES[field]}의 통은 밖에 남습니다.`)
  })

  it('with the only tractor out digging, the digger stops to haul and the answer says so', () => {
    const c = S.createCampaign(world, { seed: 7, startYear: 1990 })
    expect(S.apply(world, c, { t: 'begin' }).ok).toBe(true)
    let found: { field: number; dig: S.Job } | null = null
    for (let g = 0; g < 400 && !found && !S.seasonDone(c); g++) {
      c.incidents = []
      const s = c.season!
      const dig = s.jobs.find(j => j.id === c.crew[0].job && j.kind === 'dig')
      const field = s.fields.findIndex(f => f.inField >= 200 && !f.weighed)
      if (dig && field >= 0 && c.crew[0].rig === 'tractor') found = { field, dig }
      else expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
    }
    expect(found).not.toBeNull()
    const { field, dig } = found!
    const r = S.apply(world, c, { t: 'haulNow', field })
    expect(r.ok, r.err).toBe(true)
    const where = dig.field === field ? '거기서' : `${S.FIELD_NAMES[dig.field]}에서`
    expect(r.events[0].text).toMatch(new RegExp(`^당신은 지금 ${S.FIELD_NAMES[field]}을\\(를\\) 운반 중입니다\\. 당신은 그것 때문에 ${where} 캐기을\\(를\\) 멈춥니다\\.( 쉬는 날이라 당신도 일하는 날만큼 지칩니다\\.)? 트랙터 한 대가 어둑해질 때까지 약 [\\d,]+ cwt를 들여옵니다`))
    expect(c.season!.jobs[0]).toMatchObject({ kind: 'haul', field, unit: 0 })
    expect(S.apply(world, c, { t: 'day' }).ok).toBe(true)
    expect(c.season!.worked.some(w => w.kind === 'haul' && w.field === field && w.unit === 0)).toBe(true)
  })
})
