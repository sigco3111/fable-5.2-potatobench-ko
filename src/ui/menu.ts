// The menu: carry on, the help, the settings, the save, and the ways out.
import { openBuild } from './buildmenu.ts'
import { openContracts } from './contracts.ts'
import type { Quality } from '../game/app.ts'
import * as S from '../sim/index.ts'
import { confirmPaper, type Ctx } from './core.ts'
import { h } from './dom.ts'
import { icon } from './icons.ts'
import * as F from './fmt.ts'
import { seasonCount, yearWord } from './rules.ts'
import { PHASE_LABEL } from './top.ts'
import { uiScale } from './scale.ts'

function endSeasonEarly(ctx: Ctx): void {
  const c = ctx.app.campaign
  if (!c || c.phase !== 'season' || !c.season) return
  if (S.seasonDone(c)) { ctx.run({ t: 'endSeason' }); return }
  const left: string[] = []
  const digging: string[] = []
  const bare: string[] = []
  for (let i = 0; i < S.FIELD_COUNT; i++) {
    const f = S.fieldInfo(c, i)
    if (f.status === 'digging') digging.push(f.name)
    else if (f.status === 'idle') bare.push(f.name)
    else if (f.status !== 'rest' && f.status !== 'dug' && f.status !== 'lost' && f.status !== 'off') left.push(f.name)
  }
  void confirmPaper(ctx, {
    title: '지금 시즌을 끝낼까요?',
    text: [
      left.length ? h('p', null, `${F.list(left)}에 작물이 아직 땅에 있습니다. 그 작물과 들인 일을 잃게 됩니다.`) : null,
      bare.length ? h('p', null, `${F.list(bare)}은(는) 심지 않았습니다. 이미 쓴 ${F.money(S.FIELD_COST)}${bare.length === 1 ? '' : '씩'}은(는) 사라지고, 올해는 아무것도 자라지 않습니다.`) : null,
      digging.length ? h('p', null, `${F.list(digging)}은(는) 일부만 캤습니다. 이미 캐낸 것은 갖고 나머지는 잃습니다.`) : null,
      h('p', null, `다음은 저장고의 겨울이고, 이 시즌으로는 돌아올 수 없습니다. 연말에 은행 상환금과 가족 생활비로 ${F.money(S.NOTE_PAYMENT + S.LIVING)}을(를) 내야 합니다.`),
    ],
    yes: '시즌 끝내기',
    no: '계속 농사',
    danger: true,
  }).then(ok => { if (ok) ctx.run({ t: 'endSeason' }) })
}

const TIER_WORD = { high: '온전한 화면', medium: '중간 화면', low: '낮은 화면', flat: '간단한 평면 화면' }

// The menu (design/menu.html): the office file open over the live land, the menu on its left page and the settings on
// its right. From the title it holds the settings and the save.
export function openMenu(ctx: Ctx, o: { onHelp: () => void; onAlmanac: () => void; onGuide?: () => void; farm?: { waiting: number; todo(): void; fields(): void; people(): void } | null }): void {
  const app = ctx.app
  const set = app.settings
  const toggle = (key: 'sound' | 'reducedMotion' | 'hints' | 'pauseOnAlerts', label: string, hint: string) => {
    const tick = h('i', { class: `tick${set[key] ? ' on' : ''}` })
    return h('label', { class: 'check' },
      h('span', { class: 'check-in' }, h('input', {
        type: 'checkbox', checked: set[key], testid: `set-${key}`, onchange: (e: Event) => {
          const on = (e.target as HTMLInputElement).checked
          tick.classList.toggle('on', on)
          app.setSetting(key, on)
          if (key === 'sound') document.querySelector<HTMLInputElement>('[data-k="set-volume"]')!.disabled = !on
        },
      }), tick),
      h('span', null, h('b', null, label), ' ', h('span', { class: 'quiet' }, hint)))
  }
  const seg = (name: string, label: string, opts: [string, string][], now: string, pick: (v: string) => void) =>
    h('div', { class: 'seg-in', role: 'radiogroup', 'aria-label': label }, opts.map(([v, text]) => h('label', null,
      h('input', { type: 'radio', name, value: v, checked: now === v, testid: `${name}-${v}`, onchange: () => pick(v) }),
      h('span', null, text))))

  const c = app.campaign
  const inGame = !!c && app.screen !== 'title'
  const season = inGame && c!.phase === 'season'
  ctx.papers.open({
    title: inGame ? '메뉴와 설정' : '설정',
    testid: 'menu',
    plain: true,
    cls: 'menu-dialog',
    body: close => {
      const status = h('p', { class: 't-caption form-status', role: 'status' })
      const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr', tabindex: '-1', 'aria-label': '불러올 저장 파일' })
      file.addEventListener('change', async () => {
        const f = file.files?.[0]
        if (!f) return
        const text = await f.text()
        file.value = ''
        if (app.importSave(text)) { ctx.say('저장을 불러왔습니다.', 'good'); close() }
        else status.textContent = '이 파일은 이 게임의 저장이 아니거나 더 새 버전의 저장입니다. 다른 파일을 시도하세요.'
      })
      const q = ctx.view.quality()
      const vol = Math.round(set.volume * 100)
      const exportSave = () => {
        const text = app.exportSave()
        if (!text || !c) return
        const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: `the-county-${yearWord(c.year).replace(' ', '-')}.json` })
        document.body.append(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
        status.textContent = '사본이 다운로드에 저장됐습니다.'
        ctx.say('농장 사본을 저장했습니다.', 'good')
      }
      const deleteSave = async () => {
        const ok = await confirmPaper(ctx, {
          title: '저장을 지울까요?',
          text: h('p', null, '이 브라우저에 저장된 농장을 지우고, 되돌릴 수 없습니다. 돌려받을 수 있다면 먼저 사본을 저장하세요.'),
          yes: '지우기', no: '두기', danger: true,
        })
        if (ok) { close(); app.deleteSave(); ctx.say('저장을 지웠습니다.', 'info') }
      }
      const when = c && c.season && c.phase === 'season' ? ` · ${F.date(c.year, c.season.day)}` : c ? ` · ${PHASE_LABEL[c.phase].toLowerCase()}` : ''
      const menuPage = h('section', { 'aria-label': '메뉴' },
        h('p', { class: 't-label' }, c ? `${seasonCount(c)}${when}` : '농장'),
        h('h1', { class: 'mini-mark' }, h('span', { class: 'the' }, 'The'), h('span', { class: 'county' }, 'County')),
        h('div', { class: 'rule double' }),
        h('nav', { class: 'menu-list', 'aria-label': '메뉴' },
          inGame ? h('button', { class: 'btn go wide', type: 'button', testid: 'menu-continue', autofocus: true, onclick: close }, '계속하기', icon('arrow', 'i')) : null,
          // On a phone the farm's sheets open from here: the menu that is always up has no room there.
          o.farm ? h('div', { class: 'menu-farm', role: 'group', 'aria-label': '농장' },
            h('button', { class: 'btn', type: 'button', testid: 'menu-todo', onclick: () => { close(); o.farm!.todo() } }, '할 일', o.farm.waiting ? h('span', { class: 'mb-n num', 'aria-label': `${o.farm.waiting}개 대기 중` }, String(o.farm.waiting)) : null),
            h('button', { class: 'btn', type: 'button', testid: 'menu-fields', onclick: () => { close(); o.farm!.fields() } }, '밭'),
            h('button', { class: 'btn', type: 'button', testid: 'menu-people', onclick: () => { close(); o.farm!.people() } }, '사람')) : null,
          season ? h('button', { class: 'btn wide', type: 'button', testid: 'menu-almanac', onclick: () => { close(); o.onAlmanac() } }, icon('almanac', 'i'), '연감') : null,
          inGame && c && c.phase !== 'over' ? h('button', { class: 'btn wide', type: 'button', testid: 'menu-contracts', onclick: () => { close(); openContracts(ctx) } }, icon('contract', 'i'), '계약') : null,
          inGame && c && (c.phase === 'season' || c.phase === 'cellar') ? h('button', { class: 'btn wide', type: 'button', testid: 'menu-build', onclick: () => { close(); openBuild(ctx) } }, icon('hammer', 'i'), '짓기·사기') : null,
          h('button', { class: 'btn wide', type: 'button', testid: 'save-export', disabled: !c, onclick: exportSave }, icon('save', 'i'), '사본 저장'),
          h('button', { class: 'btn wide', type: 'button', testid: 'save-import', onclick: () => file.click() }, icon('ticket', 'i'), '저장한 농장 불러오기'),
          h('button', { class: 'btn wide', type: 'button', testid: 'how-open', onclick: () => o.onHelp() }, icon('key', 'i'), '플레이 방법'),
          o.onGuide ? h('button', { class: 'btn wide', type: 'button', testid: 'guide-open', title: ctx.touch() ? undefined : '레슨을 다시 읽습니다. 농장은 그대로입니다.', onclick: () => o.onGuide!() }, icon('fist', 'i'), '배우며 하는 첫해', h('span', { class: 'sr' }, '. 레슨을 다시 읽습니다. 농장은 그대로입니다.')) : null,
          season && !S.seasonDone(c!) ? h('button', { class: 'btn wide hazard', type: 'button', testid: 'end-season-early', onclick: () => { close(); endSeasonEarly(ctx) } }, icon('skip', 'i'), '시즌 일찍 끝내기') : null,
          inGame ? h('button', { class: 'btn wide', type: 'button', testid: 'quit-title', onclick: () => { close(); app.quitToTitle() } }, icon('letgo', 'i'), '제목 화면으로') : null,
          h('button', { class: 'btn wide hazard menu-delete', type: 'button', testid: 'save-delete', disabled: !app.savedGame() && !c, onclick: deleteSave }, '저장 지우기')),
        h('p', { class: 't-caption' }, '게임은 이 브라우저에 자동으로 저장됩니다.'),
        file, status)
      const settings = h('section', { 'aria-label': '설정' },
        h('header', { class: 'form-head' },
          h('h2', { class: 't-title' }, '설정'),
          h('button', { class: 'close', type: 'button', testid: 'paper-close', 'aria-label': '닫기 (Escape)', autofocus: !inGame, onclick: close }, icon('close', 'i'))),
        h('fieldset', { class: 'f-row' }, h('legend', { class: 't-label' }, '단위'),
          seg('units', '단위', [['us', '°F, 인치, cwt, 에이커'], ['metric', '°C, mm, 톤, 헥타르']], set.units, v => app.setSetting('units', v as 'us' | 'metric'))),
        h('fieldset', { class: 'f-row' }, h('legend', { class: 't-label' }, '소리'),
          toggle('sound', '소리', '날씨, 기계와 농장 소리'),
          h('label', { class: 'slider' },
            h('span', { class: 'sr' }, '음량'),
            h('input', {
              class: 'slider-in', type: 'range', min: 0, max: 100, step: 5, value: vol, disabled: !set.sound, testid: 'set-volume',
              style: `--fill:${vol}%`, 'aria-valuetext': `${vol}%`,
              oninput: (e: Event) => {
                const el = e.target as HTMLInputElement
                const v = Number(el.value)
                el.setAttribute('aria-valuetext', `${v}%`)
                el.style.setProperty('--fill', `${v}%`)
                el.parentElement!.querySelector('.num')!.textContent = String(v)
                app.setSetting('volume', v / 100)
              },
            }),
            h('b', { class: 'num' }, String(vol)))),
        h('fieldset', { class: 'f-row' }, h('legend', { class: 't-label' }, '플레이'),
          toggle('hints', '힌트', '각 지시가 처음 나올 때 짧은 도움말'),
          toggle('pauseOnAlerts', '알림에 멈춤', '새로 당신이 필요할 때 게임을 멈춥니다'),
          toggle('reducedMotion', '움직임 줄이기', '서류가 바로 바뀌고 땅이 움직이지 않습니다')),
        h('fieldset', { class: 'f-row' }, h('legend', { class: 't-label' }, '화면 크기'),
          seg('scale', '화면 크기', [['auto', '자동'], ['1', '100%'], ['1.25', '125%'], ['1.5', '150%'], ['1.75', '175%'], ['2', '200%']], set.uiScale ?? 'auto', v => app.setSetting('uiScale', v as typeof set.uiScale)),
          h('p', { class: 't-caption', testid: 'scale-now' }, `자동은 창에 맞춥니다. 지금 ${Math.round(uiScale() * 100)}%로 그립니다.`)),
        h('fieldset', { class: 'f-row' }, h('legend', { class: 't-label' }, '화질'),
          seg('quality', '화질', [['auto', '자동'], ['high', '높음'], ['medium', '중간'], ['low', '낮음']] as [Quality, string][], set.quality, v => app.setSetting('quality', v as Quality)),
          h('p', { class: 't-caption', testid: 'quality-now' }, `${TIER_WORD[q.tier]}으로 그리는 중${q.fps > 0 ? `, 초당 ${Math.round(q.fps)}프레임` : ''}.`)))
      return h('section', { class: 'file sys' },
        h('span', { class: 'file-tab', 'aria-hidden': 'true' }, '메뉴'),
        h('div', { class: 'file-pages' }, menuPage, settings))
    },
  })
}
