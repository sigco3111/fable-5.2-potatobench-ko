// Every tunable number in the simulation. docs/MODEL.md gives the source of each, or marks it invented.
import { PARCELS } from './farm.ts'
import type { BuildingKind, Cause, Due, Grade, JobKind, RoutineKind, Skill, Trait, UnitKind, UpgradeId, VarietyId } from './types.ts'

export const SAVE_VERSION = 7

// Every parcel the farm has or could have; the first six are the home farm.
export const FIELD_COUNT = PARCELS.length
export const ROWS = 8
export const COLS = 12
export const HILLS = ROWS * COLS
export const FIELD_ACRES = 5
export const PLANTS_PER_ACRE = 17424          // 36 in rows, 10 in between seed pieces
export const GRAMS_PER_CWT = 45359.237
export const CWT_PER_HILL_GRAM = (FIELD_ACRES * PLANTS_PER_ACRE) / HILLS / GRAMS_PER_CWT

export const SEASON_START = { month: 3, dom: 20 }   // April 20
export const SEASON_LAST = { month: 10, dom: 10 }   // November 10
export const GOAL_YEARS = 5

// Thermal time (Sands, Hackett and Nix 1979).
export const PD_MIN = 7
export const PD_OPT = 21
export const PD_MAX = 30
export const EMERGE_PD = 130
export const SOIL_T_OFFSET = [-1, 0, 1]          // C: the bottom land warms late, the ridge early
export const SOIL_T_GAIN = 0.2                 // daily pull of soil temperature toward air temperature

// Canopy.
export const CANOPY_START = 0.03
export const CANOPY_RATE = 0.17                // logistic rate per day at the temperature optimum
export const SENESCE_RATE = 0.05
export const CLOSURE = 0.85

// Tuber growth.
export const BULK_G_PER_MJ = 1.2              // g fresh tuber per hill per MJ/m2 of sunlight at full canopy
export const PARTITION_PD = 120
export const UNWEEDED_FACTOR = 0.9

// Water (FAO-56).
export const TAW_MM = [93, 84, 72]             // by field position: bottom, mid, ridge
export const DEPLETION_P = 0.35
export const KC_BARE = 0.4
export const KC_FULL = 1.15
export const DRAIN = [0.72, 0.6, 0.45]         // share of surface wetness left next day
export const WORKABLE_WET_MM = 11
export const WATERLOG_MM = 34
export const IRRIGATION_MM = 25
export const STRESS_FLOOR = 0.3               // growth left when the root zone is empty

// Frost.
export const FROST_OFFSET = [-1.6, -0.5, 0.4]  // C on a calm clear night, by field position
export const LEAF_FROST_START = -1
export const LEAF_FROST_SPAN = 2
export const TUBER_FROST_START = -4.4
export const FREEZE_UP_SOIL_T = 0.5

// Late blight.
export const SV_THRESHOLD = 18                 // Blitecast: first spray
export const SV_START = { month: 4, dom: 25 }  // severity values count from May 25
export const ARRIVE_PER_SEV = 0.09             // chance per field per day that outside spores land, per severity value
export const LATENT_DAYS = 4
export const LESION_START = 0.03
export const LESION_GROW = 0.06                // lesion share added per day per severity value
export const SPREAD = 0.9
export const JUMP = 0.03
export const PROTECT = 0.95                    // best share of infections a fresh protectant stops
export const RESIDUE_DECAY = 0.9
export const ROAD_SEV = 0.08                   // field blight share visible without scouting
export const SCOUT_DETECT = 0.6
export const HUMID_BONUS = [2, 0, -1]          // extra wet hours by field position
export const JUMP_NEAR = 30                    // road distance within which blight jumps to another field at full rate

// Hills and defects.
export const COVER_BY_PASSES = [0.5, 0.8, 1]
export const STORM_MM = 35
export const STORM_EROSION = 0.07
export const SKIN_DAYS = 14
export const NEW_POTATO_LAST = { month: 8, dom: 5 }   // September 5
export const BRUISE_SOIL_T = 8
export const BRUISE_PER_C = 0.035

// Tuber grades by weight, grams.
export const SIZE_SMALL = 36          // 1-1/2 in, the US No. 2 minimum
export const SIZE_A = 70              // 1-7/8 in, the US No. 1 minimum
export const SIZE_CHEF = 300

// Labor: share of a working day each job takes on one field.
export const JOB_DAYS: Record<JobKind, number> = {
  plant: 1, hill: 0.5, scout: 0.2, spray: 0.25, water: 1, rogue: 0.25, sample: 0.1, kill: 0.25, dig: 2,
  fell: 40, rocks: 1.5, brush: 2, build: 1, haul: 1,
}
export const JOB_COST: Record<JobKind, number> = {
  plant: 150, hill: 60, scout: 0, spray: 110, water: 300, rogue: 0, sample: 0, kill: 120, dig: 500,
  fell: 0, rocks: 0, brush: 0, build: 0, haul: 0,
}
export const UPGRADES: Record<UpgradeId, { name: string; cost: number; blurb: string }> = {
  boom: { name: '붐 분무기', cost: 6000, blurb: '밭 하나의 살포가 ¼일에서 1/10일로 줄어듭니다.' },
  harvester: { name: '2조식 수확기', cost: 12000, blurb: '밭 하나의 수확이 이틀에서 하루와 ¼일로 줄어듭니다.' },
  vent: { name: '저장고 환기', cost: 7000, blurb: '저장고에 더 많이 넣을 수 있고, 저장 중 줄어드는 양이 적어지며, 썩음이 더 천천히 번집니다.' },
  reel: { name: '관수 릴', cost: 30000, blurb: '펌프와 파이프, 이동식 스프링클러. 밭 하나의 물 주기가 하루에서 반나절로 줄고 비용도 적어집니다.' },
  tractor2: { name: '두 번째 트랙터', cost: 6000, blurb: '파종기와 북주기를 단 두 번째 트랙터로, 두 사람이 동시에 기계 작업을 할 수 있습니다. 먼저 기계 창고가 필요합니다.' },
  house2: { name: '두 번째 감자 저장고', cost: 18000, blurb: '업자가 곧바로 본가에 두 번째 감자 저장고를 지어 저장량이 두 배가 됩니다. 직접 지으면 비용이 더 적습니다.' },
  tractor3: { name: '세 번째 트랙터', cost: 8000, blurb: '세 번째 트랙터로, 세 사람이 동시에 기계 작업을 할 수 있습니다. 기계 창고와 두 번째 트랙터가 먼저 필요합니다.' },
  truck: { name: '트럭', cost: 6000, blurb: '수확물 운반이 트랙터보다 두 배 빠르고, 트랙터는 다른 일을 할 수 있게 됩니다.' },
}

// ---------------------------------------------------------------- the bigger farm (all invented: docs/MODEL.md section 9)

// Crews: who can do what, travel by the farm roads, and how a crew picks its next order.
export const UNIT_JOBS: Record<UnitKind, JobKind[]> = {
  farmer: ['plant', 'hill', 'scout', 'spray', 'water', 'rogue', 'sample', 'kill', 'dig', 'fell', 'rocks', 'brush', 'build', 'haul'],
  hand: ['scout', 'rogue', 'sample', 'fell', 'rocks', 'brush', 'build'],
  operator: ['plant', 'hill', 'spray', 'water', 'kill', 'dig', 'haul'],
}
export const TRAVEL_DAYS_PER_UNIT = 0.0016     // a day's work lost per ground unit driven: a neighbouring field about 0.03
export const PICK_WINDOW = 3                   // a crew chooses among this many of the orders it could take next
export const PICK_LAG = 0.07                   // days of travel a crew would rather drive than skip one place down the list: more than any two home fields are apart
// The hours of a working day: the crews' work is counted an hour at a time.
export const DAY_STRETCHES = 11
export const HELPERS_MOST = 3                  // people with nothing to do who help at one order at most
export const HELP_RATE = 0.35                  // each helper at an order's place adds this share to the rate it is worked at
export const HAND_WAGE = 380                   // dollars a month
export const OPERATOR_WAGE = 550
export const WAGE_DAYS = 30                    // wages are paid for this many days at a time, from the day hired
export const MAX_HANDS = 4
export const MAX_OPERATORS = 1
export const FARMER_NAME = '당신'
export const HAND_NAMES = ['뤼시앵', '마리', '제럴드', '테레사', '롤랑', '닷']
export const OPERATOR_NAMES = ['웬델', '오렐']

// A dig hauls the crop to the nearest potato house the farm has. The home six are inside the haul the dig time
// already allows for; beyond that each ground unit adds this share, so the longest haul (Spruce Lot) adds about 40%.
export const HAUL = 0.014
export const HAUL_FREE = 51

// Contracts offered each spring.
export const CONTRACT_OFFERS = 3
export const CONTRACT_CWT_MIN = 1000           // about the US No. 1 crop of one field
export const CONTRACT_CWT_MAX = 2000
export const CONTRACT_PRICE: Record<Due, [number, number]> = { harvest: [0.92, 1.02], winter: [1.02, 1.12] }   // times the average-year price
export const CONTRACT_PENALTY = 0.3            // share of the contract value of what was not delivered
export const CONTRACT_WINTER_MONTH = 4         // cellar month (0 November) when winter contracts fall due: March
export const PROCESSING_PRICE = 0.8            // the chipping variety off contract sells at this share of its price

export const LAND_WORTH = 1                    // net worth counts land the farm bought at this share of its price

// Reference practice keeps the advice to what the crews could do: of each job, as many fields at once as the home
// farm has, for each crew able to do that job.
export const ADVICE_FIELDS_PER_CREW = 6

// ---------------------------------------------------------------- the farmstead: people (all invented: docs/MODEL.md section 10)

export const SKILLS: Skill[] = ['machine', 'field', 'woods', 'build', 'pack']
export const JOB_SKILL: Record<JobKind, Skill> = {
  plant: 'machine', hill: 'machine', scout: 'field', spray: 'machine', water: 'machine', rogue: 'field', sample: 'field', kill: 'machine', dig: 'machine',
  fell: 'woods', rocks: 'field', brush: 'field', build: 'build', haul: 'machine',
}
export const SKILL_MAX = 10
export const SKILL_SPEED_BASE = 0.6            // work in a skill goes at 0.6 + 0.08 x level of normal speed: level 5 is the old speed
export const SKILL_SPEED_PER = 0.08
export const XP_BASE = 6                       // crew-days of work to go from level L to L + 1: 6 + 3L
export const XP_PER_LEVEL = 3
export const FARMER_SKILLS: Record<Skill, number> = { machine: 6, field: 6, woods: 4, build: 4, pack: 3 }
// Someone taken on from the hiring hall for a kind of work: average at it, at the standard wage.
export const HAND_SKILLS: Record<Skill, number> = { machine: 2, field: 5, woods: 4, build: 3, pack: 4 }
export const OPERATOR_SKILLS: Record<Skill, number> = { machine: 5, field: 2, woods: 2, build: 3, pack: 2 }
export const SCOUT_BASE = 0.35                 // a scout finds each lesioned hill with chance 0.35 + 0.05 x field skill, to 0.9
export const SCOUT_PER = 0.05
export const SCOUT_MAX = 0.9
export const SPRAY_BASE = 0.84                 // a spray lays down 0.84 + 0.02 x machine skill of full protection, to 1
export const SPRAY_PER = 0.02

export const TRAITS: Record<Trait, { name: string; text: string }> = {
  strong: { name: '튼튼한 허리', text: '밭일과 임업 작업을 15% 더 빠르게 합니다.' },
  steady: { name: '차분한 손', text: '기계 작업을 기술 레벨이 두 단계 높은 것처럼 합니다.' },
  sharp: { name: '눈썰미', text: '순찰할 때 역병 걸린 포기를 더 많이 찾아냅니다.' },
  early: { name: '부지런한 새벽형', text: '모든 작업을 8% 더 빠르게 합니다.' },
  tireless: { name: '지치지 않음', text: '피로가 30% 더 천천히 쌓입니다.' },
  cheerful: { name: '명랑함', text: '기분이 중간 아래로는 떨어지지 않고, 다른 사람들의 기분도 조금 올려 줍니다.' },
  hothead: { name: '다혈질', text: '지쳤을 때 기분이 두 배 빨리 떨어집니다.' },
  careless: { name: '덜렁거림', text: '순찰할 때 역병을 더 많이 놓치고, 수확 때 감자를 더 많이 상하게 합니다.' },
  slow: { name: '느리지만 꼼꼼', text: '10% 느리게 일하지만 다치는 일이 없습니다.' },
  homebody: { name: '집순이·집돌이', text: '겨울에는 일하지 않습니다.' },
}
export const TRAIT_LIST: Trait[] = ['strong', 'steady', 'sharp', 'early', 'tireless', 'cheerful', 'hothead', 'careless', 'slow', 'homebody']
export const STRONG_SPEED = 1.15
export const STEADY_LEVELS = 2
export const SHARP_SCOUT = 0.15
export const EARLY_SPEED = 1.08
export const TIRELESS = 0.7
export const CHEERFUL_FLOOR = 0.4
export const CHEERFUL_OTHERS = 0.03
export const HOTHEAD_FALL = 2
export const CARELESS_SCOUT = 0.1
export const SLOW_SPEED = 0.9

export const TIRE_PER_DAY = 0.08               // a full day's work; a part day in proportion
export const REST_PER_DAY = 0.15                // a day without work; a part day in proportion to the time not worked
export const TIRED_SLOW_FROM = 0.6             // above this, speed falls in a straight line to 60% less at 1
export const TIRED_SLOW = 0.6
export const MOOD_START = 0.7
export const MOOD_BASE = 0.7
export const MOOD_BED = 0.2                    // a bed in the bunkhouse, for hired people
export const MOOD_PAY = 1                      // 0.1 for each 10% the wage is above or below what they asked
export const MOOD_TIRED_FROM = 0.5
export const MOOD_TIRED = 1
export const MOOD_PER_FIELD = 0.02             // each field brought in this season
export const MOOD_PULL = 0.05                  // share of the way to the target mood moves each day
export const MOOD_SPEED_BASE = 0.85            // work goes at 0.85 + 0.25 x mood
export const MOOD_SPEED_PER = 0.25
export const QUIT_MOOD = 0.25
export const QUIT_DAYS = 7

export const APPLICANTS = 3                    // people asking for work each spring
export const ASK_BASE = 70                    // asking wage: 70 + 40 x best skill + 10 x all skill levels, dollars a month
export const ASK_BEST = 40
export const ASK_LEVEL = 10
export const WAGE_MIN = 100
export const WAGE_MAX = 4000
export const HOUSED_OUT = 2                    // hired people who can live out; more need the bunkhouse
export const PRIORITY_MAX = 4
export const FOREMAN_PAY = 1.4
export const FIRST_NAMES = ['앨버트', '알시드', '아서', '비어트리스', '버나뎃', '칼', '클레망', '도리스', '엘머', '에블린', '페르낭',
  '플로렌스', '헤이즐', '홀리스', '잉그리드', '아이린', '자넷', '레옹', '노르망', '폴린', '리타', '루스', '버나', '이벳']
export const LAST_NAMES = ['웰렛', '미쇼', '티보도', '시르', '펠티에', '뒤베', '부샤르', '레베크', '데글', '테리오', '나도',
  '플루르드', '허시', '부바', '앤더슨', '에스플링', '콜린스', '헤인스', '매크럼', '켈리', '가뇽', '시루아']

// The harvest break: the schools close and a picking crew can be had by the day.
export const PICKERS_FROM = { month: 8, dom: 20 }   // September 20
export const PICKERS_TO = { month: 9, dom: 10 }     // October 10
export const PICKER_DAY = 90                  // dollars a day worked
export const PICKER_DIG = 1.5                  // every dig goes this much faster

// Winter, November to April: someone kept on is paid each month and puts in this many crew-days at their skill.
export const WINTER_MONTHS = 6
export const WINTER_DAYS = 20
export const FARMER_WINTER_DAYS = 10

// ---------------------------------------------------------------- the farmstead: land and materials (docs/MODEL.md section 11)

export const FELL_DAYS: Record<'woods' | 'brush', number> = { woods: 40, brush: 16 }   // crew-days to fell a tract
export const TIMBER: Record<'woods' | 'brush', number> = { woods: 40, brush: 5 }       // loads of logs at a yield of 1
export const FELL_YIELD_BASE = 0.7             // felling yields 0.7 + 0.06 x woods skill of the tract's timber
export const FELL_YIELD_PER = 0.06
export const FELL_SEASON = 0.5                 // in the growing season felling goes at half speed: soft ground and flies
export const STUMP_FEE = 6000                  // a contractor with a bulldozer
export const STUMP_DAYS = 10                   // season days
export const TILE_FEE = 1000
export const TILE_DAYS = 8
export const RAW_GROUND = 0.85                 // a first potato crop on raw ground grows this share, unless rested first
export const NEW_GROUND_VERT = 0.01
export const SHELTER_RANGE = 20                // standing woods and brush shelter held fields within this many ground units
export const SHELTER_WATER = 0.94              // a sheltered field loses this share of the water an open one does
export const SHELTER_WIND = 1.3                // and can be sprayed in this much more wind
export const SHELTER_WET_HOURS = 1             // and stays wet an hour longer
export const SHELTER_FROST = 0.3               // and is this much colder, C, on a frost night
export const SPRAY_WIND = 7.5                  // m/s: too windy to spray an open field
export const STONE_SLOW = 0.7                  // stones slow planting and digging, to 30% at 1
export const STONE_BASE = 0.25                 // the home farm's usual stones, which the old job times already allow for
export const STONE_BRUISE = 0.12               // share of tubers bruised by stones at the dig, per unit of stones above STONE_BRUISE_FROM
export const STONE_BRUISE_FROM = 0.2
export const BRUISE_SKILL_BASE = 1.3           // stone bruising scaled by 1.3 - 0.06 x the digger's machine skill
export const BRUISE_SKILL_PER = 0.06
export const CARELESS_BRUISE = 1.2
export const HEAVE = 0.04                      // stones frost heaves up each winter
export const ROCKS_TAKE = 0.4                  // stones one picking takes off
export const ROCKS_LOADS = 12                  // loads of fieldstone for each unit of stones taken
export const ROCKS_ADVISE = 0.6                // reference practice picks rocks in spring on a field this stony
export const ROCKS_MIN = 0.05                  // below this there is nothing worth picking
export const BRUSH_YEARS = 4                   // cut hedgerows grow back after this many years
export const BRUSH_WATER = 1.03                // a field without its hedgerows loses this much more water to the wind
export const TILE_TAW = 0.97                   // a tiled field holds this share of the water in a drought
export const LOG_PRICE = 55                    // dollars a load, sold
export const MILL_PRICE = 95                   // dollars a load of logs bought for a building
export const QUARRY_PRICE = 40                 // dollars a load of stone bought for a building
export const MORTGAGE_DOWN = 0.25              // land is bought a quarter down, the rest on the mortgage
export const MORTGAGE_PRINCIPAL = 0.07          // each year end: 7% of each purchase's loan
export const MORTGAGE_RATE = 0.06              // and 6% interest on what is still owed

// ---------------------------------------------------------------- the farmstead: buildings and hauling (docs/MODEL.md section 12)

export interface BuildingSpec { name: string; cash: number; logs: number; stone: number; days: number; dufour: boolean; does: string; catch: string }
// dufour: whether one can stand at the Dufour yard too (one of each kind per yard).
export const BUILDINGS: Record<BuildingKind, BuildingSpec> = {
  house: { name: '감자 저장고', cash: 7000, logs: 30, stone: 25, days: 30, dufour: true,
    does: '마당에 3,600 cwt를 저장합니다(본가는 환기 장치를 갖추면 6,400).', catch: '밭 하나를 가꾸는 것만큼 비용이 들고, 짓는 데 한 달이 걸립니다.' },
  shed: { name: '기계 창고', cash: 4500, logs: 20, stone: 10, days: 16, dufour: false,
    does: '기계 작업이 15% 빨라지고 고장이 절반으로 줄며, 두 번째·세 번째 트랙터를 둘 수 있습니다.', catch: '감자를 키워 주지 않는 돈과 자재가 듭니다.' },
  bunk: { name: '숙소', cash: 3500, logs: 16, stone: 8, days: 12, dufour: true,
    does: '고용한 일꾼 여섯이 잘 수 있는 침대가 생기고, 침대가 있는 일꾼은 더 만족합니다.', catch: '침대는 쓰는 사람이 있어야 값을 하고, 사람 한 명마다 월급이 늘어납니다.' },
  packing: { name: '포장 창고', cash: 8000, logs: 24, stone: 15, days: 24, dufour: false,
    does: '겨울에 포장을 맡긴 사람이 저장한 감자를 선별합니다. 포장한 1등급은 15% 더 비싸게 팔리고, 포장한 B 사이즈는 1등급 가격의 4분의 3을 받습니다.', catch: '포장에는 무게당 수수료가 들고, 겨우내 두는 사람의 월급도 듭니다.' },
  pond: { name: '관수 연못', cash: 6000, logs: 0, stone: 30, days: 20, dufour: false,
    does: '여섯 번의 물 주기를 담아 둡니다. 본가나 저지대 밭에 여기서 물을 주면 하루의 3분의 1이 걸리고 $60가 듭니다.', catch: '한 달 비가 40 mm(1.6인치)보다 적으면 개울물이 말라 연못이 바닥납니다. 꼭 필요할 때요.' },
  stand: { name: '농산물 직판장', cash: 600, logs: 4, stone: 0, days: 4, dufour: false,
    does: '8월 1일부터 가장 최근 물량에서 하루 약 6 cwt를 시세의 두 배에 팝니다. 붉은 감자, 노란 감자, 햇감자는 더 받습니다.', catch: '누군가가 지켜야 해서, 문을 여는 날마다 작업일의 5분의 1이 듭니다.' },
  station: { name: '기상 관측소', cash: 1000, logs: 0, stone: 0, days: 1, dufour: false,
    does: '예보 오차가 40% 줄고, 밭마다 잎이 젖어 있는 시간을 바탕으로 오늘의 역병 위험을 보여 줍니다.', catch: '예보는 여전히 틀릴 수 있고, 위험을 아는 것만으로 밭에 약을 쳐 주지는 않습니다.' },
  road: { name: '자갈길', cash: 1500, logs: 0, stone: 40, days: 12, dufour: false,
    does: '이동과 운반이 30% 빨라집니다.', catch: '돌 40적이 필요하며, 채석장에서 사면 $1,600입니다.' },
}
export const BUILDING_KINDS: BuildingKind[] = ['house', 'shed', 'bunk', 'packing', 'pond', 'stand', 'station', 'road']
export const HOUSE_CWT = 3600                  // a built potato house; at home with ventilation it holds CELLAR_CWT_VENT
export const SHED_SPEED = 1.15
export const BUNK_BEDS = 6
export const PACK_PER_DAY = 40                 // cwt packed in a crew-day: 800 in a winter month's 20
export const PACK_CHARGE = 0.4                 // dollars a hundredweight packed: cartons, bags and labels
export const PACK_NO1 = 0.15                   // packed No. 1 brings this much more
export const PACK_B = 0.75                     // packed B size sells at this share of the No. 1 price
export const POND_CAP = 6                      // field-waterings the pond holds
export const POND_DAYS = 1 / 3                 // a watering from the pond takes this share of a day
export const POND_COST = 60
export const POND_DRY_MM = 40                  // when the last 30 days brought less rain than this, the brook is low and the pond empties
export const POND_FILL = 0.5                   // waterings a day the brook adds otherwise
export const POND_RAIN_MM = 20                 // and one watering for each this many mm of rain
export const STAND_FROM = { month: 7, dom: 1 } // August 1
export const STAND_CWT = 6                     // cwt a day
export const STAND_PRICE = 2                   // times the market's No. 1 price
export const STAND_SPECIAL = 2.4               // for red and yellow varieties, and thin-skinned new potatoes up to September 5
export const STAND_SPECIAL_VARIETIES: VarietyId[] = ['norland', 'gold']   // red and yellow
export const STAND_MIND = 0.2                  // share of a working day someone spends minding it
export const STATION_ERROR = 0.6               // the forecast's errors with a weather station
export const ROAD_SPEED = 0.7                  // travel and hauling take this share of the time
export const HAUL_CWT_DAY = 900                // cwt a day one person with a tractor hauls, at machine speed 1
export const TRUCK_HAUL = 2                    // the truck hauls at twice a tractor's rate
export const FREEZE_IN_FIELD = -2              // C at the field: a night this cold freezes a share of the crop still in the field
export const FREEZE_SHARE = 0.2
export const BARRELS_SAY = 3                   // days barrels stand out in a field before a slip says what they cost
export const GREEN_IN_FIELD = 0.005            // share of the crop in the field greened each bright day

// ---------------------------------------------------------------- the farmstead: incidents (docs/MODEL.md section 13)

// Each is drawn from the campaign seed and the day, so a replay sees the same ones; each waits a few days for an
// answer before taking its default.
export const INCIDENT_DAYS = 4                 // days an incident waits for an answer
export const TELEGRAM_GAP = 7                  // days between telegrams, but for a broken tractor
export const QUIET_UNTIL = { month: 6, dom: 15 } // a first year's telegrams wait for the planting, this long at most
export const APPLICANT_CHANCE = 0.012          // a day in season: someone turns up asking for work
export const POACH_CHANCE = 0.01              // a day in season with someone hired: a neighbour offers them more
export const POACH_RAISE = 0.15                // to match, their wage goes up this much
export const POACH_MOOD = 0.7                  // unmatched, they go if their mood is under this
export const BREAK_CHANCE = 0.004              // a day a tractor is worked: it breaks down
export const BREAK_TIRED = 3                   // likelier with long hours: times 1 + 3 x the driver's tiredness
export const BREAK_SHED = 0.5                  // half as likely with a machine shed
export const BREAK_DAYS = 3                    // days out waiting for the part
export const MECHANIC = 7                      // with someone this good at machine work on the farm, a day out
export const RUSH_PART = 450                   // dollars: a rush part, back in a day
// Felling is work for spare time and spare strength: someone this tired leaves it for a day's rest, so the woods
// never wear out the people the crop will need. (A first-time player's crew felled itself worn out, the farm's one
// driver with it, and the hilling and the spraying waited weeks.)
export const FILL_TIRED = 0.45
export const HURT_TIRED = 0.85                 // working tired above this in the woods or on a machine risks an injury
// Someone told to rest is back at work once rested below this.
export const REST_UNTIL = 0.3
export const HURT_CHANCE = 0.05                // a day, while that tired
export const HURT_DAYS = [5, 10]               // days out, at least and at most
export const BUYER_CHANCE = 0.01               // a day from August on with a weighed lot of 100 cwt or more
export const BUYER_FROM = { month: 7, dom: 1 }
export const BUYER_MIN_CWT = 100
export const BUYER_PREMIUM = 0.1               // over what the lot would fetch on the market
export const BUYER_DAYS = 7                    // this week only

// Money, in constant dollars.
export const START_CASH = 24000
export const NOTE_PAYMENT = 10000
export const LIVING = 9000
export const CREDIT_LIMIT = -20000            // carried past year end, the bank forecloses below this
export const OPERATING_LIMIT = -75000         // the spring operating loan, repaid from the crop
// Once the season is under way the bank lends for things that last as well (a building, a machine, a contractor's
// work), while the farm owes no more than this in all. (Invented, for play: a farm that can buy nothing until its
// first crop sells has nothing to build for a year.)
export const BUILD_CREDIT = 30000
export const CREDIT_RATE = 0.1
export const FIELD_COST = 8000                 // fertilizer, fuel, repairs and insurance for a potato field
export const SEED_CWT_PER_FIELD = 100
export const CERT_SEED_PER_CWT = 17
export const REST_COST = 250
// The days from tuber set while dry soil sets scab (season.ts, the potatoes sizing up), for saying a fall is scab.
export const SCAB_DAYS = 35
// About what a potato field's work costs a month of the season, the dig included (coach-tended first years: $397).
export const FIELD_WORK_MONTH = 400
export const REST_INCOME = 900

export const CELLAR_CWT = 3600
export const CELLAR_CWT_VENT = 6400
export const STORE_COST = 0.15                // dollars per cwt per month in the cellar: power, sprout control, labour
export const SHRINK = 0.012
export const SHRINK_VENT = 0.007
export const ROT_GROW = 1.1
export const ROT_GROW_VENT = 0.6
export const ROT_BREAK = 0.22
// Blight that goes into the pile looking sound, for each cwt culled for blight at the table: what the storage outlook
// expects from the weigh ticket (measured over thirty coach-tended first years).
export const ROT_HIDDEN = 0.45
export const SPROUT_SHRINK = 0.03
export const COOL_CELLAR_DAYS = 40             // dormancy gained by holding at 39F instead of the 45F the variety figures assume
export const VENT_DAYS = 25

export const SOIL_AFTER_POTATO = -0.5        // two potato years running bring the full continuous-potato penalty
export const SOIL_YIELD = 0.07               // total yield lost in continuous potato (Larkin 2022: 0.93x)
export const SOIL_SCAB = 0.19                // extra scab in continuous potato (1.19x)
export const SOIL_SCURF = 0.08               // share of tubers downgraded by black scurf and scab in worn soil
export const VERT_GROW = 2.3                 // odds of Verticillium multiply by this per potato crop
export const VERT_REST = 0.75                // and by this per rest year
export const VERT_EARLY = 0.66               // an infected plant senesces at this share of its normal thermal time
export const VIRUS_CERTIFIED = 0.01
export const VIRUS_SPREAD = 0.22             // share of healthy plants infected in a season without aphid control
export const VIRUS_KEEP = 0.85
export const VIRUS_VIGOR = 0.7               // a PVY-infected hill yields 30% less

// Price of a hundredweight relative to US No. 1, by grade.
export const GRADE_PRICE: Record<Grade, number> = { no1: 1, chef: 1.1, b: 0.55, no2: 0.45, cull: 0 }
export const CULL_PRICE = 1                  // dollars per cwt, at the starch factory
// Price through the year relative to the season average.
// Maine monthly price over the season average, 1979-2013 (USDA NASS).
// From mid August on these are the record; the new-crop premium before that is invented (see docs/MODEL.md).
export const SEASON_CURVE: [number, number][] = [   // [day of year, factor]
  [182, 1.4], [196, 1.32], [213, 1.2], [227, 1.05], [244, 0.93], [258, 0.887], [288, 0.878], [319, 0.922],
]
export const MONTH_CURVE = [0.922, 0.962, 0.983, 1.015, 1.062, 1.105, 1.099]   // November to May
export const CELLAR_MONTHS = ['November', 'December', 'January', 'February', 'March', 'April', 'May']

export const CAUSES: Cause[] = ['green', 'scab', 'hollow', 'knob', 'skin', 'bruise', 'blight', 'frost', 'rot', 'small', 'stone']
export const GRADES: Grade[] = ['no1', 'chef', 'b', 'no2', 'cull']
// The farm's standing orders, in the order they are listed, and which are on in a new game: the routine work goes on
// the list by itself; spraying, watering and killing the vines are the player's calls.
// The year's first planting waits for the player's word: this many days after the crew first stands ready it starts
// by itself.
export const PLANT_WORD_DAYS = 3
export const ROUTINE_KINDS: RoutineKind[] = ['plant', 'hill', 'scout', 'rogue', 'sample', 'dig', 'haul', 'spray', 'water', 'kill']
export const ROUTINE_DEFAULT: Record<RoutineKind, boolean> = {
  plant: true, hill: true, scout: true, rogue: true, sample: true, dig: true, haul: true, spray: false, water: false, kill: false,
}
// Hauling comes first when the night at the field is forecast this cold, or a frost this likely.
export const FROST_HAUL_C = 0
// The one planting rule: the field's own soil at this, C (50 F); below the rot line (45 F) seed rots.
export const PLANT_SOIL_C = 10
export const PLANT_ROT_C = 7.2
export const PLANT_FROM = { month: 4, dom: 8 }   // May 8: the earliest planting
// Cwt a dig lifts for each day of digging done, before the first barrels show what this field gives.
export const DIG_CWT_GUESS = 750
// A lone hauler holds the dig back when tonight's forecast low at the field is within this of freezing the barrels.
export const DIG_FROST_MARGIN = 1
// What a cwt of the crop still in the ground brings at the weigh-in, as a share of the No. 1 price: the mix of No. 1,
// B size and culls of a crop clear of scab and knobs, less this much for each share of tubers the field's season and
// soil send to No. 2 (harvest.ts, markOdds), and how far a field strays from that (fitted over 192 coach-tended fields).
export const MARKETABLE_SHARE = 0.86
// By weight, for setting the crop against the cellar: the share of a field's own expected yield that comes to the
// weigh-in (all but the culls: 0.940 to 0.951 over eight first-year farms), and before a field has shown its own, the
// share of its variety's usual yield a tended crop has brought there (0.82 to 0.89 over the same farms).
export const STORED_SHARE = 0.95
export const USUAL_STORED = 0.86
// The last day a potato field still to be planted is reckoned to make a crop.
export const PLANT_LAST = { month: 7, dom: 1 }
export const MARKETABLE_NO2 = 0.38
export const MARKETABLE_SPREAD = 0.042
// Before the tubers set: the share of tubers a usual season sends to No. 2, and how far a field's yield strays from
// its variety's usual one (18% over 384 coach-tended fields).
export const NO2_USUAL = 0.136
export const USUAL_SPREAD = 0.2
// The share of a crop's total cwt that grades US No. 1 or large, what a contract takes: each variety's in a crop clear
// of scab and knobs, less this much for each share of tubers sent to No. 2, and how far a field strays from that
// (fitted over 384 coach-tended fields, 48 of each variety).
export const NO1_SHARE: Record<VarietyId, number> = {
  norland: 0.655, superior: 0.756, katahdin: 0.815, kennebec: 0.818, burbank: 0.696, atlantic: 0.802, gold: 0.803, caribou: 0.786,
}
export const NO1_NO2 = 0.81
export const NO1_SPREAD = 0.08
// Reference practice digs a crop whose vines are still up from this date, so it is in before the freeze-up.
export const DIG_GREEN = { month: 9, dom: 5 }   // October 5
// Where the dig is the routine's and the kill the player's call, the crew kills the vines by itself this many days
// after the coach first asks, and no later than two weeks of skin set before the green dig, unless the player kept
// them up (advice.ts, killByItself).
export const KILL_WAIT = 7
// A field whose vines the player keeps up is called to them this many days before the last day a kill sets the skins.
export const KILL_CALL_DAYS = 2
// Reference practice asks for the vines to be killed by this date, or this many days after the crop is made.
export const KILL_BY = { month: 8, dom: 8 }      // September 8
export const KILL_MADE_DAYS = 4
// A kill this many days or fewer ahead of the asking counts as asked on the weigh ticket.
export const KILL_GRACE = 3
export const FROST_HAUL_CHANCE = 40
export const JOBS: JobKind[] = ['plant', 'hill', 'scout', 'spray', 'water', 'rogue', 'sample', 'kill', 'dig', 'fell', 'rocks', 'brush']
