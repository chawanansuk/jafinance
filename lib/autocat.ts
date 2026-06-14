import { categoryGroup } from './categories';
import type { RulesState } from './types';

/**
 * Ordered keyword → category table used to auto-categorize newly entered or
 * imported rows. First match wins. All matching is case-insensitive substring
 * over "merchant + desc". Purely local — no network.
 */
const KEYWORD_TABLE: { kw: string[]; category: string }[] = [
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

/**
 * Resolve a category for a row. Priority:
 *   1. exact merchant rule (user-defined)
 *   2. keyword table match
 *   3. fallback
 */
export function autoCategorize(merchant: string, desc: string, rules: RulesState = {}): string {
  const rule = rules[merchant];
  if (rule?.category) return rule.category;
  const hay = `${merchant} ${desc}`.toLowerCase();
  for (const { kw, category } of KEYWORD_TABLE) {
    if (kw.some((k) => hay.includes(k))) return category;
  }
  return 'ค่าใช้จ่ายอื่น';
}

export function autoGroup(category: string) {
  return categoryGroup(category);
}
