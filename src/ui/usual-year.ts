// What a year usually does to the balance on a farm worked as the guide works it: the middle half of farms, from
// playing the coach's advice through each year (tests/usual-year.test.ts measures it again). Said before the first
// Start so a year that ends down is not a surprise, and at each year end against the year just closed.
import * as F from './fmt.ts'

export const USUAL_YEAR = { lo: -24000, mid: -14000, hi: -4000 }

const range = () => `${F.money(-USUAL_YEAR.hi)} to ${F.money(-USUAL_YEAR.lo)}`

// Short, for the order blank; the whole of it for the hover.
export function usualFirstYear(bills: number): { short: string; full: string } {
  return {
    // The truth without the fright: what a usual first year looks like, and that the loan carries it. Nine words,
    // as the line it replaces had: the first spring sheet is held under 115 (e2e/play.spec.ts).
    short: `대출이 보통의 첫해 적자를 댑니다: ${range()}.`,
    full: `튜토리얼대로 하는 첫해는 보통 시작보다 ${range()} 아래로 끝납니다. 작물은 기르는 비용을 대지만, 수확과 무관하게 은행 상환금과 가족 생활비 ${F.money(bills)}이(가) 나갑니다.`,
  }
}

// change: the year's cash at its end less its cash at the start.
export function againstUsual(change: number): string {
  if (change > USUAL_YEAR.hi) return `보통보다 좋습니다. 대부분의 해는 ${range()} 아래로 끝납니다.`
  if (change < USUAL_YEAR.lo) return `보통보다 나쁩니다. 대부분의 해는 ${range()} 아래로 끝납니다.`
  return `보통의 해입니다. 대부분은 ${range()} 아래로 끝납니다.`
}
