// How to play (design/howto.html), from the almanac: three pictures made of the interface's own pieces (a field's tag,
// a need's stamp, the clock's keys) and three verbs, the code of the stamps, the year in a line, and the keys folded.
import { SPEED_X } from '../game/app.ts'
import * as S from '../sim/index.ts'
import type { Ctx } from './core.ts'
import { h } from './dom.ts'
import { icon } from './icons.ts'
import { JOB_KEY, JOB_VERB, orderHelp } from './rules.ts'
import { fist, key, tag } from './system/parts.ts'
import { openGuide } from './tutorial.ts'

const REPO = 'https://github.com/TheMizeGuy/fable-5.2-potatobench'

// The pictures are the land's own tag, stamp and clock, held still: inert, so nothing in them takes a click or the focus.
function figs(touch: boolean): HTMLElement {
  const fig = (n: number, pic: HTMLElement, title: string, text: string) => h('div', { class: 'fig' },
    h('div', { class: 'plate-area', 'aria-hidden': 'true', inert: true }, pic),
    h('h3', null, h('span', { class: 'n' }, String(n)), title),
    h('p', null, text))
  const spray = h('span', { class: 'need ochre is-next' }, icon('spray'))
  return h('div', { class: 'figs' },
    fig(1, tag({ name: '북쪽 마루', icon: 'bloom', selected: true, still: true }), '밭 고르기', touch ? '밭이나 그 표시를 누르면 필요한 것을 보여주는 카드가 열립니다.' : '밭이나 그 표시를 클릭하면 필요한 것을 보여주는 카드가 열립니다.'),
    fig(2, tag({ name: '윗가운데', icon: 'bloom', need: spray, still: true }), '지시하기', touch ? '도장을 눌러 밭에 필요한 일을 지시합니다.' : '도장을 클릭하거나 밭을 오른쪽 클릭해 필요한 일을 지시합니다.'),
    fig(3, h('div', { class: 'clock' }, h('span', { class: 'k' }, icon('pause', 'i')), h('span', { class: 'k', 'aria-pressed': 'true' }, SPEED_X[1]), h('span', { class: 'k' }, SPEED_X[2]), h('span', { class: 'k' }, SPEED_X[3])),
      '시간 흐르기', touch ? '고른 속도로 시간이 흐르고, 당신이 필요하면 게임이 멈춥니다.' : '고른 속도로 시간이 흐르고, 당신이 필요하면 게임이 멈춥니다. Space로 직접 멈출 수 있습니다.'))
}

export const CODE: [string, string, string, string][] = [
  ['red', 'rogue', '빨강', '역병이나 손실, 지금 움직이세요.'],
  ['ochre', 'spray', '황토', '다음에 할 일.'],
  ['blue', 'water', '파랑', '밭이 말라가고 있습니다.'],
  ['', 'hill', '검정', '때가 된 일.'],
]

const YEAR: [string, string][] = [
  ['봄', '밭을 계획하고, 원하면 고용하거나 빌리세요.'],
  ['시즌', '심고, 북을 주고, 살펴보고, 뿌리고, 캐세요.'],
  ['수확', '계근 전표를 읽고, 납품하거나 팔거나 저장하세요.'],
  ['겨울', '저장고에서 팔고, 숲을 개간하고 지으세요.'],
  ['연말', '해마다의 은행 상환금을 냅니다.'],
]

export function openHelp(ctx: Ctx): void {
  const touch = ctx.touch()
  const keys = (...names: string[]) => names.map(n => key(n))
  const row = (ks: (string | HTMLElement)[], what: string) => h('tr', null, h('th', { scope: 'row' }, ks), h('td', null, what))
  let more = false
  ctx.papers.open({
    title: '플레이 방법',
    testid: 'how',
    plain: true,
    cls: 'how-dialog',
    body: close => {
      const box = h('div', { class: 'keys-box' })
      const chev = h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')
      const toggle = h('button', { class: 'keys-fold', type: 'button', testid: 'how-keys', 'aria-expanded': 'false', onclick: () => { more = !more; draw() } },
        icon('key', 'i'), h('b', null, touch ? '모든 지시' : '모든 키와 지시'), h('span', { class: 'quiet' }, '필요할 때 찾아보세요'), chev)
      const draw = () => {
        toggle.setAttribute('aria-expanded', String(more))
        chev.textContent = '›'
        box.replaceChildren(...(more ? [h('div', { class: 'keys-cols' },
          touch ? null : h('section', null,
            h('p', { class: 't-label' }, '키'),
            h('table', { class: 'keys-t' }, h('tbody', null,
              row(keys('1', '–', '9', '0'), '처음 열 밭 중 하나를 고릅니다. Shift를 누르면 선택에 더해집니다.'),
              row(keys('Tab'), '무언가 필요한 다음 밭으로 갑니다.'),
              row(keys('Enter'), '고른 밭에 필요한 일을 지시합니다.'),
              row(keys('Space', 'F', '+', '−'), `멈춤·재개, ${SPEED_X[1]}·${SPEED_X[2]}·${SPEED_X[3]} 순환, 빨라지기와 느려지기.`),
              row(keys('Backspace'), '작업 목록의 마지막 지시를 취소합니다.'),
              row(keys('I', 'M', 'Esc'), '연감 열기, 메뉴 열기, 닫기 또는 선택 해제.'),
              row(keys('Arrows', 'Q', 'E', 'Home'), '화면을 옮기고, 돌리고, 농장을 가운데로. 밭을 고르지 않았을 때 W, A, S, D도 화면을 옮깁니다.'),
              row(keys('PgDn', 'PgUp'), '화면을 땅 쪽으로 기울이고, 다시 올립니다.'),
              row(['끌기, 휠, 오른쪽 끌기'], '끌어서 옮기고, 스크롤로 확대하고, 오른쪽으로 끌어 돌리기(옆으로) 또는 기울이기(위아래).')))),
          h('section', null,
            h('p', { class: 't-label' }, '지시'),
            h('table', { class: 'keys-t' }, h('tbody', null, S.JOBS.map(kind => h('tr', null,
              h('th', { scope: 'row' }, h('span', { class: 'order-k' }, touch || !JOB_KEY[kind] ? null : key(JOB_KEY[kind]), icon(kind, 'i'), h('b', null, JOB_VERB[kind]))),
              h('td', null, orderHelp(kind)))))))),
        ] : []))
      }
      draw()
      return h('section', { class: 'howto sheet sys' },
        h('header', { class: 'howto-head' },
          h('div', null, h('p', { class: 't-label' }, '연감에서'), h('p', { class: 't-title', 'aria-hidden': 'true' }, '플레이 방법')),
          h('button', { class: 'close', type: 'button', testid: 'how-close', autofocus: true, 'aria-label': ctx.app.screen === 'title' ? '뒤로 (Escape)' : '농장으로 돌아가기 (Escape)', onclick: close }, icon('close', 'i'))),
        h('p', { class: 'howto-lead' }, '감자를 심고, 작업반에 지시하고, 수확을 파세요. 시험 캐기가 작물의 상태를 보여줍니다. 농장을 5년 동안 이어가세요.'),
        figs(touch),
        h('div', { class: 'code-row' }, CODE.map(([ink, glyph, word, what]) => h('div', null,
          h('span', { class: `need${ink ? ` ${ink}` : ''}`, 'aria-hidden': 'true' }, icon(glyph)), h('p', null, h('b', null, word), `: ${what}`)))),
        h('div', { class: 'year-row' }, YEAR.map(([b, t]) => h('div', null, h('b', null, b), t))),
        toggle, box,
        h('button', { class: 'keys-fold how-guide', type: 'button', testid: 'how-guide', onclick: () => openGuide(ctx) },
          fist(), h('b', null, '배우며 하는 첫해'), h('span', { class: 'quiet' }, '어떤 레슨이든 다시 보기'), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')),
        h('p', { class: 't-caption howto-foot' }, '농장마다 날씨가 다르고, 다가올 일은 일기예보가 전부입니다. 원작: ',
          h('a', { class: 'btn quiet', href: REPO, target: '_blank', rel: 'noopener' }, 'GitHub의 The County'), '입니다.'))
    },
  })
}
