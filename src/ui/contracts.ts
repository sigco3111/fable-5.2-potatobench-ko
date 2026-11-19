// Contracts: the spring offers, the small tracker of what is signed, and delivering a crop against one.
import * as S from '../sim/index.ts'
import { giving, shortWhy } from './contract-words.ts'
import { patch, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { range } from './system/parts.ts'
import { offContract, yearWord } from './rules.ts'

const DUE_SHORT: Record<S.Due, string> = { harvest: '가을까지', winter: '3월까지' }

// What delivering this lot against each open contract for its variety would take, pay, and fetch on the market today.
export interface Deal { k: S.ContractInfo; take: number; pays: number; market: number }

export function deals(world: S.World, c: S.Campaign, lot: S.Lot): Deal[] {
  if (!lot.open || (c.phase !== 'season' && c.phase !== 'cellar')) return []
  if (c.phase === 'season' && c.season?.fields[lot.field]?.status === 'digging') return []
  const have = lot.grades.no1 + lot.grades.chef
  if (have <= 1e-6) return []
  return S.contractInfo(c).filter(k => !k.settled && k.needed > 1e-6 && k.variety === lot.variety).map(k => {
    const take = Math.min(have, k.needed)
    const share = take / have
    const market = share * (lot.grades.no1 * S.gradePrice(world, c, lot, 'no1') + lot.grades.chef * S.gradePrice(world, c, lot, 'chef'))
    return { k, take, pays: take * k.price, market }
  })
}

// "$2,100 more than selling it today", or less.
export function versusMarket(d: Deal): string {
  const gap = d.pays - d.market
  return Math.abs(gap) < 50 ? '오늘 시장가와 비슷함' : `오늘 시장가보다 ${F.money(Math.abs(gap))} ${gap > 0 ? '더' : '덜'}`
}

export function deliver(ctx: Ctx, lot: S.Lot, d: Deal): boolean {
  const r = ctx.run({ t: 'deliver', lot: lot.id, contract: d.k.id })
  if (r.ok) ctx.announce(F.localize(r.events[0]?.text ?? '납품했습니다.'))
  return r.ok
}

function inHand(c: S.Campaign, id: S.VarietyId): number {
  return S.openLots(c).filter(l => l.variety === id).reduce((a, l) => a + l.grades.no1 + l.grades.chef, 0)
}

function growing(c: S.Campaign, id: S.VarietyId): number {
  const s = c.season
  if (!s || c.phase !== 'season') return 0
  return s.fields.filter(f => f.variety === id && (f.status === 'planted' || f.status === 'growing' || f.status === 'dead' || f.status === 'digging')).length
}

// What the farm has toward a contract of this variety, in words.
function farmHas(c: S.Campaign, id: S.VarietyId): string {
  const name = S.variety(id).name
  if (c.phase === 'plan') {
    const g = S.contractOutlook(c, id, 0)
    return g.fields ? `계획에 ${name} 밭이 ${g.fields}곳 있어, 보통의 해에 No. 1 약 ${F.mass(Math.round(g.mean / 10) * 10)}을(를) 냅니다.`
      : `계획에 ${name}이(가) 없으니, 시즌이 시작되기 전에 지도에서 밭을 주세요.`
  }
  const have = inHand(c, id), out = growing(c, id)
  return `No. 1 ${name} ${F.mass(have)}을(를) 갖고 있습니다${out ? `, 아직 캘 밭 ${out}곳` : ''}.`
}

// What the bar on a contract shows, for its hover: the three marks it is drawn with.
export const BAR_SAYS = '빗금 띠는 밭이 낼 것으로 보이는 양, 최저에서 최고까지입니다. 세로 선은 약속한 양이고, 보라 표시는 지금까지 납품한 양입니다.'

// The bar explained under the pointer and to a screen reader, where it stands.
function barHover(el: HTMLElement): HTMLElement {
  el.title = BAR_SAYS
  return el
}

// A contract as a range: what is promised (the rule) against what the fields look like giving (the hatching), and
// what is delivered (the violet mark).
function contractRange(c: S.Campaign, id: S.VarietyId, cwt: number, delivered: number): { el: HTMLElement; said: string } {
  const g = giving(c, id, cwt, delivered)
  const max = Math.max(cwt, g?.hi ?? 0, delivered) * 1.15
  const said = g ? `밭이 No. 1을 ${F.mass(g.lo)}~${F.mass(g.hi)} 낼 것으로 보이고, ${F.mass(cwt)}을(를) 약속했습니다` : `심은 것이 없고, ${F.mass(cwt)}을(를) 약속했습니다`
  return { el: range({ lo: g?.lo ?? 0, hi: g?.hi ?? 0, max, mark: delivered > 0 ? delivered : undefined, promise: cwt, label: said }), said }
}

// The band's marks named on the band, under the first contract of a list.
function legend(): HTMLElement {
  return h('p', { class: 'band-legend', 'aria-hidden': 'true' }, h('i', { class: 'lg-band' }), '밭이 낼 것으로 보이는 양', h('i', { class: 'lg-line' }), '약속한 양')
}

function signedCard(c: S.Campaign, k: S.ContractInfo, first = false): HTMLElement {
  const r = contractRange(c, k.variety, k.cwt, k.delivered)
  const why = shortWhy(c, k)
  return h('article', { class: 'offer signed cat-offer', testid: `contract-${k.id}` },
    h('p', { class: 'lead' }, icon(k.needed <= 1e-6 ? 'check' : 'contract', 'i'), h('b', null, k.buyer), h('span', { class: 'it quiet' }, k.varietyName), h('span', { class: 'dots' }),
      h('span', { class: 'num' }, F.price(k.price))),
    barHover(r.el),
    first ? legend() : null,
    h('p', { class: 't-caption' }, `${F.mass(k.cwt)} 중 ${F.mass(k.delivered)} 납품, 기한 ${k.dueBy}. ${F.upper(r.said)}.`,
      k.settled || k.needed <= 1e-6 ? null : ' 기한이 되면 사자가 모자란 양을 감자 저장고에서 계약가로 가져가고, 그래도 모자란 만큼만 위약금을 냅니다.',
      k.settled && k.penalty > 0 ? h('span', { class: 'c-red' }, ` 위약금: ${F.money(-k.penalty)}.`) : why ? h('span', { class: 'c-ochre' }, ` ${why}`) : null))
}

function offerCard(ctx: Ctx, c: S.Campaign, o: S.OfferInfo, after: () => void, first = false): HTMLElement {
  const v = S.variety(o.variety)
  const vs = o.price / o.usual - 1
  const r = contractRange(c, o.variety, o.cwt, 0)
  return h('article', { class: 'offer cat-offer', testid: `offer-${o.id}` },
    h('p', { class: 'lead' }, icon('contract', 'i'), h('b', null, o.buyer), h('span', { class: 'it quiet' }, o.varietyName), h('span', { class: 'dots' }),
      h('span', { class: 'num' }, F.price(o.price))),
    barHover(r.el),
    first ? legend() : null,
    h('p', { class: 't-caption' }, `No. 1 ${F.mass(o.cwt)}, ${o.dueBy}까지, 전부 ${F.money(o.value)}에, `,
      h('span', { class: vs < -0.015 ? 'c-ochre' : null }, `${v.contract ? '가공 가격' : '보통의 해'}보다 ${F.versus(o.price / o.usual)}`), '. ', farmHas(c, o.variety)),
    v.contract ? h('p', { class: 't-caption c-ochre' }, `계약이 없으면 ${v.name}은(는) 평소 값의 ${offContract()}만 받습니다.`) : null,
    h('button', {
      class: 'btn', type: 'button', testid: `accept-${o.id}`,
      onclick: () => { if (ctx.run({ t: 'accept', offer: o.id }).ok) { ctx.announce(`${o.buyer}와 계약했습니다.`); after() } },
    }, '수락'))
}

// What is signed, and in spring what is offered. after: redraws whatever holds them.
function contractCards(ctx: Ctx, c: S.Campaign, after: () => void): Child {
  const offers = S.offerInfo(c)
  const signed = S.contractInfo(c)
  return [
    h('p', { class: 't-caption', testid: 'contracts-lead' }, `계약은 정한 날까지 납품한 No. 1 감자에 정해진 값을 치르고, 그때 모자란 양은 그 값의 ${F.pct(S.CONTRACT_PENALTY)}를 물어냅니다.`),
    signed.length ? [h('p', { class: 't-label cat-sub' }, '체결됨'), h('div', { class: 'offers' }, signed.map((k, n) => signedCard(c, k, n === 0)))] : null,
    c.phase === 'plan' ? [
      h('p', { class: 't-label cat-sub' }, offers.length ? '이번 봄의 제안' : '이번 봄 제안은 끝남'),
      offers.length ? h('div', { class: 'offers' }, offers.map((o, n) => offerCard(ctx, c, o, after, n === 0 && !signed.length))) : null,
      h('p', { class: 't-caption' }, `제안은 시즌이 시작되면 사라집니다.${F.cwtNote()}`),
    ] : h('p', { class: 't-caption' }, '계근 전표, 캔 밭의 카드, 저장고에서 납품할 수 있습니다. 수확 계약은 시즌이 끝나면, 겨울 계약은 2월 말에 마감됩니다.'),
  ]
}

// The contracts as the spring plan shows them, in place.
export function springContracts(ctx: Ctx, c: S.Campaign): Child {
  return contractCards(ctx, c, () => ctx.dirty())
}

// In the season and the winter: what is signed. Signed contracts are delivered against from a weigh ticket, a dug
// field's card or a cellar card.
export function openContracts(ctx: Ctx): void {
  const app = ctx.app
  if (!app.campaign) return
  ctx.papers.open({
    title: `계약, ${yearWord(app.campaign.year)}`,
    testid: 'contracts',
    size: 'wide',
    body: () => {
      const box = h('div', { class: 'contracts-body' })
      const draw = () => {
        const c = app.campaign
        if (!c) return
        box.replaceChildren(...h('div', null, contractCards(ctx, c, draw)).childNodes)
      }
      draw()
      return box
    },
    foot: close => h('button', { class: 'btn go', type: 'button', testid: 'contracts-close', autofocus: true, onclick: close }, '돌아가기'),
  })
}

// The contracts on the bank board (top.ts): each as a range, what is promised marked against what the fields of its
// variety look like giving (delivered, in hand and expected at the harvest), with the date it is due.
export function contractRows(ctx: Ctx): { key(): unknown; part(c: S.Campaign): Child } {
  const growing = (c: S.Campaign, k: S.ContractInfo) => giving(c, k.variety, k.cwt, k.delivered)
  return {
    key() {
      const c = ctx.app.campaign
      return c ? [S.contractInfo(c).map(k => [k.id, Math.round(k.delivered), Math.round(k.penalty), k.settled]), c.season?.day, c.phase === 'plan' ? c.plans : 0,
        S.openLots(c).map(l => Math.round(l.grades.no1 + l.grades.chef)), ctx.app.settings.units] : 0
    },
    part(c) {
      const ks = S.contractInfo(c)
      if (!ks.length) return null
      return h('div', { class: 'contracts', testid: 'tracker', role: 'group', 'aria-label': '계약' }, ks.map(k => {
        const done = k.needed <= 1e-6
        const g = growing(c, k)
        const max = Math.max(k.cwt, g?.hi ?? 0, k.delivered) * 1.15
        const why = shortWhy(c, k)
        const said = `${k.buyer}: ${k.varietyName} ${F.mass(k.cwt)} 중 ${F.mass(k.delivered)} 납품, 기한 ${k.dueBy}${g ? `, 밭이 No. 1을 모두 합해 ${F.mass(g.lo)}~${F.mass(g.hi)} 낼 것으로 보입니다` : ''}${k.settled ? `, 마감됨${k.penalty > 0 ? `, 위약금 ${F.money(k.penalty)}` : ''}` : done ? ', 채움' : why ? `. ${why.replace(/\.$/, '')}` : ''}. ${BAR_SAYS}`
        return h('button', { class: `contract${done ? ' done' : ''}`, type: 'button', testid: `track-${k.id}`, title: ctx.touch() ? undefined : said, onclick: () => openContracts(ctx) },
          h('span', { class: 'who' }, icon(done ? 'check' : 'contract', 'i'), h('b', null, k.varietyName), ` ${k.buyer}에게`),
          h('span', { class: 't-label due' }, k.settled ? '마감됨' : DUE_SHORT[k.due]),
          h('span', { class: 'range', 'aria-hidden': 'true' },
            g ? h('span', { class: 'band', style: `left:${(g.lo / max * 100).toFixed(1)}%;width:${((g.hi - g.lo) / max * 100).toFixed(1)}%` }) : null,
            h('span', { class: 'mark', style: `left:${(k.delivered / max * 100).toFixed(1)}%` }),
            h('span', { class: 'promise', style: `left:${(k.cwt / max * 100).toFixed(1)}%` })),
          h('span', { class: 'says num' },
            h('b', { class: 'track-n' }, `${F.num(F.massValue(k.delivered))}/${F.mass(k.cwt)}`),
            g ? ` · 예상 ${F.num(F.massValue(g.lo))}–${F.num(F.massValue(g.hi))}` : null,
            k.settled && k.penalty > 0 ? h('span', { class: 'c-red' }, ` · 모자람 ${F.money(k.penalty)}`) : why ? h('span', { class: 'c-ochre' }, ' · 모자랄 듯') : null),
          h('span', { class: 'sr' }, `. ${said} 계약을 엽니다.`))
      }))
    },
  }
}

// The contracts as a block of their own, for a sheet that lists them (the spring plan).
export function tracker(ctx: Ctx): { el: HTMLElement; update(): void } {
  const rows = contractRows(ctx)
  const el = h('section', { class: 'tracker sys', 'aria-label': '체결된 계약', hidden: true })
  return {
    el,
    update() {
      const c = ctx.app.campaign
      el.hidden = !c || !S.contractInfo(c).length
      if (c) patch(el, JSON.stringify(rows.key()), () => rows.part(c))
    },
  }
}
