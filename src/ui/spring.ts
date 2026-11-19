// Spring's catalogue (design/spring.html): its folds, each one line until it is opened (the fields with their tracts,
// people asking for work, land to rent or buy, contracts, equipment, the land mortgage, the farm's rules), and the
// cards for a field, a lot or a tract picked on the land.
import * as S from '../sim/index.ts'
import { springContracts } from './contracts.ts'
import { confirmPaper, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { term } from './glossary.ts'
import { icon } from './icons.ts'
import { BLOCK_NAME, BLOCK_NOTE, heldFields, roadTime } from './map.ts'
import { effectSays, loanSays } from './money-words.ts'
import { POSITION_NOTE, soilWord } from './rules.ts'
import { tens } from './system/parts.ts'
import { portrait } from './system/people.ts'

export type Fold = 'fields' | 'people' | 'land' | 'contracts' | 'equipment' | 'bank' | 'rules'

export interface FoldRow {
  id: Fold
  open: string              // testid of the fold that opens it
  testid: string            // testid of what it opens to
  glyph: string
  name: string
  state: string             // the one line it folds to
  short?: string            // the same, for a phone
  figure?: string
  body: () => Child
}

export function fieldCost(p: S.FieldPlan): number {
  return p.crop === 'potato' ? S.FIELD_COST + (p.seed === 'certified' ? S.SEED_CWT_PER_FIELD * S.CERT_SEED_PER_CWT : 0) : S.REST_COST
}

// Shows a parcel on the land and opens its card.
function look(ctx: Ctx, i: number): void {
  ctx.app.select(i)
  ctx.app.focus(i)
}

function done(testid: string, onClose: () => void): HTMLElement {
  return h('p', { class: 'cat-done' }, h('button', { class: 'btn quiet', type: 'button', testid, onclick: onClose }, '닫기'))
}

function tryRun(ctx: Ctx, cmd: S.Cmd, onTry: (err: string) => void, say = false): boolean {
  const r = ctx.app.do(cmd)
  onTry(r.ok ? '' : r.err)
  if (r.ok && say) ctx.say(F.localize(`${r.events[0]?.text ?? '완료.'}${cmd.t === 'hire' ? ' 시즌이 시작되기 전까지 되돌릴 수 있습니다.' : ''}`))
  else if (r.ok) ctx.announce(F.localize(r.events[0]?.text ?? '완료.'))
  ctx.dirty()
  return r.ok
}

// What a press would do to this year's year-end figure, the money board's own reckoning (S.moneyEffect).
function yearEnd(ctx: Ctx, cmd: S.Cmd): string {
  return effectSays(S.moneyEffect(ctx.app.world, ctx.app.campaign!, cmd), cmd.t === 'hire')
}

// Undo, for what this spring's plan bought or hired: it costs nothing and is taken back in full.
function undoKey(ctx: Ctx, testid: string, what: string, cmd: S.Cmd, onTry: (err: string) => void): HTMLElement {
  return h('button', { class: 'btn', type: 'button', testid, 'aria-label': `되돌리기: ${what}`, title: ctx.touch() ? undefined : '시즌이 시작되기 전까지 되돌릴 수 있습니다.', onclick: () => tryRun(ctx, cmd, onTry, true) }, icon('back', 'i'), '되돌리기')
}

// A line of a fold's list: a thing on the land with what it is and its figure; pressed, it is shown there.
function catRow(o: { icon: string; name: string; what: string; figure?: string; testid: string; onclick: () => void }): HTMLElement {
  return h('li', null, h('button', { class: 'cat-row', type: 'button', testid: o.testid, onclick: o.onclick },
    icon(o.icon, 'i'), h('b', null, o.name), h('span', { class: 'it quiet' }, o.what), h('span', { class: 'dots' }), o.figure ? h('span', { class: 'num' }, o.figure) : null))
}

// ---------------------------------------------------------------- the fields

const TRACT_GLYPH: Record<S.Cover, string> = { open: 'idle', woods: 'woods', brush: 'woods', stumps: 'stump' }

function fieldsBody(ctx: Ctx, c: S.Campaign): Child {
  const tracts = S.tractInfo(c)
  return h('ul', { class: 'cat-list' }, heldFields(c).map(i => {
    const fp = c.fields[i]
    const p = c.plans[i]
    if (fp.cover !== 'open') {
      const t = tracts.find(x => x.field === i)
      return catRow({
        icon: TRACT_GLYPH[fp.cover], name: S.FIELD_NAMES[i], testid: `fold-field-${i}`, onclick: () => look(ctx, i),
        what: `${F.upper(S.COVER_WORD[fp.cover])}, ${t?.stage === 'fell' ? `벌목에 인일 ${Math.ceil(t.fellLeft)}` : t?.stage === 'stump' ? '업자가 뽑을 차례' : '돌을 주워야 함'}`,
      })
    }
    return catRow({
      icon: p.crop === 'potato' ? 'planted' : 'rest', name: S.FIELD_NAMES[i], testid: `fold-field-${i}`, onclick: () => look(ctx, i),
      what: p.crop === 'potato' ? `${S.variety(p.variety).name}${p.seed === 'saved' ? ', 자가 종자' : ''}` : fp.raw ? '휴경, 새 땅' : '휴경',
      figure: F.money(fieldCost(p)),
    })
  }))
}

// ---------------------------------------------------------------- people

const SKILL_WORD: [S.Skill, string][] = [['machine', '기계'], ['field', '밭일'], ['woods', '산일'], ['build', '건축'], ['pack', '포장']]

function bedText(c: S.Campaign): string {
  const L = S.labourInfo(c)
  if (L.hireWhy) return L.hireWhy
  return L.hired < S.HOUSED_OUT ? '고용한 두 사람은 마을에서 살 수 있습니다.' : `빈 침대: ${L.beds}개 중 ${L.housing - L.hired}개.`
}

// An applicant as the catalogue lists them: portrait, trait in a word, five skill boxes (on a phone the best one, as
// ten boxes), the wage asked, Hire.
function applicant(ctx: Ctx, a: S.ApplicantInfo, one: boolean, onTry: (err: string) => void): HTMLElement {
  const best = SKILL_WORD.find(([k]) => k === a.best)![1]
  const text = a.traitText.replace(/\.$/, '')
  return h('article', { class: 'applicant', testid: `applicant-${a.id}` },
    portrait(a, 52),
    h('div', { class: 'who' }, h('h3', null, a.name), h('p', null, h('b', null, a.traitName), one ? null : h('span', { class: 'desc' }, `: ${text[0].toLowerCase()}${text.slice(1)}.`))),
    one
      ? h('p', { class: 'skill-one', 'aria-label': `가장 잘함: ${best}, 10 중 ${a.skills[a.best]}` }, h('b', null, `${best} ${a.skills[a.best]}`), tens(a.skills[a.best], 0, { best: true }))
      : h('ul', { class: 'skill-row', 'aria-label': `10점 만점 기술: ${SKILL_WORD.map(([k, w]) => `${w} ${a.skills[k]}`).join(', ')}` },
        SKILL_WORD.map(([k, w]) => h('li', { class: k === a.best ? 'best' : null, 'aria-hidden': 'true' }, h('span', null, w), h('b', null, String(a.skills[k]))))),
    h('p', { class: 'price' }, h('b', { class: 'num' }, F.money(a.ask)), h('span', null, '월'),
      h('span', { class: 't-caption to-end', testid: `applicant-to-end-${a.id}` }, yearEnd(ctx, { t: 'hire', applicant: a.id }))),
    h('button', {
      class: 'btn', type: 'button', testid: `applicant-hire-${a.id}`, disabled: !!a.why, title: a.why || undefined, 'aria-label': `${a.name}을(를) 월 ${F.money(a.ask)}에 고용`,
      onclick: () => tryRun(ctx, { t: 'hire', applicant: a.id }, onTry, true),
    }, '고용'))
}

// A hired person made foreman of a block the farm holds, or put back to field work: the same choice as their card.
export function foremanRow(ctx: Ctx, c: S.Campaign, p: S.PersonInfo, onTry: (err: string) => void): HTMLElement {
  const blocks = S.BLOCKS.filter(b => S.PARCELS.some((x, i) => x.block === b && S.held(c, i)))
  const place = (b: S.BlockId) => BLOCK_NAME[b].replace(/^The /, '').split(',')[0]
  const name = (b: S.BlockId) => F.upper(place(b))
  return h('p', { class: 'cat-foreman', role: 'group', 'aria-label': `${p.name}을(를) 작업반장으로:`, testid: `spring-foreman-${p.id}` },
    h('span', { class: 't-label' }, icon('foreman', 'i'), term('작업반장', 'foreman'), ' 구역:'),
    blocks.map(b => {
      const other = c.crew.find(u => u.foreman === b && u.id !== p.id)
      return h('button', {
        class: 'btn', type: 'button', testid: `spring-foreman-${p.id}-${b}`, 'aria-pressed': String(p.foreman === b), disabled: !!other,
        title: other ? `${other.name}이(가) 이미 그곳의 작업반장입니다` : `일하는 아침마다 ${p.name}이(가) ${place(b)}에 필요한 일을 작업 목록에 올립니다. 작업반장은 밭일을 하지 않고 품값을 ${F.pct(S.FOREMAN_PAY - 1)} 더 받습니다.`,
        onclick: () => tryRun(ctx, p.foreman === b ? { t: 'foreman', unit: p.id, block: null } : { t: 'foreman', unit: p.id, block: b }, onTry),
      }, name(b))
    }))
}

// Naming a foreman from wherever the goal is shown outside spring and the season (the year end): a small paper with
// each hired person and the blocks.
export function openForeman(ctx: Ctx): void {
  let note = ''
  ctx.papers.open({
    title: '작업반장 정하기',
    kicker: '앞으로의 길',
    testid: 'foreman-paper',
    size: 'small',
    body: () => {
      const box = h('div', { class: 'cat-list' })
      const draw = () => {
        const c = ctx.app.campaign
        if (!c) return
        const hired = S.peopleInfo(c).filter(p => p.kind !== 'farmer')
        box.replaceChildren(h('div', null,
          h('p', { class: 'dlg-lead' }, '일하는 아침마다 ', term('작업반장', 'foreman'), '이(가) 한 ', term('구역', 'block'), `의 밭에 필요한 일을 작업 목록에 올립니다. 작업반장은 밭일을 하지 않고 품값을 ${F.pct(S.FOREMAN_PAY - 1)} 더 받습니다.`),
          hired.map(p => h('div', { class: 'cat-hired' }, portrait(p, 32), h('b', null, p.name), h('span', { class: 'it quiet' }, `월 ${F.money(p.pay)}`),
            foremanRow(ctx, c, p, err => { note = err; draw() }))),
          hired.length ? null : h('p', { class: 't-caption' }, '아직 고용한 사람이 없습니다. 먼저 봄에 사람을 고용하세요.'),
          note ? h('p', { class: 'card-refused c-red', role: 'alert' }, note) : null))
      }
      draw()
      return box
    },
    foot: close => h('button', { class: 'btn go', type: 'button', testid: 'foreman-close', autofocus: true, onclick: close }, '닫기'),
  })
}

function peopleBody(ctx: Ctx, c: S.Campaign, onTry: (err: string) => void, onClose: () => void): Child {
  const L = S.labourInfo(c)
  const one = ctx.layout() === 'narrow'
  const hired = S.peopleInfo(c).filter(p => p.kind !== 'farmer')
  const hall = (kind: 'hand' | 'operator') => {
    const why = S.hireBlock(c, kind)
    const wage = kind === 'hand' ? S.HAND_WAGE : S.OPERATOR_WAGE
    const end = why ? '' : yearEnd(ctx, { t: 'hire', kind })
    return h('button', { class: 'btn', type: 'button', testid: `hire-${kind}`, disabled: !!why, title: why || undefined, onclick: () => tryRun(ctx, { t: 'hire', kind }, onTry, true) },
      kind === 'hand' ? '밭 일꾼' : '기계 기사', h('span', { class: 'sub num' }, `월 ${F.money(wage)}`), end ? h('span', { class: 'sub num year-end', testid: `hire-${kind}-year-end` }, end) : null)
  }
  return [
    ...S.applicantInfo(c).map(a => applicant(ctx, a, one, onTry)),
    h('div', { class: 'cat-hall hall-row' }, h('p', { class: 't-label', title: '인력소에서 온 일꾼은 맡은 일에 평균적인 솜씨입니다.' }, '아니면 인력소에서'), hall('hand'), hall('operator'),
      L.hireWhy ? h('p', { class: 't-caption' }, L.hireWhy) : null),
    hired.length ? [
      h('p', { class: 't-label cat-sub' }, `당신의 작업반: ${L.housing}자리 중 ${L.hired}명`, L.hireWhy ? null : h('span', { class: 't-caption' }, ` ${bedText(c)}`)),
      h('ul', { class: 'cat-list' }, hired.map(p => h('li', { class: 'cat-hired' },
        portrait(p, 32),
        h('b', null, p.name),
        h('span', { class: 'it quiet' }, `${p.traitName}, 월 ${F.money(p.pay)}`),
        // Hired this spring, the hire can be undone in full.
        c.spring?.hired.some(x => x.unit === p.id) ? undoKey(ctx, `unhire-${p.id}`, `${p.name} 고용`, { t: 'unhire', unit: p.id }, onTry) : null,
        // Letting someone go cannot be taken back, so it asks once more here as it does on their card.
        h('button', {
          class: 'btn hazard', type: 'button', testid: `dismiss-${p.id}`,
          onclick: async () => {
            const yes = await confirmPaper(ctx, { title: `${p.name.split(' ')[0]}을(를)보낼까요?`, text: '오늘 떠나고 돌아오지 않습니다.', yes: '보내기', danger: true })
            if (yes && tryRun(ctx, { t: 'dismiss', unit: p.id }, onTry) && ctx.app.unit === p.id) ctx.app.selectUnit(-1)
          },
        }, '보내기'),
        foremanRow(ctx, c, p, onTry)))),
    ] : null,
    done('crew-close', onClose),
  ]
}

// ---------------------------------------------------------------- land

function landBody(ctx: Ctx, c: S.Campaign, onClose: () => void): Child {
  const land = S.landInfo(c).filter(l => l.tenure === 'none')
  const blocks = [...new Set(land.map(l => l.block))]
  return [
    h('p', { class: 't-caption' }, '여기나 지도에서 필지를 고르면 카드에 값과 딸린 것이 나옵니다.'),
    blocks.map(b => [
      h('p', { class: 't-label cat-sub' }, BLOCK_NAME[b]),
      h('ul', { class: 'cat-list' }, land.filter(l => l.block === b).map(l => catRow({
        icon: S.standing(l.cover) ? 'woods' : 'land', name: l.name, testid: `fold-land-${l.field}`, onclick: () => look(ctx, l.field),
        what: S.standing(l.cover) ? `개간할 ${l.cover === 'woods' ? '숲' : '덤불'}` : l.rentable ? `연 ${F.money(l.rent)}` : '',
        figure: F.money(l.price),
      }))),
    ]),
    done('land-close', onClose),
  ]
}

export function stoneWord(stones: number): string {
  return stones >= 0.6 ? '돌이 매우 많음' : stones >= 0.35 ? '돌이 많음' : '돌이 약간 있음'
}

// The head of a card on the land: what kind of record, the name, a line under it, and the way to let it go.
export function cardHead(ctx: Ctx, kind: string, name: string, caption: Child): HTMLElement {
  return h('header', { class: 'command-head' },
    h('div', null, h('p', { class: 't-label' }, kind), h('h2', { class: 't-title', testid: 'card-title' }, name), h('p', { class: 't-caption' }, caption)),
    h('button', { class: 'close', type: 'button', testid: 'card-close', 'aria-label': '이 카드 닫기 (Escape)', onclick: () => ctx.app.select(-1) }, icon('close', 'i')))
}

function noteLine(note: string): Child {
  return note ? h('p', { class: 'card-refused c-red', role: 'alert' }, note) : null
}

// The card for land the farm does not hold: rent it, or buy it on the mortgage or outright. note: why the last try failed.
export function landCard(ctx: Ctx, c: S.Campaign, field: number, note: string, onTry: (err: string) => void): Child {
  const l = S.landInfo(c).find(x => x.field === field)
  if (!l) return null
  const m = S.mortgageInfo(c)
  const first = l.loan * (m.rate + S.MORTGAGE_PRINCIPAL)
  const haul = l.haul > 0.005 ? ` 수확물을 날라오는 데 캐는 시간의 ${F.pct(l.haul)}이(가) 더 듭니다.` : ''
  const tract = S.standing(l.cover)
  return [
    cardHead(ctx, l.rentable ? '임차·매물' : '매물', l.name, `${BLOCK_NAME[l.block]}. ${tract ? '개간해 밭으로 만들 수 있는 구획입니다.' : POSITION_NOTE[l.elev]}`),
    h('div', { class: 'readings' },
      h('p', { class: 'wrap' }, icon('land', 'i'), h('span', null, `${tract ? '' : `${BLOCK_NOTE[l.block]} `}${l.brings}`.trim())),
      h('p', { class: 'wrap', testid: 'land-facts' }, icon('field', 'i'), h('span', null, tract
        ? '개간하면 돌 많은 새 땅이라, 먼저 1년을 쉬지 않으면 첫 감자 작물이 적게 나옵니다.'
        : `흙은 ${soilWord(l.soil)}이고, 조기 고사병은 포기의 ${F.pct(l.vert)}에 오며, ${stoneWord(l.stones)}입니다. 집에서 길로 ${roadTime(l.travel)}입니다.${haul}`))),
    h('div', { class: 'orders', role: 'group', 'aria-label': '이 땅을 얻는 방법' },
      l.rentable ? h('button', { class: 'order is-suggested', type: 'button', testid: 'land-rent', disabled: !!l.rentWhy, onclick: () => tryRun(ctx, { t: 'rent', field }, onTry) },
        icon('fist', 'i fist'), h('span', { class: 'key', 'aria-hidden': 'true' }, 'R'), icon('land', 'i'), h('span', { class: 'name' }, '빌리기'), h('span', { class: 'cost num' }, `연 ${F.money(l.rent)}`),
        h('span', { class: 'catch' }, '시즌이 시작될 때 내고, 그 해는 당신의 땅입니다.')) : null,
      h('button', { class: `order${l.rentable ? '' : ' is-suggested'}`, type: 'button', testid: 'land-buy', onclick: () => tryRun(ctx, { t: 'buyLand', field }, onTry) },
        l.rentable ? null : icon('fist', 'i fist'), h('span', { class: 'key', 'aria-hidden': 'true' }, 'B'), icon('bank', 'i'), h('span', { class: 'name' }, '사기'), h('span', { class: 'cost num' }, `계약금 ${F.money(l.down)}`),
        h('span', { class: 'catch' }, `나머지 ${F.money(l.loan)}은(는) 땅 모기지로 넘어가, 연말에 약 ${F.money(first)}이고 해마다 줄어듭니다.`)),
      c.cash >= l.price ? h('button', { class: 'order', type: 'button', testid: 'land-buy-cash', onclick: () => { if (tryRun(ctx, { t: 'buyLand', field }, onTry)) tryRun(ctx, { t: 'payMortgage', amount: l.loan }, onTry) } },
        h('span', { class: 'key', 'aria-hidden': 'true' }, 'O'), icon('money', 'i'), h('span', { class: 'name' }, '일시불로 사기'), h('span', { class: 'cost num' }, F.money(l.price)),
        h('span', { class: 'catch' }, '현금으로 다 내니 빚이 없습니다.')) : null),
    noteLine(note),
  ]
}

// On the card of a field the farm rents or bought: how it is held, and the way to give it up or buy it.
export function tenureRow(ctx: Ctx, c: S.Campaign, field: number, onTry: (err: string) => void): Child {
  const fp = c.fields[field]
  if (field < S.HOME_FIELDS && fp.tenure === 'owned') return null
  const p = S.PARCELS[field]
  if (fp.tenure === 'owned') {
    const loan = S.mortgageInfo(c).loans.find(x => x.field === field)
    return h('p', { class: 'card-tenure', testid: 'tenure' }, `${BLOCK_NAME[p.block]}. 당신 소유입니다${loan ? `. ${F.money(loan.owed)}의 빚이 남았습니다` : ''}.`)
  }
  return h('div', { class: 'card-tenure', testid: 'tenure' },
    h('p', null, `${BLOCK_NAME[p.block]}. 올해 ${F.money(p.rent)}에 빌렸습니다.`),
    h('button', { class: 'btn', type: 'button', testid: 'land-release', onclick: () => tryRun(ctx, { t: 'release', field }, onTry) }, '임차 그만두기'),
    h('button', { class: 'btn', type: 'button', testid: 'land-buy', onclick: () => tryRun(ctx, { t: 'buyLand', field }, onTry) }, '사기', h('span', { class: 'sub num' }, `계약금 ${F.money(Math.round(p.price * S.MORTGAGE_DOWN))}`)))
}

const STAGES: [S.ClearStage, string][] = [['fell', '벌목'], ['stump', '그루터기'], ['rocks', '돌'], ['done', '밭']]

// The card for a tract the farm holds (design/tract.html): where its clearing stands, what the next step takes and
// yields, its shelter.
export function tractCard(ctx: Ctx, c: S.Campaign, field: number, note: string, onTry: (err: string) => void): Child {
  const t = S.tractInfo(c).find(x => x.field === field)
  if (!t) return null
  const at = STAGES.findIndex(([k]) => k === t.stage)
  const logs = Math.round(t.timber * (1 - t.felled))
  return [
    cardHead(ctx, '구획 기록', t.name, `${F.upper(t.coverWord)}. ${BLOCK_NAME[t.block]}.`),
    h('ol', { class: 'steps', 'aria-label': `개간: 다음은 ${STAGES[at][1]}` }, STAGES.map(([k, label], n) =>
      h('li', { class: n < at ? 'done' : n === at ? 'now' : null, 'aria-current': n === at ? 'step' : undefined, 'data-k': k }, label))),
    h('div', { class: 'readings' },
      t.stage === 'fell' ? h('p', null, icon('woods', 'i'), `${F.pct(t.felled)} 벌목함`, h('span', { class: 'meter', style: 'flex:1', 'aria-hidden': 'true' }, h('i', { style: `width:${(t.felled * 100).toFixed(1)}%` }))) : null,
      t.stage === 'fell' ? h('p', { class: 'wrap' }, icon('logs', 'i'), h('span', null, '약 ', h('b', null, `${logs}적재분`), `의 통나무. 제재소에서 ${F.money(logs * S.LOG_PRICE)}이거나 건축 자재로 씁니다.`)) : null,
      t.shelters.length ? h('p', { class: 'wrap' }, icon('leaf', 'i'), h('span', null, `${F.list(t.shelters.map(i => S.FIELD_NAMES[i]))}을(를) 감싸 물을 아껴주지만, 역병 날씨가 한 시간 늘고 서리가 더 차가워집니다.`)) : null),
    t.stage === 'stump' && !t.works ? h('div', { class: 'orders', role: 'group', 'aria-label': '지시' },
      h('button', { class: 'order is-suggested', type: 'button', testid: 'tract-stump', disabled: !!t.stumpWhy, title: t.stumpWhy || undefined, onclick: () => tryRun(ctx, { t: 'stump', field }, onTry) },
        icon('fist', 'i fist'), h('span', { class: 'key', 'aria-hidden': 'true' }, 'U'), icon('stump', 'i'), h('span', { class: 'name' }, '그루터기 뽑기'), h('span', { class: 'cost num' }, F.money(t.stumpFee)),
        h('span', { class: 'catch' }, `업자의 불도저가 시즌 중 약 ${S.STUMP_DAYS}일 걸립니다.`))) : null,
    h('p', { class: 'note' }, t.next || '개간이 끝났고 다음 봄부터 밭이 됩니다.',
      t.stage === 'fell' ? ' 벌목은 시즌 중 절반 속도라, 겨우내 사람을 데리고 있으면 전속력으로 뱁니다.' : ''),
    noteLine(note),
  ]
}

// ---------------------------------------------------------------- equipment

export function equipNeeds(c: S.Campaign, id: S.UpgradeId): string {
  const u = S.UPGRADES[id]
  if ((id === 'tractor2' || id === 'tractor3') && !S.hasBuilt(c, 'shed')) return '먼저 기계 창고를 지으세요.'
  if (id === 'tractor3' && !c.upgrades.tractor2) return '먼저 두 번째 트랙터를 사세요.'
  if (id === 'house2' && S.buildingAt(c, 'house', S.HOME_YARD)) return '두 번째 감자 저장고가 이미 있거나 짓는 중입니다.'
  if (S.spendBlock(c, u.cost, 'equipment')) return c.phase === 'plan' ? `현금 ${F.money(u.cost)}이(가) 필요합니다. 봄에는 은행이 장비비를 빌려주지 않습니다.` : S.spendBlock(c, u.cost, 'equipment')
  return ''
}

function equipmentBody(ctx: Ctx, c: S.Campaign, onTry: (err: string) => void, onClose: () => void): Child {
  const ids = Object.keys(S.UPGRADES) as S.UpgradeId[]
  // Equipment comes out of the cash in hand; the plan still costs what it did, so the spring loan lends that much more.
  const plan = S.planCost(c)
  const loanAdds = (cost: number) => Math.max(0, plan - (c.cash - cost)) - Math.max(0, plan - c.cash)
  return [
    h('p', { class: 't-caption', testid: 'equip-cash' }, `장비는 현금에서 냅니다. 지금 ${F.money(Math.max(0, c.cash))}. 계획이 쓴 만큼은 `, term('봄 융자', 'spring loan'), '으로 넘어갑니다.'),
    h('ul', { class: 'cat-list cat-equip' }, ids.map(id => {
      const u = S.UPGRADES[id]
      const why = c.upgrades[id] ? '' : equipNeeds(c, id)
      return h('li', null,
        h('div', null, h('b', null, u.name), h('p', { class: 't-caption' }, F.localize(u.blurb)), why ? h('p', { class: 't-caption c-ochre' }, why) : null),
        c.upgrades[id] ? [h('span', { class: 'stamp sm' }, '보유'), c.spring?.bought.some(b => b.upgrade === id) ? undoKey(ctx, `unbuy-${id}`, `${u.name} 구입`, { t: 'unbuy', upgrade: id }, onTry) : null]
          : h('button', {
            class: 'btn cat-buy', type: 'button', testid: `buy-${id}`, disabled: !!why, title: why || undefined,
            onclick: () => tryRun(ctx, { t: 'buy', upgrade: id }, onTry, true),
          }, '사기', h('span', { class: 'sub num' }, F.money(u.cost)), !why && loanSays(u.cost, loanAdds(u.cost)) ? h('span', { class: 'loan-adds num' }, loanSays(u.cost, loanAdds(u.cost))) : null,
          why ? null : h('span', { class: 'loan-adds num year-end', testid: `buy-${id}-year-end` }, yearEnd(ctx, { t: 'buy', upgrade: id }))))
    })),
    done('equipment-close', onClose),
  ]
}

// ---------------------------------------------------------------- the land mortgage

function bankBody(ctx: Ctx, c: S.Campaign, onTry: (err: string) => void, onClose: () => void): Child {
  const m = S.mortgageInfo(c)
  const pay = (amount: number, label: string) => h('button', {
    class: 'btn', type: 'button', testid: `pay-${Math.round(amount)}`, disabled: !!m.payWhy || c.cash < amount, title: m.payWhy || undefined,
    onclick: () => tryRun(ctx, { t: 'payMortgage', amount }, onTry),
  }, label, h('span', { class: 'sub num' }, F.money(amount)))
  return [
    h('ul', { class: 'cat-list' }, m.loans.map(x => h('li', null, h('p', { class: 'lead cat-loan' },
      icon('bank', 'i'), h('b', null, x.name), h('span', { class: 'it quiet' }, `원래 ${F.money(x.loan)}`), h('span', { class: 'dots' }), h('span', { class: 'num' }, F.money(x.owed)))))),
    h('p', { class: 't-caption' }, `연말에 은행은 원금 ${F.money(m.principal)}에 더해 빚의 ${F.pct(m.rate)}인 이자 ${F.money(m.interest)}을(를) 가져갑니다. 지금 더 갚아두면 해마다 이자가 줄지만, 이번 시즌에 필요할지도 모를 현금입니다.`),
    h('div', { class: 'cat-hall' }, m.owed > 5000 ? pay(5000, '갚기') : null, m.owed > 20000 ? pay(20000, '갚기') : null, pay(Math.round(m.owed), '전부 갚기')),
    done('bank-close', onClose),
  ]
}

// ---------------------------------------------------------------- the farm's rules

function rulesBody(ctx: Ctx, c: S.Campaign, onTry: (err: string) => void, onClose: () => void): Child {
  return [
    h('div', { class: 'seg-in', role: 'radiogroup', 'aria-label': '일요일' },
      ([true, false] as const).map(off => h('label', null,
        h('input', { type: 'radio', name: 'sundays', checked: c.sundaysOff === off, testid: `rule-sundays-${off ? 'off' : 'on'}`, onchange: () => tryRun(ctx, { t: 'sundays', off }, onTry) }),
        h('span', null, off ? '일요일 휴식' : '일요일 작업')))),
    h('p', { class: 't-caption' }, c.sundaysOff ? '모두가 주에 하루 쉬고 상쾌하게 돌아옵니다.' : '주에 하루 일이 더 많지만 모두가 지치고, 지친 사람은 느려지고 기운을 잃고 다칩니다.'),
    done('rules-close', onClose),
  ]
}

// ---------------------------------------------------------------- the folds

export function springFolds(ctx: Ctx, c: S.Campaign, onTry: (err: string) => void, onClose: () => void): FoldRow[] {
  const mine = heldFields(c)
  const open = mine.filter(i => c.fields[i].cover === 'open')
  const potato = open.filter(i => c.plans[i].crop === 'potato').length
  const tracts = mine.length - open.length
  const pc = S.planCosts(c)
  const L = S.labourInfo(c)
  const asking = c.applicants.length
  const land = S.landInfo(c).filter(l => l.tenure === 'none')
  const forRent = land.filter(l => l.rentable).length
  const offers = c.offers.length
  const signed = c.contracts.length
  const ids = Object.keys(S.UPGRADES) as S.UpgradeId[]
  const owned = ids.filter(id => c.upgrades[id]).length
  const m = S.mortgageInfo(c)
  const rows: FoldRow[] = [{
    id: 'fields', open: 'fields-open', testid: 'fields', glyph: 'plant', name: '밭',
    state: [`감자 ${potato}곳`, `휴경 ${open.length - potato}곳`, tracts ? `구획 ${tracts}` : ''].filter(Boolean).join(', '),
    short: `심을 ${potato}곳`, figure: F.money(pc.fields), body: () => fieldsBody(ctx, c),
  }, {
    id: 'people', open: 'crew-open', testid: 'crew', glyph: 'people', name: '사람',
    state: [asking ? `일 찾는 사람 ${asking}명` : '일 찾는 사람 없음', L.hired ? `고용 ${L.hired}명` : ''].filter(Boolean).join(', '),
    short: asking ? `구직 ${asking}명` : `고용 ${L.hired}명`,
    figure: pc.wages ? `월 ${F.money(pc.wages)}` : undefined, body: () => peopleBody(ctx, c, onTry, onClose),
  }, {
    id: 'land', open: 'land-open', testid: 'land', glyph: 'land', name: '땅',
    state: land.length ? `임차 ${forRent}, 매물 ${land.length}` : '매물 없음', body: () => landBody(ctx, c, onClose),
  }, {
    id: 'contracts', open: 'contracts-open', testid: 'contracts', glyph: 'contract', name: '계약',
    state: [offers ? `제안 ${offers}건` : '더 이상 제안 없음', signed ? `체결 ${signed}건` : ''].filter(Boolean).join(', '),
    body: () => [springContracts(ctx, c), done('contracts-close', onClose)],
  }, {
    id: 'equipment', open: 'equipment-open', testid: 'equipment', glyph: 'machine', name: '장비',
    state: [owned ? `보유 ${owned}` : '', owned < ids.length ? `살 수 있는 ${ids.length - owned}` : ''].filter(Boolean).join(', '),
    body: () => equipmentBody(ctx, c, onTry, onClose),
  }]
  if (m.owed > 0) rows.push({
    id: 'bank', open: 'bank-open', testid: 'bank', glyph: 'bank', name: '모기지',
    state: `${F.money(m.owed)} 남음`, figure: F.money(m.principal + m.interest), body: () => bankBody(ctx, c, onTry, onClose),
  })
  if (L.hired > 0 || c.history.length > 0) rows.push({
    id: 'rules', open: 'rules-open', testid: 'rules', glyph: 'calendar', name: '농장 규칙',
    state: c.sundaysOff ? '일요일 휴식' : '일요일 작업', body: () => rulesBody(ctx, c, onTry, onClose),
  })
  return rows
}
