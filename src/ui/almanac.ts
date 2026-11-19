// The almanac: the depth nobody needs to play. The forecast in full, the blight watch, every reading, the diary, the prices.
// A printed almanac's pages, with a thumb index down the fore-edge; no frame draws it, so it is made of the kit's parts.
import * as S from '../sim/index.ts'
import type { Ctx } from './core.ts'
import { h, type Child } from './dom.ts'
import * as F from './fmt.ts'
import { icon } from './icons.ts'
import { BLOCK_NAME, heldFields, roadTime } from './map.ts'
import * as R from './rules.ts'
import { meter, need } from './system/parts.ts'
import { portrait } from './system/people.ts'

type Page = 'forecast' | 'blight' | 'fields' | 'farm' | 'people' | 'buildings' | 'incidents' | 'diary' | 'prices'
const PAGES: [Page, string, string][] = [
  ['forecast', '일기예보', 'sun'], ['blight', '역병 감시', 'blight'], ['fields', '밭', 'field'], ['farm', '땅', 'land'],
  ['people', '사람들', 'people'], ['buildings', '건물', 'build'], ['incidents', '사건', 'alert'], ['diary', '일지', 'calendar'],
  ['prices', '가격', 'money'],
]

const sec = (title: string) => h('h4', { class: 'alm-sec t-label' }, title)

// A mechanic in two lines: what it gives, and its catch.
function rules(list: [string, string, string][]): HTMLElement {
  return h('dl', { class: 'alm-rules' }, list.map(([name, gives, catches]) => h('div', null,
    h('dt', null, name), h('dd', null, gives), h('dd', { class: 'catch' }, catches))))
}

// A cash-book table: words on the left, the money column ruled in red on the right.
function book(rows: [Child, Child, string?][], head?: [string, string]): HTMLElement {
  return h('table', { class: 'cashbook alm-book' },
    head ? h('thead', null, h('tr', null, h('th', { scope: 'col' }, head[0]), h('th', { scope: 'col', class: 'm' }, head[1]))) : null,
    h('tbody', null, rows.map(([what, m, cls]) => h('tr', null, h('td', null, what), h('td', { class: `m${cls ? ` ${cls}` : ''}` }, m)))))
}

const sub = (text: string) => h('span', { class: 'alm-note' }, text)

function forecastPage(ctx: Ctx, c: S.Campaign): Child {
  const t = S.today(ctx.app.world, c)
  if (!t) return null
  const fc = S.forecast(ctx.app.world, c, 5)
  const d = t.day
  const range = (x: number, sd: number) => `${F.degrees(x - sd)}–${F.degrees(x + sd)}`
  // A forecast amount is a guess: it is shown rounded and labelled as about.
  const about = (mm: number) => mm <= 0 ? '없음' : F.metric() ? `약 ${Math.round(mm)} mm` : mm / 25.4 < 0.05 ? '조금' : `약 ${F.num(mm / 25.4, 1)} in`
  return [
    h('div', { class: 'alm-today' },
      icon(t.sky, 'i'),
      h('div', null,
        h('p', { class: 't-head' }, `오늘: ${R.SKY_WORD[t.sky]}`),
        h('p', null, `최고 ${F.temp(d.tmax)}, 최저 ${F.temp(d.tmin)}, 비 ${F.rain(d.prcp)}. 중턱의 흙 온도는 ${F.temp(t.soilT)}이고 골짜기는 1도 낮고 마루는 1도 높습니다.`))),
    h('div', { class: 'alm-scroll', tabindex: '0', role: 'group', 'aria-label': '앞으로 닷새' }, h('table', { class: 'alm-t' },
      h('caption', { class: 'sr' }, '앞으로 닷새'),
      h('thead', null, h('tr', null, ['요일', `최고, ${F.tempUnit()}`, `최저, ${F.tempUnit()}`, '비', '양', '역병 날씨', '서리'].map(x => h('th', { scope: 'col' }, x)))),
      h('tbody', null, fc.map(x => h('tr', null,
        h('th', { scope: 'row' }, `${F.weekday(c.year, x.day, true)} ${F.dayOfMonth(c.year, x.day)}`),
        h('td', null, range(x.hi, x.spread)),
        h('td', null, range(x.lo, x.spread)),
        h('td', { class: x.rainChance >= 60 ? 'c-blue' : '' }, `${x.rainChance}%`),
        h('td', null, about(x.rainMm)),
        h('td', { class: x.blight >= 2 ? 'c-red' : '' }, R.BLIGHT_RISK[x.blight]),
        h('td', { class: x.frostChance >= 30 ? 'c-blue' : '' }, `${x.frostChance}%`)))))),
    h('p', { class: 't-caption' }, '최고·최저는 범위이며 멀수록 넓어집니다. 비는 확률이고 예보는 어느 쪽으로든 빗나갈 수 있습니다. 서리 확률은 가장 추운 골짜기 밭 기준입니다.'),
  ]
}

function blightPage(ctx: Ctx, c: S.Campaign): Child {
  const s0 = c.season!
  const t = S.today(ctx.app.world, c)
  const start = S.dayIndex(c.year, S.SV_START.month, S.SV_START.dom)
  const on = s0.watchDay >= 0
  const leaf = s0.fields.some(f => f.status === 'growing')
  return [
    s0.day < start
      ? h('p', { class: 'alm-lead' }, `${F.date(c.year, start)}부터 역병 심각도 수치를 셉니다.`)
      : on ? h('div', { class: 'alm-watch on' },
        need({ ink: 'red', icon: 'blight', label: '역병 감시 발령 중' }),
        h('p', { class: 'alm-lead c-red' }, `${F.date(c.year, s0.watchDay)}부터 감시가 이어지고 있으며 지금까지 심각도 수치는 ${s0.sv}입니다.`))
        : h('div', { class: 'alm-watch' },
          h('p', { class: 'alm-lead' }, h('b', { class: 't-figure' }, String(s0.sv)), ` / ${S.SV_THRESHOLD} 심각도 수치`),
          meter(Math.min(1, s0.sv / S.SV_THRESHOLD), { label: '역병 감시까지의 심각도 수치', text: `${s0.sv} / ${S.SV_THRESHOLD}`, kind: 'warn' }),
          h('p', null, `${S.SV_THRESHOLD - s0.sv}이(가) 더 쌓이면 역병 감시가 시작됩니다.${t && t.severity > 0 ? ` 오늘 날씨가 ${t.severity}을(를) 더합니다.` : ''}`)),
    h('p', null, `역병은 축축하고 온화한 날씨가 오래 이어져야 합니다. ${F.date(c.year, start)}부터 그런 날마다 심각도 수치가 쌓이고, 합계가 ${S.SV_THRESHOLD}에 이르면 역병 감시가 시작되어 그 후에는 역병 날씨마다 포자가 날아올 수 있습니다.`),
    h('p', null, '살포는 포자가 자리 잡는 것을 막지만 이미 병든 포기는 낫게 못 하므로 잎에 미리 뿌려야 합니다. 약효는 날마다 옅어지고 새 잎이 자라는 동안 더 빠르며, 비에 씻깁니다.'),
    h('p', null, on && !leaf ? '아직 잎이 올라온 밭이 없어 지킬 것이 없습니다.' : '역병은 가까이에서만 보입니다. 일주일 동안 아무도 밭을 걷지 않으면 깨끗한지 발병한 지 일주일인지 짐작일 뿐입니다.'),
  ]
}

function fieldsPage(ctx: Ctx, c: S.Campaign): Child {
  const s0 = c.season!
  return h('div', { class: 'alm-fields' }, heldFields(c).map(i => {
    const f = S.fieldInfo(c, i)
    const rows: [string, string][] = []
    const add = (k: string, v: string) => rows.push([k, v])
    add('지형', `${f.position}, 흙 ${R.soilWord(f.soil)}, 포기의 ${F.pct(f.vert)}가 일찍 시듦`)
    if (f.status === 'rest') add('올해', `귀리와 클로버, 가을에 ${F.money(S.REST_INCOME)}을(를) 벌어줍니다`)
    else {
      add('단계', f.daysIn > 0 && f.status !== 'dug' && f.status !== 'lost' ? `${f.stage}, 심은 지 ${f.daysIn}일째` : f.stage)
      if (f.status === 'idle' || f.status === 'planted') { const pr = S.plantReady(ctx.app.world, c, i); add('이곳 흙', `${F.temp(pr.soilT)}, 종자는 ${F.temp(pr.need)}이(가) 필요하고 ${F.temp(pr.rots)} 아래면 썩습니다`) }
      if (f.status === 'growing' || f.status === 'planted') {
        add('잎', `땅의 ${F.pct(f.canopy)}를 덮음${f.bloom > 0.2 ? ', 꽃핌' : ''}${f.frosted >= 0.05 ? `, ${F.pct(f.frosted)}가 서리에 검게 마름` : ''}`)
        add('북주기', R.hillWord(f.hillPasses))
        add('살포', f.protect > 0.02 ? `${F.pct(f.protect)} 남음` : '없음')
      }
      if (f.status !== 'dug' && f.status !== 'lost') add('흙 수분', `${f.moistureLabel}${f.tooWet ? ', 일하기에 너무 젖음' : f.wilt > 0.3 ? ', 잎이 처짐' : ''}`)
      if (f.status === 'growing' || f.status === 'dead') {
        add('역병', `${f.blightHills > 0 ? `포기 ${f.blightHills}개, 잎의 ${(f.blightKnown * 100).toFixed(f.blightKnown < 0.01 ? 1 : 0)}%` : '보이지 않음'}, ${f.scoutAge < 0 ? '살펴본 적 없음' : `마지막 살펴보기: ${F.ago(f.scoutAge)}`}`)
        add('바이러스', f.stunted > 0.005 ? `포기의 ${F.pct(f.stunted)}가 위축` : '위축 없음')
        if (f.stand < 0.995) add('발아', `종자의 ${F.pct(f.stand)}가 싹틈`)
      }
      if (f.estimate) {
        add('수확량', `${F.perAreaSpan(f.estimate.lo, f.estimate.hi)}, ${f.estimate.digs ? `시험 캐기 ${f.estimate.digs}회 기준` : '추정'}`)
        if (f.tubers) add('감자 크기', `시험 캐기에서 포기당 ${F.num(f.tubers.perHill, 0)}개, 개당 약 ${F.gramsSpan(f.tubers.lo, f.tubers.hi)}입니다. US No. 1은 ${F.grams(S.SIZE_A)}부터이고, ${F.grams(S.SIZE_CHEF)}을(를) 넘으면 대구입니다(${R.largeRule(ctx.app.world, c, c.plans[i].variety)}).`)
      }
      if (f.status === 'dead') add('껍질', f.skin >= 1 ? '굳음' : `${F.pct(f.skin)} 굳음, 줄기가 마른 지 ${f.deadDays}일`)
      const jobs = s0.jobs.filter(j => j.field === i)
      if (jobs.length) add('작업 목록에', F.list(jobs.map(j => R.JOB_VERB[j.kind].toLowerCase())))
    }
    return h('article', { class: 'alm-field' },
      h('h4', null, icon(R.stageGlyph(f), 'i'), h('span', { class: 'nm' }, f.name), h('span', { class: 't-caption' }, f.status === 'rest' ? '쉬는 중' : f.variety)),
      h('dl', null, rows.map(([k, v]) => h('div', null, h('dt', { class: 't-label' }, k), h('dd', null, v)))))
  }))
}

// The land the farm holds by block, its tracts, what is owed on it, and how land works.
function farmPage(ctx: Ctx, c: S.Campaign): Child {
  const mine = heldFields(c)
  const blocks = [...new Set(mine.map(i => S.PARCELS[i].block))]
  const st = S.storageInfo(c)
  const m = S.mortgageInfo(c)
  const tracts = S.tractInfo(c).filter(t => t.tenure !== 'none' && t.stage !== 'done')
  return [
    book(blocks.map(b => {
      const here = mine.filter(i => S.PARCELS[i].block === b)
      const rent = here.filter(i => c.fields[i].tenure === 'rented').reduce((a, i) => a + S.PARCELS[i].rent, 0)
      const far = Math.max(...here.map(i => S.travelDays(S.HOME_YARD, i)))
      return [[h('b', null, BLOCK_NAME[b]), sub(` ${F.list(here.map(i => S.FIELD_NAMES[i]))}${b === 'home' ? '' : `, 집 마당에서 ${roadTime(far)}`}`)], rent ? `${F.money(rent)} 임차` : '자가']
    }), ['내 땅', '연간']),
    tracts.length ? h('ul', { class: 'alm-list' }, tracts.map(t => h('li', null, h('b', null, `${t.name}, ${t.coverWord}`), `: ${t.next}`))) : null,
    h('p', { class: 't-caption' }, `${m.owed > 0 ? `땅 대출 ${F.money(m.owed)}이(가) 남았고 은행이 올해 말 ${F.money(m.principal + m.interest)}을(를) 가져갑니다. ` : ''}저장: ${F.list(st.houses.map(x => `${x.name.replace(/^(Home|Second)/, w => w.toLowerCase())} ${F.mass(x.cwt)}`))}.`),
    sec('땅은 이렇게 굴러갑니다'),
    rules([
      ['임차', '그 해 밭을 쓰고 시즌 시작 때 돈을 냅니다.', '계속 쓰는 해마다 임차료를 다시 냅니다.'],
      ['매입', `${F.pct(S.MORTGAGE_DOWN)}를 계약금으로 내고 나머지는 땅 대출로 넘기며 밭은 영원히 당신의 것입니다.`, `매년 말 은행이 대출의 ${F.pct(S.MORTGAGE_PRINCIPAL)}와 이자 ${F.pct(S.MORTGAGE_RATE)}를, 해마다 내는 상환금에 더해 가져갑니다.`],
      ['개간', `나무를 베고 그루터기를 뽑고(${F.money(S.STUMP_FEE)}) 돌을 주우면 숲이나 잡목지가 밭이 됩니다.`, '새 땅은 돌이 많고, 한 해 쉬지 않으면 첫 감자 수확이 적습니다.'],
      ['바람막이', '서 있는 숲은 옆 밭을 가려 수분 손실이 적고 더 센 바람에도 살포할 수 있습니다.', '대신 역병 날씨가 하루 한 시간 길어지고 서리가 더 차갑습니다.'],
      ['돌', '돌을 주우면 심기와 캐기가 빨라지고 작물의 멍이 줍니다.', '서리가 해마다 겨울마다 돌을 밀어 올리고, 줍는 동안 사람과 시간이 들고 밭에 작물이 없어야 합니다.'],
      ['산울타리', '산울타리를 자르면 골짜기나 중턱 밭의 습한 공기와 서리가 빠집니다.', `바람에 밭이 더 마르고 산울타리는 ${S.BRUSH_YEARS}년이면 다시 자랍니다.`],
      ['암거 배수관', '골짜기 땅도 비탈처럼 물이 빠지게 합니다.', `전문 업자가 ${F.money(S.TILE_FEE)}를 받으며, 작물이 없는 소유 땅에서만 가능합니다.`],
      ['통나무와 돌', `나무를 베면 통나무, 돌을 주우면 자연석이 생깁니다. 둘 다 건물에 들어가고 통나무는 짐당 ${F.money(S.LOG_PRICE)}에 팔 수 있습니다.`, `건물에 모자란 것은 사야 합니다. 통나무 짐당 ${F.money(S.MILL_PRICE)}, 돌 짐당 ${F.money(S.QUARRY_PRICE)}입니다.`],
    ]),
  ]
}

function peoplePage(c: S.Campaign): Child {
  const people = S.peopleInfo(c)
  return [
    h('table', { class: 'alm-t alm-people' }, h('tbody', null, people.map(p => {
      const best = S.bestSkill(p.skills)
      const who = p.kind === 'farmer' ? '당신' : p.name
      return h('tr', null,
        h('td', { class: 'alm-face' }, portrait(who, 40)),
        h('th', { scope: 'row' }, h('b', null, who),
          sub(` ${p.traitName ? `${p.traitName.toLowerCase()}, ` : ''}${S.SKILL_LABEL[best]}이(가) 최고 (${p.skills[best]}), ${p.tiredWord}, ${p.moodWord}${p.pay ? `, 월 ${F.money(p.pay)}` : ''}`)),
        h('td', null, p.doing))
    }))),
    sec('사람들은 이렇게 일합니다'),
    rules([
      ['기술', '다섯 가지, 각각 0~10: 기계, 밭일, 임업, 건축, 포장. 기술이 높을수록 빠르고 잘합니다.', `일하면서 배웁니다. 첫 레벨은 그 일 ${S.XP_BASE}일, 그다음부터는 매번 ${S.XP_PER_LEVEL}일씩 더 걸립니다.`],
      ['기질', '고용하는 사람마다 하나씩 있습니다. 억센 허리, 새벽형, 매서운 눈 같은 것입니다.', '고용 전에 읽어보세요. 부주의한 사람은 작물에 멍을 들이고 집순이는 겨울 일을 안 합니다.'],
      ['우선순위', '사람마다 자기 순서대로 일을 집어 듭니다. 1(가장 먼저)부터 4(마지막), 또는 절대 안 함.', '한 사람에게 직접 지시하면 우선순위와 무관하게 합니다.'],
      ['피로', '하루 쉬면 회복되고, 쉰 사람은 온전한 속도로 일합니다.', '지친 사람은 느려지고 기운을 잃고 숲이나 기계 위에서 다칩니다.'],
      ['기분', '요구보다 많은 품값, 침대, 휴식, 좋은 수확이 올려주고, 만족한 사람은 더 빨리 일합니다.', '기분이 일주일 내내 바닥이면 고용된 사람은 그만둡니다.'],
      ['일요일 휴식', '모두가 일주일에 하루 쉽니다.', '일요일에 일하면 일주일에 하루를 벌지만 모두가 지칩니다.'],
      ['작업반장', '매 작업일마다 구역 밭에 필요한 일을 작업 목록에 올립니다.', `작업반장은 품값을 ${F.pct(S.FOREMAN_PAY - 1)} 더 받고 밭일은 하지 않으며 영리하기보다 꼼꼼합니다.`],
      ['학생 일꾼', `수확철에 학생 일꾼은 캐기를 ${F.pct(S.PICKER_DIG - 1)} 빠르게 합니다.`, `일하는 날마다 ${F.money(S.PICKER_DAY)}이(가) 듭니다.`],
      ['겨울', `남겨둔 사람은 한 달에 ${S.WINTER_DAYS}일씩 벌목, 포장, 건축을 합니다.`, '품값은 매달 줍니다. 내보내면 비용이 없고 봄에 돌아옵니다.'],
    ]),
  ]
}

function buildingsPage(c: S.Campaign): Child {
  const all = S.buildingInfo(c).filter(b => b.yard === S.HOME_YARD || S.holdsDufour(c))
  const up = all.filter(b => b.state !== 'none')
  return [
    up.length ? h('ul', { class: 'alm-built' }, up.map(b => h('li', null,
      h('span', { class: 'lead' }, h('b', null, b.name), sub(b.yardName), h('span', { class: 'dots' }), h('span', null, b.state === 'built' ? '완공' : `${F.pct(b.progress)} 지어짐`)),
      b.state === 'built' ? null : meter(b.progress, { label: `${b.name} 완공도`, text: `${F.pct(b.progress)} 지어짐` }))))
      : h('p', { class: 'alm-empty' }, icon('build', 'i'), '처음 가진 것 외에 건물이 아직 없습니다. 지도에서 마당을 골라 지어보세요.'),
    sec('건물마다 하는 일'),
    rules(S.BUILDING_KINDS.map(k => {
      const spec = S.BUILDINGS[k]
      return [spec.name, `${spec.does} 비용은 ${F.money(spec.cash)}, 통나무 ${spec.logs}짐, 돌 ${spec.stone}짐, 공사 ${spec.days}일입니다.`, spec.catch]
    })),
  ]
}

function incidentsPage(c: S.Campaign): Child {
  const open = S.incidentInfo(c)
  return [
    open.length ? h('ul', { class: 'alm-list' }, open.map(i => h('li', null, h('b', null, i.title), `: ${F.localize(i.text)} `,
      i.daysLeft ? h('span', { class: 'c-red' }, `답할 날이 ${i.daysLeft}일 남았습니다.`) : null)))
      : h('p', { class: 'alm-empty' }, icon('check', 'i'), '지금 답이 필요한 일이 없습니다.'),
    sec('일어날 수 있는 일'),
    rules([
      [F.localize(S.INCIDENT_TITLE.applicant), '고용하거나 다른 곳을 보게 둡니다. 각자 자기 기술과 기질을 갖고 있습니다.', `답을 ${S.INCIDENT_DAYS}일 기다립니다.`],
      [F.localize(S.INCIDENT_TITLE.poach), `제안에 맞추면(${F.pct(S.POACH_RAISE)} 인상) 되고, 아니면 그 사람이 정합니다.`, '불만인 사람은 제안을 받고 떠납니다.'],
      [F.localize(S.INCIDENT_TITLE.breakdown), `${S.BREAK_DAYS}일 못 쓰거나 ${F.money(S.RUSH_PART)}를 내고 급송 부품을 받습니다. 기계 기술 ${S.MECHANIC} 이상이면 하루 만에 고칩니다.`, '지친 사람의 장시간 작업은 고장을 부르고, 기계 창고는 위험을 반으로 줄입니다.'],
      ['누군가 다침', `${S.HURT_DAYS[0]}~${S.HURT_DAYS[1]}일을 쉽니다.`, '숲이나 기계 위에서 일하는 지친 사람에게만 일어나니 쉬게 하면 막을 수 있습니다.'],
      [F.localize(S.INCIDENT_TITLE.buyer), `저장 작물 전체를 시세보다 ${F.pct(S.BUYER_PREMIUM)} 높게 삽니다. 이번 주뿐입니다.`, '팔면 끝이라 봄 가격까지 가져갈 수 없습니다.'],
    ]),
  ]
}

function diaryPage(c: S.Campaign): Child {
  const log = c.season?.log ?? []
  if (!log.length) return h('p', { class: 'alm-empty' }, icon('calendar', 'i'), '아무 일도 아직 일어나지 않았습니다.')
  const ink: Record<S.GameEvent['level'], string> = { info: '', good: 'c-green', warn: 'c-ochre', bad: 'c-red' }
  return h('ol', { class: 'alm-diary' }, [...log].reverse().map(e => h('li', { class: ink[e.level] },
    h('span', { class: 'when' }, F.date(c.year, e.day, true)),
    h('span', null, F.localize(e.text)))))
}

function pricesPage(ctx: Ctx, c: S.Campaign): Child {
  const world = ctx.app.world
  const ids = [...new Set(c.plans.filter((p, i) => p.crop === 'potato' && S.isField(c, i)).map(p => p.variety))]
  const lots = S.openLots(c)
  const ks = S.contractInfo(c)
  return [
    h('p', { class: 'alm-lead' }, R.moodText(world, c)),
    h('table', { class: 'cashbook alm-book' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, '품종'), h('th', { scope: 'col', class: 'm' }, '오늘 US No. 1'), h('th', { scope: 'col', class: 'm' }, '보통의 해'))),
      h('tbody', null, ids.map(id => {
        const v = S.variety(id)
        return h('tr', null, h('td', null, h('b', null, v.name), v.contract ? sub(' 계약 없이는 가공용 가격') : null), h('td', { class: 'm' }, F.price(S.basePrice(world, c, id))), h('td', { class: 'm' }, F.price(v.price)))
      }))),
    h('p', null, R.outlookText(c)),
    h('p', { class: 't-caption' }, `저장은 수확일부터 ${F.storeRate(S.STORE_COST)}이(가) 들고, 감자 저장고는 ${F.mass(S.cellarCapacity(c))}을(를) 담습니다.${F.cwtNote()}`),
    lots.length ? [
      sec('저장고 안'),
      book(lots.map(l => [`${S.FIELD_NAMES[l.field]}의 ${S.variety(l.variety).name}, ${F.mass(S.lotCwt(l))}`, F.money(S.lotValue(world, c, l))])),
      h('p', { class: 't-caption' }, '오늘 팔면 받는 값입니다. 캐낸 밭을 골라 작물을 팔거나 계근 전표를 보세요.'),
    ] : null,
    ks.length ? [
      sec('계약'),
      book(ks.map(k => [[h('b', null, `${k.buyer}, ${k.varietyName}`), sub(` ${F.mass(k.cwt)} 중 ${F.mass(k.delivered)} 납품, ${F.price(k.price)}, ${k.dueBy}`)],
        k.penalty > 0 ? `부족 ${F.money(-k.penalty)}` : '채움', k.penalty > 0 ? 'out' : undefined])),
    ] : null,
  ]
}

export function openAlmanac(ctx: Ctx, first: Page = 'forecast'): void {
  const app = ctx.app
  const c = app.campaign
  if (!c || !c.season) return
  let page = first
  ctx.papers.open({
    title: `연감, ${F.date(c.year, c.season.day)}`,
    testid: 'almanac',
    plain: true,
    cls: 'almanac-dialog',
    body: close => {
      const index = h('nav', { class: 'alm-index', 'aria-label': '연감 페이지' })
      const leaf = h('article', { class: 'alm-page', 'data-scroll': '', tabindex: '0', role: 'region', 'aria-label': '연감 페이지' })
      const draw = (focus = false) => {
        index.replaceChildren(...PAGES.map(([k, label, glyph]) => h('button', {
          class: `alm-tab${page === k ? ' on' : ''}`, type: 'button', testid: `almanac-${k}`, 'aria-current': page === k ? 'page' : null, autofocus: page === k,
          onclick: () => { page = k; draw(true) },
        }, icon(glyph, 'i'), h('span', null, label))))
        if (focus) index.querySelector<HTMLElement>('[aria-current]')?.focus()
        const pages: Record<Page, () => Child> = {
          forecast: () => forecastPage(ctx, c), blight: () => blightPage(ctx, c), fields: () => fieldsPage(ctx, c), farm: () => farmPage(ctx, c),
          people: () => peoplePage(c), buildings: () => buildingsPage(c), incidents: () => incidentsPage(c), diary: () => diaryPage(c), prices: () => pricesPage(ctx, c),
        }
        const name = PAGES.find(p => p[0] === page)![1]
        leaf.replaceChildren(h('h3', { class: 'alm-title' }, name), h('div', { class: 'alm-text' }, pages[page]()))
        leaf.scrollTop = 0
      }
      draw()
      return h('section', { class: 'alm sheet sys', 'data-layout': ctx.layout() },
        h('header', { class: 'alm-head' },
          h('div', null,
            h('p', { class: 't-label' }, `${R.seasonCount(c)} · ${F.date(c.year, c.season!.day)}`),
            h('p', { class: 'alm-mark', 'aria-hidden': 'true' }, '연감')),
          h('button', { class: 'close', type: 'button', testid: 'almanac-close', 'aria-label': '농장으로 돌아가기 (Esc)', onclick: close }, icon('close', 'i'))),
        leaf, index)
    },
  })
}
