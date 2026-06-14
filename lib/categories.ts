import type { Group } from './types';
import {
  Utensils,
  Store,
  ShoppingBag,
  ShoppingCart,
  Car,
  Bus,
  Plane,
  Fuel,
  HeartPulse,
  Shirt,
  Coffee,
  Repeat,
  Globe,
  Wallet,
  GraduationCap,
  CalendarClock,
  Send,
  Banknote,
  Briefcase,
  CircleEllipsis,
  ArrowDownCircle,
  Undo2,
  type LucideIcon,
} from 'lucide-react';

export interface CategoryMeta {
  name: string;
  group: Group;
  color: string; // hex token, reused across every chart
  icon: LucideIcon;
}

// Canonical category catalogue. group is 1:1 with category in the source data
// (verified: no category spans two groups), so we can derive group from category.
export const CATEGORIES: CategoryMeta[] = [
  { name: 'อาหาร/ร้านอาหาร', group: 'discretionary', color: '#ef4444', icon: Utensils },
  { name: 'อาหาร/ร้านค้า', group: 'discretionary', color: '#f97316', icon: Store },
  { name: 'ร้านสะดวกซื้อ', group: 'essential', color: '#22c55e', icon: Store },
  { name: 'ห้าง/ซูเปอร์มาร์เก็ต', group: 'essential', color: '#16a34a', icon: ShoppingCart },
  { name: 'ห้าง/ช้อปปิ้ง', group: 'discretionary', color: '#ec4899', icon: ShoppingBag },
  { name: 'Grab/เดลิเวอรี่/แท็กซี่', group: 'discretionary', color: '#14b8a6', icon: Car },
  { name: 'เดินทาง/ขนส่ง', group: 'essential', color: '#0ea5e9', icon: Bus },
  { name: 'ที่พัก/ท่องเที่ยว', group: 'discretionary', color: '#8b5cf6', icon: Plane },
  { name: 'น้ำมัน/ปั๊ม', group: 'essential', color: '#64748b', icon: Fuel },
  { name: 'โรงพยาบาล/สุขภาพ', group: 'essential', color: '#06b6d4', icon: HeartPulse },
  { name: 'เสื้อผ้า/แฟชั่น', group: 'discretionary', color: '#d946ef', icon: Shirt },
  { name: 'คาเฟ่/ขนม', group: 'discretionary', color: '#f59e0b', icon: Coffee },
  { name: 'ซับสคริปชั่น/ดิจิทัล', group: 'discretionary', color: '#6366f1', icon: Repeat },
  { name: 'ช้อปออนไลน์', group: 'discretionary', color: '#a855f7', icon: Globe },
  { name: 'เติมเงิน/วอลเล็ต', group: 'transfer', color: '#94a3b8', icon: Wallet },
  { name: 'การศึกษา/เด็ก', group: 'essential', color: '#3b82f6', icon: GraduationCap },
  { name: 'ค่าบริการรายวัน (AUD)', group: 'discretionary', color: '#eab308', icon: CalendarClock },
  { name: 'โอนเงิน/บุคคล', group: 'transfer', color: '#78716c', icon: Send },
  { name: 'ถอนเงินสด', group: 'transfer', color: '#a8a29e', icon: Banknote },
  { name: 'ธุรกิจ/บริการ', group: 'transfer', color: '#737373', icon: Briefcase },
  { name: 'ค่าใช้จ่ายอื่น', group: 'transfer', color: '#9ca3af', icon: CircleEllipsis },
  { name: 'รายรับ (เงินเข้า)', group: 'income', color: '#10b981', icon: ArrowDownCircle },
  { name: 'คืนเงิน (refund)', group: 'refund', color: '#34d399', icon: Undo2 },
];

const BY_NAME = new Map(CATEGORIES.map((c) => [c.name, c]));

const FALLBACK: CategoryMeta = {
  name: 'ค่าใช้จ่ายอื่น',
  group: 'transfer',
  color: '#9ca3af',
  icon: CircleEllipsis,
};

export function categoryMeta(name: string): CategoryMeta {
  return BY_NAME.get(name) ?? { ...FALLBACK, name };
}

export function categoryColor(name: string): string {
  return categoryMeta(name).color;
}

export function categoryGroup(name: string): Group {
  return categoryMeta(name).group;
}

export const GROUP_LABEL: Record<Group, string> = {
  essential: 'จำเป็น',
  discretionary: 'ลดได้',
  transfer: 'โอน/ถอน',
  income: 'เงินเข้า',
  refund: 'เงินคืน',
};

export const GROUP_COLOR: Record<Group, string> = {
  essential: '#16a34a',
  discretionary: '#f97316',
  transfer: '#64748b',
  income: '#10b981',
  refund: '#34d399',
};
