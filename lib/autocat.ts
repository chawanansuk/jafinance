import { categoryGroup } from './categories';
import type { RulesState } from './types';

/**
 * Ordered keyword → category table used to auto-categorize newly entered or
 * imported rows. First match wins. All matching is case-insensitive substring
 * over "merchant + desc". Purely local — no network.
 */
const KEYWORD_TABLE: { kw: string[]; category: string }[] = [
  // debt settlement — must come first so it isn't caught by generic bank/transfer keywords
  { kw: ['ชำระบัตร', 'ชำระค่าบัตร', 'จ่ายบัตร', 'ชำระยอดบัตร', 'บัตรเครดิต', 'credit card payment', 'cc payment', 'uob premier', 'card payment'], category: 'ชำระบัตรเครดิต' },
  { kw: ['grab', 'lineman', 'foodpanda', 'gojek', 'bolt'], category: 'Grab/เดลิเวอรี่/แท็กซี่' },
  { kw: ['7-eleven', '7-11', '7 11', 'seven', 'เซเว่น', 'cj more', 'lawson', 'familymart'], category: 'ร้านสะดวกซื้อ' },
  { kw: ['lotus', 'โลตัส', 'tops', 'big c', 'bigc', 'makro', 'แม็คโคร', 'villa market', 'gourmet', 'foodland', 'tesco', 'grocery', 'supermarket', 'ซูเปอร์'], category: 'ห้าง/ซูเปอร์มาร์เก็ต' },
  { kw: ['starbucks', 'cafe', 'café', 'คาเฟ่', 'coffee', 'กาแฟ', 'amazon coffee', 'อเมซอน', 'bakery', 'ขนม', 'dessert'], category: 'คาเฟ่/ขนม' },
  { kw: ['sushiro', 'mk ', 'sukishi', 'yayoi', 'fast food', 'kfc', 'mcdonald', 'burger', 'pizza', 'ร้านอาหาร', 'restaurant', 'ตามสั่ง', 'noodle', 'ก๋วยเตี๋ยว'], category: 'อาหาร/ร้านอาหาร' },
  { kw: ['booking', 'agoda', 'airbnb', 'hotel', 'โรงแรม', 'resort', 'expedia', 'traveloka', 'trip.com'], category: 'ที่พัก/ท่องเที่ยว' },
  { kw: ['shell', 'ptt', 'esso', 'caltex', 'bangchak', 'บางจาก', 'ปตท', 'ปั๊ม', 'น้ำมัน', 'fuel', 'petrol'], category: 'น้ำมัน/ปั๊ม' },
  { kw: ['hospital', 'โรงพยาบาล', 'รพ.', 'clinic', 'คลินิก', 'pharmacy', 'ร้านยา', 'dental', 'ทันตกรรม', 'watsons', 'boots', 'guardian'], category: 'โรงพยาบาล/สุขภาพ' },
  { kw: ['netflix', 'spotify', 'youtube', 'google', 'apple.com', 'icloud', 'disney', 'hbo', 'subscription', 'openai', 'chatgpt', 'microsoft'], category: 'ซับสคริปชั่น/ดิจิทัล' },
  { kw: ['lazada', 'shopee', 'amazon', 'aliexpress', 'tiktok shop'], category: 'ช้อปออนไลน์' },
  { kw: ['bts', 'mrt', 'taxi', 'แท็กซี่', 'รถไฟฟ้า', 'รถเมล์', 'ขนส่ง', 'bem', 'arl', 'แอร์พอร์ต'], category: 'เดินทาง/ขนส่ง' },
  { kw: ['uniqlo', 'h&m', 'zara', 'muji', 'เสื้อผ้า', 'fashion', 'shoe', 'รองเท้า'], category: 'เสื้อผ้า/แฟชั่น' },
  { kw: ['atm', 'ถอนเงิน', 'withdraw', 'ถอน'], category: 'ถอนเงินสด' },
  { kw: ['truemoney', 'wallet', 'วอลเล็ต', 'เติมเงิน', 'top up', 'topup'], category: 'เติมเงิน/วอลเล็ต' },
  { kw: ['aud', 'ค่าบริการรายวัน'], category: 'ค่าบริการรายวัน (AUD)' },
  { kw: ['school', 'โรงเรียน', 'การศึกษา', 'tuition', 'ค่าเทอม', 'เด็ก'], category: 'การศึกษา/เด็ก' },
  { kw: ['โอน', 'transfer', 'พร้อมเพย์', 'promptpay', 'bbl', 'ktb', 'scb', 'kbank'], category: 'โอนเงิน/บุคคล' },
];

// Grab fares below this are treated as a ride (transport), not food delivery.
export const GRAB_RIDE_MAX = 120;

/**
 * Amount-aware refinement applied on top of a resolved category.
 * A cheap Grab charge is a taxi/ride → "เดินทาง/ขนส่ง"; a pricier one stays
 * food delivery. Only adjusts when the category is still the default Grab one.
 */
export function refineCategory(merchant: string, desc: string, category: string, amount: number): string {
  if (
    category === 'Grab/เดลิเวอรี่/แท็กซี่' &&
    /grab/.test(`${merchant} ${desc}`.toLowerCase()) &&
    amount > 0 && amount < GRAB_RIDE_MAX
  ) {
    return 'เดินทาง/ขนส่ง';
  }
  return category;
}

/**
 * Resolve a category for a row. Priority:
 *   1. exact merchant rule (user-defined)
 *   2. keyword table match
 *   3. fallback
 * When `amount` is given, an amount-aware refinement (e.g. Grab rides) applies.
 */
export function autoCategorize(merchant: string, desc: string, rules: RulesState = {}, amount?: number): string {
  const rule = rules[merchant];
  if (rule?.category) return rule.category;
  const hay = `${merchant} ${desc}`.toLowerCase();
  let category = 'ค่าใช้จ่ายอื่น';
  for (const { kw, category: c } of KEYWORD_TABLE) {
    if (kw.some((k) => hay.includes(k))) { category = c; break; }
  }
  return amount != null ? refineCategory(merchant, desc, category, amount) : category;
}

export function autoGroup(category: string) {
  return categoryGroup(category);
}
