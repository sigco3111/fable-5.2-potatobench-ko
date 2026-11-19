// What a contract is shown to be getting, and why it looks like falling short, from the simulation's outlook.
import * as S from '../sim/index.ts'
import * as F from './fmt.ts'

// What a contract looks like getting by its due date: delivered, in hand, and the No. 1 its fields are expected to
// give at the harvest (sim/outlook.ts, contractOutlook). null when nothing more is coming to it.
export function giving(c: S.Campaign, id: S.VarietyId, cwt: number, delivered = 0): S.ContractOutlook | null {
  const g = S.contractOutlook(c, id, cwt, delivered)
  return g.hi > delivered + 0.5 ? g : null
}

// Why a contract looks like falling short, in one sentence, or '': only when even the top of what it looks like
// getting is under the promise, and never as a loss already made. A closed contract's penalty is said apart.
export function shortWhy(c: S.Campaign, k: S.ContractInfo): string {
  if (k.settled || k.needed <= 1e-6) return ''
  const g = S.contractOutlook(c, k.variety, k.cwt, k.delivered)
  if (!g.short) return ''
  const name = k.varietyName
  if (c.phase === 'plan') {
    return g.short === 'none' ? `계획에 아직 이 계약의 ${name}이(가) 없습니다. 시즌 전에 지도에서 밭을 정해주세요.`
      : `좋은 해에도 이 계약을 채우기에 ${name}의 면적이 너무 적습니다. 시즌 전에 밭을 하나 더 주세요.`
  }
  const least = F.money((k.cwt - g.hi) * k.price * S.CONTRACT_PENALTY)
  switch (g.short) {
    case 'none': return `올해 ${name}을(를) 심지 않아 약 ${least}의 위약금이 예상됩니다.`
    case 'acres': return `좋은 해에도 이 계약을 채우기에 ${name}의 면적이 너무 적어 최소 ${least}의 위약금이 예상됩니다.`
    case 'crop': return `예상을 크게 잡아도 ${name} 수확이 이 계약을 채우기에 너무 적어 최소 ${least}의 위약금이 예상됩니다.`
    default: return `${name} 수확이 약속보다 적어 약 ${least}의 위약금이 예상됩니다.`
  }
}
