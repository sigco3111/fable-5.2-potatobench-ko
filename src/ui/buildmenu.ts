// The build menu: everything money and work can add to the farm, in one sheet that is always a press away (the
// owner, 14 November: "the freedom like whats building etc how do you get upgrades"; think of RimWorld's Architect
// and the toolbar of Cities: Skylines). Buildings the crew puts up, machines, people, and land to clear: each with
// what it changes, what it costs, and either the one press that gets it or the plain reason it cannot be had yet.
import * as S from '../sim/index.ts'
import type { Ctx } from './core.ts'
import { openCrew } from './crew.ts'
import { h } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { BUILD_GLYPH } from './rules.ts'
import { equipNeeds } from './spring.ts'
import './buildmenu.css'

type State = 'can' | 'no' | 'have' | 'doing'
// cost: what it takes from the year-end forecast, where that is a plain sum. tag: a word of advice beside its name.
// gist: what it changes, in a few words, beside its name (two viewers of the menu: "give each building one short
// effect line"); the sentence under it says the rest.
// cmd: the purchase as a command, tried on a copy of the farm for the year-end figure it leaves.
interface Item { id: string; glyph: string; name: string; gist?: string; does: string; price: string; cost?: number; cmd?: S.Cmd; tag?: string; sub?: string; state: State; why: string; label: string; run?: () => void }

// The trade's words, said plainly where a newcomer meets them first (two viewers who knew nothing of potatoes: "cwt",
// "intervale field", "No. 1", "B size").
const plain = (t: string): string => t.replace(/\bcwt\b/g, 'hundredweight').replace(/a home or intervale field/, 'a field near the pond').replace('Packed No. 1 sells for 15% more, and packed B size sells for three quarters of the No. 1 price.', 'Packed potatoes sell for 15% more, and the small ones sell too.')
// (each from the catalogue's own figures: src/sim/params.ts, BUILDINGS and UPGRADES)
const BUILD_GIST: Record<S.BuildingKind, string> = {
  house: '저장 +3,600cwt', shed: '기계 작업 15% 빨라짐', bunk: '고용한 사람 침대 +6', packing: '겨울 판매가 +15%',
  pond: '물주기 여섯 번 저장', stand: '시장가의 두 배에 판매', station: '더 정확한 일기예보', road: '이동·운반 30% 빨라짐',
}
// When a building is worth its price, from what it does in the game (src/sim/params.ts, BUILDINGS; two hired people
// can live out, HOUSED_OUT; the home cellar holds CELLAR_CWT). No sum of money is put on one the game has no sum for.
const BUILD_WHEN: Record<S.BuildingKind, string> = {
  house: '저장고보다 작물이 많아질 때 가치가 있습니다',
  shed: '두 번째 트랙터 전에, 트랙터에 필요합니다',
  bunk: '세 번째 일꾼을 고용하고 싶을 때',
  packing: '작물을 저장해 겨울에 팔 때',
  pond: '여름이 가물 때',
  stand: '첫 수확부터 해마다 가치가 있습니다',
  station: '살포를 직접 지시할 때',
  road: '마당에서 먼 밭이 있을 때',
}
const UPGRADE_GIST: Record<S.UpgradeId, string> = {
  boom: '살포 2.5배 빠름', harvester: '캐기 1.6배 빠름', vent: '저장 늘고 썩음 줄어듦', reel: '물주기 2배 빠름',
  tractor2: '기계 두 대 동시 작업', house2: '저장 두 배, 바로 지어짐', tractor3: '기계 세 대 동시 작업', truck: '운반 2배 빠름',
}
const UPGRADE_GLYPH: Record<S.UpgradeId, string> = { boom: 'spray', harvester: 'dig', vent: 'store', reel: 'water', tractor2: 'machine', house2: 'store', tractor3: 'machine', truck: 'haul' }
// What a machine's purchase waits on, said as the thing to do first.
const first = (why: string): string => /Dufour place|뒤푸르/i.test(why) ? '먼저 뒤푸르 밭이 필요합니다' : /machine shed|기계 창고/i.test(why) ? '기계 창고가 필요합니다' : /second tractor|두 번째 트랙터/i.test(why) ? '두 번째 트랙터가 필요합니다' : /can't afford|costs \$|You need \$|현금|모자/i.test(why) ? '아직 돈이 부족합니다' : why.replace(/\.$/, '')

function items(ctx: Ctx, c: S.Campaign, done: (text: string, ok: boolean) => void): { title: string; note: string; list: Item[] }[] {
  const app = ctx.app
  const run = (cmd: S.Cmd) => { const r = ctx.run(cmd); done(r.ok ? F.localize(r.events[0]?.text ?? '완료.') : F.localize(r.err), r.ok) }
  const loads = (n: number) => F.num(Math.ceil(n))
  // What the stand takes in a day over selling the same potatoes at the market's price (src/sim/season.ts, standSales).
  const grown = c.plans.find(p => p?.crop === 'potato')?.variety
  const standExtra = grown ? Math.round(S.STAND_CWT * S.basePrice(app.world, c, grown) * (S.STAND_PRICE - 1) / 10) * 10 : 0
  // The farm's own figures where the game has them (both viewers of every pass asked what a building brings back):
  // this season's crop against what the potato houses hold, and what a winter of the farmer's own packing adds
  // (PACK_PER_DAY a day for FARMER_WINTER_DAYS a month, PACK_NO1 over the price less the packing charge).
  const crop = c.phase === 'season' && c.season ? Math.round(S.cropAhead(c) / 100) * 100 : 0
  const holds = S.cellarCapacity(c)
  // (not while a second house is going up: what the farm can store is about to change)
  const going = c.buildings.some(b => b.kind === 'house' && !b.built)
  const storing = crop <= 0 || going ? '' : crop > holds ? `작물이 약 ${F.mass(crop)}인데 저장은 ${F.mass(holds)}: ${F.mass(crop - holds)}은(는) 수확 때 팔게 됩니다`
    : `올해 작물은 이미 다 저장할 수 있습니다 (${F.mass(holds)} 중 약 ${F.mass(crop)})`
  const packs = grown ? Math.round(S.packOutlook(app.world, c, grown) / 100) * 100 : 0
  const own: Partial<Record<S.BuildingKind, string>> = { house: storing, packing: packs > 0 ? `겨우내 직접 포장하면 보통의 겨울 값으로 약 ${F.money(packs)}이(가) 더해집니다` : '' }
  const buildings: Item[] = S.buildingInfo(c).filter(b => b.yard === S.HOME_YARD).map(b => {
    const mats = [b.logs > 0 ? `통나무 ${loads(b.logs)}` : '', b.stone > 0 ? `돌 ${loads(b.stone)}` : ''].filter(Boolean).join('·')
    const bought = b.buyLogs > 0 || b.buyStone > 0
    const crewDays = Math.max(1, Math.ceil(b.days / Math.max(1, c.crew.length)))
    return {
      id: `build-${b.kind}`, glyph: BUILD_GLYPH[b.kind], name: b.name, gist: b.kind === 'stand' && standExtra > 0 ? `수확 뒤 하루 약 +${F.money(standExtra)}` : BUILD_GIST[b.kind], does: `${plain(b.does)}${mats ? ` ${mats}이(가) 듭니다${bought ? ', 값에 포함' : ', 당신의 마당에서'}.` : ''}`,
      price: F.money(b.total), cost: b.total,
      tag: b.kind === 'stand' && b.state === 'none' ? '가장 싼 건물: 처음 짓기 좋음' : undefined,
      // (its materials are on its slip with the sentence: "30 logs and 25 stone, included in the price" beside a
      // yard of none read as a thing still to be got)
      // (the stand's price over what it takes in a day more than the market would pay: the days of selling that pay for it)
      sub: `${b.kind === 'stand' && standExtra > 0 ? `파는 날 약 ${Math.ceil(b.total / standExtra)}일이면 본전` : own[b.kind] || BUILD_WHEN[b.kind]} · 약 ${crewDays}일이면 지어짐${mats && !bought ? `, 마당의 ${mats} 사용` : ''}`,
      state: b.state === 'built' ? 'have' : b.state === 'building' ? 'doing' : b.ok ? 'can' : 'no',
      why: b.state === 'built' ? '지어짐' : b.state === 'building' ? `짓는 중: ${F.pct(b.progress)} 완료` : b.ok ? '' : first(b.why),
      label: '짓기', cmd: { t: 'build', kind: b.kind, yard: S.HOME_YARD }, run: () => run({ t: 'build', kind: b.kind, yard: S.HOME_YARD }),
    }
  })
  const machines: Item[] = (Object.keys(S.UPGRADES) as S.UpgradeId[]).map(id => {
    const u = S.UPGRADES[id]
    const have = !!c.upgrades[id]
    const why = have ? '' : equipNeeds(c, id)
    return {
      id: `buy-${id}`, glyph: UPGRADE_GLYPH[id], name: u.name, gist: UPGRADE_GIST[id], sub: (id === 'vent' || id === 'house2') && storing ? storing : undefined, does: plain(u.blurb.replace(/ You need the machine shed[^.]*\./, '')), price: F.money(u.cost), cost: u.cost,
      state: have ? 'have' : why ? 'no' : 'can', why: have ? '보유' : why ? first(why) : '',
      label: '사기', cmd: { t: 'buy', upgrade: id }, run: () => run({ t: 'buy', upgrade: id }),
    }
  })
  const room = S.hireBlock(c, 'hand')
  const hire = (kind: 'hand' | 'operator', name: string, wage: number, does: string): Item => ({
    id: `hire-${kind}`, glyph: kind === 'hand' ? 'hand' : 'machine', name, does, price: `월 ${F.money(wage)}`, cost: wage, cmd: { t: 'hire', kind },
    state: room ? 'no' : 'can', why: room ? (/bunkhouse|숙소/i.test(room) ? '빈 침대가 없습니다: 숙소를 지으면 침대 여섯' : first(room)) : '', label: '고용하기', run: () => run({ t: 'hire', kind }),
  })
  const crew: Item[] = [
    hire('hand', '밭 일꾼', S.HAND_WAGE, '걸어서 일합니다: 살펴보기, 병든 포기 뽑기, 벌목, 돌 고르기, 짓기, 심는 기계와 캐는 기계 돕기.'),
    hire('operator', '트랙터 기사', S.OPERATOR_WAGE, '기계를 몹니다: 심기, 북주기, 살포, 캐기, 운반. 트랙터가 두 대면 두 밭을 동시에 합니다.'),
    { id: 'hire-list', glyph: 'people', name: '일을 찾는 사람들', does: '이름과 각자의 기술과 품값이 있는 사람들입니다.', price: '', state: c.applicants.length ? 'can' : 'no', why: c.applicants.length ? '' : '지금은 찾는 사람이 없습니다: 해마다 봄에 옵니다', label: '보기', run: () => openCrew(ctx) },
  ]
  const season = c.phase === 'season' && !!c.season
  const land: Item[] = S.tractInfo(c).filter(t => t.tenure !== 'none').flatMap((t): Item[] => {
    const listed = season && c.season!.jobs.some(j => j.kind === 'fell' && j.field === t.field)
    if (t.stage === 'fell') {
      const why = season ? S.jobBlock(c, 'fell', t.field) : '벌목은 시즌 중에 지시하거나 겨울 일로 정합니다'
      return [{
        id: `fell-${t.field}`, glyph: 'woods', name: `${t.name} 개간하기`, does: `작업반이 벌목합니다. 통나무는 짓기 위해 마당으로 가거나 적재분당 ${F.money(S.LOG_PRICE)}에 제재소로 갑니다. 그 다음 그루터기를 뽑으면 새 밭이 됩니다.`,
        price: '비용 없음', sub: '한가한 사람이 하는 일: 작물이 필요로 하면 멈춥니다.',
        state: listed ? 'doing' : why && !listed ? 'no' : 'can', why: listed ? `작업 목록에 있음${t.felled > 0 ? `: ${F.pct(t.felled)} 벌목함` : ''}` : why ? first(why) : '', label: '벌목하기',
        run: () => { const r = app.order('fell', { fields: [t.field] })[0]; done(r?.ok ? `${t.name} 벌목이 작업 목록에 올랐습니다.` : r?.err ?? '지금은 지시할 수 없습니다.', !!r?.ok); if (r?.ok) app.focus(t.field) },
      }]
    }
    if (t.stage === 'stump') {
      return [{
        id: `stump-${t.field}`, glyph: 'stump', name: `${t.name}의 그루터기 뽑기`, does: `업자의 불도저가 약 ${S.STUMP_DAYS}일 만에 치웁니다. 그 다음 돌을 고르고 농사지을 수 있습니다.`,
        price: F.money(t.stumpFee), state: t.works ? 'doing' : t.stumpWhy ? 'no' : 'can', why: t.works ? '업자가 작업 중' : t.stumpWhy ? first(t.stumpWhy) : '', label: '업자 부르기', run: () => run({ t: 'stump', field: t.field }),
      }]
    }
    return []
  })
  // Woods and brush for sale: bought in any part of the year, a quarter down and the rest on the land mortgage.
  for (const l of S.landInfo(c).filter(x => S.standing(x.cover) && x.price > 0)) {
    const down = Math.round(l.price * S.MORTGAGE_DOWN)
    land.push({
      id: `land-${l.field}`, glyph: 'woods', name: `${l.name} 사기`, does: F.localize(l.brings || '개간해 새 밭으로 만들 땅.'),
      price: `계약금 ${F.money(down)}`, cost: down, sub: `전부 ${F.money(l.price)}: 지금 1/4, 나머지는 땅 모기지로 매 연말에 갚습니다.`,
      state: l.buyWhy ? 'no' : 'can', why: l.buyWhy ? first(l.buyWhy) : '', label: 'Buy',
      run: () => { const r = ctx.run({ t: 'buyLand', field: l.field }); done(r.ok ? F.localize(r.events[0]?.text ?? 'Done.') : F.localize(r.err), r.ok); if (r.ok) app.focus(l.field) },
    })
  }
  land.push({ id: 'more-land', glyph: 'land', name: '더 많은 밭', does: '바로 심을 수 있는 밭. 1년 빌리거나 살 수 있습니다.', price: '', state: 'no', why: '해마다 봄 계획에서 빌리고 삽니다', label: '' })
  return [
    { title: '건물', note: '작업반이 작물 일 틈틈이 짓습니다. 1cwt는 감자 100파운드(약 45kg)입니다.', list: buildings },
    { title: '기계', note: '사는 날 배달됩니다.', list: machines },
    { title: '사람', note: '', list: crew },
    { title: '땅', note: '', list: land },
  ]
}

export function openBuild(ctx: Ctx): void {
  const app = ctx.app
  let off: (() => void) | null = null
  ctx.papers.open({
    title: '짓기·사기',
    testid: 'build',
    size: 'wide',
    kicker: '건물, 기계, 사람과 땅',
    onClose: () => { off?.(); off = null },
    body: () => {
      const box = h('div', { class: 'bm' })
      let said: { text: string; ok: boolean } | null = null
      const draw = (): void => {
        const c = app.campaign
        if (!c) return
        const money = c.phase === 'season' || c.phase === 'cellar' ? S.moneyNow(app.world, c) : null
        // The year-end figure with the purchase made: the game's own forecast on a copy of the farm (so a farm
        // stand's sales to the season's close are in it), or the figure less the price where it cannot be tried.
        const leftAfter = (x: Item, after: number): number => {
          if (x.cmd) { const copy = structuredClone(c); if (S.apply(app.world, copy, x.cmd).ok) return S.moneyNow(app.world, copy).after }
          return after - (x.cost ?? 0)
        }
        const row = (x: Item): HTMLElement => h('li', { class: `bm-row is-${x.state}${x.tag && x.state === 'can' ? ' is-pick' : ''}`, testid: x.id, title: x.gist && !ctx.touch() ? x.does : undefined },
          icon(x.glyph, 'i bm-ic'),
          h('div', { class: 'bm-what' }, h('b', { class: 'bm-name' }, x.name, x.gist ? h('span', { class: 'bm-gist' }, x.gist) : null, x.tag && x.state === 'can' ? h('span', { class: 'bm-tag' }, x.tag) : null), x.gist ? null : h('span', { class: 'bm-does' }, x.does), x.sub ? h('span', { class: 'bm-sub t-caption' }, x.sub) : null),
          h('div', { class: 'bm-get' },
            x.state === 'can' && x.run ? [h('button', { class: 'btn go bm-key', type: 'button', testid: `${x.id}-go`, onclick: x.run }, x.label, x.price && x.price !== '비용 없음' ? h('span', { class: 'num bm-price' }, x.price) : null),
              // What the purchase leaves of the year-end forecast, so its price is read against the goal.
              money && x.cost ? ((left: number) => h('span', { class: `bm-left t-caption num${left < 0 ? ' c-red' : ''}`, testid: `${x.id}-left` }, '연말 현금 ', h('span', { class: 'bm-was' }, F.money(Math.round(money.after / 100) * 100)), ' \u2192 ', h('b', { class: left < 0 ? 'c-red' : left > money.after ? 'bm-up' : 'bm-ok' }, F.money(Math.round(left / 100) * 100))))(leftAfter(x, money.after)) : null]
              // (no price beside a thing built or going up: with the yard's logs used, the figure there was no longer what was paid)
              : [x.price && x.state === 'no' ? h('span', { class: 'num bm-price' }, x.price) : null, h('span', { class: `bm-why${x.state === 'have' ? ' ok' : ''}` }, x.state === 'have' ? [icon('check', 'i'), x.why] : x.why)]))
        const groups = items(ctx, c, (text, ok) => { said = { text, ok }; draw() })
        const head = h('div', { class: 'bm-head' },
          h('div', { class: 'bm-fig', testid: 'build-spend' }, h('span', { class: 't-label' }, '쓸 수 있는 돈'), h('b', { class: 'num' }, F.money(Math.floor(S.spendable(c)))),
            // (whose money it is, said outright: two viewers in a row asked whether a purchase is cash or debt)
            h('span', { class: 't-caption' }, c.phase === 'plan' ? '당신의 현금' : c.cash >= 1 ? `${F.money(Math.floor(c.cash))}은(는) 당신의 현금, 나머지는 빚이며 작물이 갚습니다` : '전부 빚: 작물이 팔리기 전까지 현금이 없고, 작물이 갚습니다')),
          h('div', { class: 'bm-fig' }, h('span', { class: 't-label' }, '당신의 자재'), h('b', { class: 'num' }, `통나무 ${F.num(Math.floor(c.logs))} · 돌 ${F.num(Math.floor(c.stone))}`), h('span', { class: 't-caption' }, '나무를 베고 돌을 주운 것. 모자란 것은 값에 포함됩니다')))
        const jump = h('nav', { class: 'bm-jump', 'aria-label': '바로가기' }, groups.map((g, k) => h('button', { class: 'btn quiet', type: 'button', testid: `build-jump-${k}`, onclick: () => box.querySelectorAll('.bm-group')[k]?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }, g.title)))
        const parts: (Node | null)[] = [head as Node, jump,
          said ? h('p', { class: `bm-said${said.ok ? '' : ' c-red'}`, testid: 'build-said', role: 'status' }, said.text) : null,
          ...groups.map(g => h('section', { class: 'bm-group' },
            h('h3', { class: 'bm-title t-label' }, g.title), g.note ? h('p', { class: 'bm-note t-caption' }, g.note) : null,
            h('ul', { class: 'bm-list' }, g.list.map(row))))]
        box.replaceChildren(...parts.filter((x): x is Node => !!x))
      }
      draw()
      off = app.on(e => { if (e.type === 'change' || (e.type === 'events' && e.dayPassed)) draw() })
      return box
    },
  })
}
