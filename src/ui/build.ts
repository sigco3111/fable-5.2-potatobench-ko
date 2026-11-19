// The yard's command bar (design/yard.html): what stands there, what is going up and who is on it, and what can be
// raised, each building an order numbered with its key, its cost in dollars, logs, stone and crew-days, then its catch.
import * as S from '../sim/index.ts'
import { EXIT_MS, patch, type Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { ringFor } from './crew.ts'
import { BUILD_GLYPH, firstName } from './rules.ts'
import { meter, order } from './system/parts.ts'
import { ringed } from './system/people.ts'

export const YARD_TITLE: Record<number, string> = { [S.HOME_YARD]: '본가 마당', [S.DUFOUR_YARD]: '뒤푸르 마당' }

export interface YardCard {
  el: HTMLElement
  update(c: S.Campaign, suggest?: S.BuildingKind | null): void
  // Orders the building numbered n on the bar (the keys 1 to 9). False when the bar is not up or there is no such one.
  pick(n: number): boolean
}

// Whole loads, as the top bar and a building's cost count them.
function loads(n: number): string {
  return F.num(S.wholeLoads(n))
}

export function yardCard(ctx: Ctx): YardCard {
  const app = ctx.app
  const el = h('section', { class: 'command sheet sys yard-card compact', testid: 'yard-card', 'aria-label': '마당', hidden: true })
  let shownFor = 0
  let flashed: { kind: S.BuildingKind | null; text: string; until: number } | null = null
  let can: S.BuildingInfo[] = []

  function build(b: S.BuildingInfo): void {
    if (!b.ok) { flashed = { kind: b.kind, text: F.localize(b.why), until: performance.now() + 5000 }; ctx.announce(flashed.text); setTimeout(() => ctx.dirty(), 5100); ctx.dirty(); return }
    const r = app.do({ t: 'build', kind: b.kind, yard: b.yard })
    if (!r.ok) { flashed = { kind: b.kind, text: F.localize(r.err), until: performance.now() + 5000 }; ctx.announce(flashed.text); setTimeout(() => ctx.dirty(), 5100); ctx.dirty(); return }
    flashed = null
    ctx.announce(F.localize(r.events[0]?.text ?? `${b.name} 착공.`))
  }

  // Who is on a building now: the people holding its order.
  function builders(c: S.Campaign, kind: S.BuildingKind, yard: number): S.Unit[] {
    const b = S.buildingAt(c, kind, yard)
    const job = b ? c.season?.jobs.find(j => j.kind === 'build' && j.building === b.id) : undefined
    return job ? c.crew.filter(u => u.job === job.id) : []
  }

  // A building's cost as its order prints it: dollars, then what the yard must find, then the days of work.
  function costOf(b: S.BuildingInfo): string {
    // (each item keeps to one line: a number is never parted from what it counts)
    return [F.money(b.cash), b.logs ? `통나무\u00a0${b.logs}적재분` : '', b.stone ? `막돌\u00a0${b.stone}적재분` : '', `인일\u00a0${b.days}일`].filter(Boolean).join(' · ')
  }

  function body(c: S.Campaign, yard: number, suggest: S.BuildingKind | null): Child {
    const all = S.buildingInfo(c).filter(b => b.yard === yard)
    const up = all.filter(b => b.state === 'building')
    can = all.filter(b => b.state === 'none')
    const m = S.materialsInfo(c)
    const houses = S.storageInfo(c).houses.filter(x => x.at === yard)
    const built = all.filter(b => b.state === 'built' && b.kind !== 'house')
    const pond = S.pondInfo(app.world, c)
    const stand = S.standInfo(c)
    const extra = (b: S.BuildingInfo) => b.kind === 'pond' && pond.built ? `관수 ${F.num(Math.floor(pond.waterings))}/${pond.capacity}회분` : b.kind === 'stand' && stand.built ? `${stand.open ? '영업 중' : '닫힘'}, 올해 ${F.money(stand.sales)}` : ''
    const best = suggest && can.some(b => b.kind === suggest && b.ok) ? suggest : null
    const keys = !ctx.touch()
    const flash = flashed && performance.now() < flashed.until ? flashed : null
    // What cannot be paid for is said once for the yard, not on every row: each row keeps its own figures and a
    // short state.
    const poor = (b: S.BuildingInfo) => !b.ok && b.total > S.spendable(c) && /^아직 감당할 수 없습니다/.test(b.why)
    const short = can.filter(poor)
    const bought = short.some(b => b.buyLogs > 0 || b.buyStone > 0)
    const head = h('header', { class: 'command-head' },
        h('div', null,
          h('p', { class: 't-label num' }, `${yard === S.HOME_YARD ? '집 농장' : '뒤푸르 농장'} · 마당에 통나무 ${loads(m.logs)}적재분, 막돌 ${loads(m.stone)}적재분`),
          h('h2', { class: 't-title', testid: 'yard-title' }, YARD_TITLE[yard])),
        h('button', { class: 'close', type: 'button', testid: 'yard-close', 'aria-label': `닫기${keys ? ' (Escape)' : ''}`, onclick: () => app.selectYard(0) }, icon('close', 'i')))
    // The head and its cross stay in view; what is under them scrolls inside the card when the window is short.
    return [head, h('div', { class: 'card-body', 'data-scroll': 'yard' },
      h('div', { class: 'builds', role: 'list', 'aria-label': '지어진 것과 짓는 중' },
        houses.map(x => h('div', { class: 'build-row', role: 'listitem' }, icon('store', 'i'), h('span', null, h('span', { class: 't-label' }, '지어짐'), ' ', h('b', null, x.name), ' ', h('span', { class: 'quiet num' }, `${F.mass(x.cwt)} 저장`)), h('span'))),
        built.map(b => h('div', { class: 'build-row', role: 'listitem', testid: `built-${b.kind}` }, icon(BUILD_GLYPH[b.kind], 'i'), h('span', null, h('span', { class: 't-label' }, '지어짐'), ' ', h('b', null, b.name), extra(b) ? [' ', h('span', { class: 'quiet' }, extra(b))] : null), h('span'))),
        up.map(b => {
          const who = builders(c, b.kind, yard)
          return h('div', { class: 'build-row', role: 'listitem', testid: `going-${b.kind}` },
            icon('build', 'i'),
            h('span', null, h('span', { class: 't-label' }, '짓는 중'), ' ', h('b', null, b.name), ' ', h('span', { class: 'quiet num' }, `${F.pct(b.progress)} · 인일 ${F.num(Math.ceil(b.daysLeft))}일`)),
            h('span', { class: 'who' }, who.length ? who.slice(0, 3).map(u => [ringed(u, ringFor(c, u.id), 24), h('span', null, firstName(u.name))])
              : h('span', { class: 'quiet it' }, c.phase === 'season' ? '건축 일꾼을 기다리는 중' : '시즌 중이나 겨울에 짓습니다')),
            meter(b.progress, { label: `${b.name} 완공`, text: `${F.pct(b.progress)} 완공` }))
        }),
        !houses.length && !built.length && !up.length ? h('div', { class: 'build-row', role: 'listitem' }, h('span', { class: 'quiet it' }, '아직 지어진 것이 없습니다.')) : null),
      m.logs >= 1 && !m.sellWhy ? h('div', { class: 'orders sell-logs', role: 'group', 'aria-label': '통나무' },
        order({
          key: '', icon: 'logs', name: `통나무 ${Math.floor(m.logs)}적재분 팔기`, cost: F.money(Math.floor(m.logs) * m.logPrice), testid: 'yard-sell-logs',
          catch: `제재소는 적재분당 ${F.money(m.logPrice)}에 사지만, 건축에 모자라면 되살 때는 ${F.money(m.millPrice)}를 냅니다.`,
          onclick: () => { const r = ctx.run({ t: 'sellLogs', loads: Math.floor(m.logs) }); if (r.ok) ctx.announce(F.localize(r.events[0]?.text ?? '')) },
        })) : null,
      short.length ? h('p', { class: 'note yard-short c-red', testid: 'yard-short' },
        c.phase === 'plan' ? `${c.cash >= 1 ? `건축에 쓸 ${F.money(Math.floor(c.cash))}이(가) 있습니다` : '건축에 쓸 현금이 없습니다'}. 봄에는 은행이 건축에는 대출해 주지 않습니다.${bought ? ' 마당에 모자란 통나무와 막돌은 사야 합니다.' : ''}`
          : `${F.money(Math.floor(S.spendable(c)))}을(를) 더 쓸 수 있습니다. 은행은 빚이 ${F.money(S.BUILD_CREDIT)}가 될 때까지만 빌려줍니다.${bought ? ' 마당에 모자란 통나무와 막돌은 사야 합니다.' : ''}`) : null,
      can.length ? h('div', { class: 'orders', role: 'group', 'aria-label': '건물 짓기' },
        can.map((b, k) => order({
          key: keys && k < 9 ? String(k + 1) : '', icon: '', name: b.name, cost: costOf(b), suggested: b.kind === best, testid: `build-${b.kind}`,
          catch: flash?.kind === b.kind && !poor(b) ? flash.text : poor(b) ? `아직 감당할 수 없습니다${b.buyLogs > 0 || b.buyStone > 0 ? `: 자재 포함 ${F.money(b.total)}` : ''}.` : !b.ok ? F.localize(b.why) : `약점: ${b.catch}`,
          refused: flash?.kind === b.kind || !b.ok,
          title: keys ? b.does : undefined,
          said: `${b.does} 총 ${F.money(b.total)}${b.buyLogs > 0 || b.buyStone > 0 ? `, 자재 구입 ${[b.buyLogs > 0 ? `통나무 ${loads(b.buyLogs)}적재분` : '', b.buyStone > 0 ? `막돌 ${loads(b.buyStone)}적재분` : ''].filter(Boolean).join(', ')}` : ''}.`,
          onclick: () => build(b),
        }))) : h('p', { class: 'note' }, '이 마당에는 지을 수 있는 건물을 모두 지었습니다.')),
    ]
  }

  function update(c: S.Campaign, suggest: S.BuildingKind | null = null): void {
    const yard = app.yard
    if (yard === 0) {
      if (!el.hidden && !ctx.reduced()) {
        el.classList.add('out')
        setTimeout(() => { if (!el.classList.contains('out')) return; el.hidden = true; el.classList.remove('out') }, EXIT_MS)
      } else el.hidden = true
      shownFor = 0
      can = []
      return
    }
    const was = el.hidden || el.classList.contains('out')
    el.classList.remove('out')
    el.hidden = false
    if (shownFor !== yard) { shownFor = yard; flashed = null }
    const s0 = c.season
    const model = {
      yard, cash: Math.round(c.cash), logs: Math.round(c.logs * 10), stone: Math.round(c.stone * 10), t: ctx.touch(), u: app.settings.units, suggest,
      b: c.buildings.map(b => [b.id, b.kind, b.yard, Math.round(b.done * 10), b.built]), pond: Math.round(c.pond * 10), stand: Math.round(c.yearStand),
      j: s0?.jobs.filter(j => j.kind === 'build').map(j => j.id), crew: c.crew.map(u => [u.id, u.job]), phase: c.phase,
      flash: flashed && performance.now() < flashed.until ? flashed.text : '',
    }
    patch(el, JSON.stringify(model), () => body(c, yard, suggest))
    el.setAttribute('aria-label', YARD_TITLE[yard])
    if (was && !ctx.reduced()) { el.classList.remove('in'); void el.offsetWidth; el.classList.add('in') }
  }

  function pick(n: number): boolean {
    if (el.hidden || !can[n - 1]) return false
    build(can[n - 1])
    return true
  }

  return { el, update, pick }
}
