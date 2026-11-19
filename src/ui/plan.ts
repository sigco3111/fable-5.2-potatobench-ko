// Spring (design/spring.html): the land with its tags, and the seed and supply catalogue at the right with its folds
// and its order blank, where Start the season always is. A field, a lot or a tract picked on the land opens its card.
import * as S from '../sim/index.ts'
import { tracker } from './contracts.ts'
import { patch, type Ctx, type Screen } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { GLOSSARY, term } from './glossary.ts'
import { icon } from './icons.ts'
import { digitFor, fieldForDigit, heldFields, step } from './map.ts'
import { dueSays, limitSays, lowCashSays, rangeSays } from './money-words.ts'
import { plates, type PlateModel } from './plates.ts'
import * as R from './rules.ts'
import { cardHead, fieldCost, landCard, springFolds, tenureRow, tractCard, type Fold } from './spring.ts'
import { anchored, ties, type Land } from './tie.ts'
import { fold } from './system/parts.ts'
import { topBar } from './top.ts'
import { usualFirstYear } from './usual-year.ts'
import { firstSight } from './first-sight.ts'
import { nextGoal } from '../game/goals.ts'
import { agentSpeaking, springSlot } from './tutorial.ts'

// 숙기의 표시말. 데이터는 영문 키 그대로 둔다.
const MATURITY_KO: Record<S.Variety['maturity'], string> = { early: '조생', mid: '중생', late: '만생', 'very late': '극만생' }

function varietyTraits(v: S.Variety, c: S.Campaign, world: S.World): string[] {
  return [
    `${MATURITY_KO[v.maturity]}종`,
    v.market,
    `수량: ${R.yieldWord(v)}`,
    ...(R.setWord(v) ? [R.setWord(v)] : []),
    R.blightWord(v), R.scabWord(v), R.droughtWord(v),
    `${R.keepsUntil(c.year, v.id, c.upgrades.vent)}까지 저장`,
    R.seedWord(v),
    v.contract ? `공장 계약 시 ${F.price(v.price)}, 계약 없으면 그의 ${R.offContract()}` : `평년에 ${F.price(v.price)}`,
    `대구: ${R.largeRule(world, c, v.id)}`,
  ]
}

// Whether the player has seen every variety side by side: from then on the field record lists them all.
let compared = false

// Every variety that can be planted this year, side by side.
function openCompare(ctx: Ctx): void {
  const app = ctx.app
  const c = app.campaign
  if (!c) return
  compared = true
  ctx.dirty()
  const vs = S.availableVarieties(c.year)
  const cols: [string, (v: S.Variety) => string][] = [
    ['숙기', v => MATURITY_KO[v.maturity]],
    ['수량', v => `${F.upper(R.yieldWord(v))}${R.setWord(v) ? `. ${F.upper(R.setWord(v))}` : ''}`],
    ['잎 역병', v => F.upper(R.blightWord(v, true))],
    ['더부룩병', v => F.upper(R.scabWord(v, true))],
    ['가뭄', v => F.upper(R.droughtWord(v, true))],
    ['저장 기한', v => R.keepsUntil(c.year, v.id, c.upgrades.vent)],
    ['자가 종자', v => F.upper(R.seedWord(v, true))],
    ['가격', v => v.contract ? `계약 시 ${F.price(v.price)}, 없으면 ${F.price(v.price * S.PROCESSING_PRICE)}뿐` : F.price(v.price)],
    ['대구', v => F.upper(R.largeRule(app.world, c, v.id, true))],
  ]
  ctx.papers.open({
    title: `${R.yearWord(c.year)}의 품종`,
    kicker: '종자 카탈로그에서',
    testid: 'compare',
    size: 'wide',
    body: () => [
      h('p', { class: 'dlg-lead' }, '각 품종의 특성을, 게임이 밭을 키우는 그 숫자 그대로 비교합니다. 매년 이기는 만능 품종은 없습니다.'),
      h('div', { class: 'table-scroll', tabindex: '0', role: 'group', 'aria-label': '품종 비교' }, h('table', { class: 'compare-t' },
        h('thead', null, h('tr', null, h('th', { scope: 'col', class: 't-label' }, '품종'), cols.map(([label]) => h('th', { scope: 'col', class: 't-label' }, label)))),
        h('tbody', null, vs.map(v => h('tr', null,
          h('th', { scope: 'row' }, h('b', null, v.name), h('span', { class: 't-caption' }, v.market)),
          cols.map(([label, text]) => h('td', { 'data-label': label, class: label === '가격' && v.contract ? 'c-ochre' : null }, text(v)))))))),
      h('p', { class: 't-caption' }, `가격은 평년의 US No. 1을 시즌 평균한 값입니다. 수확기에는 낮고 봄에는 높지만, 계약가는 시즌 내내 같습니다. 계약이 없으면 칩용 품종은 가공가만 받아 평소 가격의 ${R.offContract()}입니다. ${F.grams(S.SIZE_CHEF)}를 넘는 대구는 품종에 따라 No. 1 가격보다 더 받거나 덜 받습니다. "저장 기한"은 9월 25일쯤 캔 작물이 싹트기 전 마지막 저장 달입니다${c.upgrades.vent ? '(환기 장치 기준)' : ''}. 수량은 날씨, 역병, 줄기 죽이기 전 온전한 시즌의 양입니다.${F.cwtNote()}`),
    ],
    foot: close => h('button', { class: 'btn go', type: 'button', testid: 'compare-close', autofocus: true, onclick: close }, '계획으로 돌아가기', icon('arrow', 'i')),
  })
}

// A line of an account: the label, a dot leader, the figure right; a negative figure carries its minus sign in red.
function line(label: Child, value: number, o: { testid?: string; cls?: string } = {}): HTMLElement {
  return h('p', { class: `lead${o.cls ? ` ${o.cls}` : ''}` }, h('span', null, label), h('span', { class: 'dots' }),
    h('span', { class: `num${value < 0 ? ' c-red' : ''}`, testid: o.testid }, F.money(value)))
}

// The money behind the order blank: what the plan costs, what the bank lends, what comes due.
function openMoney(ctx: Ctx): void {
  const app = ctx.app
  const c = app.campaign
  if (!c) return
  const pc = S.planCosts(c)
  const after = c.cash - pc.total
  const mine = heldFields(c).filter(i => c.fields[i].cover === 'open')
  const potato = mine.filter(i => c.plans[i].crop === 'potato').length
  const cert = mine.filter(i => c.plans[i].crop === 'potato' && c.plans[i].seed === 'certified').length
  const rest = mine.length - potato
  const rented = mine.filter(i => c.fields[i].tenure === 'rented').length
  const paid = c.crew.filter(u => u.wage > 0).length
  const m = S.mortgageInfo(c)
  const y = c.history[c.history.length - 1]
  const nb = y ? app.world.neighbor[String(y.year)] : undefined
  const growing = y ? y.costs - y.wages - y.rent - y.land - y.penalties - y.storage - y.mortgage - y.works - y.building - y.packing : 0
  ctx.papers.open({
    title: `돈, ${R.yearName(c.year)}`,
    kicker: '봄 계획 전체 내역',
    testid: 'money',
    size: 'medium',
    body: () => [
      h('div', { class: 'ledger-lines' },
        line(c.cash < 0 ? '작년부터의 빚' : '보유 현금', c.cash),
        line(`감자밭 ${potato}곳, 각 ${F.money(S.FIELD_COST)}`, -potato * S.FIELD_COST),
        cert ? line(`인증 종자, 밭 ${cert}곳`, -cert * S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT) : null,
        rest ? line(`휴경 밭 ${rest}곳, 각 ${F.money(S.REST_COST)}`, -rest * S.REST_COST) : null,
        pc.rent ? line(`임차료, 밭 ${rented}곳`, -pc.rent) : null,
        pc.wages ? line(`첫 달 임금, ${paid}명`, -pc.wages) : null,
        line(h('b', null, '이 계획'), -pc.total, { testid: 'plan-cost', cls: 'sub-total' }),
        line(h('b', null, '파종 후'), after, { testid: 'plan-after', cls: 'total' })),
      h('p', { class: 't-caption' }, after < S.OPERATING_LIMIT
        ? `은행은 봄에 ${F.money(-S.OPERATING_LIMIT)}까지만 빌려주니 밭을 쉬게 하거나 자가 종자를 심으세요. 자가 종자는 무료지만 바이러스를 옮깁니다.`
        : after < 0 ? `은행의 봄 융자가 무이자로 ${F.money(-after)}를 대고, 작물로 갚습니다.` : '이번 봄에는 빌릴 필요가 없습니다.',
      pc.wages ? ` 그 뒤로는 시즌이 끝날 때까지 매달 임금이 ${F.money(pc.wages)}이고, 겨울에 데리고 있는 사람에게도 계속 줍니다.` : ''),
      h('p', { class: 't-label dlg-sub' }, '연말에 낼 돈'),
      h('div', { class: 'ledger-lines' },
        after < 0 && after >= S.OPERATING_LIMIT ? line('봄 융자 상환', -after) : null,
        line(term('매년 은행에 내는 돈', 'the note'), S.NOTE_PAYMENT),
        line(term('가족 생활비', 'the household'), S.LIVING),
        m.owed > 0 ? line(`땅 모기지, ${F.money(m.owed)} 남음`, Math.round(m.principal + m.interest)) : null,
        line(h('b', null, '합계'), (after < 0 && after >= S.OPERATING_LIMIT ? -after : 0) + S.NOTE_PAYMENT + S.LIVING + Math.round(m.principal + m.interest), { cls: 'total' })),
      h('p', { class: 't-caption' }, `그 뒤에도 남은 빚은 ${F.pct(S.CREDIT_RATE)}의 이자로 이듬해로 넘어가고, ${F.money(-S.CREDIT_LIMIT)}을 넘으면 은행이 융자를 회수해 농장을 잃습니다. 땅, 건물, 장비는 현금으로만 살 수 있습니다.`),
      y ? [
        h('p', { class: 't-label dlg-sub' }, `작년, ${R.yearWord(y.year)}`),
        h('div', { class: 'ledger-lines' },
          line('감자 판매', y.revenue - y.restIncome - y.contracts - y.logs - y.stand),
          y.contracts ? line('계약 납품', y.contracts) : null,
          y.stand ? line('직판장', y.stand) : null,
          y.logs ? line('제재소에 판 통나무', y.logs) : null,
          y.restIncome ? line('오트와 클로버', y.restIncome) : null,
          line('재배와 저장', -(growing + y.storage + y.packing)),
          y.wages ? line('임금', -y.wages) : null,
          y.rent ? line('임차료', -y.rent) : null,
          y.land ? line('땅, 계약금', -y.land) : null,
          y.mortgage ? line('땅 모기지', -y.mortgage) : null,
          y.building ? line('건물', -y.building) : null,
          y.works ? line('도급', -y.works) : null,
          y.penalties ? line('계약 위약금', -y.penalties) : null,
          line('은행 납부, 생활비와 이자', -(y.note + y.living + y.interest)),
          line(h('b', null, '연말 현금'), y.cashEnd, { cls: 'total' })),
        h('p', { class: 't-caption' }, `${y.potatoFields ? `당신은 ${F.perArea(y.yieldCwtAcre)}을(를) 팔았습니다.` : '감자를 기르지 않았습니다.'}${nb ? ` 이웃은 ${F.perArea(nb.yieldCwtAcre)}을(를) 팔았습니다.` : ''}`),
      ] : null,
    ],
    foot: close => h('button', { class: 'btn go', type: 'button', testid: 'money-close', autofocus: true, onclick: close }, '계획으로 돌아가기', icon('arrow', 'i')),
  })
}

const TRACT_GLYPH: Record<S.Cover, string> = { open: 'idle', woods: 'woods', brush: 'woods', stumps: 'stump' }

export function planScreen(ctx: Ctx, plateLayer: HTMLElement, o: { onMenu: () => void }): Screen {
  const app = ctx.app
  // A spring goal's "Show me" opens the fold where it is reached, or picks the tract it is about.
  const goalFold: Partial<Record<string, Fold>> = { tool: 'equipment', hire: 'people', contract: 'contracts', land: 'land', foreman: 'people' }
  const goalTract = (id: string) => {
    const c = app.campaign
    const stage = id === 'stump' ? 'stump' : id === 'fell' ? 'fell' : ''
    return c && stage ? S.tractInfo(c).find(t => t.tenure !== 'none' && t.stage === stage)?.field ?? -1 : -1
  }
  const top = topBar(ctx, {
    ...o,
    canShow: g => {
      const c = app.campaign
      if (!c || c.phase !== 'plan') return false
      if (g.id === 'foreman') return c.crew.some(u => u.kind !== 'farmer')
      return !!goalFold[g.id] || goalTract(g.id) >= 0
    },
    show: g => {
      const t = goalTract(g.id)
      if (t >= 0) { app.select(t); return true }
      const f = goalFold[g.id]
      if (!f) return false
      // Opened outright: the control it leads to is then scrolled into view (light, in top.ts), not held in place.
      if (open !== f) { open = f; body.scrollTop = 0; ctx.dirty() }
      return true
    },
  })
  // A field, a lot or a tract picked on the land: its card, beside the point clicked and tied to it (tie.ts), on the
  // land the catalogue leaves free. On a phone it fills the land over the order blank.
  const card = h('section', { class: 'command docked-left spring-card sheet sys', 'aria-label': '선택한 밭', testid: 'plan-card', hidden: true })
  // The contracts signed stand under the folds: they are money promised.
  const track = tracker(ctx)
  const mast = h('header', { class: 'masthead' })
  const rows = h('div', { class: 'cat-folds' })
  const foot = h('footer', { class: 'order-blank' })
  const body = h('div', { class: 'cat-body', 'data-scroll': 'spring' }, rows, track.el)
  const sheet = h('section', { class: 'catalogue sheet sys', 'aria-label': '봄 계획', testid: 'spring' }, mast, body, springSlot(), foot)
  const notesSlot = h('div', { class: 'notes-slot' })
  const tied = anchored(ctx, card)
  const el = h('main', { class: 'spring-screen sys' }, top.el, notesSlot, tied.parts, card, sheet)
  // Where a card may stand: under the boards, left of the catalogue. Read once after each change.
  let landNow: Land | null = null
  ties().setLand(() => {
    if (!landNow) {
      const ins = app.insets
      landNow = { win: { left: 8, top: ins.top + 8, right: Math.min(innerWidth, sheet.getBoundingClientRect().left) - 8, bottom: innerHeight - 8 }, blocks: [] }
    }
    return { ...landNow, tags: () => P.boxes() }
  })
  // Every fold starts shut: a newcomer's first spring is a short sheet (e2e/play.spec.ts), each fold one click away.
  let open: Fold | null = null
  let note = ''
  let focused = false

  function onTry(err: string): void {
    note = err
    if (err) ctx.announce(err)
    ctx.dirty()
  }

  function setPlan(change: Partial<S.FieldPlan>): void {
    const c = app.campaign
    if (!c) return
    note = ''
    for (const i of app.selection) {
      if (!S.isField(c, i)) continue
      const p = { ...c.plans[i], ...change }
      if (change.variety && change.variety !== c.plans[i].variety) p.seed = 'certified'
      const r = app.do({ t: 'plan', field: i, plan: p })
      if (!r.ok) note = r.err
    }
    if (note) ctx.announce(note)
    ctx.dirty()
  }

  function begin(): void {
    const r = ctx.run({ t: 'begin' })
    if (!r.ok) return
    app.setSpeed(1)
  }

  // A fold opened or closed stays where it was under the pointer: the sheet scrolls by what moved above it, and when
  // closing leaves too little below to scroll back, a spacer holds the rows still until the pointer leaves the sheet.
  function toggle(id: Fold): void {
    const head = () => rows.querySelector<HTMLElement>(`[data-k="fold-${id}"]`)
    const was = head()?.getBoundingClientRect().top
    open = open === id ? null : id
    ctx.dirty()
    // Open, the fold scrolls in its own room under the strip; the sheet itself stands at its top.
    if (open) { body.scrollTop = 0; body.style.paddingBottom = ''; return }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const now = head()?.getBoundingClientRect().top
      if (was === undefined || now === undefined) return
      const shift = now - was
      if (Math.abs(shift) < 1) return
      const room = body.scrollHeight - body.clientHeight - body.scrollTop
      if (shift > room) body.style.paddingBottom = `${Math.ceil(shift - room)}px`
      body.scrollTop += shift
    }))
  }
  sheet.addEventListener('pointerleave', () => { if (body.style.paddingBottom) body.style.paddingBottom = '' })

  function plateModel(i: number): PlateModel | null {
    const c = app.campaign!
    if (!S.held(c, i)) {
      const l = S.landInfo(c).find(x => x.field === i)
      return l ? { name: l.name, glyph: S.standing(l.cover) ? 'woods' : 'land', marks: [], queue: [], badge: null, land: true, said: `${l.name}, ${l.block === 'home' ? '집 농장 옆' : '집 농장 너머'}. ${l.rentable ? `1년 ${F.money(l.rent)}에 빌리거나 ` : ''}${F.money(l.price)}에 살 수 있습니다.` } : null
    }
    const key = digitFor(c, i)
    const fp = c.fields[i]
    if (fp.cover !== 'open') {
      return {
        name: S.FIELD_NAMES[i], glyph: TRACT_GLYPH[fp.cover], sub: S.COVER_WORD[fp.cover], marks: [], queue: [], badge: null, key,
        said: `${S.FIELD_NAMES[i]}, ${S.COVER_WORD[fp.cover]}. 개간해 밭으로 만들 수 있는 구획입니다.`,
      }
    }
    const p = c.plans[i]
    const potato = p.crop === 'potato'
    const v = S.variety(p.variety)
    const rented = fp.tenure === 'rented'
    return {
      name: S.FIELD_NAMES[i],
      glyph: potato ? 'planted' : 'rest',
      sub: potato ? v.name : '휴경',
      marks: [...(potato && p.seed === 'saved' ? [{ glyph: 'sprout', cls: 'warn' }] : []), ...(rented ? [{ glyph: 'land', cls: '' }] : [])],
      queue: [], badge: null, key,
      said: `${S.FIELD_NAMES[i]}. ${potato ? `${p.seed === 'certified' ? '인증' : '자가'} 종자의 ${v.name}` : '오트와 클로버 휴경'}${rented ? ', 임차' : ''}, ${F.money(fieldCost(p))}.${key ? ` ${key}를 눌러 선택합니다.` : ''}`,
    }
  }
  const P = plates(ctx, plateLayer, { model: plateModel, onBadge: () => {}, covers: () => card.hidden ? [] : [card.getBoundingClientRect()] })

  // The box's word for leaf blight, which names what it is about ("prone" alone was not understood).
  const BOX_BLIGHT = ['역병에 강함', '역병 저항 약간', '역병에 약함', '역병에 매우 약함']

  // A variety as a printed box to tick: its name, how it matures and yields, its price; what else it is like is said
  // to a screen reader, and in full on the comparison sheet.
  function varietyBox(c: S.Campaign, v: S.Variety, on: boolean): HTMLElement {
    return h('label', { class: 'vbox' },
      h('input', { type: 'radio', name: 'variety', value: v.id, checked: on, testid: `plan-variety-${v.id}`, k: `v-${v.id}`, 'aria-describedby': `v-more-${v.id}`, onchange: () => setPlan({ variety: v.id }) }),
      h('span', { class: 'vbox-in' },
        h('b', null, v.name),
        h('span', { class: 'it' }, `${MATURITY_KO[v.maturity]}, ${R.yieldWord(v).split(',')[0]}`),
        h('span', { class: v.contract ? 'c-ochre' : null, title: v.contract ? GLOSSARY['contract only'] : undefined }, v.contract ? '계약 전용' : BOX_BLIGHT[R.blightMark(v)]),
        h('span', { class: 'num' }, F.price(v.price))),
      h('span', { class: 'sr', id: `v-more-${v.id}` }, varietyTraits(v, c, app.world).join(', ')))
  }

  function choice(name: string, label: string, opts: [string, string, boolean, () => void, string?][]): HTMLElement {
    return h('div', { class: 'seg-in', role: 'radiogroup', 'aria-label': label }, opts.map(([value, text, on, set, off]) => h('label', { title: off || undefined },
      h('input', { type: 'radio', name, value, checked: on, disabled: !!off, testid: `plan-${name}-${value}`, k: `${name}-${value}`, onchange: set }),
      h('span', null, text))))
  }

  function drawCard(c: S.Campaign, sel: number[]): Child {
    const i = sel[0]
    if (!S.held(c, i)) return landCard(ctx, c, i, note, onTry)
    if (c.fields[i].cover !== 'open') return tractCard(ctx, c, i, note, onTry)
    const one = sel.length === 1
    const p = c.plans[i]
    const same = (k: keyof S.FieldPlan) => sel.every(j => c.plans[j][k] === p[k])
    const potato = p.crop === 'potato'
    const info = S.fieldInfo(c, i)
    const all = S.availableVarieties(c.year)
    const vs = c.history.length || compared ? all : firstSight(all, [...new Set(sel.map(j => c.plans[j].variety))])
    const v = S.variety(p.variety)
    const stock = c.seedStock.filter(x => x.variety === p.variety && x.fields > 0)
    const saved = stock.reduce((a, x) => a + x.fields, 0)
    const cost = sel.reduce((a, j) => a + fieldCost(c.plans[j]), 0)
    // Saved seed's warning stands with the seed choice; how to save some is read with the varieties.
    const seedNote = h('p', { class: `t-caption${p.seed === 'saved' ? ' c-ochre' : ''}`, testid: 'seed-note' }, saved > 0 || p.seed === 'saved' ? R.savedSeedText(stock)
      : [`저장고에 자가 ${v.name} 종자가 없습니다. 겨울에 저장한 작물에서 `, term('종자를 남겨 두면', 'hold back seed'), ' 됩니다. 다음 봄 파종은 무료지만 바이러스를 옮깁니다.'])
    // Head and seed stay in view; where the land leaves the card too little room, the crop and the varieties scroll
    // between them.
    return [
      cardHead(ctx, one ? '밭 기록' : '밭들', one ? info.name : `밭 ${sel.length}곳`, one
        ? [`${R.POSITION_NOTE[info.elev]} ${info.streak > 1 ? `${info.streak}년 연속 감자` : info.streak ? '작년에 감자' : '작년에는 감자 아님'}. 흙은 ${R.soilWord(info.soil)}이고 `, term('조기 고사병'), `이(가) 포기의 ${F.pct(info.vert)}에 옵니다.${info.raw ? ' 새 땅이라 1년 쉬지 않으면 첫 작물이 적습니다.' : ''}`]
        : F.list(sel.map(j => S.FIELD_NAMES[j]))),
      h('div', { class: 'card-scroll', 'data-scroll': 'record', testid: 'record-scroll' },
        h('div', { class: 'card-crop' },
          choice('crop', '작물', [['potato', '감자', same('crop') && potato, () => setPlan({ crop: 'potato' })], ['rest', '휴경', same('crop') && !potato, () => setPlan({ crop: 'rest' })]]),
          h('p', { class: 'card-cost' }, h('span', { class: 't-label' }, sel.length > 1 ? '합계' : '비용'), h('b', { class: 'num', testid: 'field-cost' }, F.money(cost)))),
        potato ? [
          h('div', { class: `vgrid${vs.length < all.length ? ' few' : ''}`, role: 'radiogroup', 'aria-label': '품종' }, vs.map(x => varietyBox(c, x, same('variety') && x.id === p.variety))),
          h('p', { class: 'note card-note' }, same('variety') ? `${v.blurb}${v.contract ? ` 계약이 없으면 평소 가격의 ${R.offContract()}에 팔립니다.` : ''}` : '이 밭들은 서로 다른 품종을 심습니다.',
            ' ', h('button', { class: 'btn quiet', type: 'button', testid: 'compare-open', onclick: () => openCompare(ctx) }, vs.length < all.length ? `모두 ${all.length}개 비교` : '모두 비교하기')),
          p.seed === 'saved' ? null : h('div', { class: 'card-seed-note' }, seedNote),
        ] : h('p', { class: 'note card-note' }, `오트와 클로버는 ${F.money(S.REST_COST)}가 들고 가을에 ${F.money(S.REST_INCOME)}을(를) 법니다. 휴경은 흙을 바로 회복시키고 조기 고사병을 서서히 줄입니다.`)),
      h('div', { class: 'card-foot', testid: 'record-foot' },
        potato ? [
          // Where the seed comes from is always on the card: saved seed is free once some is held back in the cellar.
          h('div', { class: 'card-seed' },
            h('p', { class: 't-label' }, '종자'),
            choice('seed', '종자', [
              ['certified', `인증, ${F.money(S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT)}`, same('seed') && p.seed === 'certified', () => setPlan({ seed: 'certified' })],
              ['saved', saved > 0 ? `자가, 무료 (${saved}곳 분량)` : '자가, 무료', same('seed') && p.seed === 'saved', () => setPlan({ seed: 'saved' }),
                saved > 0 || p.seed === 'saved' ? '' : `저장고에 자가 ${v.name} 종자가 없습니다`]]),
            p.seed === 'saved' ? seedNote : null),
        ] : null,
        one ? tenureRow(ctx, c, i, onTry) : null,
        note ? h('p', { class: 'card-refused c-red', role: 'alert' }, note) : null),
    ]
  }

  function drawMast(c: S.Campaign): Child {
    return [h('h1', null, '봄'), h('span', { class: 't-label' }, R.seasonCount(c))]
  }

  function drawRows(c: S.Campaign): Child {
    const folds = springFolds(ctx, c, onTry, () => { open = null; ctx.dirty() })
    // The fold where the slip's goal is reached is ringed, and says so, so it is found without the slip.
    const g = nextGoal(c)
    // While the county agent has a note for this screen, the ring waits with the slip: one voice at a time.
    const goalAt = g && g.now && !g.block && !agentSpeaking() ? goalFold[g.id] : undefined
    const phone = ctx.layout() === 'narrow'
    // On a phone the folds after the people stand as one row of buttons until one is opened (design/spring.phone.html).
    // While a fold is open every other one stands in that row above it, so the open one has the sheet's room.
    const later = open ? folds.filter(f => f.id !== open) : phone ? folds.filter(f => f.id !== 'fields' && f.id !== 'people') : []
    const strip = later.length ? h('div', { class: `fold more${open ? ` strip${later.length > 4 ? ' many' : ''}` : ''}`, role: 'group', 'aria-label': '더 많은 항목', k: 'fold-more' },
      later.map(f => h('button', { class: `btn${goalAt === f.id ? ' goal-ring' : ''}`, type: 'button', testid: f.open, 'aria-expanded': 'false', onclick: () => toggle(f.id) }, icon(f.glyph, 'i'), h('span', { class: 'nm' }, f.name)))) : null
    return [
      open ? strip : null,
      folds.filter(f => !later.includes(f)).map(f => {
        const on = open === f.id
        const el = fold({ icon: f.glyph, name: f.name, state: goalAt === f.id && !on ? `여기서: ${g!.title}` : phone ? f.short ?? f.state : f.state, figure: f.figure, open: on, controls: on ? `fold-${f.id}` : undefined, testid: f.open, onclick: () => toggle(f.id) })
        if (goalAt === f.id && !on) el.classList.add('goal-ring')
        return h('div', { class: 'cat-fold', k: `fold-${f.id}` }, el,
          on ? h('div', { class: 'cat-open', id: `fold-${f.id}`, testid: f.testid, 'data-scroll': `fold-${f.id}` }, f.body()) : null)
      }),
      open ? null : strip,
    ]
  }

  let moneyMore = false
  function drawFoot(c: S.Campaign): Child {
    const pc = S.planCosts(c)
    const after = c.cash - pc.total
    const over = after < S.OPERATING_LIMIT
    // What the year end takes, whatever the crop (S.moneyNow): the spring loan back, the note, the household, the land
    // mortgage. Whatever raises the loan (a field, a hand, a machine bought from cash) raises what is due by as much.
    const mn = S.moneyNow(app.world, c)
    const loan = over ? 0 : mn.loan
    const what = pc.rent || pc.wages ? `(${F.list([pc.rent ? `임차료 ${F.money(pc.rent)}` : '', pc.wages ? `첫 달 임금 ${F.money(pc.wages)}` : ''].filter(Boolean))} 포함)` : ''
    const due = dueSays(mn.due, loan)
    const low = over ? '' : lowCashSays(c, after)
    // The year-end figure the season will open with (S.moneyPlan: this plan begun on a copy of the farm), with where it
    // is likely to end, and past the bank's limit, the one change that would bring it back most.
    const year = S.moneyPlan(app.world, c)
    const fig = Math.round(year.after / 100) * 100
    const past = over ? '' : limitSays(year, year.after < S.CREDIT_LIMIT ? S.planRescue(app.world, c) : null)
    return [
      h('div', { class: `plan-money${over ? ' over' : ''}${moneyMore ? ' more' : ''}`, testid: 'plan-money' },
        h('p', { class: 'lead quiet pm-cash' }, h('span', { class: 'it' }, c.cash < 0 ? '작년부터의 빚' : '보유액'), h('span', { class: 'dots' }),
          h('span', { class: `num${c.cash < 0 ? ' c-red' : ''}`, testid: 'plan-cash' }, F.money(c.cash))),
        h('p', { class: 'lead' }, h('span', null, '이 계획', what ? h('span', { class: 'it quiet', testid: 'plan-rent' }, ` ${what}`) : null), h('span', { class: 'dots' }),
          h('b', { class: 'num big' }, F.money(pc.total))),
        h('p', { class: 'lead quiet pm-loan' }, h('span', { class: 'it' }, over ? '은행이 빌려줄 수 있는 금액 초과' : after < 0 ? term('은행 봄 융자', 'spring loan') : '남는 현금'), h('span', { class: 'dots' }),
          over ? null : h('span', { class: `num${low ? ' c-ochre' : ''}`, testid: 'plan-loan' }, F.money(Math.abs(after)))),
        low ? h('p', { class: 't-caption c-ochre', testid: 'plan-low', role: 'status' }, low) : null,
        over ? null : [
          h('p', { class: 'lead pm-after' }, h('span', { class: 'it' }, '연말 결산 후'), h('span', { class: 'dots' }),
            h('span', { class: `num${year.callRisk === 'likely' ? ' c-red' : year.callRisk === 'possible' ? ' c-ochre' : ''}`, testid: 'plan-year-end' }, F.money(fig))),
          h('p', { class: 't-caption pm-range', testid: 'plan-year-range' }, rangeSays(year.range)),
          past ? h('p', { class: 't-caption c-red', testid: 'plan-past-limit', role: 'status' }, past) : null,
        ],
        h('p', { class: 'lead quiet' }, h('span', { class: 'it' }, term('연말에 낼 돈', 'due at the year end'), ctx.layout() === 'narrow' ? null : ', 작물에서'), h('span', { class: 'dots' }),
          h('span', { class: 'num c-red', testid: 'plan-due' }, F.money(due.total))),
        h('p', { class: 't-caption pm-parts' }, due.text),
        c.history.length ? null : h('p', { class: 't-caption pm-usual', testid: 'plan-usual' }, usualFirstYear(mn.due.note + mn.due.household).short)),
      over ? h('p', { class: 't-caption c-red', role: 'alert' }, '은행이 이번 봄에 더 빌려주지 않으니 밭을 쉬게 하거나 자가 종자를 심으세요.') : null,
      h('div', { class: 'blank-go' },
        h('button', { class: 'btn go wide', type: 'button', testid: 'begin-season', onclick: begin }, '시즌 시작하기', icon('arrow', 'i')),
        // At a glance the blank says three things: what you have, what the plan costs, where the year will end. The
        // loan, the range and what falls due are one press away.
        over ? null : h('button', { class: 'btn quiet', type: 'button', testid: 'plan-more', 'aria-expanded': String(moneyMore), onclick: () => { moneyMore = !moneyMore; ctx.dirty() } }, moneyMore ? '접기' : '자세히'),
        h('button', { class: 'btn quiet', type: 'button', testid: 'money-open', onclick: () => openMoney(ctx) }, '돈 내역 보기')),
    ]
  }

  return {
    el,
    notes: notesSlot,
    key(e) {
      if (e.altKey || e.metaKey || e.ctrlKey) return false
      const c = app.campaign
      if (!c) return false
      const t = e.target as HTMLElement
      const onTag = !!t.closest?.('.plate, .tag')
      const onControl = !!t.closest?.('button, input, a')
      if (e.key === 'Escape') {
        if (app.selection.length) { app.select(-1); return true }
        if (open) { open = null; ctx.dirty(); return true }
        return false
      }
      if (e.key === 'Tab' && (!onControl || onTag) && app.selection.length) {
        app.select(step(heldFields(c), app.selected, e.shiftKey))
        ;(document.activeElement as HTMLElement | null)?.blur?.()
        return true
      }
      const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code)
      if (digit && !t.closest?.('input')) {
        const i = fieldForDigit(c, Number(digit[1]))
        if (i >= 0) app.select(i, e.shiftKey)
        return true
      }
      return false
    },
    update() {
      const c = app.campaign
      if (!c) return
      const layout = ctx.layout()
      el.dataset.layout = layout
      // An open fold takes the sheet's room: the other folds as a strip, the order blank down to its two totals.
      sheet.classList.toggle('folded', !!open)
      top.update()
      track.update()
      P.update()
      const sel = app.selection.filter(i => i >= 0 && i < S.FIELD_COUNT)
      // Land the farm does not hold, and tracts, are looked at one at a time.
      const last = sel[sel.length - 1]
      const shown = last === undefined ? [] : !S.isField(c, last) ? [last] : sel.filter(i => S.isField(c, i))
      const was = card.hidden
      card.hidden = shown.length === 0
      el.classList.toggle('selected', shown.length > 0)
      if (shown.length) {
        patch(card, JSON.stringify([shown, compared, c.plans, c.seedStock, note, app.settings.units, c.year, c.fields.map(f => [f.tenure, f.cover, f.works?.left]), Math.round(c.cash), c.mortgages.length]), () => drawCard(c, shown))
        if (was && !ctx.reduced()) { card.classList.remove('in'); void card.offsetWidth; card.classList.add('in') }
      } else note = ''
      tied.update(card.hidden ? null : ties().field())
      landNow = null
      const state = [c.year, c.history.length, c.plans, c.fields.map(f => [f.tenure, f.cover]), c.seedStock.length, app.settings.units, layout]
      patch(mast, JSON.stringify([c.year, c.yearIdx]), () => drawMast(c))
      patch(rows, JSON.stringify([...state, open, nextGoal(c)?.id, agentSpeaking(), c.applicants.map(a => a.id), c.crew.map(u => [u.id, u.wage, u.foreman]), c.offers.map(x => x.id), c.contracts.map(k => k.id),
        c.upgrades, c.mortgages.map(m => Math.round(m.owed)), c.sundaysOff, Math.round(c.cash), c.buildings.length]), () => drawRows(c))
      patch(foot, JSON.stringify([moneyMore, S.planCosts(c), Math.round(c.cash), c.plans, c.contracts.map(k => k.id), c.crew.map(u => [u.id, u.wage]), c.upgrades, c.mortgages.map(m => Math.round(m.owed)), app.settings.units, layout]), () => drawFoot(c))
      el.style.setProperty('--foot-h', `${Math.round(foot.offsetHeight)}px`)
      // The one thing to do here is under the keyboard from the start.
      if (!focused && !ctx.papers.isOpen()) {
        const start = foot.querySelector<HTMLElement>('[data-k="begin-season"]')
        const at = document.activeElement
        const free = !at || at === document.body || !!at.closest('[inert]')
        if (free) start?.focus({ preventScroll: true })
        focused = document.activeElement === start || !free
        if (!focused) setTimeout(() => ctx.dirty(), 200)
      }
    },
    insets() {
      const t = top.el.getBoundingClientRect().bottom
      const s = sheet.getBoundingClientRect()
      if (ctx.layout() === 'narrow') {
        const low = card.hidden ? s.top : Math.min(s.top, card.getBoundingClientRect().top)
        return [t, 0, innerHeight - low + 8, 0]
      }
      // The card opening on a click never moves the camera: only the sheet, which always stands, frames the land.
      return [t, innerWidth - s.left + 8, 0, 0]
    },
    frame: () => { P.frame(); tied.frame(ctx.layout() === 'narrow' || ctx.layout() === 'short' ? 'plain' : 'float') },
    dispose() { P.dispose(); ties().setLand(null); tied.dispose() },
  }
}
