// The opening (design/title.html): the farm almanac's cover over the land, a third of the frame, with the menu set
// as its contents and the benchmark's credit printed as its imprint.
import cut from '../../design/src/cut.svg?raw'
import { QUIET_S } from '../game/app.ts'
import { isFarmYear } from '../sim/index.ts'
import { confirmPaper, patch, type Ctx, type Screen } from './core.ts'
import { h } from './dom.ts'
import { icon } from './icons.ts'
import { seasonCount } from './rules.ts'
import { PHASE_LABEL } from './top.ts'
import { guidedFarm, startedFarm, straightIn } from './tutorial.ts'
import './title.css'
import { toScreen } from './scale.ts'

// Starts a farm of its own, with seasons made for it. A farm still in play is not replaced unasked.
export async function startNewFarm(ctx: Ctx, guided = false): Promise<void> {
  const app = ctx.app
  const saved = app.savedGame()?.campaign
  if (saved && saved.phase !== 'over' && saved.outcome !== 'lost') {
    const ok = await confirmPaper(ctx, {
      title: '새 농장을 시작할까요?',
      text: h('p', null, `이 브라우저에 저장된 농장(${seasonCount(saved)}, ${PHASE_LABEL[saved.phase].toLowerCase()})을 대신합니다. 남기고 싶으면 먼저 메뉴에서 사본을 저장하세요.`),
      yes: '새 농장 시작', no: '이 농장 두기', danger: true,
    })
    if (!ok) return
  }
  ctx.papers.closeAll()
  app.newGame()
  if (!app.campaign) return
  // Onto the land at once; a browser that has not been asked about tips answers that first.
  if (guided) { guidedFarm(); straightIn(ctx) }
  else if (!startedFarm(app.campaign.seed)) straightIn(ctx)
}

// A farm saved on its first spring's plan by a build that still showed it (Play now goes onto the land) goes on as
// Play does: the usual plan stands and the season starts.
function resumeOnLand(ctx: Ctx): void {
  const c = ctx.app.campaign
  if (QUIET_S && c && c.phase === 'plan' && c.history.length === 0 && isFarmYear(c.startYear)) straightIn(ctx)
}

let entered = false

function engraving(): HTMLElement {
  const box = h('span', { class: 'cv-plate' })
  box.innerHTML = cut
  return box
}

export function titleScreen(ctx: Ctx, o: { onMenu: () => void; onHelp: () => void }): Screen {
  const app = ctx.app
  const menu = h('nav', { class: 'cv-menu', 'aria-label': '더 카운티' })
  const cover = h('section', { class: 'cover sheet sys', 'aria-label': '더 카운티' },
    h('p', { class: 'cv-top', 'aria-hidden': 'true' }, h('span', null, '감자 농사'), h('i', { class: 'orn' }), h('span', null, '메인 북부')),
    h('h1', { class: 'cv-name title-name' }, h('span', { class: 'the' }, 'The'), h('span', { class: 'county' }, 'County')),
    h('hr', { class: 'rule oxford' }),
    h('figure', { class: 'cv-cut' }, engraving(),
      h('p', null, '메인 북부에서 감자 농장을 꾸리세요. 밭을 심고, 작업반을 고용하고, 수확을 팔고, 농장을 5년 동안 이어가세요.'),
      h('figcaption', { class: 'it' }, '그림 1. 감자 포기.')),
    menu,
    h('footer', { class: 'imprint', testid: 'credit' },
      h('p', { class: 'a' }, 'Fable 5.2 - PotatoBench'),
      h('p', { class: 'b' }, 'PotatoBench 제작 TheMizeGuy · 한글판 sigco3111')))
  // The frame's dressing: bars, a little dark at its corners and behind the name, and the black the first frame comes
  // up out of. All of it lies under the name and the menu and takes no press. The picture itself is left clean.
  const barT = h('div', { class: 'cine-bar t' }), barB = h('div', { class: 'cine-bar b' })
  const el = h('main', { class: 'title-screen cine sys' }, h('div', { class: 'title-shade' }), h('div', { class: 'cine-vignette' }),
    barT, barB, cover, h('p', { class: 'cine-hint', 'aria-hidden': 'true' }, 'Enter로 시작'), h('div', { class: 'cine-fade' }))
  // The entrance plays once a visit, the first time the landing is shown.
  if (!entered) {
    entered = true
    const go = () => { el.classList.remove('await'); el.classList.add('intro'); setTimeout(() => el.classList.remove('intro'), 4200) }
    // It waits for the loading page to lift, so the name is set over the land and not behind the page that hid it.
    const splash = document.getElementById('splash')
    if (splash && !splash.classList.contains('gone')) {
      el.classList.add('await')
      const seen = new MutationObserver(() => { if (splash.classList.contains('gone') || !splash.isConnected) { seen.disconnect(); go() } })
      seen.observe(splash, { attributes: true, attributeFilter: ['class'] })
      if (splash.parentNode) seen.observe(splash.parentNode, { childList: true })
    } else go()
  }
  let focused = false
  return {
    el,
    update() {
      const c = app.savedGame()?.campaign
      const layout = ctx.layout()
      el.dataset.layout = layout
      patch(menu, JSON.stringify([c?.year, c?.phase, c?.yearIdx, c?.outcome]), () => [
        h('p', { class: 't-label' }, '차례'),
        // The strong action is the one most players want: go on with the farm they have, or start one.
        c ? h('button', { class: 'btn go wide', type: 'button', testid: 'continue', onclick: () => { if (!app.continueGame()) ctx.say('저장된 농장을 불러오지 못했습니다. 새 농장으로 시작하세요.', 'warn'); else resumeOnLand(ctx) } },
          h('span', null, '이어하기', h('span', { class: 'sub-go' }, `${seasonCount(c)}, ${PHASE_LABEL[c.phase].toLowerCase()}`)), icon('arrow', 'i'))
          : h('button', { class: 'btn go wide', type: 'button', testid: 'play', onclick: () => { void startNewFarm(ctx) } }, '시작하기', icon('arrow', 'i')),
        c ? h('button', { class: 'cv-item lead', type: 'button', testid: 'play', onclick: () => { void startNewFarm(ctx) } },
          h('b', null, '새 농장'), h('span', { class: 'dots' }), h('span', { class: 'it quiet' }, '첫 봄부터')) : null,
        h('button', { class: 'cv-item lead', type: 'button', testid: 'play-guided', onclick: () => { void startNewFarm(ctx, true) } },
          h('b', null, '배우며 하는 첫해'), h('span', { class: 'dots' }), h('span', { class: 'it quiet' }, '레슨과 함께하는 새 농장')),
        h('button', { class: 'cv-item lead', type: 'button', testid: 'how-open', onclick: () => o.onHelp() }, h('b', null, '플레이 방법'), h('span', { class: 'dots' }), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')),
        h('button', { class: 'cv-item lead', type: 'button', testid: 'menu-open', onclick: () => o.onMenu() }, h('b', null, '설정'), h('span', { class: 'dots' }), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')),
      ])
      // The strong action is under the keyboard from the start; the focus is tried again until the land is up and it takes.
      if (!focused && !ctx.papers.isOpen()) {
        const go = menu.querySelector<HTMLElement>('.btn.go')
        go?.focus({ preventScroll: true })
        focused = document.activeElement === go
        if (!focused) setTimeout(() => ctx.dirty(), 200)
      }
    },
    insets() {
      // The cover takes the left of the frame; on a phone, the whole of it but the sky above.
      const r = cover.getBoundingClientRect()
      // (under the bars the picture is composed between them, to the right of the name)
      return r.width > innerWidth * 0.7 ? [0, 0, Math.max(0, innerHeight - r.top), 0] : [toScreen(barT.offsetHeight), 0, toScreen(barB.offsetHeight), Math.max(0, r.right)]
    },
  }
}
