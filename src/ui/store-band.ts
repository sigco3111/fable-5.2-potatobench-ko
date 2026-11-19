// Keeping a crop against selling it now, said with how sure it is. The cellar outlook (S.storeOutlook) follows the
// usual price curve; a winter's prices wander from it, so a gain inside that wander is no gain to count on.
import type * as S from '../sim/index.ts'
import * as F from './fmt.ts'

// How far what a kept lot comes to can stray from the outlook, as a share, for a month this many ahead: about 7% a
// month out, growing with the square root of the months (tests/store-band.test.ts holds it to nine months in ten).
export function priceBand(ahead: number): number {
  return Math.min(0.2, 0.068 * Math.sqrt(Math.max(1, ahead)))
}

// Whether keeping a lot is the way that brings most: only when the best month ahead beats selling today by more than
// prices wander. The line says the month, the usual figure, how far off it can be, and so whether to count on it.
// The one rule for the weigh ticket: store only when the best month's usual figure beats selling today by more than
// prices can swing by then. The tab goes on the way the rule favours, and its words say why: "Pays most" when that
// way brings the most even with the swing, "Surer" when storing brings more only on average. The store line never
// says it brings more than the way the tab is on. short: the same call in one sentence, for the ticket's coupon.
export function storeCall(o: { now: number; months: S.StoreMonth[]; best: S.StoreMonth | null }): { store: boolean; tab: string; phrase: string; short: string } {
  const b = o.best
  if (!b) return { store: false, tab: '가장 이득', phrase: '저장할 달이 남지 않았습니다', short: '저장할 달이 남지 않았습니다.' }
  const spread = Math.round((b.net * priceBand(o.months.indexOf(b) + 1)) / 10) * 10
  const d = b.net - o.now
  if (d < 0.5) {
    return {
      store: false, tab: '가장 이득',
      phrase: `보관비와 감모를 빼면 보통 오늘보다 더 주는 달이 없습니다(가장 나은 것은 ${b.name}, 약 ${F.money(b.net)})`,
      short: '보관비가 가격 상승보다 보통 더 듭니다.',
    }
  }
  if (d > spread) {
    return {
      store: true, tab: '가장 이득',
      phrase: `${b.name}까지 저장하면 보관비와 감모를 빼고 보통 약 ${F.money(b.net)}을(를) 받아 오늘 파는 것보다 ${F.money(d)} 많고${b.sprouted ? '(싹이 난 뒤에도)' : ''}, 그때까지 가격이 ${F.money(spread)} 이상 흔들리는 일은 드뭅니다`,
      short: `${b.name}까지면 보관비를 빼고도 보통 오늘보다 ${F.money(d)} 더 받습니다.`,
    }
  }
  return {
    store: false, tab: '더 확실',
    phrase: `${b.name}까지 저장하면 보관비와 감모를 빼고 보통 약 ${F.money(b.net)}을(를) 받지만, 그때까지 가격이 ${F.money(spread)} 어느 쪽으로든 흔들릴 수 있어 오늘 파는 것보다 적을 수도 있습니다`,
    short: `${b.name}까지면 오늘보다 적을 수도 많을 수도 있습니다.`,
  }
}
