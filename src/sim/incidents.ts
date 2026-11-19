// Incidents: things that happen in the season and ask for a decision, what each choice does, and the default taken
// when nobody answers.
import { formatDay, withCommas } from './calendar.ts'
import { lotCwt } from './harvest.ts'
import * as P from './params.ts'
import { SKILL_LABEL, bestSkill } from './people.ts'
import type { Campaign, Incident, IncidentKind, Unit } from './types.ts'
import { variety } from './varieties.ts'

export const INCIDENT_TITLE: Record<IncidentKind, string> = {
  applicant: '일자리를 찾는 사람',
  poach: '이웃이 우리 일꾼을 빼가려 합니다',
  breakdown: '트랙터가 고장 났습니다',
  buyer: '구매자가 들렀습니다',
}

export const CHOICE_LABEL: Record<string, string> = {
  hire: '고용', pass: '다음에',
  match: '같은 조건 제시', let: '본인이 정하게',
  rush: '급송 부품 비용 지불', wait: '부품을 기다림',
  take: '제안 수락', refuse: '거절',
}

// The situation in plain words.
export function incidentText(c: Campaign, inc: Incident): string {
  const day = (d: number) => formatDay(c.year, d)
  switch (inc.kind) {
    case 'applicant': {
      const a = inc.applicant!
      const best = bestSkill(a.skills)
      return `${a.name} 님이 월 $${withCommas(a.ask)}에 일자리를 찾고 있습니다. 가장 뛰어난 기술은 ${SKILL_LABEL[best]}(레벨 ${a.skills[best]})이고, 성향은 ${P.TRAITS[a.trait].name}입니다.`
    }
    case 'poach': {
      const u = c.crew.find(x => x.id === inc.unit)
      return u ? `이웃이 ${u.name}에게 월 $${withCommas(inc.wage!)}를 제시했습니다. 현재 당신은 $${withCommas(u.wage)}를 주고 있습니다.` : '이웃의 제안은 지났습니다.'
    }
    case 'breakdown':
      return `부품을 기다리면 트랙터는 ${day(inc.back!)}에 돌아옵니다.`
    case 'buyer': {
      const lot = c.lots.find(l => l.id === inc.lot)
      return lot ? `구매자가 당신의 ${variety(lot.variety).name} ${withCommas(lotCwt(lot))} cwt 전량에 시세보다 10%를 얹어주겠다고 합니다. 이번 주뿐입니다.` : '구매자가 떠났습니다.'
    }
  }
}

// What a choice does, in one sentence.
export function choiceDoes(c: Campaign, inc: Incident, choice: string): string {
  switch (choice) {
    case 'hire': return `${inc.applicant!.name} 님이 월 $${withCommas(inc.applicant!.ask)}로 시작합니다. 기술과 성향은 그 사람 고유의 것입니다.`
    case 'pass': return inc.kind === 'buyer' ? '이 물량은 나중에 팔거나 저장할 수 있습니다.' : '그 사람은 다른 일자리를 찾을 겁니다.'
    case 'match': return `월급이 ${Math.round(P.POACH_RAISE * 100)}% 올라 월 $${withCommas(inc.wage!)}가 됩니다.`
    case 'let': {
      const u = c.crew.find(x => x.id === inc.unit)
      return u && u.mood < P.POACH_MOOD ? `${u.name} 님은 이곳이 마음에 들지 않아 떠날 겁니다.` : `${u?.name ?? '그 사람'}은 이곳이 충분히 마음에 들면 남지만, 기분이 ${P.POACH_MOOD} 아래면 떠납니다.`
    }
    case 'rush': return `$${withCommas(P.RUSH_PART)}가 들고, 트랙터는 내일 돌아옵니다.`
    case 'wait': return `비용은 없고, 트랙터는 ${formatDay(c.year, inc.back!)}에 돌아옵니다.`
    case 'take': return '지금 물량 전부를 오늘 시세보다 10% 높게 팝니다.'
    case 'refuse': return '이 물량은 나중에 팔거나 저장할 수 있습니다.'
  }
  return ''
}

// Chance that a tractor breaks down under this driver today: likelier with long hours (the driver's tiredness), half
// as likely with a machine shed.
export function breakdownChance(u: Unit, shed: boolean): number {
  return P.BREAK_CHANCE * (1 + P.BREAK_TIRED * u.tired) * (shed ? P.BREAK_SHED : 1)
}

// Chance that someone working in the woods or on a machine today is hurt: only when worn out, never for the slow
// and sure.
export function hurtChance(u: Unit): number {
  return u.tired > P.HURT_TIRED && u.trait !== 'slow' ? P.HURT_CHANCE : 0
}

// The choice taken when nobody answers: the last on the list.
export function defaultChoice(inc: Incident): string {
  return inc.choices[inc.choices.length - 1]
}
