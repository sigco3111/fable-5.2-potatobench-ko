// The spring plan's money in words: what the year end takes and what it is made of, a plan that leaves too little
// cash, and how a purchase is paid for.
import * as S from '../sim/index.ts'
import * as F from './fmt.ts'

// What is due at the year end, whatever the crop, as the figure and the sentence under it. The parts are each to the
// dollar and the figure is their sum: the yearly $19,000 for the bank and the family, then this spring's loan and the
// land mortgage.
export function dueSays(due: S.MoneyNow['due'], loan: number): { total: number; parts: number[]; text: string } {
  const bills = Math.round(due.note + due.household)
  const lent = Math.round(loan)
  const mortgage = Math.round(due.mortgage)
  const more = F.list([lent ? `이번 봄 대출 ${F.money(lent)}` : '', mortgage ? `땅 대출 ${F.money(mortgage)}` : ''].filter(Boolean))
  return {
    total: bills + lent + mortgage, parts: [bills, lent, mortgage],
    text: `매년 은행과 가족에게 내는 ${F.money(bills)}입니다${more ? `, 거기에 ${more}` : ''}. 남는 것은 당신의 것입니다.`,
  }
}

// When the plan leaves less cash than about a month of the season costs, one line that says so and names the largest
// thing that could be left out; '' otherwise. left: the cash the plan leaves.
export function lowCashSays(c: S.Campaign, left: number): string {
  const month = S.monthCost(c)
  if (left < 0 || left >= month) return ''
  const cut = S.planCut(c)
  return `한 달치 품값과 밭일 비용(약 ${F.money(Math.round(month / 100) * 100)})보다 적어 시즌이 대출로 시작됩니다.${cut ? ` ${cut.what}을(를) 하지 않으면 약 ${F.money(Math.round(cut.saves / 100) * 100)}을(를) 아낍니다.` : ''}`
}

// The key a cause's remedy is pressed by, a word each: the order that helps that field.
export const REMEDY: Partial<Record<S.JobKind, string>> = { water: '물주기', spray: '살포' }

// Why the year-end figure moved, as the board says it under the figure: "Brook Field dry: −$2,600"; with its remedy
// in words where the line is itself what is pressed (an alert on a phone): "Brook Field dry: −$2,600. Water it". A sale
// that left the figure where it was has no amount.
export function causeLine(why: S.MoneyCause, remedy = false): string {
  const fix = remedy && why.remedy && REMEDY[why.remedy] ? `. ${REMEDY[why.remedy]}하세요` : ''
  return Math.abs(why.amount) < 0.5 ? why.text : `${why.text}: ${signedMoney(why.amount)}${fix}`
}

// A figure to the $100 with its sign: "+$25,000", "−$11,800".
export function signedMoney(n: number): string {
  const r = Math.round(n / 100) * 100
  return `${r > 0 ? '+' : ''}${F.money(r)}`
}

// The board's sum to its figure: the opening cash to the dollar, as the ledger said it; the rest each to the $100,
// the largest taking the rounding, so it adds up to the figure.
export function sumLines(parts: S.MoneyPart[], figure: number): S.MoneyPart[] {
  const lines = parts.map(p => ({ ...p, amount: p.id === 'start' ? Math.round(p.amount) : Math.round(p.amount / 100) * 100, of: p.of?.map(q => ({ ...q, amount: Math.round(q.amount / 100) * 100 })).filter(q => q.amount !== 0) }))
  const big = lines.reduce((b, p, i) => p.id !== 'start' && (lines[b].id === 'start' || Math.abs(p.amount) > Math.abs(lines[b].amount)) ? i : b, 0)
  if (lines.length) lines[big].amount += figure - lines.reduce((a, p) => a + p.amount, 0)
  return lines
}

// Where the year-end figure is likely to end, as a person reads a range.
export function rangeSays(range: { lo: number; hi: number }): string {
  return `이런 해는 대부분 ${signedMoney(range.lo)}에서 ${signedMoney(range.hi)} 사이로 끝납니다.`
}

// The spring loan, said under the pointer on Borrowed, and once a season as a note the first time it grows.
export const BORROWED_SAYS = `은행의 봄 대출입니다. 작물이 팔릴 때까지 품값과 밭일 비용이 여기서 나가고, 연말까지 이자가 없으며 작물 판매로 갚습니다. 그때 남은 것은 ${F.pct(S.CREDIT_RATE)}의 이자가 붙습니다.`
export const LOAN_NOTE = '작물이 팔릴 때까지 은행이 비용을 대고, 작물이 은행에 갚습니다.'

// Whether the loan's note is due now: in the season, the first time this year that what is borrowed grows (not the
// spring loan's own start).
export function loanNoteNow(c: S.Campaign, cashWas: number, saidIn: number): boolean {
  return c.phase === 'season' && saidIn !== c.year && cashWas < 0 && Math.round(c.cash) < cashWas
}

// What a press would do to this year's year-end figure, for a key's second line: "year end −$12,000"; a hire's as
// what it takes to the year end: "about $3,300 to the year end".
export function effectSays(d: number | null, hire = false): string {
  if (d === null || Math.abs(d) < 50) return ''
  return hire && d < 0 ? `연말까지 약 ${F.money(-Math.round(d / 100) * 100)}` : `연말 ${signedMoney(d)}`
}

// The spring plan's year-end figure past the bank's limit: one line, and the change that would bring it back most.
export function limitSays(m: S.MoneyNow, rescue: { what: string; gains: number } | null): string {
  if (m.after >= S.CREDIT_LIMIT) return ''
  return `은행 한도인 ${F.money(S.CREDIT_LIMIT)}을(를) 넘어 대출 회수에 들어갑니다.${rescue ? ` ${rescue.what}을(를) 하면 약 ${F.money(Math.round(rescue.gains / 100) * 100)} 올라갑니다.` : ''}`
}

// The ledger's verdict, by the bank's own rule (campaign.ts, closeYear): in hand, or down but inside the limit.
export function verdictSays(y: S.YearSummary, left: number, kept: boolean): string {
  const more = left > 0 ? ` ${left}년 남았습니다.` : ''
  if (kept) return y.cashEnd >= 0 ? '농장은 당신의 것이고 은행도 만족합니다.' : `농장은 당신의 것입니다. ${F.money(-y.cashEnd)}의 빚으로 끝냈지만 은행이 허락하는 안쪽입니다.`
  if (y.cashEnd >= 0) return `${F.money(y.cashEnd)}을(를) 남기고 해를 마쳐 은행이 만족합니다.${more}`
  // "In debt", not "down": the lines beside it use "down" for cash against the year's start, which is another figure.
  return `${F.money(-y.cashEnd)}의 빚으로 끝냈지만 은행이 허락하는 안쪽이라 또 한 해를 봐줍니다.${more}`
}

// The ledger's first line: from what was sold to what was kept.
export function yearWalk(y: S.YearSummary): string {
  const bills = y.note + y.living + y.interest
  const gap = Math.round(y.cashEnd - y.cashStart)
  const kept = (y.land ?? 0) + (y.building ?? 0) + (y.works ?? 0)
  return `${F.money(y.revenue)}을(를) 팔고 농장에 ${F.money(y.costs)}, 은행과 가족에 ${F.money(bills)}을(를) 써 ${F.money(y.cashEnd)}(으)로 끝냈습니다. 시작할 때보다 ${gap === 0 ? '같습니다' : `${F.money(Math.abs(gap))} ${gap < 0 ? '적습니다' : '많습니다'}`}.${kept && gap < 0 ? ` 그중 ${F.money(kept)}은(는) 당신이 지키는 땅, 건물, 개간에 들어갔습니다.` : ''}`
}

// How a purchase is paid in spring: the cash first, the rest on the spring loan. '' when the cash covers it.
export function loanSays(cost: number, onLoan: number): string {
  if (onLoan < 0.5) return ''
  if (onLoan >= cost - 0.5) return `대출로 +${F.money(cost)}`
  return `현금에서 ${F.money(cost - onLoan)}, 대출로 +${F.money(onLoan)}`
}
