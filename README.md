# วางแผนค่าใช้จ่าย (jafinance)

เว็บแอพวางแผนและวิเคราะห์ค่าใช้จ่ายส่วนตัว — รวมข้อมูล **KBank ออมทรัพย์** + **UOB บัตรเครดิต**
ทำงาน **client-side ล้วน** ข้อมูลเก็บใน `localStorage` ของเครื่องผู้ใช้เท่านั้น ไม่มี backend
ไม่มี analytics/tracker และไม่ส่งข้อมูลออกไปเซิร์ฟเวอร์ภายนอก

## Tech stack
Next.js 14 (App Router, `output: 'export'`) · TypeScript · Tailwind CSS · Recharts · lucide-react
· ฟอนต์ Noto Sans Thai (self-host ผ่าน `next/font` ไม่เรียก Google ตอนรันไทม์)

## หน้าหลัก (เฟส 1 MVP)
- **ภาพรวม (Dashboard)** — การ์ดสรุป, เลือกเดือน, สลับบัญชี, กราฟแท่งรายเดือน, โดนัทแยกหมวด
- **หมวดหมู่** — ตารางหมวด + drill-down (trend / top merchants / รายการ)
- **งบประมาณ** — ตั้งงบ/หมวด, ตั้งงบอัตโนมัติ, progress bar, คาดการณ์สิ้นเดือน, กรอกรายได้เอง → เงินเก็บ, จำเป็น vs ลดได้
- **รายการ** — ตารางเต็ม + filter/search/sort + แก้หมวดทีละอัน/แบบกลุ่ม + import/export
- **อินไซต์** — หมวดโตเร็วสุด, ร้านบ่อยสุด, recurring, outliers, ก้อนใหญ่ไม่ประจำ

## การคำนวณที่ตรวจสอบแล้ว (reconcile)
`npm run reconcile` คำนวณยอดควบคุมซ้ำจาก `data/transactions.json` แบบอิสระ แล้ว assert กับ baseline
(รันอัตโนมัติใน `prebuild` — ถ้ายอดเพี้ยน build จะ fail) ยอดที่ตรวจ:

| รายการ | ค่า |
|---|---|
| รายจ่ายสุทธิรวม (net, รวม transfer) | 176,663 |
| UOB net (gross 143,902.08 − refund 10,682.02) | 133,220.06 |
| KBank | 43,443.17 |
| จำเป็น / ลดได้(net) / โอน-ถอน | 53,824 / 85,705 / 37,134 |

### หลักการสำคัญที่ฝังไว้ในโค้ด
1. **Refund netting แบบ route ตามร้าน** — รายการ `refund` (Airbnb/Booking) ถูกหักกลับเข้า "ที่พัก/ท่องเที่ยว"
   ไม่ใช่หักเข้าหมวด "คืนเงิน" ของตัวเอง (ป้องกันยอดท่องเที่ยวพองเกินจริง)
2. **ไม่ de-dup ชุดข้อมูลเดิม** — รายการที่ `date+amount+desc` ซ้ำกันเป็นรายการจริงคนละครั้ง การ import
   ใหม่จะ de-dup ด้วยทั้งแถว (รวม time/account) ไม่ใช่แค่ 3 ฟิลด์
3. **default month / projection guard** — แอพเลือกเดือนล่าสุดที่ข้อมูลพอ และไม่พยากรณ์เดือนที่ข้อมูลไม่ครบ
4. **net เป็นค่าหลัก** ทุกที่สอดคล้องกัน
5. **transfer/income/refund ถูกตัดออกจาก top-merchant** เพื่อไม่ให้การโอนเข้าตัวเองกลายเป็น "ร้านโปรด"

## รัน
```bash
npm install
npm run dev        # http://localhost:3000
npm run reconcile  # ตรวจยอดกับ baseline
npm run build      # static export -> ./out
```

## Deploy
- **Vercel** (ค่าเริ่มต้น): เชื่อม repo แล้ว push — Vercel ตรวจ Next.js ให้อัตโนมัติ ไม่ต้องตั้งค่าเพิ่ม
- **GitHub Pages / subpath อื่น**: ตั้ง env `NEXT_PUBLIC_BASE_PATH=/jafinance` ก่อน build
  (โค้ดอ่าน basePath/assetPrefix จาก env ตัวนี้ ใช้ build เดียวได้ทั้งสองที่)

## ข้อมูล
`data/transactions.json` — 687 รายการ ผ่านการ reconcile กับสลิปแล้ว
ขอบเขต: UOB ต่อเนื่อง 20 ก.พ.–20 พ.ค. · KBank เป็นช่วงๆ ถึง 26 มิ.ย. (ดู disclaimer ในแอพ)
