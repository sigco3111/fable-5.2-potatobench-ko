// The two moments the crop shows itself: the test-dig tray, and dig day: the platform scale's face, the weigh ticket
// it prints and the full reckoning behind it (design/ticket-reveal.html, design/ticket.html, design/MOTION.md).
import * as S from '../sim/index.ts'
import { deals, deliver, versusMarket } from './contracts.ts'
import { count, type Ctx, type PaperSpec } from './core.ts'
import { h, s, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { term } from './glossary.ts'
import { icon } from './icons.ts'
import * as R from './rules.ts'
import { storeCall } from './store-band.ts'
import { expectedFrom, ticketPlace } from './ticket-words.ts'
import { coupon, range } from './system/parts.ts'
import { agentLine } from './tutorial.ts'

// 원인의 화면 표시(한글)와 용어집 키(영어)를 함께 둔다.
const CAUSE_LABEL: Record<S.Cause, string> = {
  green: 'Greened', scab: 'Scab', hollow: 'Hollow heart', knob: 'Knobs and cracks', skin: 'Thin skins',
  bruise: 'Bruised', blight: 'Tuber blight', frost: 'Frozen', rot: 'Soft rot', small: 'Too small', stone: 'Stone bruise',
}
const CAUSE_KO: Record<S.Cause, string> = {
  green: '녹화', scab: '더부룩병', hollow: '속빔', knob: '혹·금', skin: '연피',
  bruise: '멍', blight: '덩이 역병', frost: '동해', rot: '연부', small: '너무 작음', stone: '돌 멍',
}
const causeTerm = (k: S.Cause): Child => term(CAUSE_KO[k], CAUSE_LABEL[k].toLowerCase())
const CULLED: S.Cause[] = ['green', 'blight', 'frost', 'rot', 'small']
// Why the season asked for the vines to be killed (S.killTiming), as the ticket says it: a trade, never a fault.
// A kill this many days or more before it was due is the player's loss; a day or two either way is the trade.
const EARLY_DAYS = 3
const KILL_ASKED: Record<string, string> = { blight: '역병이 이기고 있었기 때문에', frost: '서리가 오고 있었기 때문에', made: '작물이 다 자랐기 때문에', late: '시즌이 끝나가고 있었기 때문에' }

export function lotKey(c: S.Campaign, id: number): string {
  return `${c.seed}:${c.startYear}:${c.year}:${id}`
}

// What went to the cull pile on dig day. A sale empties the pile, so the causes are the lasting record.
export function culledAtDig(lot: S.Lot): number {
  return CULLED.reduce((a, k) => a + lot.loss[k], 0)
}

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`
}

function fieldLog(c: S.Campaign, field: number, type: string): S.GameEvent[] {
  return (c.season?.log ?? []).filter(e => e.field === field && e.type === type)
}

// The day the digger went in and the day it finished.
function digDays(c: S.Campaign, lot: S.Lot): { start: number; end: number } {
  const done = fieldLog(c, lot.field, 'dug').pop()?.day ?? c.season?.fields[lot.field]?.dugDay ?? -1
  return { start: lot.dugDay, end: done >= lot.dugDay ? done : lot.dugDay }
}

// The day the last barrel came in and the ticket was cut, or -1.
function weighDay(c: S.Campaign, lot: S.Lot): number {
  return fieldLog(c, lot.field, 'weighed').pop()?.day ?? -1
}

// The nights the barrels in the field froze before they were hauled in.
function barrelFrosts(c: S.Campaign, lot: S.Lot): number[] {
  return fieldLog(c, lot.field, 'frozenInField').map(e => e.day).filter(d => d >= lot.dugDay)
}

function stonesWord(stones: number): string {
  return stones >= 0.6 ? '돌이 매우 많은 곳' : stones >= 0.35 ? '돌이 많은 곳' : '돌이 조금 있는 곳'
}

function digDatesText(c: S.Campaign, lot: S.Lot): string {
  const { start, end } = digDays(c, lot)
  return end > start ? `${F.date(lot.year, start)}부터 ${F.date(lot.year, end)}까지 캠` : `${F.date(lot.year, start)}에 캠`
}

// "9월 16~18일", "9월 29일~10월 2일", "9월 16일".
function daySpan(year: number, a: number, b: number): string {
  if (b <= a) return F.date(year, a, true)
  const same = S.monthDay(year, a).month === S.monthDay(year, b).month
  return `${F.date(year, a, true)}~${same ? `${S.monthDay(year, b).dom}일` : F.date(year, b, true)}`
}

// A weight without its unit, as a machine stamps it: "1,374".
function bare(cwt: number): string {
  return F.mass(cwt).replace(/ (cwt|t)$/, '')
}

// What a capture asks the staging to hold still on (tools/quality/capture.ts): 'sweep' or 'tear'.
function held(what: string): boolean {
  return document.documentElement.dataset.hold === what
}

// --ease-out and --ease-paper, for movements driven from here.
const EASE_PAPER = 'cubic-bezier(.3, 1.25, .5, 1)'
const EASE_IN = 'cubic-bezier(.5, 0, .9, .4)'
function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const at = (u: number, a: number, b: number) => 3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3
  return t => {
    let lo = 0, hi = 1, u = t
    for (let i = 0; i < 24; i++) {
      const x = at(u, x1, x2)
      if (Math.abs(x - t) < 1e-4) break
      if (x < t) lo = u; else hi = u
      u = (lo + hi) / 2
    }
    return at(u, y1, y2)
  }
}
const easeOut = bezier(0.2, 0.7, 0.2, 1)

// ---------------------------------------------------------------- the test dig

interface Placed { w: number; mark: number; k: number; x: number; ground: number; a: number; b: number; rot: number }

const LABEL_H = 36
// What a mark is called under its tuber, in a word or two.
const TRAY_MARK: Record<S.Cause, string> = { green: '녹화', scab: '더부룩', hollow: '속빔', knob: '혹', skin: '연피', bruise: '멍', blight: '역병', frost: '동해', rot: '썩음', small: '작음', stone: '돌 멍' }

// Tubers in weight order on one ground line, or two when one would make them too small to read.
// close: a phone's tray, where the labels stand nearer each other so one row of tubers can do.
function layoutTray(weights: number[], marks: number[], shape: number, width: number, close: boolean): { items: Placed[]; height: number; pxPerCm: number } {
  const LABEL_W = close ? 44 : 50
  const minPx = close ? 3.4 : 5.2
  // An ellipsoid of the tuber's weight at 1.08 g/cm3, with semi-axes in the ratio length : width : depth.
  const dims = weights.map((w, k) => {
    const long = shape * (1.06 + ((k * 7) % 5) * 0.02), deep = 0.82
    const r = Math.cbrt((w / 1.08) / ((4 / 3) * Math.PI * long * deep))
    return { k, w, a: long * r, b: r }
  }).sort((p, q) => q.w - p.w)
  const pad = 14, gap = close ? 6 : 8
  const rowsFor = (n: number) => n === 1 ? [dims] : [dims.slice(0, Math.ceil(dims.length / 2)), dims.slice(Math.ceil(dims.length / 2))]
  const need = (row: typeof dims, px: number) => row.reduce((sum, d) => sum + Math.max(d.a * 2 * px, LABEL_W) + gap, -gap)
  const fit = (rows: (typeof dims)[]) => {
    let lo = 1, hi = 10
    for (let n = 0; n < 14; n++) { const mid = (lo + hi) / 2; if (rows.every(r => need(r, mid) <= width - pad * 2)) lo = mid; else hi = mid }
    return lo
  }
  let rows = rowsFor(1)
  let px = fit(rows)
  if (px < minPx && dims.length > 3) { rows = rowsFor(2); px = fit(rows) }
  const items: Placed[] = []
  let y = pad
  for (const row of rows) {
    const tall = Math.max(...row.map(d => d.b * 2 * px))
    const ground = y + tall
    let x = (width - need(row, px)) / 2
    for (const d of row) {
      const slot = Math.max(d.a * 2 * px, LABEL_W)
      items.push({ w: d.w, mark: marks[d.k], k: d.k, x: x + slot / 2, ground, a: d.a * px, b: d.b * px, rot: ((d.k * 37) % 9) - 4 })
      x += slot + gap
    }
    y = ground + LABEL_H + 6
  }
  return { items, height: y + 20, pxPerCm: px }
}

// A closed, slightly lumpy outline: no two tubers alike, none a perfect oval.
function blob(a: number, b: number, seed: number): string {
  const n = 10
  const pts: [number, number][] = []
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2
    const j = 1 + 0.06 * Math.sin(seed * 1.7 + k * 2.3) + 0.04 * Math.sin(seed * 0.9 + k * 4.1)
    pts.push([Math.cos(t) * a * j, Math.sin(t) * b * j * (Math.sin(t) > 0 ? 0.94 : 1)])
  }
  const at = (i: number) => pts[(i + n) % n]
  let d = `M${at(0)[0].toFixed(1)} ${at(0)[1].toFixed(1)}`
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return `${d}z`
}

function tuberMark(t: Placed): SVGElement[] {
  const { a, b } = t
  const out: SVGElement[] = []
  const cause = t.mark > 0 ? S.CAUSES[t.mark - 1] : null
  switch (cause) {
    case 'green': out.push(s('ellipse', { class: 'm-green', cx: -a * 0.25, cy: -b * 0.3, rx: a * 0.75, ry: b * 0.7 })); break
    case 'scab':
      for (let k = 0; k < 8; k++) out.push(s('circle', { class: 'm-scab', cx: (((k * 53 + t.k * 17) % 10) / 10 - 0.5) * a * 1.4, cy: (((k * 31 + t.k * 7) % 10) / 10 - 0.5) * b * 1.3, r: Math.max(1.2, b * 0.12) }))
      break
    case 'hollow':
      out.push(s('path', { class: 'm-cut', d: `M${-a * 1.1} ${-b * 0.05}H${a * 1.1}` }))
      out.push(s('path', { class: 'm-hollow', d: `M${-a * 0.35} 0 Q0 ${-b * 0.42} ${a * 0.35} 0 Q0 ${b * 0.42} ${-a * 0.35} 0z` }))
      break
    case 'skin': out.push(s('path', { class: 'm-skin', d: `M${-a * 0.1} ${-b * 0.5}q${a * 0.5} ${b * 0.1} ${a * 0.45} ${b * 0.6}q${-a * 0.4} ${b * 0.25} ${-a * 0.6} ${-b * 0.15}z` })); break
    case 'bruise': out.push(s('ellipse', { class: 'm-bruise', cx: a * 0.3, cy: b * 0.15, rx: a * 0.32, ry: b * 0.38 })); break
    case 'blight': out.push(s('path', { class: 'm-blight', d: `M${-a * 0.7} ${-b * 0.1} q${a * 0.3} ${-b * 0.7} ${a * 0.8} ${-b * 0.3} q${a * 0.4} ${b * 0.6} ${-a * 0.1} ${b * 0.8} q${-a * 0.6} ${b * 0.1} ${-a * 0.7} ${-b * 0.5}z` })); break
    case 'frost': out.push(s('ellipse', { class: 'm-frost', cx: 0, cy: 0, rx: a * 1.2, ry: b * 1.2 })); break
    case 'rot': out.push(s('ellipse', { class: 'm-rot', cx: a * 0.5, cy: b * 0.1, rx: a * 0.6, ry: b * 0.9 })); break
    default: break
  }
  return out
}

let traySeq = 0

// The grading tray, printed: a keylined board with the hill's tubers on it at true relative size, each weight stamped
// under its tuber and its mark written beside, a two-inch rule in the corner.
function tray(weights: number[], marks: number[], v: S.Variety, W: number, close: boolean): SVGElement {
  const L = layoutTray(weights, marks, v.shape, W, close)
  const id = `tray${++traySeq}`
  const H = L.height
  const russet = v.id === 'burbank' || v.id === 'caribou'
  const kids: SVGElement[] = [
    s('defs', null,
      s('radialGradient', { id: `${id}-form`, cx: '36%', cy: '28%', r: '85%' },
        s('stop', { offset: '0', 'stop-color': '#fff6e0', 'stop-opacity': '0.42' }),
        s('stop', { offset: '0.5', 'stop-color': '#fff6e0', 'stop-opacity': '0' }),
        s('stop', { offset: '1', 'stop-color': '#2a1a0c', 'stop-opacity': '0.42' }))),
    s('rect', { class: 'flat-rim', x: 0.75, y: 0.75, width: W - 1.5, height: H - 1.5 }),
    s('rect', { class: 'flat-bed', x: 5, y: 5, width: W - 10, height: H - 10 }),
  ]
  const grounds = [...new Set(L.items.map(t => t.ground))]
  for (const g of grounds) kids.push(s('path', { class: 'flat-slat', d: `M5 ${(g + 1.5).toFixed(1)}H${W - 5}` }))
  L.items.forEach((t, n) => {
    const cause = t.mark > 0 ? S.CAUSES[t.mark - 1] : null
    const { a, b } = t
    const d = blob(a, b, t.k * 3.1 + t.w * 0.013)
    const cy = t.ground - b
    const eyes: SVGElement[] = []
    const count = Math.max(2, Math.min(5, Math.round(a / 9)))
    for (let e = 0; e < count; e++) {
      const ang = (e * 2.4 + t.k * 1.3) % (Math.PI * 2), rr = 0.25 + ((e * 37 + t.k * 11) % 40) / 100
      const ex = Math.cos(ang) * a * rr, ey = Math.sin(ang) * b * rr
      const tilt = ((e * 53 + t.k * 29) % 60) - 30
      eyes.push(s('path', { class: 't-eye', d: 'M-2.2 0q2.2 1.4 4.4 0', transform: `translate(${ex.toFixed(1)} ${ey.toFixed(1)}) rotate(${tilt})` }))
    }
    const specks: SVGElement[] = []
    if (russet) for (let e = 0; e < 14; e++) specks.push(s('circle', { class: 't-net', cx: ((((e * 71 + t.k * 13) % 100) / 100) - 0.5) * a * 1.6, cy: ((((e * 43 + t.k * 31) % 100) / 100) - 0.5) * b * 1.5, r: 0.7 }))
    kids.push(s('g', { class: 'tuber', style: `--n:${n}` },
      s('ellipse', { class: 't-shadow', cx: t.x.toFixed(1), cy: (t.ground + 1).toFixed(1), rx: (a * 0.92).toFixed(1), ry: Math.max(2, b * 0.16).toFixed(1) }),
      s('g', { transform: `translate(${t.x.toFixed(1)} ${cy.toFixed(1)}) rotate(${t.rot})` },
        s('clipPath', { id: `${id}-c${n}` }, s('path', { d })),
        s('path', { d, fill: hex(v.skin) }),
        s('g', { 'clip-path': `url(#${id}-c${n})` }, specks, tuberMark(t), s('path', { d, fill: `url(#${id}-form)`, transform: 'scale(1.02)' })),
        cause === 'knob' ? s('path', { class: 't-knob', d: blob(b * 0.5, b * 0.42, t.k), fill: hex(v.skin), transform: `translate(${(a * 0.92).toFixed(1)} ${(-b * 0.5).toFixed(1)})` }) : null,
        cause === 'hollow' ? null : eyes,
        s('path', { class: 't-edge', d })),
      s('text', { class: 'tray-w', x: t.x.toFixed(1), y: (t.ground + 18).toFixed(1) }, F.grams(t.w)),
      cause ? s('text', { class: 'tray-m', x: t.x.toFixed(1), y: (t.ground + 33).toFixed(1) }, TRAY_MARK[cause]) : null))
  })
  const len = (F.metric() ? 5 : 5.08) * L.pxPerCm
  kids.push(s('path', { class: 'tray-scale', d: `M14 ${H - 13}v-5M14 ${H - 15.5}h${len.toFixed(1)}M${(14 + len).toFixed(1)} ${H - 13}v-5` }))
  kids.push(s('text', { class: 'tray-scale-label', x: (20 + len).toFixed(1), y: H - 10 }, F.metric() ? '5 cm' : '2 in'))
  const sound = marks.filter(m => m === 0).length
  return s('svg', {
    class: 'tray', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `쟁반 위 감자 ${weights.length}개, 실제 크기 비율, 그중 ${sound}개가 온전합니다. 무게: ${weights.map(w => F.grams(w)).join(', ')}.`,
  }, kids)
}

// The estimate before and now on one scale, with the hill itself as the violet mark. Staged, the band narrows from
// the old range to the new one (a clip opening on the union of the two), and the figures count.
function narrowing(before: S.Estimate | null, after: S.Estimate, hill: number, staged: boolean, delay: number): { rows: HTMLElement; caption: HTMLElement } {
  // The scale is fitted to these figures, so the narrowing is wide enough to see.
  const max = Math.ceil(Math.max(after.hi, before?.hi ?? 0, hill) * 1.2 / 50) * 50 || 50
  const digits = F.metric() ? 1 : 0
  const show = (n: number) => F.num(F.perAreaValue(n), digits)
  const from = before ?? after
  const now = range({ lo: after.lo, hi: after.hi, max, mark: hill > 0 ? Math.min(hill, max) : undefined, cls: 'now',
    label: `지금: ${F.perAreaSpan(after.lo, after.hi)}. 이 밭 전체가 이런 포기라면 ${F.perArea(hill)}을(를) 거둡니다.` })
  const lo = h('span', null, show(staged ? from.lo : after.lo)), hi = h('span', null, show(staged ? from.hi : after.hi))
  now.style.setProperty('--at', `${Math.max(0, delay - 300)}ms`)
  if (staged) {
    const band = now.querySelector<HTMLElement>('.band')!
    const u0 = Math.min(from.lo, after.lo), u1 = Math.max(from.hi, after.hi)
    const x = (v: number) => `${(Math.max(0, Math.min(1, v / max)) * 100).toFixed(1)}%`
    const inset = (e: S.Estimate) => `inset(0 ${((u1 - e.hi) / (u1 - u0 || 1) * 100).toFixed(1)}% 0 ${((e.lo - u0) / (u1 - u0 || 1) * 100).toFixed(1)}%)`
    band.style.left = x(u0)
    band.style.width = `calc(${x(u1)} - ${x(u0)})`
    band.style.clipPath = inset(from)
    setTimeout(() => {
      if (!now.isConnected) return
      band.style.transition = 'clip-path 600ms var(--ease-out)'
      band.style.clipPath = inset(after)
      count(lo, from.lo, after.lo, show)
      count(hi, from.hi, after.hi, show)
      setTimeout(() => { band.style.cssText = `left:${x(after.lo)};width:calc(${x(after.hi)} - ${x(after.lo)})` }, 640)
    }, delay)
  }
  const rows = h('div', { class: 'narrowing' },
    before ? h('div', { class: 'nrow was' },
      h('span', { class: 't-label' }, term('이전', 'estimate before')),
      range({ lo: before.lo, hi: before.hi, max, label: `이전: ${F.perAreaSpan(before.lo, before.hi)}` }),
      h('span', { class: 'num' }, F.perAreaSpan(before.lo, before.hi).replace(` ${F.perAreaUnit()}`, ''))) : null,
    h('div', { class: 'nrow' },
      h('span', { class: 't-label' }, '지금'),
      now,
      h('b', { class: 'num' }, lo, '–', hi)))
  const caption = h('p', { class: 't-caption tray-caption' }, `수확량 ${F.perAreaUnit()} 기준, 시험 캐기 ${after.digs}회. 눈금은 이 포기이고 한 포기가 밭 전체는 아니라서 범위는 움직여도 하나의 수로 좁혀지지 않습니다.${F.cwtNote()}`)
  return { rows, caption }
}

// The tray paper for one test dig. It sits beside the land and does not stop the clock.
export function trayPaper(ctx: Ctx, e: S.GameEvent, before: S.Estimate | null, o: { staged: boolean; onClose: () => void }): HTMLElement {
  const c = ctx.app.campaign!
  const v = S.variety(c.plans[e.field].variety)
  const weights = (e.data?.weights as number[]) ?? []
  const marks = (e.data?.marks as number[]) ?? []
  const grams = Number(e.data?.grams ?? 0)
  const after = S.fieldInfo(c, e.field).estimate
  const tally = new Map<string, number>()
  marks.forEach((m, k) => {
    const w = weights[k] ?? 0
    const key = m > 0 ? CAUSE_LABEL[S.CAUSES[m - 1]].toLowerCase() : w < S.SIZE_A ? 'sound, B size' : w > S.SIZE_CHEF ? 'sound and large' : 'sound, No. 1 size'
    // key는 영어(용어집 키)로 두고 표시만 한글로: 아래 TALLY_KO.

    tally.set(key, (tally.get(key) ?? 0) + 1)
  })
  const alone = grams * S.PLANTS_PER_ACRE / S.GRAMS_PER_CWT
  const narrow = ctx.layout() === 'narrow'
  const W = narrow ? Math.min(360, innerWidth - 48) : 360
  const staged = o.staged && !ctx.reduced()
  const arrive = Math.min(6, weights.length) * 90 + 420
  const est = after ? narrowing(before, after, alone, staged, arrive + 500) : null
  const TALLY_KO: Record<string, string> = { 'sound, B size': '온전, B 사이즈', 'sound and large': '온전, 대구', 'sound, No. 1 size': '온전, No. 1 크기' }
  for (const k of Object.keys(CAUSE_KO)) TALLY_KO[CAUSE_LABEL[k as S.Cause].toLowerCase()] = CAUSE_KO[k as S.Cause]
  const el = h('section', { class: `tray-paper sheet sys${staged ? ' staged' : ''}`, role: 'region', 'aria-label': `시험 캐기, ${S.FIELD_NAMES[e.field]}`, testid: 'sample-dialog', 'data-layout': ctx.layout() },
    h('header', { class: 'tray-head' },
      h('div', null,
        h('p', { class: 't-label' }, icon('sample', 'i'), '시험 캐기'),
        h('h2', null, S.FIELD_NAMES[e.field])),
      h('button', { class: 'close', type: 'button', 'aria-label': '쟁반 닫기', testid: 'sample-close', onclick: o.onClose }, icon('close', 'i'))),
    // Where the window is too short for the whole tray, the tray, its tally and what the estimate means scroll
    // between the head and the estimate, which stay in view.
    h('div', { class: 'tray-scroll', testid: 'tray-scroll', tabindex: '-1' },
      h('p', { class: 'tray-lede' }, `${F.date(c.year, e.day)}, ${v.name} 한 포기. 감자 ${weights.length}개 무게 `, h('span', { class: 'stamped' }, F.hillMass(grams)), '.'),
      // On a phone the tubers keep to one row where they can, so the tray leaves the land its room.
      tray(weights, marks, v, W, narrow),
      h('div', { class: 'tally sheet laid', role: 'list', 'aria-label': '집계' },
        [...tally].map(([k, n]) => h('p', { class: 'lead', role: 'listitem' }, h('span', null, term(TALLY_KO[k] ?? F.upper(k), k === 'sound, B size' ? 'B size' : k)), h('span', { class: 'dots' }), h('b', { class: 'num' }, n)))),
      est?.caption ?? null),
    est?.rows ?? null)
  // A click anywhere on the tray skips the staging.
  if (staged) el.addEventListener('pointerdown', () => el.classList.remove('staged'), { once: true })
  return el
}

// ---------------------------------------------------------------- dig day: the causes

interface Facts { name: string; f: S.FieldInfo; v: S.Variety; planted?: S.GameEvent; killed?: S.GameEvent; died?: S.GameEvent; dry?: S.GameEvent; blight?: S.GameEvent }

function facts(c: S.Campaign, lot: S.Lot): Facts {
  const first = (type: string) => fieldLog(c, lot.field, type)[0]
  const blight = [...fieldLog(c, lot.field, 'blightSeen'), ...fieldLog(c, lot.field, 'scout').filter(e => Number(e.data?.found ?? 0) > 0)].sort((a, b) => a.day - b.day)[0]
  return { name: S.FIELD_NAMES[lot.field], f: S.fieldInfo(c, lot.field), v: S.variety(lot.variety), planted: first('planted'), killed: first('killed'), died: first('vinesDead'), dry: first('dry'), blight }
}

// Each cause in a phrase, for the ticket.
function phrase(ctx: Ctx, c: S.Campaign, lot: S.Lot, cause: S.Cause): string {
  const x = facts(c, lot)
  const inDay = weighDay(c, lot)
  switch (cause) {
    case 'green': return x.f.hillPasses === 0 ? '북주기를 안 해 감자가 햇빛을 봤습니다' : x.f.hillPasses === 1 ? '북주기를 한 번만 해 얕은 북으로 빛이 들었습니다'
      : inDay - lot.dugDay > 2 ? `광주리에서 ${inDay - lot.dugDay}일을 햇볕에 놓였습니다` : '비가 북의 흙을 씻어냈습니다'
    case 'scab': return '감자가 맺힌 뒤 몇 주 동안 흙이 말랐습니다'
    case 'hollow': return '생장이 멈췄다가 급격히 자랐습니다'
    case 'knob': return '가뭄 뒤에 비가 왔습니다'
    case 'skin': {
      const dead = x.killed ?? x.died
      return dead ? `줄기가 죽은 지 ${lot.dugDay - dead.day}일 만에 캤지만 껍질은 ${S.SKIN_DAYS}일이 필요합니다` : '줄기가 파랄 때 캤습니다'
    }
    case 'bruise': {
      const t = ctx.memo.digSoilT[lotKey(c, lot.id)]
      return t !== undefined ? `흙 온도 ${F.temp(t)}에서 캤습니다` : '차가운 흙에서 캤습니다'
    }
    case 'blight': return '병든 잎에서 포자가 씻겨 내려왔습니다'
    case 'frost': {
      const nights = barrelFrosts(c, lot)
      return nights.length ? `${F.list(nights.map(d => F.date(c.year, d, true)))}에 날라오기 전 광주리에서 얼었습니다` : '수확 전 땅에서 얼었습니다'
    }
    case 'rot': return '물에 잠긴 흙에 놓여 있었습니다'
    case 'small':
      if (x.killed && (!x.died || x.killed.day <= x.died.day)) {
        // Whether the kill came before the coach asked for it (the player's early kill) or when asked (the trade it asked for).
        const kt = S.killTiming(c, lot.field)
        const on = F.date(c.year, x.killed.day, true)
        if (kt.killed >= 0 && kt.early >= EARLY_DAYS) return `${on}에 줄기를 ${kt.early}일 일찍 죽여 다 자라기 전이었습니다`
        return `${on}에 줄기를 죽였습니다${KILL_ASKED[kt.why] ? `(${KILL_ASKED[kt.why]} 예정대로)` : ''}. 크기 일부를 제때 굳은 껍질과 맞바꿨습니다`
      }
      if (x.died) return x.died.text.includes('서리가 줄기') ? '서리가 줄기를 죽여 다 자라지 못했습니다' : x.died.text.includes('역병이 줄기') ? '역병이 줄기를 죽여 다 자라지 못했습니다' : '줄기가 먼저 말라 다 자라지 못했습니다'
      return '줄기가 파랄 때 캐 다 자라지 못했습니다'
    case 'stone': return `${x.name}은(는) ${stonesWord(x.f.stones)}이라 캐는 기계에 감자가 돌에 부딪혔습니다`
  }
}

// Each cause in full: tied to the field's own dates and the player's own acts.
function why(ctx: Ctx, c: S.Campaign, lot: S.Lot, cause: S.Cause): string {
  const { name, f, v, planted, killed, died, dry } = facts(c, lot)
  const date = (d: number) => F.date(c.year, d)
  const first = (type: string) => fieldLog(c, lot.field, type)[0]
  const reel = c.upgrades.reel
  const water = reel ? '그 몇 주에 물을 주면 막을 수 있습니다.' : '그 몇 주의 비나 관개가 막아주지만, 관개 릴이 없으면 여기 농가들은 대부분 비를 기다릴 뿐입니다.'
  switch (cause) {
    case 'green': {
      const p = f.hillPasses
      const storms: number[] = []
      if (planted) for (let d = planted.day; d < lot.dugDay && d < (c.season?.day ?? 0); d++) if (S.getDay(ctx.app.world, c.year, d).prcp >= S.STORM_MM) storms.push(d)
      const barrels = weighDay(c, lot) - lot.dugDay
      return `빛 속으로 자라 올라온 감자는 초록으로 변하고 씁니다. ${name}은(는) ${p === 0 ? '북주기를 한 번도 하지 않았고, 두 번의 북주기가' : p === 1 ? '북주기를 한 번만 했고, 한 번 더 하는 것이' : '북주기를 두 번 했습니다'}${p < 2 ? ' 줄이 닫히기 전에 감자를 덮어줍니다' : ''}.`
        + (storms.length ? ` ${F.list(storms.map(date))}의 큰비가 북의 흙을 씻어냈습니다.` : '')
        + (barrels > 2 ? ` 작물이 광주리에서 ${barrels}일을 밭에 놓였고, 해가 날 때마다 더 초록으로 변합니다. 한 사람은 캐면서 나를 수 없습니다. 트럭 기사나 트랙터가 하나 더 있으면 캐는 동안 날라옵니다.` : '')
        + (v.green >= 1.3 ? ` ${v.name}은(는) 감자가 북의 높은 곳에 맺힙니다.` : '')
    }
    case 'scab': {
      const ti = first('ti')
      const watered = fieldLog(c, lot.field, 'watered').length
      const inWindow = !!dry && !!ti && dry.day >= ti.day - 7 && dry.day <= ti.day + 35
      return `더부룩병은 감자가 맺힌 뒤 다섯 주 동안 흙이 마르면 생깁니다${ti ? `(${name}, ${date(ti.day)}부터 ${date(ti.day + 35)}까지)` : ''}.`
        + (inWindow ? ` ${name}은(는) ${date(dry.day)}에 마르고 있었습니다` : ` ${name}은(는) 그 기간 일부가 말랐습니다`)
        + (watered ? `, 물을 ${F.times(watered)} 줬습니다.` : reel ? ', 물을 주지 않았습니다.' : '.')
        + ` ${water}`
        + ` ${v.name}은(는) ${v.scab >= 1.3 ? '더부룩병에 약합니다' : v.scab < 0.7 ? '더부룩병이 드뭅니다' : '더부룩병은 보통입니다'}`
        + (f.soil < 0.6 ? ', 감자를 해마다 기르면 흙에 더부룩병이 남습니다.' : '.')
    }
    case 'hollow':
      return `큰 감자의 속이 비었습니다. 가뭄에 생장이 멈췄다가 비 뒤에 급격히 자라거나, 감자가 맺힐 때 흙이 차가우면 그렇게 됩니다.${dry ? ` ${name}은(는) ${date(dry.day)}에 마르고 있었습니다.` : ''} ${v.name}은(는) ${v.hollow >= 0.1 ? '속이 잘 빕니다' : '이런 일이 드뭅니다'}.`
    case 'knob':
      return `가뭄 뒤의 비는 감자를 들쑥날쑥 자라게 해 갈라지고 혹이 생깁니다${dry ? `. ${name}은(는) ${date(dry.day)}에 마르고 있었습니다` : ''}.${v.rough >= 1.2 ? ` ${v.name}은(는) 쉽게 거칠어집니다.` : ''} 감자가 굵어지는 동안 비나 관개로 물을 고르게 주면 막을 수 있습니다.`
    case 'skin': {
      const dead = killed ?? died
      const last = F.date(lot.year, S.dayIndex(lot.year, S.NEW_POTATO_LAST.month, S.NEW_POTATO_LAST.dom))
      if (!dead) return `줄기가 파랄 때 캐서 껍질이 굳지 못했습니다. 줄기가 죽은 뒤 ${S.SKIN_DAYS}일이 필요합니다.`
      const k = lot.dugDay - dead.day
      return `껍질이 아직 굳지 않았습니다. 줄기가 죽은 지 ${k}일 만에 캤는데 껍질은 ${S.SKIN_DAYS}일이 필요합니다. No. 2로 팔리거나, ${last}까지 수확 후 6일 안에 밭에서 바로 팔면 No. 1 가격입니다.`
    }
    case 'bruise': {
      const t = ctx.memo.digSoilT[lotKey(c, lot.id)]
      return `${t !== undefined ? `수확일의 흙 온도가 ${F.temp(t)}였고, 차` : '차'}가운 감자는 약 ${F.temp(S.BRUISE_SOIL_T)} 아래에서 캐는 기계에 멍이 듭니다. 땅이 차가워지기 전에 캐면 피할 수 있습니다.`
    }
    case 'blight': {
      const seen = facts(c, lot).blight
      const sprays = fieldLog(c, lot.field, 'sprayed').length
      return `비가 병든 잎의 포자를 북 속으로 씻어 내렸습니다. ${seen ? `${name}에서 ${date(seen.day)}에 역병을 처음 발견했고` : '여기 잎에서는 역병을 찾은 적이 없어 눈에 띄지 않게 들어왔고'}${sprays ? `, 밭에는 ${F.times(sprays)} 살포했습니다` : ', 밭에 살포하지 않았습니다'}. 북을 충분히 올리고 줄기를 일찍 죽이면 포자가 감자에 닿지 않습니다.`
    }
    case 'frost': {
      const nights = barrelFrosts(c, lot)
      if (nights.length) return `${F.list(nights.map(date))}의 강한 서리가 ${name}에서 날라오기 전 광주리의 작물을 덮쳐 놓인 것의 5분의 1이 얼었습니다. 나르는 사람이 하나 더 있거나, 트랙터나 트럭이 하나 더 있으면 캐는 만큼 빨리 날라옵니다.`
      const frosts = fieldLog(c, lot.field, 'frost').map(e => e.day)
      return `${frosts.length ? `${F.list(frosts.slice(-3).map(date))}에 서리가 왔고` : '수확 전에 강한 서리가 와서'}, 얕은 북 아래 감자가 땅에서 얼었습니다.${f.elev === 0 ? ' 찬 공기는 골짜기에 고입니다.' : ''} 강한 서리가 오기 전에 캐세요.`
    }
    case 'rot': {
      const logged = first('logged')
      return `${logged ? `${date(logged.day)}부터 ${name}에 물이 고였고, 물에 잠긴 흙의 감자는 썩습니다.` : '젖은 흙에 놓인 감자는 썹니다.'}${f.elev === 0 ? ' 골짜기는 비 뒤에 물을 머금습니다.' : ''}`
    }
    case 'small': {
      const blight = facts(c, lot).blight
      let end = ` ${name}에서는 줄기가 파랄 때인 ${date(lot.dugDay)}에 캤습니다.`
      const kt = S.killTiming(c, lot.field)
      if (killed && (!died || killed.day <= died.day) && kt.killed >= 0 && kt.early >= EARLY_DAYS) {
        end = ` ${name}에서는 ${date(killed.day)}에 줄기를 죽였습니다. 필요보다 ${kt.early}일 빨라 감자가 다 자라지 못했습니다.${Number(killed.data?.lost ?? 0) > 0 ? ' 못 불린 무게는 자라지 못한 몫에 있습니다.' : ''}`
      } else if (killed && (!died || killed.day <= died.day) && kt.killed >= 0 && kt.asked >= 0) {
        end = ` ${name}에서는 ${date(killed.day)}에 예정대로 줄기를 죽였습니다${KILL_ASKED[kt.why] ? `(${KILL_ASKED[kt.why]})` : ''}. 작은 감자 일부는 제때 굳는 껍질의 대가입니다.`
      } else if (killed && (!died || killed.day <= died.day)) {
        end = blight && blight.day <= killed.day
          ? ` ${name}에서는 밭에 역병이 도는 가운데 ${date(killed.day)}에 줄기를 죽여, 크기 일부를 포기하고 감자를 역병에서 지켰습니다.`
          : ` ${name}에서는 ${date(killed.day)}에 줄기를 죽였습니다. 한 주를 더 기다리면 커지지만 역병과 서리의 위험도 커집니다.`
      } else if (died) {
        end = died.text.includes('서리가 줄기') ? ` ${name}에서는 ${date(died.day)}에 서리가 줄기를 죽였습니다.`
          : died.text.includes('역병이 줄기') ? ` ${name}에서는 ${date(died.day)}에 역병이 줄기를 죽였습니다.`
            : ` ${name}에서는 ${date(died.day)}에 줄기가 말랐습니다.`
      }
      return `지름 ${F.metric() ? '4cm' : '1½인치'} 미만이라 등급을 매길 수 없어 불량과 함께 전분 공장으로 갑니다. 감자는 줄기가 죽을 때까지 계속 자랍니다.${end}${v.maturity === 'late' || v.maturity === 'very late' ? ` ${v.name}은(는) 긴 시즌이 필요합니다.` : ''}`
    }
    case 'stone': return `${name}은(는) ${stonesWord(f.stones)}이라, 캐는 기계가 들어 올릴 때 돌에 부딪힌 감자가 No. 2로 떨어졌습니다. 서리는 해마다 돌을 더 밀어 올립니다. 작물이 없을 때 돌을 골라내면 대부분 치울 수 있고, 솜씨 좋은 기계 기사는 멍을 덜 들게 합니다.`
  }
}

// ---------------------------------------------------------------- dig day: the grades

type GradeKey = S.Grade | 'skinned'
const GRADE_LABEL: Record<GradeKey, string> = { no1: 'US No. 1', chef: 'Large', b: 'B size', no2: 'US No. 2', skinned: 'Thin-skinned', cull: 'Culls' }
// 표시용 한국어 등급명. 용어집 키는 GRADE_LABEL의 영문 소문자 그대로.
const GRADE_KO: Record<GradeKey, string> = { no1: 'US No. 1', chef: '대구', b: 'B size', no2: 'US No. 2', skinned: '연피', cull: '불량' }
const gradeTerm = (key: GradeKey): Child => term(GRADE_KO[key], GRADE_LABEL[key].toLowerCase())
const GRADE_ORDER: GradeKey[] = ['no1', 'chef', 'b', 'no2', 'skinned', 'cull']
// The printer's tints (design/system.css .g1 to .g5); thin skins, a sixth grade no frame shows, take the hatch turned.
const TINT: Record<GradeKey, string> = { no1: 'g1', chef: 'g2', b: 'g3', no2: 'g4', skinned: 'g6', cull: 'g5' }

function gradeNote(ctx: Ctx, c: S.Campaign, lot: S.Lot, key: GradeKey): string {
  const last = S.dayIndex(lot.year, S.NEW_POTATO_LAST.month, S.NEW_POTATO_LAST.dom)
  switch (key) {
    case 'no1': return '정가'
    case 'chef': return `${F.grams(S.SIZE_CHEF)} 초과, ${R.largeRule(ctx.app.world, c, lot.variety)}`
    case 'b': return `${F.grams(S.SIZE_A)} 미만, No. 1 가격의 ${F.pct(S.GRADE_PRICE.b)}`
    case 'no2': return `흠집 있음, No. 1 가격의 ${F.pct(S.GRADE_PRICE.no2)}`
    case 'skinned': return `No. 2 가격. ${F.date(lot.year, last)}까지, 수확 후 6일 안에 밭에서 바로 팔면 No. 1 가격`
    case 'cull': return `전분 공장행, ${F.price(S.CULL_PRICE)}`
  }
}

interface AtDig { known: boolean; market: number; cull: number; total: number; rows: { key: GradeKey; cwt: number }[] }

// The crop as it stood on dig day, whatever has been sold since. The grades come largest first, as the grader
// fills its bins, the culls last.
function atDig(ctx: Ctx, c: S.Campaign, lot: S.Lot): AtDig {
  const snap = ctx.memo.lots[lotKey(c, lot.id)]
  const now = S.lotCwt(lot)
  // Selling scales every grade down together, so a lot seen after a sale is scaled back up to dig-day size.
  const scale = snap ? 1 : now > 0 ? (now + lot.sold) / now : 1
  const base = snap ?? lot
  const known = !!snap || now > 0
  const cull = culledAtDig(lot)
  const market = known ? S.lotCwt(base) * scale : lot.sold
  const amount = (k: GradeKey) => k === 'cull' ? cull : (k === 'skinned' ? base.skinned : base.grades[k]) * scale
  const rows = GRADE_ORDER.map(key => ({ key, cwt: amount(key) })).filter(r => r.cwt >= 0.5 || r.key === 'no1')
  rows.sort((a, b) => (a.key === 'cull' ? 1 : 0) - (b.key === 'cull' ? 1 : 0) || b.cwt - a.cwt)
  return { known, market, cull, total: market + cull, rows }
}

function gradebar(d: AtDig, parts: string[]): HTMLElement {
  return h('div', { class: 'gradebar', role: 'img', 'aria-label': `등급별: ${d.rows.map((r, k) => `${GRADE_KO[r.key]} ${parts[k]}`).join(', ')}` },
    d.rows.map(r => h('i', { class: TINT[r.key], style: `width:${(d.total > 0 ? r.cwt / d.total * 100 : 0).toFixed(1)}%` })))
}

// The strip in words, by its first grade: "73% made US No. 1, the full price."
function topGrade(d: AtDig): Child[] {
  const no1 = d.rows.find(r => r.key === 'no1')?.cwt ?? 0
  const share = d.total > 0 ? no1 / d.total : 0
  return [h('i', { class: `sw ${TINT.no1}` }), `${F.pct(share)}가 `, term('US No. 1'), ' 등급을 받았습니다. 정가입니다.']
}

// What a grower weighs before keeping a crop, in full.
function sellOrKeep(ctx: Ctx, c: S.Campaign, lot: S.Lot): HTMLElement[] {
  const world = ctx.app.world
  const v = S.variety(lot.variety)
  const m = R.sproutMonth(lot.year, lot.dugDay, lot.variety, c.upgrades.vent)
  return [
    h('p', null, `오늘 ${v.name}의 US No. 1 시세는 ${F.price(S.basePrice(world, c, lot.variety))}입니다. 이 작물을 오늘 팔면 `, h('strong', { class: 'num' }, F.money(S.lotValue(world, c, lot))), `을(를) 받습니다. ${F.upper(storeCall(S.storeOutlook(world, c, lot)).phrase)}.`),
    ...(v.contract ? [h('p', null, R.contractText(v))] : [h('p', null, R.outlookText(c)), h('p', null, R.moodText(world, c))]),
    h('p', null, R.storageText(c, S.lotCwt(lot))),
    h('p', null, `이 ${v.name}은(는) ${F.date(lot.year, lot.dugDay)}에 캤고 ${R.sproutText(m)}${m < S.CELLAR_MONTHS.length ? ' 싹난 감자는 15% 낮게 팔리고 더 빨리 줍니다' : ''}`),
  ]
}

// The potato houses and what is kept in them, with this crop counted in: what will not fit is sold off the field.
export function storageLine(c: S.Campaign): string {
  const st = S.storageInfo(c)
  const over = st.stored - st.capacity
  const houses = st.houses.length === 1 ? `감자 저장고에는 ${F.mass(st.capacity)}이(가) 들어갑니다` : `감자 저장고들에 모두 ${F.mass(st.capacity)}이(가) 들어갑니다(${F.list(st.houses.map(x => `${x.name.replace(/ 감자 저장고$/, '')} ${F.mass(x.cwt)}`))})`
  return `${houses}. 이 작물을 저장하면 저장량이 ${F.mass(st.stored)}이(가) 됩니다${over > 0.5 ? `. 들어가지 못하는 ${F.mass(over)}은(는) 시즌이 끝날 때 밭에서 바로 팔립니다` : `. ${F.mass(st.free)} 더 들어갑니다`}.`
}

function ticketNo(c: S.Campaign, lot: S.Lot): string {
  return `${R.yearShort(lot.year || c.year)}-${ticketPlace(c, lot)}`
}

// ---------------------------------------------------------------- the full reckoning

// Everything behind the ticket, in the ticket's own hand: every grade and its rule, every cause in full, what never
// grew, and whether to sell or keep.
function reckoning(ctx: Ctx, lotId: number): PaperSpec {
  const c = ctx.app.campaign!
  const lot = c.lots.find(l => l.id === lotId)!
  const name = S.FIELD_NAMES[lot.field]
  const key = lotKey(c, lotId)
  const d = atDig(ctx, c, lot)
  const shown = F.massParts(d.rows.map(r => r.cwt))
  const losses = S.CAUSES.map(k => ({ k, cwt: lot.loss[k] })).filter(x => x.cwt >= 0.5).sort((a, b) => b.cwt - a.cwt)
  const lost = losses.reduce((a, x) => a + x.cwt, 0)
  const seen = ctx.memo.digSeen[key] ?? null
  const never: { head: string; cwt: number; text: string }[] = []
  const stunted = seen?.stunted ?? 0
  if (stunted >= 0.05) {
    const share = (1 - S.VIRUS_VIGOR) * stunted
    never.push({
      head: '바이러스', cwt: d.total * share / (1 - share),
      text: `${name} 포기의 ${F.pct(stunted)}가 바이러스로 위축됐고, 위축된 포기는 약 ${F.pct(1 - S.VIRUS_VIGOR)} 덜 맺습니다. 바이러스는 씨감자와 함께 들어왔습니다${c.plans[lot.field]?.seed === 'saved' ? '. 아껴 둔 종자는 두는 해마다 더 많이 옮깁니다' : ''}.`,
    })
  }
  const stand = seen?.stand ?? S.fieldInfo(c, lot.field).stand
  // Seed that rotted in cold soil is named here however little (the ticket names it only as its biggest loss).
  // Other thin stands from 8%.
  if (stand > 0 && (stand < 0.92 || !!R.coldSeed(c, lot, stand, d.total))) {
    const planted = fieldLog(c, lot.field, 'planted')[0]
    never.push({
      head: '성긴 포기', cwt: d.total * (1 - stand) / stand,
      text: `씨감자 조각의 ${F.pct(1 - stand)}가 싹이 나기 전에 썩었습니다${planted ? `(${F.date(c.year, planted.day)}에 심은 뒤)` : ''}. 씨감자는 차가운 땅에서 썩으니 흙이 ${F.temp(10)} 가까워지기를 기다리세요.`,
    })
  }
  // The growth an early kill gave up never reached any grade: the kill's own record says how much.
  const killed = fieldLog(c, lot.field, 'killed')[0]
  const gaveUp = Number(killed?.data?.lost ?? 0)
  if (killed && gaveUp > 0) {
    const early = Number(killed.data?.early ?? 0)
    never.push({
      head: '일찍 죽인 줄기', cwt: gaveUp * S.FIELD_ACRES,
      text: `${name}의 줄기를 ${F.date(c.year, killed.day)}에 죽였습니다${early > 0 ? `. 제때보다 약 ${early}일 빨랐습니다` : ''}. 감자는 줄기가 죽는 날 자라기를 멈추니, 그때까지 불렸을 분량을 놓쳤습니다. 그 나날의 날씨는 다시 돌릴 수 없어 추정치입니다.`,
    })
  }
  const st = S.storageInfo(c)
  const head = (text: string) => h('h3', { class: 'reck-h t-label' }, text)
  return {
    title: `전체 내역, ${name}`,
    kicker: `계근 전표 No. ${ticketNo(c, lot)}의 상세`,
    testid: 'reckoning',
    size: 'wide',
    cls: 'reckoning-paper',
    body: () => h('div', { class: 'reck' },
      h('p', { class: 'reck-lede' }, `${F.upper(digDatesText(c, lot))}. ${F.area(S.FIELD_ACRES)}에서 나온 ${S.variety(lot.variety).name}, 팔 수 있는 것 `,
        h('span', { class: 'stamped' }, F.mass(d.market)), ', 불량 ', h('span', { class: 'stamped' }, F.mass(d.cull)), `입니다.${F.cwtNote()}`),
      h('section', { class: 'reck-part' },
        head('등급별로'),
        d.known ? [
          gradebar(d, shown.parts),
          h('table', { class: 'losses reck-grades' },
            h('thead', { class: 'sr' }, h('tr', null, h('th', { scope: 'col' }, '등급'), h('th', { scope: 'col' }, '판매 가격'), h('th', { scope: 'col' }, '무게'), h('th', { scope: 'col' }, '비율'))),
            h('tbody', null, d.rows.map((r, k) => h('tr', null,
              h('th', { scope: 'row' }, h('i', { class: `sw ${TINT[r.key]}` }), gradeTerm(r.key)),
              h('td', { class: 'reck-note' }, gradeNote(ctx, c, lot, r.key)),
              h('td', { class: 'num' }, shown.parts[k]),
              h('td', { class: 'num share' }, d.total > 0 ? (r.cwt / d.total < 0.005 ? 'under 1%' : F.pct(r.cwt / d.total)) : ''))))),
        ] : h('p', { class: 't-caption' }, '이 작물의 등급표는 판매와 함께 넘어갔습니다.')),
      h('section', { class: 'reck-part' },
        head(losses.length ? `강등·불량 처리: ${F.mass(lost)}` : '강등되거나 불량 처리된 것 없음'),
        losses.length ? h('table', { class: 'losses reck-causes' },
          h('tbody', null, losses.map(x => h('tr', null,
            h('th', { scope: 'row' }, causeTerm(x.k)),
            h('td', { class: 'num' }, `−${F.mass(x.cwt)}`),
            h('td', null, h('span', { class: 't-label' }, x.k === 'skin' ? '강등' : CULLED.includes(x.k) ? '불량 처리' : 'No. 2로'), h('p', null, why(ctx, c, lot, x.k))))))) : h('p', null, '모든 감자가 등급을 지켰습니다. 깨끗한 수확입니다.')),
      never.length ? h('section', { class: 'reck-part' },
        head('자라지 못한 몫'),
        h('table', { class: 'losses reck-causes' },
          h('tbody', null, never.map(x => h('tr', null,
            h('th', { scope: 'row' }, x.head),
            h('td', { class: 'num' }, `약 ${F.mass(x.cwt)}`),
            h('td', null, h('span', { class: 't-label' }, '수확에 들지 않음'), h('p', null, x.text))))))) : null,
      lot.open ? h('section', { class: 'reck-part reck-keep' },
        head('지금 팔까요, 저장할까요?'),
        sellOrKeep(ctx, c, lot),
        h('p', { class: st.stored > st.capacity ? 'c-ochre' : 'quiet' }, storageLine(c)),
        S.hasBuilt(c, 'packing') ? h('p', { testid: 'store-packing' }, `겨울 동안 포장하면 No. 1은 ${F.pct(S.PACK_NO1)} 더 비싸게, B size는 No. 1 가격의 ${F.pct(S.PACK_B)}에 팔립니다. 포장비는 cwt당 ${F.money(S.PACK_CHARGE)}입니다.`) : null) : null),
    foot: close => h('button', { class: 'btn', type: 'button', testid: 'reckoning-close', autofocus: true, onclick: close }, icon('back', 'i'), '전표로 돌아가기'),
  }
}

// ---------------------------------------------------------------- dig day: the platform scale

// The dial's own units: hundreds of cwt, or tonnes.
function dialUnits(cwt: number): number {
  return F.metric() ? F.massValue(cwt) : cwt / 100
}

// The scale's capacity rounded up to a figure a maker would print, with the needle well short of it, and a step for
// the numbers round the rim that gives five to ten of them.
function capacity(gross: number): { max: number; step: number } {
  const caps = [5, 10, 20, 30, 40, 50, 60, 80, 100, 120, 150, 200, 300, 400, 500, 600, 800, 1000]
  const max = caps.find(k => gross <= k * 0.87) ?? Math.ceil(gross / 0.87 / 100) * 100
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200].find(k => max / k <= 10 && Number.isInteger(max / k)) ?? max / 10
  return { max, step }
}

let dialSeq = 0

interface Dial { el: SVGElement; set(v: number, ghosts?: [number, number] | null): void }

// The printed face of the potato house's platform scale (design/tools/dial.py, drawn live): the grades as they came
// off the grader round the rim in the printer's tints, each inked in as the needle passes it.
function dial(rows: { key: GradeKey; cwt: number }[], gross: number, inked: boolean): Dial {
  const id = `dial${++dialSeq}`
  const C = 235, A0 = -225, A1 = 45
  const g = dialUnits(gross)
  const { max, step } = capacity(g)
  const deg = (v: number) => A0 + (A1 - A0) * Math.max(0, Math.min(1, v / max))
  const pt = (v: number, r: number): [number, number] => { const a = deg(v) * Math.PI / 180; return [C + r * Math.cos(a), C + r * Math.sin(a)] }
  const f = (n: number) => n.toFixed(1)
  const arc = (v0: number, v1: number, r0: number, r1: number) => {
    const large = (v1 - v0) / max * (A1 - A0) > 180 ? 1 : 0
    const [x0, y0] = pt(v0, r1), [x1, y1] = pt(v1, r1), [x2, y2] = pt(v1, r0), [x3, y3] = pt(v0, r0)
    return `M${f(x0)} ${f(y0)}A${r1} ${r1} 0 ${large} 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${r0} ${r0} 0 ${large} 0 ${f(x3)} ${f(y3)}Z`
  }
  const mid = (v0: number, v1: number, r: number) => {
    const large = (v1 - v0) / max * (A1 - A0) > 180 ? 1 : 0
    const [x0, y0] = pt(v0, r), [x1, y1] = pt(v1, r)
    return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${large} 1 ${f(x1)} ${f(y1)}`
  }
  const INK = '#1e1c19', INK2 = '#4b463d', RED = '#9c3226'
  const pattern: Record<GradeKey, SVGElement | null> = {
    no1: s('pattern', { id: `${id}-g1`, width: 4, height: 4, patternUnits: 'userSpaceOnUse' }, s('rect', { width: 4, height: 4, fill: INK })),
    chef: s('pattern', { id: `${id}-g2`, width: 4, height: 4, patternUnits: 'userSpaceOnUse' }, s('path', { d: 'M0 1h4', stroke: INK, 'stroke-width': 1.4 })),
    b: s('pattern', { id: `${id}-g3`, width: 4, height: 4, patternUnits: 'userSpaceOnUse' }, s('circle', { cx: 2, cy: 2, r: 1.1, fill: INK })),
    no2: s('pattern', { id: `${id}-g4`, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, s('path', { d: 'M0 0v5', stroke: INK, 'stroke-width': 1.5 })),
    skinned: s('pattern', { id: `${id}-g6`, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-45)' }, s('path', { d: 'M0 0v5', stroke: INK, 'stroke-width': 1.5 })),
    cull: null,
  }
  const kids: Child[] = [
    s('defs', null, rows.map(r => pattern[r.key]), s('path', { id: `${id}-top`, d: 'M145 235a90 90 0 0 1 180 0' })),
    s('circle', { cx: C, cy: C, r: 232, fill: '#2c2620' }),
    s('circle', { cx: C, cy: C, r: 224, fill: '#f6f1e4', stroke: INK, 'stroke-width': 2 }),
    s('circle', { cx: C, cy: C, r: 160, fill: 'none', stroke: INK, 'stroke-width': 1 }),
    // The rim's track, dashed where no grade has come yet.
    s('path', { d: arc(0, max, 176, 200), fill: 'none', stroke: INK, 'stroke-width': 1, 'stroke-dasharray': '3 3' }),
  ]
  const bands: { v0: number; v1: number; fill: SVGElement | null; line: SVGElement }[] = []
  let v = 0
  for (const r of rows) {
    const w = dialUnits(r.cwt)
    const v0 = v, v1 = v + w
    v = v1
    const pat = pattern[r.key]
    const fill = pat ? s('path', { class: 'd-ink', d: mid(v0, v1, 188), fill: 'none', stroke: `url(#${pat.getAttribute('id')})`, 'stroke-width': 24, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': inked ? 0 : 1 }) : null
    const sweep = (v1 - v0) / max * (A1 - A0) * Math.PI / 180 * 208
    const label = GRADE_KO[r.key].toUpperCase()
    const [lx, ly] = pt((v0 + v1) / 2, 208)
    const named = sweep >= label.length * 8.6 + 10
      ? s('text', { x: f(lx), y: f(ly), 'text-anchor': 'middle', 'font-family': 'Gothic', 'font-size': 14, 'letter-spacing': 1.5, fill: INK, transform: `rotate(${f(deg((v0 + v1) / 2) + 90)} ${f(lx)} ${f(ly)})` }, label)
      : null
    const line = s('g', { class: `d-band${inked ? ' is-in' : ''}` },
      s('path', { d: arc(v0, v1, 176, 200), fill: 'none', stroke: INK, 'stroke-width': 1.2 }), named)
    kids.push(fill, line)
    bands.push({ v0, v1, fill, line })
  }
  // The graduations: a long mark at each half step, the figures at each step.
  const minor = step / 10
  for (let k = 0; k <= Math.round(max / minor); k++) {
    const val = k * minor
    const big = k % 5 === 0
    const [x0, y0] = pt(val, big ? 172 : 166), [x1, y1] = pt(val, 152)
    kids.push(s('line', { x1: f(x0), y1: f(y0), x2: f(x1), y2: f(y1), stroke: INK, 'stroke-width': big ? 2.2 : 1 }))
    if (k % 10 === 0) {
      const [x, y] = pt(val, 132)
      kids.push(s('text', { x: f(x), y: f(y + 9), 'text-anchor': 'middle', 'font-family': 'Gothic', 'font-size': 28, fill: INK }, String(Math.round(val * 10) / 10)))
    }
  }
  kids.push(
    s('text', { 'font-family': 'Gothic', 'font-size': 15, 'letter-spacing': 3, fill: INK2 }, s('textPath', { href: `#${id}-top`, startOffset: '50%', 'text-anchor': 'middle' }, 'FARMERS’ PLATFORM SCALE')),
    s('text', { x: C, y: C + 62, 'text-anchor': 'middle', 'font-family': 'Gothic', 'font-size': 18, 'letter-spacing': 3, fill: INK2 }, F.metric() ? '톤' : 'CWT × 100'),
    s('text', { x: C, y: C + 86, 'text-anchor': 'middle', 'font-family': 'Caslon', 'font-style': 'italic', 'font-size': 15, fill: INK2 }, `capacity ${F.metric() ? `${max} t` : F.mass(max * 100)}`))
  // The needle, drawn pointing straight up and turned; two faint places it has just swept through follow it round.
  const ghost = (op: number) => s('line', { class: 'd-ghost', x1: C, y1: C, x2: C, y2: C - 168, stroke: RED, 'stroke-width': 5, 'stroke-linecap': 'round', opacity: op })
  const ghosts = [ghost(0.12), ghost(0.22)]
  const needle = s('line', { x1: C, y1: C + 30, x2: C, y2: C - 170, stroke: RED, 'stroke-width': 5, 'stroke-linecap': 'round' })
  kids.push(ghosts, needle, s('circle', { cx: C, cy: C, r: 15, fill: INK }), s('circle', { cx: C, cy: C, r: 5, fill: RED }))
  const names = rows.map(r => GRADE_KO[r.key])
  const el = s('svg', { viewBox: '0 0 470 470', role: 'img', 'aria-label': `저울 바늘이 ${F.list(names)}를 지나 ${F.mass(gross)}까지 돌아갑니다` }, kids)
  const turn = (x: SVGElement, val: number) => x.setAttribute('transform', `rotate(${f(deg(val) + 90)} ${C} ${C})`)
  const set = (val: number, trail: [number, number] | null = null) => {
    turn(needle, val)
    ghosts.forEach((x, k) => { if (trail) { x.style.display = ''; turn(x, trail[k]) } else x.style.display = 'none' })
    for (const b of bands) {
      const p = Math.max(0, Math.min(1, (val - b.v0) / (b.v1 - b.v0 || 1)))
      b.fill?.setAttribute('stroke-dashoffset', (1 - p).toFixed(3))
      b.line.classList.toggle('is-in', val > b.v0 + 1e-6 || p >= 1)
    }
  }
  set(inked ? g : 0)
  return { el, set: (val, trail) => set(val, trail ?? null) }
}

interface Face { el: HTMLElement; slip: HTMLElement; set(f: number, trail?: [number, number] | null): void }

// The scale's face as a sheet: the dial, the violet figure counting under it, and the slot the ticket prints from.
function scaleFace(c: S.Campaign, lot: S.Lot, d: AtDig): Face {
  const name = S.FIELD_NAMES[lot.field]
  const g = dial(d.rows, d.total, false)
  const gross = dialUnits(d.total)
  const figure = h('span', { class: 'stamped' }, bare(0))
  const slip = h('div', { class: 'slip' }, h('span', null, '계근 전표'), h('span', { class: 'stamped' }, `No. ${ticketNo(c, lot)}`))
  const el = h('section', { class: 'scale-face sheet', role: 'status', 'aria-label': `${name} 계량 중, 밭에서 나온 ${F.mass(d.total)}` },
    h('p', { class: 't-label' }, `${name} · ${S.variety(lot.variety).name} · 저울 위`),
    h('div', { class: 'dial' }, g.el),
    h('p', { class: 'readout', 'aria-hidden': 'true' }, figure, h('span', { class: 't-label' }, `밭에서 나온 양(${F.massUnit()})`)),
    h('div', { class: 'printing', 'aria-hidden': 'true' }, slip))
  return {
    el, slip,
    set(f, trail) {
      g.set(gross * f, trail ? [gross * trail[0], gross * trail[1]] : null)
      figure.textContent = bare(d.total * f)
    },
  }
}

// ---------------------------------------------------------------- dig day: the weigh ticket

let stampSeq = 0

// The round violet stamp the scale house brings down on a weighed crop.
function weighedStamp(date: string, year: string): SVGElement {
  const id = `wr${++stampSeq}`
  const ring = (r: number, w: number) => s('circle', { cx: 80, cy: 80, r, fill: 'none', stroke: 'currentColor', 'stroke-width': w })
  return s('svg', { class: 'weighed', viewBox: '0 0 160 160', role: 'img', 'aria-label': `도장: 계근, ${date}, ${year}` },
    s('defs', null, s('path', { id: `${id}-t`, d: 'M26 80a54 54 0 0 1 108 0' }), s('path', { id: `${id}-b`, d: 'M30 80a50 50 0 0 0 100 0' })),
    ring(74, 4), ring(67, 1.6), ring(40, 1.6),
    s('text', { 'font-family': 'Gothic', 'font-size': 16, 'letter-spacing': 2.5, fill: 'currentColor' }, s('textPath', { href: `#${id}-t`, startOffset: '50%', 'text-anchor': 'middle' }, 'HOME POTATO HOUSE')),
    s('text', { 'font-family': 'Gothic', 'font-size': 15, 'letter-spacing': 3, fill: 'currentColor' }, s('textPath', { href: `#${id}-b`, startOffset: '50%', 'text-anchor': 'middle' }, year.toUpperCase())),
    s('text', { x: 80, y: 77, 'font-family': 'Gothic', 'font-size': 25, 'letter-spacing': 1.5, 'text-anchor': 'middle', fill: 'currentColor' }, 'WEIGHED'),
    s('text', { x: 80, y: 99, 'font-family': 'Gothic', 'font-size': 18, 'letter-spacing': 2, 'text-anchor': 'middle', fill: 'currentColor' }, date.toUpperCase()))
}

// The violet net weight arriving like a numbering machine: digit by digit, left to right, in at most 600 ms. The
// figure is set out blank at once, so nothing moves when it is struck.
function numbering(el: HTMLElement, text: string): { run(ms: number): void; done(): void } {
  const chars = [...text]
  const cells = chars.map(ch => h('span', { class: 'nm-cell nm-wait' }, ch))
  el.replaceChildren(...cells)
  const digits = cells.filter((_, k) => /\d/.test(chars[k]))
  const timers: number[] = []
  const done = () => { timers.forEach(clearTimeout); el.textContent = text }
  return {
    done,
    run(ms) {
      const each = ms / Math.max(1, digits.length)
      let shown = 0
      const strike = () => {
        // A digit and whatever stands before it since the last one struck: "1," then "3", "7", "4".
        const upTo = cells.indexOf(digits[shown])
        for (let k = 0; k <= upTo; k++) cells[k].classList.remove('nm-wait')
        digits[shown].animate([{ transform: 'translateY(-6px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: Math.min(90, each), easing: 'ease-out' })
        if (++shown < digits.length) timers.push(window.setTimeout(strike, each))
        else timers.push(window.setTimeout(done, 100))
      }
      if (digits.length) strike()
      else done()
    },
  }
}

interface Way { el: HTMLElement; key: string }

// The weigh ticket. fresh: this is dig day itself, so it wants an answer, and unless the clock was racing it is
// weighed on the scale first.
export function ticket(ctx: Ctx, lotId: number, o: { fresh: boolean; staged?: boolean }): PaperSpec | null {
  const app = ctx.app
  const c = app.campaign
  const lot = c?.lots.find(l => l.id === lotId)
  if (!c || !lot) return null
  const v = S.variety(lot.variety)
  const name = S.FIELD_NAMES[lot.field]
  const key = lotKey(c, lotId)
  const d = atDig(ctx, c, lot)
  const parts = F.massParts(d.rows.map(r => r.cwt))
  const losses = S.CAUSES.map(k => ({ k, cwt: lot.loss[k] })).filter(x => x.cwt >= 0.5).sort((a, b) => b.cwt - a.cwt)
  const est = ctx.memo.digEst[key] ?? null
  const perAcre = d.total / S.FIELD_ACRES
  const value = lot.open ? S.lotValue(app.world, c, lot) : lot.revenue
  const fresh = o.fresh
  const reveal = fresh && !!o.staged && !ctx.reduced() && d.known && d.total > 0
  const advice = S.advise(app.world, c).find(a => a.act === 'sell' && a.lot === lotId)
  const dug = digDays(c, lot)
  const inDay = weighDay(c, lot)
  const no = ticketNo(c, lot)
  // Seed that rotted in cold soil is the loss the face shows when it is the biggest; otherwise it is one press away.
  const cold = R.coldSeed(c, lot, ctx.memo.digSeen[key]?.stand ?? (c.season?.year === lot.year ? S.fieldInfo(c, lot.field).stand : null), d.total)
  const coldFirst = !!cold && (!losses.length || cold.cwt > losses[0].cwt)
  let answered = false
  let busy = false
  let worthEl: HTMLElement | null = null
  let paper: HTMLElement | null = null
  let ways: Way[] = []
  let revealing = false
  let skip: () => void = () => {}

  // While this ticket is on top its ways answer to their keys, and during the reveal any key or press skips to the end.
  const onKey = (e: KeyboardEvent) => {
    if (!paper?.isConnected) { off(); return }
    if (ctx.papers.top() !== paper || e.ctrlKey || e.metaKey || e.altKey) return
    if (revealing) { if (e.key !== 'Escape' && e.key !== 'Tab') skip(); return }
    const way = ways.find(w => w.key === e.key)
    if (way && !busy) { e.preventDefault(); way.el.click() }
  }
  const onPress = () => { if (revealing && paper && ctx.papers.top() === paper) skip() }
  const shade = () => paper?.parentElement?.querySelector<HTMLElement>(':scope > .veil')
  const off = () => {
    document.removeEventListener('keydown', onKey)
    document.removeEventListener('pointerdown', onPress, true)
  }

  // Taking a way tears its coupon off along the perforation, then the ticket goes or shows what is left.
  const tear = (el: HTMLElement, then: () => void) => {
    busy = true
    ctx.cue('tearOff')
    if (ctx.reduced()) { then(); return }
    el.classList.add('is-torn')
    const a = el.animate([
      { transform: 'none', clipPath: 'inset(-32px -4px -6px -4px)' },
      { transform: 'translateY(6px) rotate(3deg)', clipPath: 'inset(-32px 2px 3px 2px)' },
    ], { duration: 260, easing: EASE_IN, fill: 'forwards' })
    if (held('tear')) return
    a.onfinish = then
  }

  return {
    title: `계근 전표, ${name}`,
    testid: 'weighin',
    size: 'medium',
    plain: true,
    cls: `dig-paper${reveal ? ' is-reveal' : ''}`,
    sticky: fresh && lot.open,
    // A dig-day ticket still waiting when its crop has already been sold or delivered has nothing to ask.
    stale: () => (fresh && !lot.open) || app.campaign !== c || !c.lots.includes(lot),
    closeLabel: lot.open ? '저장하고 닫기' : '닫기',
    onClose: () => {
      off()
      shade()?.classList.remove('deep')
      if (!fresh || app.campaign !== c || c.phase !== 'season') return
      if (lot.open && !answered) ctx.say(`${name}에서 나온 ${F.mass(S.lotCwt(lot))}을(를) 저장고에 넣었습니다.`, 'info')
      // The decision is made: the days run again.
      if (!ctx.papers.pending()) app.resumeAfterCard()
    },
    body: close => {
      const sold = !lot.open
      const net = h('span', { class: 'stamped huge num', testid: 'ticket-weight' }, bare(d.market))
      const worth = h('span', { class: 't-figure num', testid: 'ticket-value' }, F.money(value))
      worthEl = worth
      const stampDay = inDay >= 0 ? inDay : dug.end
      const stamp = weighedStamp(F.date(lot.year, stampDay, true), R.yearName(lot.year))
      const max = est ? Math.max(500, Math.ceil(Math.max(est.hi, perAcre) / 100) * 100) : 500
      const inside = est ? perAcre >= est.lo && perAcre <= est.hi : false
      const box = h('div', { class: 'choice' })

      const tk = h('article', { class: `ticket sheet s-buff${reveal ? ' is-waiting' : ''}`, 'aria-labelledby': `tk-${lotId}` },
        h('div', { class: 'stub', role: 'img', 'aria-label': `전표 번호 ${no}, ${name}` }, h('span', null, `No. ${no} `, h('b', null, name))),
        h('div', { class: 'tk' },
          h('header', { class: 'tk-head' },
            h('div', null,
              h('p', { class: 't-label' }, icon('scale', 'i'), '집 감자 저장고'),
              h('h2', { id: `tk-${lotId}` }, '계근 전표')),
            stamp,
            fresh ? null : h('button', { class: 'close', type: 'button', 'aria-label': lot.open ? '전표 닫기' : '닫기', onclick: close }, icon('close', 'i'))),
          fresh && lot.open ? agentLine('ticket', `${c.seed}:${lot.year}:${lotId}`) : null,
          h('p', { class: 'tk-line' },
            h('span', null, h('span', { class: 't-label' }, '품종'), ' ', h('b', null, v.name)),
            h('span', null, h('span', { class: 't-label' }, '캔 날짜'), ' ', h('b', { class: 'num' }, daySpan(lot.year, dug.start, dug.end))),
            inDay > dug.end ? h('span', null, h('span', { class: 't-label' }, '날라온 날짜'), ' ', h('b', { class: 'num' }, F.date(lot.year, inDay, true))) : null),
          h('div', { class: 'tk-net' },
            h('div', { class: 'net-main' },
              h('p', { class: 'net' }, net, h('span', { class: 'unit' }, F.massUnit(), h('br'), sold ? '판매함' : '판매 가능')),
              F.cwtNote() ? h('p', { class: 'cwt-note', testid: 'ticket-cwt' }, F.cwtNote().trim()) : null),
            h('div', { class: 'net-side' },
              h('p', null, h('span', { class: 't-label' }, sold ? '판매액' : '오늘 팔면')),
              h('p', null, worth),
              h('p', { class: 'quiet num' }, est ? '' : `${F.perArea(d.market / S.FIELD_ACRES)} · `, `${F.mass(d.cull)} `, term('불량 처리', 'culls')),
              est ? [
                range({ lo: est.lo, hi: est.hi, max, mark: perAcre, label: `${expectedFrom(est.digs)} ${F.perAreaSpan(est.lo, est.hi)}, 밭에서는 ${F.perArea(perAcre)}이(가) 나왔습니다` }),
                h('p', { class: 'carried', testid: 'carried' }, `${expectedFrom(est.digs)} `, h('span', { class: 'num' }, F.perAreaSpan(est.lo, est.hi)), '. 밭에서는 ',
                  h('b', { class: 'num' }, F.perArea(perAcre).replace(` ${F.perAreaUnit()}`, '')), `이(가) 나왔습니다. ${inside ? '예상 범위 안입니다' : perAcre < est.lo ? '예상보다 적습니다' : '예상보다 많습니다'}.`),
              ] : null)),
          // The first reading: the grades as a strip and what most of it made, the one biggest loss. Every grade
          // and every loss in full is one press away, on the full breakdown.
          d.known ? h('div', { class: 'grades' },
            gradebar(d, parts.parts),
            h('p', { class: 'tk-top' }, topGrade(d))) : h('p', { class: 'grades t-caption' }, '이 작물의 등급표는 판매와 함께 넘어갔습니다.'),
          h('div', { class: 'tk-loss' },
            h('table', { class: 'losses' },
              h('caption', { class: 't-label' }, losses.length || coldFirst ? '가장 큰 손실' : '손실'),
              h('tbody', null, coldFirst ? h('tr', { testid: 'ticket-cold' },
                h('th', { scope: 'row' }, '썩은 씨감자'), h('td', { class: 'num' }, `−${F.mass(cold!.cwt)}`), h('td', null, cold!.phrase))
                : losses.length ? losses.slice(0, 1).map(x => h('tr', null,
                  h('th', { scope: 'row' }, causeTerm(x.k)), h('td', { class: 'num' }, `−${F.mass(x.cwt)}`), h('td', null, phrase(ctx, c, lot, x.k))))
                  : h('tr', null, h('td', { colspan: 3 }, '모든 감자가 등급을 지켰습니다. 깨끗한 수확입니다.')))),
            h('button', { class: 'btn quiet', type: 'button', testid: 'reckoning-open', onclick: () => ctx.papers.open(reckoning(ctx, lotId)) },
              losses.length > 1 ? '모든 등급과 손실 보기' : '모든 등급 보기')),
          box))

      let delivered = false
      // Delivering takes the No. 1 and large tubers a contract wants; what is left still has to be sold or stored.
      const draw = () => {
        busy = false
        if (!lot.open && !sold) { answered = true; close(); return }
        if (sold) {
          ways = []
          box.replaceChildren(h('p', { class: 'tk-more' }, h('button', { class: 'btn', type: 'button', testid: `lot-keep-${lot.id}`, autofocus: true, onclick: close }, '닫기')))
          return
        }
        const deal = deals(app.world, c, lot)[0]
        const now = S.lotValue(app.world, c, lot)
        if (worthEl) worthEl.textContent = F.money(now)
        const month = Math.round(S.lotCwt(lot) * S.STORE_COST)
        const st = S.storageInfo(c)
        const over = st.stored > st.capacity + 0.5
        // The farm stand sells from the newest crop weighed, whatever is chosen here.
        const s0 = c.season
        const newest = s0 ? S.standLot(c, s0) : undefined
        const stand = S.hasBuilt(c, 'stand') && newest?.id === lot.id
          ? `직판장에서 이 작물을 하루 약 ${F.mass(S.STAND_CWT)}씩 시세의 두 배에 팝니다${s0 && s0.day < S.dayIndex(c.year, S.STAND_FROM.month, S.STAND_FROM.dom) ? '(8월 1일부터)' : ''}. 가장 최근 작물인 동안 계속됩니다.`
          : ''
        const outlook = S.storeOutlook(app.world, c, lot)
        const call = storeCall(outlook)
        const best = deal && deal.pays >= deal.market - 0.5 ? 'deliver' : advice || !call.store ? 'sell' : 'store'
        // One rule (storeCall) sets the tab and its words; advice to sell (new potatoes, blight in the pile) makes selling the surer way.
        const tab = best === 'deliver' ? '가장 이득' : advice && call.store ? '더 확실' : call.tab
        let n = 0
        const k = () => String(++n)
        const list: Way[] = []
        const add = (el: HTMLElement) => { list.push({ el, key: el.getAttribute('aria-keyshortcuts') ?? '' }); return el }
        const deliverWay = deal ? add(coupon({
          icon: 'deliver', label: `${deal.k.buyer.replace(/^The /, 'the ')}에 납품`, amount: F.money(deal.pays), take: '납품', key: k(), best: best === 'deliver',
          does: `${F.mass(deal.take)}을(를) ${F.price(deal.k.price)}에, ${versusMarket(deal)}.${deal.take < deal.k.needed - 0.5 ? ` 계약량이 ${F.mass(deal.k.needed - deal.take)} 남습니다.` : ' 계약을 채웁니다.'}`,
          testid: `lot-deliver-${lot.id}`,
          onclick: e => { if (busy || !deliver(ctx, lot, deal)) return; delivered = true; tear(e.currentTarget as HTMLElement, draw) },
        })) : null
        const sellWay = add(coupon({
          icon: 'sell', label: delivered ? '나머지 판매' : '지금 판매', amount: F.money(now), take: '판매', key: k(), best: best === 'sell', bestLabel: tab,
          does: advice && !delivered ? h('span', { class: 'choice-advice' }, F.localize(advice.why)) : `오늘 US No. 1에 ${F.price(S.basePrice(app.world, c, lot.variety))}.`,
          testid: `lot-sell-${lot.id}`,
          onclick: e => { if (busy) return; answered = true; if (ctx.run({ t: 'sell', lot: lot.id, frac: 1 }).ok) tear(e.currentTarget as HTMLElement, close) },
        }))
        const storeWay = add(coupon({
          icon: 'store', label: delivered ? '나머지 저장' : fresh ? '저장하기' : '계속 저장', take: '저장', key: k(), best: best === 'store', bestLabel: tab,
          amount: [h('span', { 'aria-hidden': 'true' }, `−${F.money(month).replace('−', '')}`, h('small', null, '/월')), h('span', { class: 'sr' }, `저장 비용은 한 달에 ${F.money(month)}입니다.`)],
          does: advice ? `${call.short.replace(/\.$/, '')}. 다만 ${F.localize(advice.why)}` : call.short,
          testid: `lot-keep-${lot.id}`,
          onclick: e => { if (busy) return; answered = true; if (fresh) ctx.say(`${name}에서 나온 ${F.mass(S.lotCwt(lot))}을(를) 저장고에 넣었습니다.`, 'info'); tear(e.currentTarget as HTMLElement, close) },
        }))
        ways = list
        // After a delivery, what is left and what becomes of it if the ticket is simply closed: it goes into store.
        const left = delivered ? h('p', { class: 'tk-left', testid: 'ticket-left', role: 'status' },
          icon('deliver', 'i'), `납품했습니다. ${F.mass(S.lotCwt(lot))}이(가) 남았습니다. 팔거나 저장하세요. 전표를 닫으면(Escape) 저장됩니다.`) : null
        box.replaceChildren(...(left ? [left] : []),
          h('div', { class: `ways${deal ? '' : ' two'}`, role: 'group', 'aria-label': '작물 처리 방법' }, deliverWay, sellWay, storeWay),
          // Below the ways only what changes the choice: whether the potato house has room, the farm stand.
          h('div', { class: 'tk-more' },
            h('div', { class: 'tk-notes' },
              h('p', { class: over ? 'c-ochre' : '', testid: 'store-houses' }, over ? storageLine(c) : `저장고에 자리가 있습니다. ${F.mass(st.free)}만큼 여유가 있습니다.`),
              stand ? h('p', { class: 'choice-stand', testid: 'ticket-stand' }, icon('stand', 'i'), stand) : null)))
      }
      draw()

      const root = h('div', { class: `dig-day${reveal ? ' revealing' : ''}`, 'data-layout': ctx.layout() }, tk)
      const placeLayout = () => { if (!root.isConnected) { removeEventListener('resize', placeLayout); return } root.dataset.layout = ctx.layout() }
      addEventListener('resize', placeLayout)

      // Mounted: find the paper this sits in, listen for keys, dim the land further.
      setTimeout(() => {
        paper = root.closest<HTMLElement>('.dialog')
        if (!paper) return
        shade()?.classList.add('deep')
        document.addEventListener('keydown', onKey)
        document.addEventListener('pointerdown', onPress, true)
      }, 0)

      if (!reveal) {
        if (fresh) ctx.cue('ticket')
        return root
      }

      // The reveal (MOTION.md, "Dig day"): the scale's face laid down, the needle sweeping round the grades as the
      // figure counts, the ticket fed out of the slot, the face lifted away and the ticket laid in its place, the
      // net weight numbered and the Weighed stamp brought down.
      const face = scaleFace(c, lot, d)
      root.prepend(face.el)
      revealing = true
      stamp.classList.add('is-up')
      const numbers = numbering(net, bare(d.market))
      const timers: number[] = []
      let raf = 0
      const at = (ms: number, fn: () => void) => { timers.push(window.setTimeout(() => { if (root.isConnected) fn() }, ms)) }
      const end = () => {
        revealing = false
        timers.forEach(clearTimeout)
        cancelAnimationFrame(raf)
        numbers.done()
        face.el.remove()
        root.classList.remove('revealing')
        tk.classList.remove('is-waiting')
        stamp.classList.remove('is-up')
      }
      skip = () => { if (revealing && !held('sweep')) end() }
      face.el.animate([{ transform: 'translateY(14px)' }, { transform: 'none' }], { duration: 320, easing: EASE_PAPER })
      const SWEEP = 1400
      at(320, () => {
        // The sound runs to the same clock: a clack per band, the feed, the numbering machine, the stamp.
        ctx.cue('ticket')
        const t0 = performance.now()
        const lag = (p: number, back: number) => easeOut(Math.max(0, p - back))
        const step = (now: number) => {
          if (!root.isConnected) return
          const p = Math.min(1, (now - t0) / SWEEP)
          const fr = easeOut(p)
          if (held('sweep') && fr >= 0.72) { face.set(fr, [lag(p, 0.1), lag(p, 0.05)]); return }
          face.set(fr, p < 1 ? [lag(p, 0.1), lag(p, 0.05)] : null)
          if (p < 1) raf = requestAnimationFrame(step)
          else printed()
        }
        raf = requestAnimationFrame(step)
      })
      const printed = () => {
        const printing = face.slip.parentElement!
        at(50, () => {
          printing.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 500, easing: 'linear', fill: 'forwards' })
          face.slip.animate([{ transform: 'translateY(-100%)' }, { transform: 'none' }], { duration: 500, easing: 'linear', fill: 'forwards' })
        })
        at(550, () => {
          face.el.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-16px)', opacity: 0 }], { duration: 200, easing: EASE_IN, fill: 'forwards' })
          tk.classList.remove('is-waiting')
          tk.animate([{ transform: 'translateY(14px)' }, { transform: 'none' }], { duration: 320, easing: EASE_PAPER })
        })
        at(760, () => { face.el.remove(); root.classList.remove('revealing') })
        at(900, () => numbers.run(500))
        at(1550, () => {
          stamp.classList.remove('is-up')
          stamp.animate([{ transform: 'rotate(10deg) scale(1.2)', opacity: 0 }, { transform: 'rotate(10deg) scale(1)', opacity: 1 }], { duration: 140, easing: 'cubic-bezier(.2, .7, .2, 1)' })
        })
        at(1700, end)
      }
      return root
    },
  }
}
