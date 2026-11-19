// The menu that is always up: one row of tabs at the foot of the season screen, each opening its own sheet, in the
// manner of a colony game's main bar. "To do" says what waits on the player and goes there; Fields and People list
// the farm, and a row pressed takes the camera to it.
import { idleWork, nextGoal, waitingFor, type FreeWork } from '../game/goals.ts'
import * as S from '../sim/index.ts'
import { openBuild } from './buildmenu.ts'
import type { Ctx } from './core.ts'
import { openCrew, ringFor } from './crew.ts'
import { h } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import './mainbar.css'
import { heldFields, isTract } from './map.ts'
import { personNow } from './now.ts'
import { ringed } from './system/people.ts'

const FREE_TEXT: Record<FreeWork['kind'], string> = { brush: '주변의 덤불 베기', rocks: '의 돌 골라내기', fell: '의 나무 베기' }
const FREE_KEY: Record<FreeWork['kind'], string> = { brush: '덤불 베기', rocks: '돌 골라내기', fell: '나무 베기' }
const MOIST_WORD: Record<string, string> = { 'standing water': '고인 물', wet: '젖음', good: '좋음', drying: '마르는 중', dry: '마름', wilting: '시듦' }

// order: the one press that deals with it, where there is one, with what it costs.
export interface Todo { field: number; glyph: string; text: string; why: string; urgent: boolean; go: () => void; order?: { label: string; cost: number; run: () => void } }

interface Hooks {
  todo: () => Todo[]
  // Gives people with nothing to do a job on the land (the keys under the goal slip do the same).
  free: (w: FreeWork) => void
  goField: (i: number) => void
  goUnit: (id: number) => void
  onWork: () => void
  onMoney: () => void
  onAlmanac: () => void
  onMenu: () => void
}

export function mainBar(ctx: Ctx, o: Hooks): { el: HTMLElement; update(c: S.Campaign): void; openTodo(): void; openFields(): void; openPeople(): void } {
  const app = ctx.app
  const el = h('nav', { class: 'mainbar sys', 'aria-label': '농장 메뉴' })
  let key = ''

  function openTodo(): void {
    ctx.papers.open({
      title: '할 일',
      testid: 'todo',
      size: 'medium',
      kicker: '당신을 기다리는 것',
      body: close => {
        const c = app.campaign
        if (!c) return null
        const list = o.todo()
        const orders = list.filter(t => t.order)
        const all = orders.reduce((n, t) => n + t.order!.cost, 0)
        const goal = nextGoal(c)
        const wait = c.phase === 'season' ? waitingFor(c, app.world) : null
        const idle = c.phase === 'season' ? idleWork(c) : null
        const names = (idle?.who ?? []).map(id => c.crew.find(u => u.id === id)).filter((u): u is S.Unit => !!u).map(u => (u.kind === 'farmer' ? '당신' : u.name.split(' ')[0]))
        const idleNames = names.length > 1 ? `${names.slice(0, -1).join(', ')}과 ${names[names.length - 1]}` : names[0] ?? ''
        const upper = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
        return h('div', { class: 'mb-sheet' },
          list.length
            ? h('ul', { class: 'mb-list' }, list.map((t, k) => h('li', null,
              h('div', { class: `mb-row${t.urgent ? ' urgent' : ''}` },
                icon(t.glyph, 'i'), h('span', { class: 'mb-what' }, h('b', null, t.text), h('span', { class: 't-caption' }, t.why)),
                h('span', { class: 'mb-keys' },
                  h('button', { class: 'btn quiet', type: 'button', testid: `todo-go-${k}`, onclick: () => { close(); t.go() } }, '그곳으로'),
                  t.order ? h('button', { class: 'btn', type: 'button', testid: `todo-do-${k}`, onclick: () => { close(); t.order!.run() } }, t.order.label, h('span', { class: 'num mb-cost' }, F.money(t.order.cost))) : null))))
            // Several at once: one press orders them all, and says what that comes to.
            .concat(orders.length > 1 ? [h('li', { class: 'mb-all' }, h('button', { class: 'btn go', type: 'button', testid: 'todo-all', onclick: () => { close(); for (const t of orders) t.order!.run() } },
              `모두 지시 (${orders.length}건)`, h('span', { class: 'num mb-cost' }, F.money(all))))] : []))
            : idle ? null : h('p', { class: 'mb-none' }, '기다리는 일이 없습니다. 작업반이 작업 목록을 해나가고 있습니다.'),
          // People with nothing to do, and the work they can be given: the sheet said "nothing is waiting on you, your
          // crew is working through the work list" under a slip that said "Keep your crew busy" with two of three idle.
          idle ? h('div', { class: 'mb-idle', testid: 'todo-idle' },
            h('p', { class: 'mb-none' }, `${idleNames}은(는) 할 일이 없습니다. 땅에 일이 있습니다:`),
            h('ul', { class: 'mb-list' }, idle.options.map((w, k) => h('li', null, h('div', { class: 'mb-row' },
              icon(w.kind, 'i'), h('span', { class: 'mb-what' }, h('b', null, `${S.FIELD_NAMES[w.field]} ${FREE_TEXT[w.kind]}`), h('span', { class: 't-caption' }, w.gain)),
              h('span', { class: 'mb-keys' }, h('button', { class: 'btn', type: 'button', testid: `todo-free-${k}`, onclick: () => { close(); o.free(w) } }, FREE_KEY[w.kind]))))))) : null,
          // (the label says it is coming, so the line does not say "Next up" again; and the goal that is the same
          // thing, the vine kill, is not said a third time under it)
          wait ? h('p', { class: 'mb-next' }, h('span', { class: 't-label' }, '다가오는 것'), ' ', wait.title, wait.when ? `, ${wait.when}` : '', '.') : null,
          goal && !(wait && goal.id === 'kill' && /줄기/.test(wait.title)) ? h('p', { class: 'mb-next' }, h('span', { class: 't-label' }, '다음 목표'), ' ', goal.title, '. ', h('span', { class: 't-caption' }, goal.why)) : null)
      },
    })
  }

  function openFields(): void {
    ctx.papers.open({
      title: '밭',
      testid: 'fields',
      size: 'wide',
      kicker: '당신의 땅',
      body: close => {
        const c = app.campaign
        if (!c) return null
        const needs = c.phase === 'season' ? app.needs() : []
        const pct = (v: number) => F.pct(v)
        return h('div', { class: 'mb-scroll' }, h('table', { class: 'mb-table' },
          h('thead', null, h('tr', null, ['밭', '작물', '단계', '잎', '물', '방제', '필요'].map(t => h('th', { scope: 'col', class: 't-label' }, t)))),
          h('tbody', null, heldFields(c).map(i => {
            const f = S.fieldInfo(c, i)
            const live = f.status === 'growing' || f.status === 'planted'
            const tract = isTract(i) && (f.cover !== 'open' || f.status === 'off')
            const need = needs[i]?.need
            return h('tr', null,
              h('th', { scope: 'row' }, h('button', { class: 'mb-name', type: 'button', testid: `fields-go-${i}`, onclick: () => { close(); o.goField(i) } }, f.name)),
              h('td', null, tract ? f.coverWord : f.crop === 'rest' || f.status === 'rest' ? '귀리와 클로버' : f.variety),
              h('td', null, tract ? '' : f.status === 'rest' ? '휴경' : f.stage),
              h('td', { class: 'num' }, live ? pct(f.canopy) : ''),
              h('td', null, live ? (MOIST_WORD[f.moistureLabel] ?? f.moistureLabel) : ''),
              h('td', { class: 'num' }, f.status === 'growing' ? pct(f.protect) : ''),
              h('td', null, need && need.act !== 'wait' ? F.localize(need.text) : ''))
          }))))
      },
    })
  }

  function openPeople(): void {
    ctx.papers.open({
      title: '사람',
      testid: 'people',
      size: 'medium',
      kicker: '농장에 있는 사람',
      body: close => {
        const c = app.campaign
        if (!c) return null
        const waits = c.phase === 'season' ? S.jobWaits(app.world, c) : {}
        return h('ul', { class: 'mb-list' }, c.crew.map(u => {
          const now = c.phase === 'season' ? personNow(c, u.id, waits) : null
          return h('li', null, h('button', { class: 'mb-row', type: 'button', testid: `people-go-${u.id}`, onclick: () => { close(); o.goUnit(u.id) } },
            ringed({ name: u.name }, ringFor(c, u.id), 34),
            h('span', { class: 'mb-what' }, h('b', null, u.kind === 'farmer' ? '당신' : u.name), h('span', { class: 't-caption' }, now ? now.line : u.kind === 'farmer' ? '농장주' : '농장에 있음')),
            h('span', { class: 'mb-go t-label' }, '그곳으로')))
        }))
      },
      foot: close => [
        h('button', { class: 'btn', type: 'button', testid: 'people-work', onclick: () => { close(); o.onWork() } }, '누가 무엇을 하나'),
        h('button', { class: 'btn', type: 'button', testid: 'people-hire', onclick: () => { close(); openCrew(ctx) } }, '고용'),
      ],
    })
  }

  // Build stands first and strong: it is where the farm grows. (Work is under People, with the hiring; contracts
  // and the almanac are in the menu, and the forecast opens the almanac.)
  const TABS: [string, string, () => void][] = [
    ['build', '짓기·사기', () => openBuild(ctx)],
    ['todo', '할 일', openTodo],
    ['fields', '밭', openFields],
    ['people', '사람', openPeople],
    ['money', '돈', () => o.onMoney()],
    ['menu', '메뉴', () => o.onMenu()],
  ]

  return {
    el,
    openTodo,
    openFields,
    openPeople,
    update(c: S.Campaign): void {
      const n = c.phase === 'season' ? o.todo().length : 0
      const k = `${c.phase}|${n}`
      if (k === key) return
      key = k
      el.replaceChildren(...TABS.map(([id, name, open]) => h('button', { class: `mb-tab${id === 'todo' && n ? ' has' : ''}${id === 'build' ? ' build' : ''}`, type: 'button', testid: `bar-${id}`, title: id === 'build' && !ctx.touch() ? '건물, 기계, 사람과 땅 (B)' : undefined, onclick: open },
        id === 'build' ? icon('hammer', 'i') : null, name, id === 'todo' && n ? h('span', { class: 'mb-n num', 'aria-label': `${n}개 대기 중` }, String(n)) : null)))
    },
  }
}
