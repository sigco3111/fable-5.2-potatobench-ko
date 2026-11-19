// Farm words in plain words, in place: a word with a dotted rule under it says what it means under the pointer, or
// on a tap (it takes the focus).
import { h, type Child } from './dom.ts'

const NOTE = '농장 모기지에 대한 해마다의 은행 상환금으로, 은행이 연말에 가져갑니다.'
const LIVING = '한 해 가족의 생활비로, 연말에 나갑니다.'
const DUE = '작물이 어떻게 되든 연말에 갚아야 할 것: 농장의 은행 상환금, 가족의 생활비, 그리고 땅 모기지가 있다면 그것.'

export const GLOSSARY: Record<string, string> = {
  cwt: 'hundredweight(백중량)의 줄임말로, 감자 100파운드(약 45kg)입니다. 작물, 값, 저장량이 모두 이 단위로 잡힙니다.',
  'cwt/acre': '에이커당 백중량으로, 땅의 양에 비해 작물이 얼마나 무거운지를 말해줍니다.',
  'US No. 1': '최상급. 멀쩡하고 알이 좋은 감자로, 시장에서 제값을 받습니다.',
  'US No. 2': '두 번째 등급. 멀쩡하지만 모양이 삐뚤거나 흠이 있어 싸게 팔립니다.',
  'B size': 'No. 1 크기보다 작은 감자로, 싸게 팔립니다.',
  culls: '베이거나, 초록빛이거나, 썩거나, 너무 작아 팔 수 없는 감자.',
  hill: '감자가 빛과 역병에서 덮이고 잡초가 묻히도록 이랑에 흙을 덮어올리는 일. 시즌에 두 번 합니다.',
  hilled: '이랑에 흙을 덮어올린 횟수. 두 번이면 다 한 것입니다.',
  rogue: '찾아낸 병든 포기를 뽑아 자루에 담아, 포자가 퍼지는 것을 멈춥니다.',
  'kill vines': '일부러 줄기를 죽여, 감자가 자라기를 멈추고 껍질이 수확에 맞게 단단해지게 합니다.',
  'skins set': '줄기가 죽은 뒤 감자 껍질이 단단해져, 상하지 않게 캘 수 있고 저장에도 견딥니다.',
  protection: '역병이 자리잡지 못하게 잎에 뿌리는 약. 비와 새 잎에 닳아 없어지고, 이미 병든 포기는 낫게 하지 못합니다.',
  leaf: '잎이 땅을 덮는 정도. 잎이 많을수록 작물이 빨리 자랍니다.',
  water: '흙이 머금고 있는, 식물이 쓸 수 있는 물의 양.',
  'crew-days': '한 사람의 하루 일. 두 사람이면 이틀에 인일 넷을 해냅니다.',
  foreman: '한 구역의 밭을 맡긴 당신의 사람. 일하는 아침마다 그 밭에 필요한 일을 작업 목록에 올리고, 밭일은 직접 하지 않습니다. 품값은 40% 더 받습니다.',
  tract: '농장이 갖고 있거나 살 수 있는 숲, 덤불, 허한 땅. 벌목하고 그루터기를 뽑고 돌을 골라내면 새 밭이 됩니다.',
  'rest year': '감자 대신 귀리와 클로버를 심는 해. 밭은 조금 벌고 흙은 회복됩니다.',
  bulking: '감자가 여무는 시기. 작물을 만드는 몇 주입니다.',
  'setting tubers': '포기가 감자를 맺기 시작하는 시기. 몇 개나 맺는지가 작물의 크기를 정합니다.',
  'in bloom': '꽃이 피는 시기. 땅속에서 감자가 맺히고 있다는 뜻입니다.',
  'blight watch': '역병이 오기 좋은 날씨가 이어지고 있으니, 밭을 살펴보고 잎에 약을 뿌려두세요.',
  sheltered: '밭 옆 숲이 바람을 막습니다. 물은 덜 마르지만 잎이 오래 젖어 있어 역병이 좋아합니다.',
  'the note': NOTE,
  'the bank payment': NOTE,
  'the household': LIVING,
  'the household\'s keep': LIVING,
  'your family\'s living costs': LIVING,
  'due at the year end': DUE,
  'due at the end of the year': DUE,
  'test dig': '포기 하나를 캐서 감자가 몇 개인지, 얼마나 큰지, 무엇이 잘못됐는지 봅니다. 수확 전에 작물을 볼 수 있는 유일한 방법입니다.',
  scout: '가까이에서만 보이는 역병을 찾아 이랑 사이를 걷는 일.',
  'certified seed': '바이러스가 없게 기른 씨감자. 자가 종자보다 비싸지만 수확이 많습니다.',
  'fry plant': '감자튀김을 만드는 사자. 크고 멀쩡한 감자를 원하고 계약으로 값을 치릅니다.',
  packer: '상점에 낼 감자를 씻어 자루에 담는 사자.',
  lapse: '답하지 않으면 대신 결정되는 날.',
  'spring loan': '봄 계획이 가진 현금보다 비싸면, 은행이 모자란 만큼을 무이자로 빌려주고 연말에 작물이 번 돈에서 가져갑니다.',
  block: '함께 일구는 이웃한 밭들의 묶음: 집 농장, 시내 건너 골짜기 밭, 마루 밭, 뒤푸르 땅. 작업반장 하나가 한 구역을 돌봅니다.',
  skill: '한 종류의 일을 얼마나 잘하는지, 0에서 10까지. 기계 기술 6이면 좋은 트랙터 운전수입니다. 기술은 연습으로 늡니다.',
  'contract only': '이 품종은 계약으로 팔 때만 값을 받습니다. 계약이 없으면 낮은 가공 값이 됩니다.',
  'estimate before': '이번 시험 캐기 전에 밭이 낼 것이라 기대한, 에이커당 백중량. 아래의 범위가 시험 캐기가 보여주는 지금의 값입니다.',
  'hold back seed': '한 묶음의 일부를 저장고에 남겨 다음 봄에 심습니다. 공짜지만, 나온 작물의 바이러스를 그대로 물려받습니다.',
  'the cellar months': '작물이 저장되어 있는 11월부터 4월까지. 값이 움직이는 대로 팔 수 있고, 사람들을 데리고 나무를 베거나 포장하거나 지을 수 있습니다.',
  stamp: '밭의 표시 옆 둥근 도장을 누르면 그 밭에 필요한 지시를 합니다. 빨강은 역병이나 손실이니 지금 움직이세요. 황토색은 다음에 할 일. 파랑은 밭이 말라가는 중. 검정은 때가 된 일입니다.',
  'early dying': '흙 속의 시들음병으로, 포기를 일찍 죽입니다. 감자 뒤에 감자를 심으면 쌓이고, 휴경 해에는 줄어듭니다.',
  lesions: '역병이 잎에 만드는, 번지는 갈색 반점.',
  'hollow heart': '가문 뒤에 너무 빨리 자라 큰 감자 한가운데 생기는 빈 자리. 감자의 등급을 떨어뜨립니다.',
  large: 'No. 1 크기를 넘는 감자. 품종에 따라 큰 것에 더 주는 사자도, 덜 주는 사자도 있습니다.',
  'thin-skinned': '껍질이 단단해지기 전에 캔 감자. 시즌 초에 밭에서 바로 팔지 않으면 No. 2 값을 받습니다.',
  'knobs and cracks': '가문 뒤 비가 와 울렁울렁 자란 감자의 혹과 금. US No. 2로 떨어집니다.',
  scab: '흙이 마르면 번성하는 흙 속 균이 껍질에 만드는 거칠고 코르크 같은 얼룩. 걸린 감자는 US No. 2로 떨어집니다.',
  greened: '빛 속으로 자라 올라와 초록빛이 되고 써진 감자로, 팔 수 없습니다.',
  'thin skins': '밭을 캘 때 아직 단단해지지 않은 껍질. 줄기가 죽은 뒤 약 2주가 필요합니다.',
  'tuber blight': '잎에서 씻겨 내려가 감자 자체에 든 역병. 썩으므로 불량으로 골라냅니다.',
  'too small': '등급을 매기기엔 너무 작은 감자. 불량과 함께 전분 공장으로 갑니다.',
  'stone bruise': '캐는 기계가 감자를 돌에 부딪혀 생긴 멍. US No. 2로 떨어집니다.',
}

let seq = 0

// A word or phrase with its meaning in place. key: the glossary's entry, when it differs from the words shown. A screen
// reader hears the meaning as the word's description; it is not part of the sheet's text.
export function term(text: string, key = text.toLowerCase()): Child {
  const tip = GLOSSARY[key] ?? GLOSSARY[text]
  if (!tip) return text
  const id = `term-${++seq}`
  return h('span', { class: 'term', tabindex: '0', 'data-tip': tip, 'aria-describedby': id }, text, h('span', { id, hidden: true }, tip))
}
