import type { VarietyId } from './types.ts'

export interface Variety {
  id: VarietyId
  name: string
  released: number
  blurb: string
  maturity: 'early' | 'mid' | 'late' | 'very late'
  market: string        // what it is sold as
  tiPd: number          // thermal time from emergence to tuber initiation
  matPd: number         // thermal time from emergence to the start of senescence
  set: number           // tubers per hill
  bulk: number          // daily growth relative to the average
  blightLeaf: number    // susceptibility of foliage to late blight (Atlantic = 1)
  blightTuber: number   // susceptibility of tubers
  scab: number          // susceptibility to common scab (Atlantic = 1)
  hollow: number        // base share of large tubers with hollow heart
  green: number         // tendency to green: how high in the hill the tubers set
  rough: number         // tendency to knobs and growth cracks
  drought: number       // tolerance of dry soil, 0..1
  virus: number         // how readily virus spreads into saved seed (PVY susceptibility)
  dormancy: number      // days in the cellar before sprouting
  price: number         // dollars per cwt of US No. 1 in an average year
  usual: number         // cwt an acre it usually gives here, culls included, on rested soil a careful grower tends
  chefBonus: boolean    // large tubers sell at a premium
  contract: boolean     // the chipping variety: off contract it sells at a processing price that barely moves with the market
  skin: number          // colours, for drawing
  flesh: number
  shape: number         // 1 round, 1.7 long
}

// Sources and derivations: docs/research/03-varieties.md, table 2B, and docs/MODEL.md.
export const VARIETIES: Variety[] = [
  {
    id: 'norland', name: '다크 레드 놀랜드', released: 1957, maturity: 'early', market: '붉은 식용 감자',
    blurb: '조생 붉은 감자. 역병이 가장 심해지기 전에 거둘 수 있고 붉은 감자 값을 받지만, 가뭄에 시들고 수확 후 석 달 안에 싹이 난다.',
    tiPd: 120, matPd: 450, set: 9, bulk: 1.25, blightLeaf: 1.15, blightTuber: 1.2, scab: 0.58, hollow: 0.03, green: 1.0, rough: 0.8,
    drought: 0.1, virus: 0.9, dormancy: 60, usual: 226, price: 15.5, chefBonus: false, contract: false, skin: 0x9c3a3a, flesh: 0xf6efd8, shape: 1.05,
  },
  {
    id: 'superior', name: '수피리어', released: 1962, maturity: 'early', market: '조생 둥근 흰 감자',
    blurb: '조생에 매끈하고 궤양병에 강하다. 잎은 여기 품종 중 역병에 가장 약하니, 8월이 습해지기 전에 캐내거나 약을 쳐야 한다.',
    tiPd: 125, matPd: 520, set: 8, bulk: 1.15, blightLeaf: 1.38, blightTuber: 1.2, scab: 0.63, hollow: 0.03, green: 0.9, rough: 0.8,
    drought: 0.4, virus: 1.0, dormancy: 75, usual: 259, price: 14, chefBonus: false, contract: false, skin: 0xd6bb86, flesh: 0xf7f1dc, shape: 1.15,
  },
  {
    id: 'katahdin', name: '카타딘', released: 1932, maturity: 'late', market: '둥근 흰 식용 감자',
    blurb: '수십 년째 이 고장의 표준 둥근 흰 감자. 가뭄을 잘 견디고 저장성도 좋지만, 감자가 두둑 윗쪽에 달려 두둑이 얕으면 녹변한다.',
    tiPd: 155, matPd: 740, set: 7, bulk: 1.0, blightLeaf: 0.92, blightTuber: 0.7, scab: 1.42, hollow: 0.05, green: 1.5, rough: 0.9,
    drought: 0.55, virus: 0.5, dormancy: 120, usual: 301, price: 14.5, chefBonus: false, contract: false, skin: 0xdcc594, flesh: 0xf8f3e2, shape: 1,
  },
  {
    id: 'kennebec', name: '케너벡', released: 1948, maturity: 'late', market: '둥근 흰 식용 감자',
    blurb: '수량이 많고 여기 품종 중 역병 저항성이 가장 좋다. 마른 땅에서는 궤양병이 심하고, 가뭄이 풀릴 때 감자가 거칠어진다.',
    tiPd: 150, matPd: 680, set: 7, bulk: 1.02, blightLeaf: 0.48, blightTuber: 0.6, scab: 2.45, hollow: 0.08, green: 1.3, rough: 1.5,
    drought: 0.6, virus: 0.3, dormancy: 140, usual: 314, price: 13, chefBonus: false, contract: false, skin: 0xe0cb9c, flesh: 0xfaf5e6, shape: 1.25,
  },
  {
    id: 'burbank', name: '러셋 버뱅크', released: 1902, maturity: 'very late', market: '구이·튀김용 러셋',
    blurb: '구이용 감자의 고전. 이렇게 짧은 시즌에는 끝까지 여물지 못하니 9월의 하루하루가 중요하고, 수분이 고르지 못하면 울퉁불퉁해지고 속이 빈다. 4월까지 저장되는, 여기서 가장 오래가는 품종이다.',
    tiPd: 175, matPd: 850, set: 10, bulk: 1.0, blightLeaf: 0.7, blightTuber: 1.1, scab: 0.47, hollow: 0.138, green: 0.7, rough: 1.7,
    drought: 0.3, virus: 0.85, dormancy: 160, usual: 291, price: 14, chefBonus: true, contract: false, skin: 0xa6794e, flesh: 0xf5eeda, shape: 1.7,
  },
  {
    id: 'atlantic', name: '애틀랜틱', released: 1976, maturity: 'mid', market: '칩 가공 계약',
    blurb: '칩 가공용 표준 품종. 고정 가격을 받는 칩 공장 계약 재배용이고, 계약 없이는 가공용 가격밖에 못 받는다. 큰 감자는 속이 빌 수 있다.',
    tiPd: 145, matPd: 650, set: 8, bulk: 1.12, blightLeaf: 1.0, blightTuber: 1.1, scab: 1.0, hollow: 0.154, green: 1.0, rough: 0.9,
    drought: 0.3, virus: 0.75, dormancy: 100, usual: 317, price: 12.5, chefBonus: false, contract: true, skin: 0xd9c491, flesh: 0xf8f2de, shape: 1.05,
  },
  {
    id: 'gold', name: '유콘 골드', released: 1980, maturity: 'mid', market: '노란 특용',
    blurb: '살이 노랗고 품종 이름값으로 여기서 가장 좋은 값에 팔린다. 포기당 감자가 적게 달려 알이 크고, 일부는 속이 빈다.',
    tiPd: 140, matPd: 580, set: 6, bulk: 1.0, blightLeaf: 0.87, blightTuber: 0.8, scab: 1.32, hollow: 0.12, green: 1.0, rough: 0.9,
    drought: 0.4, virus: 1.0, dormancy: 110, usual: 260, price: 16.2, chefBonus: false, contract: false, skin: 0xd8b565, flesh: 0xf2d98a, shape: 1.1,
  },
  {
    id: 'caribou', name: '캐리부 러셋', released: 2015, maturity: 'late', market: '구이·튀김용 러셋',
    blurb: '짧은 시즌에도 여무는 새로운 러셋. 수량이 많고 감자가 매끈하며 궤양병도 적다. 1월을 넘겨 저장하기는 어렵다.',
    tiPd: 150, matPd: 700, set: 8, bulk: 1.03, blightLeaf: 1.0, blightTuber: 1.0, scab: 0.6, hollow: 0.03, green: 0.8, rough: 0.9,
    drought: 0.4, virus: 1.0, dormancy: 80, usual: 304, price: 14, chefBonus: true, contract: false, skin: 0xa9825a, flesh: 0xf6f0dc, shape: 1.6,
  },
]

export function variety(id: VarietyId): Variety {
  const v = VARIETIES.find(x => x.id === id)
  if (!v) throw new Error(`알 수 없는 품종 ${id}`)
  return v
}

export function availableVarieties(year: number): Variety[] {
  return VARIETIES.filter(v => v.released <= year)
}
