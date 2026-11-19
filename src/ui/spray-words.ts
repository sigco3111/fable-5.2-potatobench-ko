// What keeping the fields sprayed by itself comes to, said against what a careful grower makes: the neighbour's
// passes in a usual season, field by field, so "about 36 passes" is read as nine on each of four fields.
import * as S from '../sim/index.ts'
import * as F from './fmt.ts'

// The neighbour's spray passes in a usual season, over every year on record.
export function neighbourSprays(world: S.World): number {
  const years = Object.values(world.neighbor ?? {}).filter(y => typeof y.sprays === 'number')
  return years.length ? years.reduce((a, y) => a + y.sprays, 0) / years.length : 0
}

export function keepSprayedLine(world: S.World, c: S.Campaign): string {
  const o = S.sprayOutlook(world, c)
  if (!o.passes || !o.fields) return '일꾼들이 약효가 떨어질 때마다 살포합니다.'
  const each = Math.round(o.passes / o.fields)
  const usual = Math.round(neighbourSprays(world))
  const more = usual > 0 && each > usual * 1.25
  return `일꾼들이 약효가 떨어질 때마다 밭마다 살포합니다. 밭 ${o.fields}개에 각각 약 ${each}회, 이번 시즌 ${F.money(o.dollars)}입니다.${usual ? ` 이웃은 밭마다 시즌에 약 ${usual}회 뿌립니다${more ? '. 매번 묻도록 고르면 역병 날씨에만 뿌릴 수 있습니다' : ''}.` : ''}`
}
