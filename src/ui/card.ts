// A field's card (design/season-card.html, design/tract.html): opened beside the field (tie.ts), the field's record
// above (its meters and what is known), and its orders as real buttons, each with its key, its cost, then its catch;
// the suggested one filled ochre. An order given is answered at once: "On the list". Everything on it is about the
// field in hand: what the whole farm does (how spraying is done this season) is at the foot, with the people.
import * as S from '../sim/index.ts'
import { EXIT_MS, patch, type Ctx, type Level } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { deals, deliver, versusMarket } from './contracts.ts'
import { culledAtDig } from './dig.ts'
import { fates, ringFor } from './crew.ts'
import { isTract } from './map.ts'
import { firstName, hillWord, isJob, isStale, JOB_KEY, JOB_VERB, jobText, jobWhat, killEarly, stonesText, stonesWord, type KillEarly } from './rules.ts'
import { term } from './glossary.ts'
import { meter, order, range } from './system/parts.ts'
import { ringed } from './system/people.ts'

const MAX_ORDERS = 5
// The crop's orders, each in its own place on the card whatever the field's state.
const CROP: S.JobKind[] = ['plant', 'hill', 'scout', 'spray', 'water', 'rogue', 'sample', 'kill', 'dig']
const HOLD_MS = 1400
const FLASH_MS = 5000

// The stage as the record's caption says it.
const SHORT_STAGE: Record<string, string> = { '심음, 아직 안 나옴': '심음', '줄기 죽음, 껍질 굳는 중': '줄기 죽음', '줄기 죽음, 껍질 굳음': '줄기 죽음', '꽃피는 중': '꽃핌' }

// 흙 수분 키(sim의 영어 키)를 화면에 보일 말로.
const MOIST_WORD: Record<string, string> = { 'standing water': '물에 잠김', wet: '젖음', good: '적당함', drying: '마르는 중', dry: '마름', wilting: '시듦' }
const moistWord = (k: string) => MOIST_WORD[k] ?? k

// What a card's head says the thing is, over its name: "Potato field / North Ridge", "Woods to clear / Home Woodlot".
const TRACT_KIND: Record<S.Cover, string> = { woods: '베어낼 수림', brush: '베어낼 관목', stumps: '뽑을 그루터기', open: '개간한 땅' }
function fieldKind(f: S.FieldInfo): string {
  return f.status === 'rest' ? '쉬는 밭' : '감자밭'
}

interface Offer { kind: S.JobKind; fields: number[]; days: number; cost: number; score: number; given?: boolean }

export interface Card {
  el: HTMLElement
  update(c: S.Campaign): void
  // Gives an order to the selection, by button or by key.
  give(kind: S.JobKind, first: boolean): void
  // Gives each selected field what reference practice has for it.
  suggested(): void
  flash(text: string, level?: Level): void
}

// How much an order matters here now, to choose five when more than five can be given.
function score(kind: S.JobKind, f: S.FieldInfo, s: S.Season, suggested: boolean): number {
  if (suggested) return 100
  switch (kind) {
    case 'plant': return 90
    case 'rogue': return 80
    case 'hill': return 70
    case 'water': return f.moistureLabel === 'dry' || f.moistureLabel === 'wilting' || f.moistureLabel === 'drying' ? 65 : 20
    case 'spray': return 60
    case 'scout': return 55
    case 'sample': return 50
    case 'kill': return s.fields[f.index].matureDay >= 0 || f.blightKnown >= 0.05 || s.day >= S.dayIndex(s.year, 7, 20) ? 45 : 25
    case 'dig': return f.status === 'dead' ? 85 : 10
    case 'fell': return 75
    case 'rocks': return 40
    case 'brush': return 30
    case 'build': case 'haul': return 0
  }
}

// Care of the land beyond the crop is offered once the farm has a year behind it, or where it is badly wanted: stones
// a careful grower would pick, hedgerows that hold frost on bottom land. Felling belongs to the tracts.
function landCare(c: S.Campaign, f: S.FieldInfo, kind: S.JobKind): boolean {
  if (kind === 'fell') return isTract(f.index)
  if (kind === 'rocks') return isTract(f.index) || f.stones >= S.ROCKS_ADVISE || (c.history.length > 0 && f.stones >= 0.3)
  if (kind === 'brush') return c.history.length > 0 && f.elev === 0
  return true
}

// What the crop in barrels faces until it is hauled in.
function barrels(world: S.World, c: S.Campaign, i: number): S.HaulInfo | undefined {
  return S.haulInfo(world, c).find(x => x.field === i)
}

// An order's cost as its button prints it: the time, then the money.
function costText(days: number, cost: number): string {
  return `${F.days(days)}${cost ? ` · ${F.money(cost)}` : ''}`
}

export function commandCard(ctx: Ctx, o: { onTray: (field: number) => void; onTicket: (lot: number) => void }): Card {
  const app = ctx.app
  const el = h('section', { class: 'command sheet sys card', 'aria-label': '선택됨', testid: 'card', hidden: true })
  let page = 0
  let shownFor = ''
  let flashed: { text: string; level: Level; until: number } | null = null
  // After an order is given its button holds its place for a moment, so a second tap never lands on a neighbour.
  let held: { until: number; kinds: S.JobKind[]; given: S.JobKind[] } | null = null
  // A refused order's catch says why, in red, until the next press.
  let refused: { kind: S.JobKind; why: string; until: number } | null = null

  // The crew the orders go to, when one is picked.
  function picked(c: S.Campaign): S.Unit | null {
    return app.unit >= 0 ? c.crew.find(u => u.id === app.unit) ?? null : null
  }

  function offers(c: S.Campaign, sel: number[]): Offer[] {
    const s = c.season!
    const needs = app.needs()
    const by = new Map<S.JobKind, Offer>()
    const u = picked(c)
    for (const i of sel) {
      const f = S.fieldInfo(c, i)
      const need = needs[i]?.need?.act
      for (const a of S.fieldActions(app.world, c, i)) {
        if (!a.ok || (u && S.unitBlock(c, a.kind, u.id)) || !landCare(c, f, a.kind)) continue
        const sc = score(a.kind, f, s, need === a.kind)
        const x = by.get(a.kind)
        if (x) { x.fields.push(i); x.days += a.days; x.cost += a.cost; x.score = Math.max(x.score, sc) }
        else by.set(a.kind, { kind: a.kind, fields: [i], days: a.days, cost: a.cost, score: sc })
      }
    }
    // What is already on the list for the selection stays in its place, stamped, so the answer to an order is seen.
    for (const j of s.jobs) {
      if (!sel.includes(j.field) || by.has(j.kind) || j.kind === 'build' || j.kind === 'haul') continue
      const f = sel.length === 1 ? S.fieldInfo(c, sel[0]) : null
      by.set(j.kind, { kind: j.kind, fields: [j.field], days: 0, cost: 0, score: f ? score(j.kind, f, s, needs[sel[0]]?.need?.act === j.kind) : 5, given: true })
    }
    return S.JOBS.filter(k => by.has(k)).map(k => by.get(k)!)
  }

  function flash(text: string, level: Level = 'warn'): void {
    flashed = { text: F.localize(text), level, until: performance.now() + FLASH_MS }
    ctx.announce(flashed.text)
    setTimeout(() => ctx.dirty(), FLASH_MS + 50)
    ctx.dirty()
  }

  function give(kind: S.JobKind, first: boolean): void {
    const c = app.campaign
    if (!c || !c.season) return
    if (!app.selection.length) { ctx.say(ctx.touch() ? '먼저 밭을 고르세요. 하나를 누르고 지시하세요.' : '먼저 밭을 고르세요. 누르거나 번호 키를 누르세요.'); return }
    const u = picked(c)
    const busy = u ? S.unitBlock(c, kind, u.id) : ''
    if (u && busy) { refuse(kind, `${busy} 그 사람의 카드를 닫으면 아무나 지시를 받을 수 있습니다.`); return }
    const before = shown(offers(c, app.selection)).map(x => x.kind)
    const cold = kind === 'plant' && !!coldSoil(c, app.selection)
    const early = kind === 'kill' ? killSoon(c, app.selection) : null
    const res = app.order(kind, { first })
    const took = res.filter(r => r.ok)
    if (!took.length) {
      refuse(kind, res.length === 1 ? res[0].err : res.map(r => `${S.FIELD_NAMES[r.field]}. ${r.err}`).join(' '))
      return
    }
    flashed = null
    refused = null
    held = { until: performance.now() + HOLD_MS, kinds: held && performance.now() < held.until ? held.kinds : before, given: [...(held?.given ?? []), kind] }
    setTimeout(() => ctx.dirty(), HOLD_MS + 50)
    ctx.announce(`${F.list(took.map(r => S.FIELD_NAMES[r.field]))}의 ${JOB_VERB[kind]}이(가) 작업 목록${first ? ' 맨 앞' : ''}에 올랐습니다${u ? `, ${u.name === S.FARMER_NAME ? '당신' : u.name}에게 배정됩니다` : ''}.`)
    if (cold) flash(`${F.list(took.map(r => S.FIELD_NAMES[r.field]))}을(를) 차가운 흙에 심어 종자 일부가 싹트기 전에 썩을 수 있습니다.`, 'info')
    else if (early && took.some(r => r.field === early.field)) flash(early.did, 'info')
  }

  // An order that cannot be given says why at once: on its own button when it is on the bar, on the note otherwise.
  function refuse(kind: S.JobKind, why: string): void {
    const c = app.campaign
    const on = !!c && shown(offers(c, app.selection)).some(x => x.kind === kind)
    if (on) {
      refused = { kind, why: F.localize(why), until: performance.now() + FLASH_MS }
      ctx.announce(`${JOB_VERB[kind]}: ${refused.why}`)
      setTimeout(() => ctx.dirty(), FLASH_MS + 50)
    }
    flash(`${JOB_VERB[kind]}: ${why}`)
  }

  function suggested(): void {
    const c = app.campaign
    if (!c || !c.season) return
    if (!app.selection.length) { ctx.say(ctx.touch() ? '먼저 밭을 눌러 고르세요.' : '먼저 밭을 고르세요. 누르거나 번호 키를 누르세요.'); return }
    const fails: string[] = []
    const took: number[] = []
    for (const i of [...app.selection]) {
      const r = app.smartOrder(i)
      if (r.ok) took.push(i)
      else fails.push(app.selection.length > 1 ? `${S.FIELD_NAMES[i]}. ${r.err}` : r.err)
    }
    if (took.length) ctx.announce(`권하는 지시가 ${F.list(took.map(i => S.FIELD_NAMES[i]))}의 작업 목록에 올랐습니다.`)
    else flash(fails.join(' '), 'info')
  }

  // The five to show, in the order of the season.
  function shown(all: Offer[]): Offer[] {
    if (all.length <= MAX_ORDERS) return all
    const top = [...all].sort((a, b) => b.score - a.score).slice(0, MAX_ORDERS).map(x => x.kind)
    return all.filter(x => page === 0 ? top.includes(x.kind) : !top.includes(x.kind))
  }

  // An order's catch, in a few words: why now for the suggested one, what stands against it for the rest.
  function catchFor(c: S.Campaign, kind: S.JobKind, f: S.FieldInfo | null, suggestedWhy: string): string {
    if (suggestedWhy) return suggestedWhy
    if (!f) return jobWhat(kind)
    switch (kind) {
      case 'plant': { const hold = app.needs()[f.index]?.hold; return F.localize(hold ? hold.why : S.plantReady(app.world, c, f.index).why) }
      case 'hill': return f.hillPasses > 0 ? `북주기 ${hillWord(f.hillPasses)}.` : '아직 북주기 전입니다.'
      case 'scout': return f.scoutAge < 0 ? '아직 살펴보지 않았습니다.' : `마지막 살펴보기: ${F.ago(f.scoutAge)}.`
      case 'spray': return f.protect > 0.02 ? `살포 보호가 ${F.pct(f.protect)} 남았습니다.` : '잎에 살포 보호가 없습니다.'
      case 'water': return `흙은 ${moistWord(f.moistureLabel)}입니다.`
      case 'rogue': return f.blightHills > 0 ? `포기 ${f.blightHills}개에 역병이 보입니다.` : jobWhat(kind)
      case 'sample': return '작물을 볼 수 있는 유일한 방법입니다.'
      case 'kill': return c.season!.fields[f.index].matureDay < 0 && f.blightKnown < 0.05 ? '너무 이릅니다. 줄기를 죽이면 작물이 자라는 것이 멈춥니다.' : `생장이 멈추고 ${S.SKIN_DAYS}일이면 껍질이 굳습니다.`
      case 'dig': return f.skin >= 1 ? '껍질이 굳었습니다.' : `껍질이 ${F.pct(f.skin)}만 굳어 멍이 듭니다.`
      case 'fell': return c.phase === 'season' ? '시즌에는 절반 속도이고, 겨울에 남겨둔 사람은 온전한 속도입니다.' : jobWhat(kind)
      case 'rocks': return f.stones > 0.05 ? `${F.upper(stonesText(f.stones))}.` : jobWhat(kind)
      case 'brush': return '역병 날씨와 서리가 줄지만 다시 자랍니다.'
      default: return jobWhat(kind)
    }
  }

  function orderRow(c: S.Campaign, sel: number[], suggestedKind: S.JobKind | null, why: string, extra: HTMLElement[] = []): Child {
    const all = offers(c, sel)
    const now = performance.now()
    if (held && now >= held.until) held = null
    if (refused && now >= refused.until) refused = null
    const live = shown(all)
    const kinds = held ? held.kinds : live.map(x => x.kind)
    const touch = ctx.touch()
    const f = sel.length === 1 ? S.fieldInfo(c, sel[0]) : null
    const cells = kinds.map(kind => {
      const x = all.find(y => y.kind === kind)
      const given = !!x?.given || !!held?.given.includes(kind)
      if (!x || given) {
        return order({ key: touch ? '' : JOB_KEY[kind], icon: kind, name: JOB_VERB[kind], given: true, catch: catchFor(c, kind, f, ''), testid: `order-${kind}-given`, attrs: { 'data-k': `order-${kind}`, tabindex: '-1', 'aria-disabled': 'true' } })
      }
      const part = x.fields.length < sel.length ? ` ${sel.length}개 중 ${x.fields.length}개` : ''
      const no = refused?.kind === kind
      return order({
        key: touch ? '' : JOB_KEY[kind], icon: kind, name: [JOB_VERB[kind], part ? h('span', { class: 'order-part num' }, part) : null],
        cost: kind === 'fell' || kind === 'rocks' || kind === 'brush' ? `${F.num(Math.ceil(x.days))}인일${x.cost ? ` · ${F.money(x.cost)}` : ''}` : costText(x.days, x.cost), catch: no ? refused!.why : catchFor(c, kind, f, kind === suggestedKind ? why : ''), suggested: kind === suggestedKind, refused: no,
        testid: `order-${kind}`, title: touch ? undefined : jobWhat(kind), said: jobWhat(kind),
        onclick: (e: Event) => give(kind, (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey),
        attrs: { 'data-k': `order-${kind}`, oncontextmenu: (e: Event) => { e.preventDefault(); give(kind, true) } },
      })
    })
    const u = picked(c)
    const who = u ? h('p', { class: 'order-who' }, ringed(u, ringFor(c, u.id), 26), h('span', null, '지시는 ', h('b', null, u.kind === 'farmer' ? '당신에게' : `${firstName(u.name)}에게`))) : null
    const more = all.length > MAX_ORDERS && !held ? h('button', {
      class: 'btn quiet order-more', type: 'button', testid: 'order-more', 'aria-pressed': String(page === 1),
      onclick: () => { page = page === 0 ? 1 : 0; ctx.dirty() },
    }, icon(page === 0 ? 'more' : 'back', 'i'), page === 0 ? `지시 ${all.length - MAX_ORDERS}개 더` : '앞의 지시로') : null
    const room = extra.slice(0, Math.max(0, MAX_ORDERS - cells.length))
    return cells.length || more || room.length || who ? h('div', { class: 'orders', role: 'group', 'aria-label': u ? `지시 대상: ${u.name === S.FARMER_NAME ? '당신' : u.name}` : '지시' }, who, cells, room, more) : null
  }

  // The crop's nine orders in fixed places: one that can be given, one on the list (stamped), or one that cannot be
  // given now, greyed, its reason said under the pointer, on focus, and on a press. say: the line under them, which
  // shows the catch of the order under the pointer and goes back to what it said.
  function slots(c: S.Campaign, sel: number[], suggestedKind: S.JobKind | null, why: string): { el: HTMLElement; canAny: boolean; wire(say: HTMLElement): void } {
    const s = c.season!
    const now = performance.now()
    if (refused && now >= refused.until) refused = null
    const touch = ctx.touch()
    const u = picked(c)
    const f = sel.length === 1 ? S.fieldInfo(c, sel[0]) : null
    const acts = sel.map(i => S.fieldActions(app.world, c, i))
    const tell: { el: HTMLElement; text: string }[] = []
    let canAny = false
    const cells = CROP.map(kind => {
      const mine = acts.map(a => a.find(x => x.kind === kind)!)
      const busy = u ? S.unitBlock(c, kind, u.id) : ''
      const can = sel.filter((_, k) => mine[k].ok && !busy)
      const listed = sel.filter(i => s.jobs.some(j => j.field === i && j.kind === kind))
      const key = touch ? '' : JOB_KEY[kind]
      const attrs = (cls = '') => ({ 'data-k': `order-${kind}`, class: `slot${cls}` })
      let el: HTMLElement
      let text: string
      if (!can.length && listed.length) {
        text = catchFor(c, kind, f, '')
        el = order({ key, icon: kind, name: JOB_VERB[kind], given: true, catch: '', said: text, testid: `order-${kind}-given`, attrs: { ...attrs(), 'aria-disabled': 'true' } })
      } else if (!can.length) {
        text = busy || F.localize(mine.find(x => !x.ok)?.why ?? '') || jobWhat(kind)
        el = order({
          key, icon: kind, name: JOB_VERB[kind], catch: '', said: `지금은 지시할 수 없습니다. ${text}`, testid: `order-${kind}-off`, title: touch ? undefined : text,
          attrs: attrs(' is-off'), onclick: () => refuse(kind, text),
        })
      } else {
        canAny = true
        const days = can.reduce((t, i) => t + mine[sel.indexOf(i)].days, 0)
        const cost = can.reduce((t, i) => t + mine[sel.indexOf(i)].cost, 0)
        const part = can.length < sel.length ? ` ${sel.length}개 중 ${can.length}개` : ''
        const no = refused?.kind === kind
        // Planting in cold ground and killing vines before they are due can be ordered, and the stamp says plainly
        // what each risks.
        const cold = kind === 'plant' ? coldSoil(c, can) : ''
        const early = kind === 'kill' ? killSoon(c, can) : null
        const risk = cold || early?.why || ''
        text = no ? refused!.why : risk || catchFor(c, kind, f, kind === suggestedKind ? why : '')
        el = order({
          key, icon: kind, name: [JOB_VERB[kind], part ? h('span', { class: 'order-part num' }, part) : null],
          cost: cold ? `너무 추움${cost ? ` · ${F.money(cost)}` : ''}` : early ? early.short : costText(days, cost), catch: '',
          suggested: kind === suggestedKind, refused: no, testid: `order-${kind}`, title: touch ? undefined : risk ? `${risk} ${costText(days, cost)}.` : jobWhat(kind), said: `${jobWhat(kind)} ${text}`,
          onclick: (e: Event) => give(kind, (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey),
          attrs: { ...attrs(), class: `slot${risk ? ' is-risk' : ''}`, oncontextmenu: (e: Event) => { e.preventDefault(); give(kind, true) } },
        })
      }
      tell.push({ el, text })
      return el
    })
    const who = u ? h('p', { class: 'order-who' }, ringed(u, ringFor(c, u.id), 26), h('span', null, '지시는 ', h('b', null, u.kind === 'farmer' ? '당신에게' : `${firstName(u.name)}에게`))) : null
    const el = h('div', { class: 'orders slots', role: 'group', 'aria-label': u ? `지시 대상: ${u.name === S.FARMER_NAME ? '당신' : u.name}` : '지시' }, who, cells)
    return {
      el, canAny,
      wire(say: HTMLElement) {
        const base = [...say.childNodes]
        const back = () => { say.replaceChildren(...base); say.classList.remove('is-telling') }
        for (const t of tell) {
          const show = () => { say.replaceChildren(t.text); say.classList.add('is-telling') }
          t.el.addEventListener('pointerenter', e => { if ((e as PointerEvent).pointerType === 'mouse') show() })
          t.el.addEventListener('pointerleave', back)
          t.el.addEventListener('focus', show)
          t.el.addEventListener('blur', back)
        }
      },
    }
  }

  // Why planting now is a risk, with the day the soil should be warm enough; empty once the soil is fit (or only wet).
  function coldSoil(c: S.Campaign, fields: number[]): string {
    const s = c.season!
    const early = s.day < S.dayIndex(s.year, S.PLANT_FROM.month, S.PLANT_FROM.dom)
    const cold = fields.map(i => S.plantReady(app.world, c, i)).find(pr => !pr.ok && (early || pr.soilT < pr.need))
    return cold ? `${F.localize(cold.why)} 지금 심을지는 당신이 정합니다.` : ''
  }

  // Killing the vines before they are due, for the fields where the coach is not asking for it (blight winning): the
  // worst field's cost, or null when none gives up enough to say.
  function killSoon(c: S.Campaign, fields: number[]): KillEarly | null {
    return killEarly(app.world, c, fields.filter(i => app.needs()[i]?.need?.act !== 'kill'))
  }

  // Care of the land beside the crop's orders, when it is wanted: rocks, hedgerows, tile drains.
  function landRow(c: S.Campaign, i: number): HTMLElement | null {
    const f = S.fieldInfo(c, i)
    const kinds = (['rocks', 'brush'] as S.JobKind[]).filter(k => landCare(c, f, k))
    const acts = S.fieldActions(app.world, c, i)
    const u = picked(c)
    const touch = ctx.touch()
    const cells: HTMLElement[] = kinds.map(kind => {
      const a = acts.find(x => x.kind === kind)!
      const ok = a.ok && !(u && S.unitBlock(c, kind, u.id))
      return order({
        key: touch ? '' : JOB_KEY[kind], icon: kind, name: JOB_VERB[kind], cost: ok ? `${F.num(Math.ceil(a.days))}인일${a.cost ? ` · ${F.money(a.cost)}` : ''}` : undefined,
        catch: ok ? catchFor(c, kind, f, '') : F.localize(a.why), title: touch ? undefined : ok ? catchFor(c, kind, f, '') : F.localize(a.why), testid: ok ? `order-${kind}` : `order-${kind}-off`,
        attrs: { 'data-k': `order-${kind}`, class: ok ? '' : 'is-off', 'aria-disabled': ok ? null : 'true' },
        onclick: () => (ok ? give(kind, false) : refuse(kind, F.localize(a.why))),
      })
    })
    if (c.history.length > 0) { const t = contractor(c, i, 'tile'); if (t) cells.push(t) }
    return cells.length ? h('div', { class: 'orders land-orders', role: 'group', 'aria-label': '땅' }, cells) : null
  }

  // A contractor's job, ordered and paid for at once: stumps pulled, tile laid.
  function contractor(c: S.Campaign, i: number, kind: 'stump' | 'tile'): HTMLElement | null {
    const why = kind === 'stump' ? S.stumpBlock(c, i) : S.tileBlock(c, i)
    const fee = kind === 'stump' ? S.STUMP_FEE : S.TILE_FEE
    const days = kind === 'stump' ? S.STUMP_DAYS : S.TILE_DAYS
    // Stumps the tract is ready for are always on its bar: ordered, or with why not, never missing.
    if (why) return kind === 'stump' && S.tractInfo(c).find(t => t.field === i)?.stage === 'stump'
      ? order({ key: '', icon: kind, name: '그루터기 뽑기', cost: `${F.money(fee)} · ${days}일`, catch: F.localize(why), refused: true, disabled: true, testid: 'order-stump' }) : null
    return order({
      key: '', icon: kind, name: kind === 'stump' ? '그루터기 뽑기' : '암거 배수관', cost: `${F.money(fee)} · ${days}일`,
      catch: kind === 'stump' ? '불도저를 가진 전문 업자가 뽑습니다.' : '밭이 비탈처럼 물이 빠지지만 가뭄에 수분을 조금 덜 머금습니다.', testid: `order-${kind}`,
      onclick: () => { const r = ctx.run({ t: kind, field: i }); if (r.ok) ctx.announce(F.localize(r.events[0]?.text ?? '')) },
    })
  }

  // The land under the crop, where it matters: stones, shelter, barrels waiting to be hauled.
  function landLines(c: S.Campaign, f: S.FieldInfo): HTMLElement[] {
    const parts: HTMLElement[] = []
    const haul = barrels(app.world, c, f.index)
    if (haul) {
      const who = haul.hauler >= 0 ? c.crew.find(u => u.id === haul.hauler) : undefined
      parts.push(h('p', { class: haul.frostChance >= 30 ? 'c-red' : '', testid: 'barrels' }, icon('haul', 'i'),
        h('span', null, F.metric() ? F.mass(haul.cwt) : term(F.mass(haul.cwt), 'cwt'), `을(를) 광주리에 담음${who ? `, ${who.kind === 'farmer' ? '당신이' : `${firstName(who.name)}이(가)`} 날라오는 중` : haul.digging ? '' : ', 날라오길 기다리는 중'}${haul.frostChance >= 30 ? `. 오늘 밤 서리 확률 ${haul.frostChance}%` : ''}`)))
    }
    if (f.works) parts.push(h('p', null, icon(f.works.kind, 'i'), h('span', null, `${f.works.kind === 'stump' ? '그루터기 뽑는 중' : '암거 배수관 묻는 중'}, ${f.works.left}일 남음`)))
    if (f.stones >= 0.4 || (c.history.length > 0 && f.stones >= 0.3)) parts.push(h('p', { class: 'quiet', testid: 'stones' }, icon('rocks', 'i'), h('span', null, `${F.upper(stonesWord(f.stones))}: ${stonesText(f.stones)}`)))
    if (f.sheltered && f.status !== 'dug') parts.push(h('p', { class: 'quiet', testid: 'shelter' }, icon('woods', 'i'), h('span', null, `${f.shelteredBy}이(가) 가려줘 바람은 적지만 역병 날씨는 많습니다`)))
    if (f.brushed > 0) parts.push(h('p', { class: 'quiet' }, icon('brush', 'i'), h('span', null, `산울타리를 잘랐고 ${f.brushed}년이면 다시 자랍니다`)))
    if (f.raw && f.status !== 'off') parts.push(h('p', { class: 'quiet' }, icon('idle', 'i'), h('span', null, '새 땅이라 첫 감자 수확이 적습니다')))
    return parts
  }

  function headWith(label: string, title: string, sub: Child): HTMLElement {
    return h('header', { class: 'command-head' },
      h('div', null, h('p', { class: 't-label' }, label), h('h2', { class: 't-title', testid: 'card-title' }, title), h('p', { class: 't-caption' }, sub)),
      h('button', { class: 'close', type: 'button', testid: 'card-close', 'data-k': 'close', 'aria-label': `선택 해제${ctx.touch() ? '' : ' (Esc)'}`, onclick: () => app.select(-1) }, icon('close', 'i')))
  }

  function head(label: string, title: string, sub: string): HTMLElement {
    return h('header', { class: 'command-head' },
      h('div', null, h('p', { class: 't-label' }, label), h('h2', { class: 't-title', testid: 'card-title' }, title), sub ? h('p', { class: 't-caption' }, sub) : null),
      h('button', { class: 'close', type: 'button', testid: 'card-close', 'data-k': 'close', 'aria-label': `선택 해제${ctx.touch() ? '' : ' (Esc)'}`, onclick: () => app.select(-1) }, icon('close', 'i')))
  }

  // What the bar has to say beyond its orders: a refusal, why a field waits, why nothing can be done. Empty otherwise.
  function note(text: Child, cls = ''): HTMLElement {
    return h('p', { class: `note card-line${cls ? ` ${cls}` : ''}`, testid: 'card-line', role: cls.includes('flash') ? 'status' : null }, text || null)
  }

  function adviceLine(c: S.Campaign, sel: number[], canAny: boolean): HTMLElement {
    if (flashed && performance.now() < flashed.until) return note(flashed.text, `flash lv-${flashed.level}`)
    const s = c.season!
    const needs = app.needs()
    if (sel.length === 1) {
      const i = sel[0]
      const { need, hold } = needs[i] ?? { need: null, hold: null }
      if (need && need.act === 'sell') return note([h('b', null, '파세요. '), F.localize(need.why)])
      if (need && isJob(need.act)) return note('')
      // Why a field waits to be planted is said once, in the planting rule's own sentence.
      // (work the crew does by itself is said once, in the crew's line below: not in a paragraph of its own here)
      if (hold && hold.act === 'wait' && /작업 목록에 자동으로 오릅니다\.$/.test(hold.text)) return note('')
      if (hold) return note(S.fieldInfo(c, i).status === 'idle' ? F.localize(hold.why) : `${F.localize(hold.text)} ${F.localize(hold.why)}`)
      if (!canAny) {
        const f = S.fieldInfo(c, i)
        const job = s.jobs.find(j => j.kind === 'dig' && j.field === i)
        return note(s.frozen ? '땅이 얼어 밭에서는 더 할 일이 없습니다.'
          : f.status === 'rest' ? `가을에 ${F.money(S.REST_INCOME)}을(를) 벌고 흙을 회복합니다.`
            : f.status === 'planted' ? '심었습니다. 싹이 나기까지 할 일이 없습니다.'
              : f.status === 'digging' ? `캐는 중이며 지금까지 줄의 ${job ? F.pct(job.done / job.need) : '일부'}를 냈습니다. 다 날라오면 계근 전표를 받습니다.`
                : f.status === 'lost' ? '이 작물은 잃었습니다.'
                  : picked(c) ? nothingFor(picked(c)!)
                    : '이 밭에 필요한 일은 모두 작업 목록에 있습니다.')
      }
      return note('')
    }
    const want = sel.filter(i => isJob(needs[i]?.need?.act))
    if (want.length) return note(`${F.list(want.map(i => S.FIELD_NAMES[i]))}에 권하는 지시가 있습니다. ${ctx.touch() ? '도장을 눌러 지시하세요.' : 'Enter를 눌러 각 밭에 지시하세요.'}`)
    if (!canAny) return note(s.frozen ? '땅이 얼어 밭에서는 더 할 일이 없습니다.' : picked(c) ? nothingFor(picked(c)!) : '지금은 이 밭들 어디에도 지시할 수 없습니다.')
    return note('')
  }

  function nothingFor(u: S.Unit): string {
    return `지금 여기서 ${u.kind === 'farmer' ? '당신이' : `${u.name}이(가)`} 할 수 있는 일이 없습니다.`
  }

  function gauges(c: S.Campaign, f: S.FieldInfo): HTMLElement {
    const s = c.season!
    const watch = s.watchDay >= 0
    const waterKind = f.moistureLabel === 'wilting' ? 'bad' : f.moistureLabel === 'dry' ? 'warn' : f.tooWet ? 'wet' : undefined
    const waterWord = moistWord(f.moistureLabel)
    const bare = watch && f.protect < 0.35 && f.status === 'growing'
    // What the soil's state means for the crop, under the pointer (a first-time player watched fields "flooded" for
    // two weeks with nothing to say whether that hurt).
    const WATER_SAYS: Partial<Record<S.Moisture, string>> = {
      'standing water': '큰비 뒤 고인 물입니다. 빠질 때까지(보통 며칠) 작물이 더디 자라고 기계가 밭에 못 들어갑니다.',
      wet: '오늘은 기계가 못 들어갈 만큼 젖었습니다. 비가 없으면 하루 이틀이면 마릅니다.',
      drying: '마르기 시작했습니다. 아직 해는 없습니다.',
      dry: '마른 흙은 생장을 늦추고, 감자가 맺히는 동안에는 더부룩병을 부릅니다. 비나 물주기로 해결합니다.',
      wilting: '작물이 시들고 있어 비가 오거나 물을 주기까지 매일 수확이 줍니다.',
    }
    const GKEY: Record<string, string> = { 잎: 'leaf', 물: 'water', 보호: 'protection', 북주기: 'hilled' }
    const cell = (label: string, value: string, m: HTMLElement, cls = '', says?: string) => h('div', { class: `gauge${cls ? ` ${cls}` : ''}`, title: says && !ctx.touch() ? says : undefined }, h('span', { class: 't-label' }, term(label, GKEY[label] ?? label)), h('b', null, value), m)
    return h('div', { class: 'gauges' },
      cell('잎', F.pct(f.canopy), meter(f.canopy, { label: '잎이 덮은 정도' })),
      cell('물', waterWord, meter(Math.min(1, f.moisture), { label: '흙 수분', text: `${moistWord(f.moistureLabel)}, 작물이 쓸 수 있는 양의 ${F.pct(f.moisture)}`, kind: waterKind }), waterKind === 'wet' ? '' : waterKind ?? '', WATER_SAYS[f.moistureLabel]),
      cell('보호', f.protect > 0.02 ? F.pct(f.protect) : '없음', meter(f.protect, { label: '잎 위 살포 보호', kind: bare ? (f.protect < 0.05 ? 'bad' : 'warn') : undefined }), bare ? (f.protect < 0.05 ? 'bad' : 'warn') : ''),
      cell('북주기', f.hillPasses >= 2 ? '두 번' : f.hillPasses === 1 ? '한 번' : '아직', meter(f.hillPasses / 2, { label: '북주기', text: hillWord(f.hillPasses), half: true })))
  }

  // Blight as last seen, and how old that is; before the rows are up, the soil; once the vines are dead, the skins.
  function known(c: S.Campaign, f: S.FieldInfo): HTMLElement[] {
    const s = c.season!
    const coach = app.needs()[f.index]?.hold ?? (app.needs()[f.index]?.need?.act === 'plant' ? app.needs()[f.index]?.need : null)
    if (f.status === 'idle' && coach && /°/.test(F.localize(`${coach.text} ${coach.why}`))) return []
    // The one planting rule (S.plantReady), the same the coach and the routine go by.
    if (f.status === 'idle' || f.status === 'planted') {
      // The reading only: why it matters is said once, on the line under the orders.
      return [h('p', null, icon('planted', 'i'), h('span', null, `이곳 흙 온도는 ${F.temp(S.plantReady(app.world, c, f.index).soilT)}입니다.`))]
    }
    if (f.status === 'dead') {
      const left = Math.ceil((1 - f.skin) * S.SKIN_DAYS)
      return [h('p', null, icon('dead', 'i'), h('span', null, f.skin >= 1 ? '껍질이 굳었습니다.' : `껍질이 ${F.pct(f.skin)} 굳었고 약 ${left}일 남았습니다.`))]
    }
    if (f.status === 'digging') {
      const job = s.jobs.find(j => j.kind === 'dig' && j.field === f.index)
      return [h('p', null, icon('dig', 'i'), h('span', null, `줄의 ${job ? F.pct(job.done / job.need) : '일부'}를 냈습니다.`))]
    }
    const age = f.scoutAge
    const stale = isStale(f)
    const seen = f.blightHills > 0 || f.blightSeen
    const pull = f.pullBy === 'you' ? ', 뽑는 것은 당신 몫' : f.pullBy ? ', 일꾼들이 알아서 뽑습니다' : ''
    const blight = h('p', { class: `${seen ? 'c-red blight' : ''}${stale ? ' stale' : ''}`.trim(), testid: 'blight-reading' },
      icon(seen ? (stale ? 'blight-old' : 'blight') : stale ? 'stale' : 'check', 'i'),
      h('span', null, f.blightHills > 0 ? `포기 ${f.blightHills}개에 역병${pull}` : seen ? '여기서 역병을 봤습니다' : age < 0 ? '아직 살펴보지 않음' : '역병이 보이지 않음'),
      age >= 0 ? h('span', { class: 'quiet' }, `· 살펴봄: ${F.ago(age)}`) : seen ? h('span', { class: 'quiet' }, '· 길에서 봄') : null)
    const e = f.estimate
    if (!e) return [blight, h('p', { class: 'quiet' }, icon('bulk', 'i'), h('span', null, '감자가 맺히기까지 수확 추정이 없습니다.'))]
    const max = Math.max(500, Math.ceil(e.hi / 100) * 100)
    const sample = [...(c.season?.log ?? [])].reverse().find(x => x.type === 'sample' && x.field === f.index)
    return [blight, h('p', { class: 'estimate', testid: 'estimate' }, icon('bloom', 'i'), h('b', { class: 'num' }, F.metric() ? F.perAreaSpan(e.lo, e.hi) : term(F.perAreaSpan(e.lo, e.hi), 'cwt/acre')),
      range({ lo: e.lo, hi: e.hi, max, label: `수확 추정 ${F.perAreaSpan(e.lo, e.hi)}, ${e.digs ? `시험 캐기 ${e.digs}회 기준` : '추정'}` }),
      sample ? h('button', {
        class: 'btn quiet est-by', type: 'button', testid: 'sample-again', 'aria-label': `${F.date(c.year, sample.day)}의 시험 캐기 보기`, title: ctx.touch() ? undefined : `${F.date(c.year, sample.day)}의 시험 캐기 보기`,
        onclick: () => o.onTray(f.index),
      }, icon('sample', 'i'), e.digs ? '시험 캐기' : '추정') : h('span', { class: 'quiet' }, '추정'))]
  }

  // A tract: where its clearing stands, what it takes and yields, and the orders that move it on.
  function tractBody(c: S.Campaign, i: number): Child {
    const t = S.tractInfo(c).find(x => x.field === i)!
    const f = S.fieldInfo(c, i)
    const cropped = t.stage === 'done' && f.status !== 'off'
    const at = t.stage === 'fell' ? 0 : t.stage === 'stump' ? 1 : t.stage === 'rocks' ? 2 : 3
    const steps = ['벌목', '그루터기', '돌', '밭']
    const logs = t.timber * (1 - t.felled) * (S.FELL_YIELD_BASE + S.FELL_YIELD_PER * 5)
    const stone = S.ROCKS_LOADS * Math.min(t.stones, S.ROCKS_TAKE)
    const extra = [contractor(c, i, 'stump')].filter((x): x is HTMLElement => !!x)
    const sugg = t.stage === 'fell' ? 'fell' : t.stage === 'rocks' ? 'rocks' : null
    const rows = orderRow(c, [i], sugg, '', extra)
    const next = t.works ? `불도저가 그루터기를 뽑는 중이며 ${t.works.left}작업일 남았습니다.` : t.next ? `다음: ${F.localize(t.next).replace(/^./, x => x.toLowerCase())}` : f.status === 'off' ? '개간했습니다. 내년 봄에 심을 수 있지만 먼저 귀리와 클로버로 한 해 보내면 새 땅이 좋아집니다.' : ''
    return [
      head(TRACT_KIND[f.cover], t.name, `${F.upper(t.coverWord)}. ${t.tenure === 'none' ? `${F.money(t.price)}에 판매 중입니다.` : S.PARCELS[i].block === 'home' ? '집터 농장의 일부입니다.' : '농장 소유입니다.'}`),
      h('ol', { class: 'steps', testid: 'clear-track', 'aria-label': `개간: ${cropped ? '다시 밭' : ['그대로', '벌목함', '그루터기 뽑음', '돌 주움'][at]}, ${steps.length}단계 중 ${at + 1}단계` },
        steps.map((st, k) => h('li', { class: k < at || cropped ? 'done' : k === at ? 'now' : '' }, st))),
      h('div', { class: 'readings' },
        t.stage === 'fell' ? h('p', null, icon('woods', 'i'), h('span', null, `${F.pct(t.felled)} 벌목`), meter(t.felled, { label: '벌목', text: `${F.pct(t.felled)} 벌목` })) : null,
        t.stage === 'fell' ? h('p', null, icon('logs', 'i'), h('span', null, '통나무 약 ', h('b', { class: 'num' }, `${Math.round(logs)}짐`), `, 제재소에서 ${F.money(Math.round(logs) * S.LOG_PRICE)}`)) : null,
        t.stage === 'rocks' ? h('p', null, icon('stone', 'i'), h('span', null, '자연석 약 ', h('b', { class: 'num' }, `${Math.round(stone)}짐`))) : null,
        t.shelters.length ? h('p', { class: 'wrap' }, icon('leaf', 'i'), h('span', null, `${F.list(t.shelters.map(x => S.FIELD_NAMES[x]))}을(를) 가려줘 수분 손실이 적지만 역병 날씨는 많아집니다.`)) : null,
        t.tenure === 'none' ? h('p', null, icon('land', 'i'), h('span', null, `봄에 ${F.money(t.price)}에 살 수 있습니다.`)) : null),
      rows,
      !rows && t.tenure !== 'none' ? note(queuedHere(c, i)) : null,
      next ? h('p', { class: 'note' }, next) : null,
    ]
  }

  // What is on the list for a tract, in words, when nothing more can be ordered there.
  function queuedHere(c: S.Campaign, i: number): string {
    const jobs = c.season?.jobs.filter(j => j.field === i) ?? []
    if (!jobs.length) return c.phase === 'season' ? '지금 여기서 더 할 수 있는 일이 없습니다.' : ''
    const who = jobs.map(j => c.crew.find(u => u.job === j.id)).find(Boolean)
    return `${jobText(jobs[0])}이(가) 작업 목록에 있습니다${who ? `, ${who.kind === 'farmer' ? '당신이' : `${firstName(who.name)}이(가)`} 하는 중입니다` : ''}.`
  }

  function one(c: S.Campaign, i: number): Child {
    const f = S.fieldInfo(c, i)
    if (isTract(i) && (f.cover !== 'open' || f.status === 'off')) return tractBody(c, i)
    const need = app.needs()[i]?.need
    const lot = f.lot >= 0 ? c.lots.find(l => l.id === f.lot) : undefined
    const land = landLines(c, f)
    if (f.status === 'dug' && lot && !f.weighed) {
      return [head(fieldKind(f), f.name, `${f.variety}, 캐서 나르는 중`), land.length ? h('div', { class: 'readings' }, land) : null, note('마지막 광주리가 감자 저장고에 들어가면 계근 전표를 받습니다.')]
    }
    if (f.status === 'dug' && lot) {
      const value = lot.open ? S.lotValue(app.world, c, lot) : 0
      const cull = culledAtDig(lot)
      const deal = deals(app.world, c, lot)[0]
      return [
        head(fieldKind(f), f.name, `${f.variety}, ${F.date(c.year, lot.dugDay, true)}에 캠`),
        h('div', { class: 'readings' },
          h('p', { class: 'wrap' }, icon('dig', 'i'), h('span', null, lot.open
            ? `저장고에 ${F.mass(S.lotCwt(lot))}, 오늘 값 ${F.money(value)}입니다.${lot.sold > 0 ? ` ${F.mass(lot.sold)}을(를) ${F.money(lot.revenue)}에 팔았습니다.` : ''}`
            : lot.sold > 0 ? `${F.mass(lot.sold)}을(를) ${F.money(lot.revenue)}에 팔고 ${F.mass(cull)}을(를) 골라냈습니다.` : '팔 만한 것이 하나도 없었습니다.'))),
        h('div', { class: 'orders', role: 'group', 'aria-label': '작물' },
          deal ? order({ key: '', icon: 'deliver', name: `${deal.k.buyer.replace(/^The /, 'the ')}에 납품`, cost: F.money(deal.pays), catch: `${F.mass(deal.take)}, ${versusMarket(deal)}.`, suggested: true, testid: `field-deliver-${lot.id}`, onclick: () => deliver(ctx, lot, deal) }) : null,
          lot.open ? order({ key: '', icon: 'sell', name: deal ? '모두 팔기' : '팔기', cost: F.money(value), catch: need && need.act === 'sell' ? F.localize(need.why) : '오늘 시세로.', suggested: !deal && need?.act === 'sell', testid: `field-sell-${lot.id}`, onclick: () => ctx.run({ t: 'sell', lot: lot.id, frac: 1 }) }) : null,
          order({ key: '', icon: 'ticket', name: '전표', catch: '계근 전표를 다시 봅니다. 등급, 손실, 당신의 선택이 있습니다.', testid: `weighin-${lot.id}`, onclick: () => o.onTicket(lot.id) })),
      ]
    }
    const sugg = need && isJob(need.act) ? need.act : null
    if (f.status === 'rest' || f.status === 'lost') {
      const extra = c.history.length > 0 ? [contractor(c, i, 'tile')].filter((x): x is HTMLElement => !!x) : []
      const rows = orderRow(c, [i], sugg, need && sugg ? F.localize(need.why) : '', extra)
      return [head(fieldKind(f), f.name, f.status === 'rest' ? '귀리와 클로버' : `${f.variety}, 잃음`), land.length ? h('div', { class: 'readings' }, land) : null, adviceLine(c, [i], !!rows), rows]
    }
    // The orders stand right under the gauges, so nothing above them comes or goes: a paragraph appearing never moves one.
    const g = slots(c, [i], sugg, need && sugg ? F.localize(need.why) : '')
    const say = sayLine(c, [i], g.canAny, sugg)
    g.wire(say)
    return [
      headWith(fieldKind(f), f.name, [`${f.variety}, `, term((SHORT_STAGE[f.stage] ?? f.stage).toLowerCase())]),
      // What is known first, then everything that can be ordered here in one group, then what the orders say back.
      // Nothing grows yet on an unplanted field, so it has no leaf, spray or hilling to read.
      f.status === 'idle' ? null : gauges(c, f),
      g.el,
      landRow(c, i),
      say,
      whoseLine(c, i),
      // The stones are said once: by the Pick rocks order when it is on the card.
      h('div', { class: 'readings' }, known(c, f), landCare(c, f, 'rocks') ? land.filter(e => e.dataset.testid !== 'stones') : land),
    ]
  }

  function many(c: S.Campaign, sel: number[]): Child {
    const g = slots(c, sel, null, '')
    const say = sayLine(c, sel, g.canAny, null)
    g.wire(say)
    return [
      head('밭 기록', `밭 ${sel.length}개`, F.list(sel.map(i => S.FIELD_NAMES[i]))),
      g.el,
      say,
    ]
  }

  // Whose work is whose on this field: what the crew has on the list here by itself and when it is taken, and which
  // kinds of work wait for the player.
  function whoseLine(c: S.Campaign, i: number): HTMLElement | null {
    const s = c.season!
    const f = S.fieldInfo(c, i)
    if (f.status === 'dug' || f.status === 'rest' || f.status === 'lost' || f.status === 'off' || s.frozen) return null
    const of = fates(app.world, c).of
    const mine = s.jobs.filter(j => j.field === i && (j.by === 'routine' || j.by === 'foreman'))
    const crew = mine.slice(0, 2).map(j => {
      const o = of.get(j.id)
      const u = o && o.unit >= 0 ? c.crew.find(x => x.id === o.unit) : undefined
      const me = u?.kind === 'farmer'
      const when = !o ? '' : o.unit < 0 ? '아직 아무도 못 함' : o.when === 'now' ? (me ? '당신이 하는 중' : `${firstName(u!.name)}이(가) 하는 중`) : o.when === 'next' && /다음으로 합니다\.$/.test(o.why) ? (me ? '당신이 다음' : `${firstName(u!.name)}이(가) 다음`) : o.when === 'waiting' ? '기다리는 중' : me ? '당신이 나중에 함' : `${firstName(u!.name)}이(가) 나중에 함`
      return `${JOB_VERB[j.kind].toLowerCase()}${when ? ` (${when})` : ''}`
    })
    const r = S.routineInfo(c)
    const yours = r.filter(x => !x.auto && (CROP as string[]).includes(x.kind)).map(x => JOB_VERB[x.kind].toLowerCase())
    const parts: Child[] = []
    if (crew.length) parts.push(h('span', null, icon('sprout', 'i'), h('b', null, '일꾼: '), `${crew.join(', ')}.`))
    else parts.push(h('span', { class: 'quiet' }, icon('sprout', 'i'), '정해진 일은 일꾼들이 합니다.'))
    if (yours.length) parts.push(h('span', null, ' ', h('b', null, '당신: '), `${F.list(yours)}.`))
    // When the kill is due by the coach's reckoning; the vine kill the crew does by itself, with its date, and the way
    // to refuse it.
    const due = f.status === 'growing' ? S.killOutlook(c, i) : null
    if (due) parts.push(h('span', { testid: 'card-kill-due' }, ' ', h('b', null, '줄기 죽이기 시기: '), `약 ${F.date(c.year, due.day, true)}${due.why === 'blight' ? ', 역병이 이기고 있어서' : due.why === 'frost' ? ', 서리가 오고 있어서' : ''}.`))
    const kill = fates(app.world, c).pressing.find(p => p.kind === 'kill' && p.field === i && p.job < 0)
    const kept = c.season!.fields[i].keepVines
    return h('div', { class: 'whose-box' },
      h('p', { class: 'whose', testid: 'card-whose' }, parts),
      kill ? h('p', { class: 'whose kill-date', testid: 'card-kill-date' }, icon('kill', 'i'), F.localize(kill.inWay), ' ',
        h('button', { class: 'btn quiet', type: 'button', testid: 'card-keep-vines', onclick: () => { const r = ctx.run({ t: 'keepVines', field: i, keep: true }); if (r.ok) ctx.announce(`${S.FIELD_NAMES[i]}: 일꾼들이 줄기를 남겨둡니다.`) } }, '남겨두기')) : null,
      kept && f.status === 'growing' ? h('p', { class: 'whose', testid: 'card-vines-kept' }, icon('kill', 'i'), '줄기를 남겨두기로 했으니 죽일지는 당신이 정합니다. ',
        h('button', { class: 'btn quiet', type: 'button', testid: 'card-let-vines', onclick: () => { ctx.run({ t: 'keepVines', field: i, keep: false }) } }, '일꾼에게 맡기기')) : null)
  }

  // The line under the orders: a refusal, why the field waits, or why the suggested order is suggested.
  function sayLine(c: S.Campaign, sel: number[], canAny: boolean, sugg: S.JobKind | null): HTMLElement {
    const line = adviceLine(c, sel, canAny)
    line.classList.add('order-say')
    if (!line.textContent && sugg && sel.length === 1) {
      const n = app.needs()[sel[0]]?.need
      if (n) line.replaceChildren(`${JOB_VERB[sugg]}: ${F.localize(n.why)}`)
    }
    return line
  }

  // The head with its cross stays put; what is under it scrolls when the window is short.
  function framed(parts: Child): Child {
    const list = (Array.isArray(parts) ? parts : [parts]) as Child[]
    return [list[0], h('div', { class: 'card-body', 'data-scroll': 'card' }, list.slice(1))]
  }

  function update(c: S.Campaign): void {
    const sel = app.selection.filter(i => i >= 0 && i < S.FIELD_COUNT && S.held(c, i))
    const was = el.hidden
    if (!sel.length) {
      // The bar leaves as it came: nothing cuts out on one frame.
      if (!el.hidden && shownFor !== '' && !ctx.reduced()) {
        el.classList.remove('in')
        el.classList.add('out')
        setTimeout(() => { if (!app.selection.length) { el.hidden = true; el.classList.remove('out'); ctx.dirty() } }, EXIT_MS)
      } else if (!el.classList.contains('out')) el.hidden = true
      shownFor = ''
      return
    }
    el.classList.remove('out')
    el.hidden = false
    const key = sel.join(',')
    if (key !== shownFor) { shownFor = key; page = 0; held = null; flashed = null; refused = null }
    const s = c.season!
    const model = {
      sel, layout: ctx.layout(), day: s.day, jobs: s.jobs.map(j => [j.id, j.kind, j.field, Math.round(j.done * 20)]), u: app.settings.units, t: ctx.touch(), page,
      held: held && performance.now() < held.until ? [held.kinds, held.given] : 0, flash: flashed && performance.now() < flashed.until ? flashed.text : '',
      refused: refused && performance.now() < refused.until ? [refused.kind, refused.why] : 0,
      f: sel.map(i => { const f = S.fieldInfo(c, i); return [f.status, f.stage, Math.round(f.canopy * 100), Math.round(f.moisture * 50), f.moistureLabel, Math.round(f.protect * 100), f.hillPasses, f.blightHills, f.blightSeen, f.pullBy, f.scoutAge, f.estimate ? [Math.round(f.estimate.lo), Math.round(f.estimate.hi), f.estimate.digs] : 0, Math.round(f.skin * 100), f.lot, f.cover, Math.round(f.stones * 100), f.works, Math.round(f.inField), f.weighed, f.sheltered, f.brushed, c.fields[i].felled] }),
      cash: Math.round(c.cash / 100), crew: c.crew.map(u => [u.id, u.job, u.prio]), fc: S.haulInfo(app.world, c).map(x => [x.field, x.frostChance, x.hauler]),
      n: app.needs().filter((_, i) => sel.includes(i)).map(x => [x.need?.id, x.need?.why, x.hold?.id, x.hold?.why]),
      lots: c.lots.filter(l => sel.includes(l.field)).map(l => [l.id, l.open, Math.round(S.lotCwt(l)), Math.round(l.sold), l.open ? Math.round(S.lotValue(app.world, c, l)) : 0]),
      frozen: s.frozen, w: s.watchDay >= 0, soil: Math.round(s.soilT * 2), unit: app.unit,
      k: c.contracts.map(k => [k.id, Math.round(k.delivered), k.settled]),
      kv: s.fields.map(x => x.keepVines ? 1 : 0), sw: c.sprayWay, r: c.routine, kill: fates(app.world, c).pressing.filter(p => p.kind === 'kill').map(p => [p.field, p.inWay]),
      fate: sel.flatMap(i => s.jobs.filter(j => j.field === i).map(j => [j.id, fates(app.world, c).of.get(j.id)?.why])),
    }
    patch(el, JSON.stringify(model), () => framed(sel.length === 1 ? one(c, sel[0]) : many(c, sel)))
    el.setAttribute('aria-label', sel.length === 1 ? `선택됨: ${S.FIELD_NAMES[sel[0]]}` : `선택됨: 밭 ${sel.length}개`)
    if (was && !ctx.reduced()) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in') }
  }

  return { el, update, give, suggested, flash }
}
