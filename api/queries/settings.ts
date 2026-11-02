import { eq } from "drizzle-orm";
import { settings } from "../../db/schema";
import { getDb } from "./connection";

const DEFAULTS: Record<string, string> = {
  facility_name: "إدارة التوجيه المعنوي",
  admin_password: "1234",
  // فرق التوقيت عن UTC بالدقائق (العراق +180)
  tz_offset_min: "180",
  // أول يوم بالأسبوع: 0=الأحد 6=السبت
  week_start: "0",
  // طريقة التحقق من وجود الموظف داخل المنشأة: scan = بطاقات الموظفين تُمسح بجهاز واحد عند المدخل، wifi = شبكة المنشأة، qr = رمز متغيّر على شاشة
  verify_mode: "qr",
  // عناوين IP العامة المسموحة (مفصولة بفواصل) — تُضبط من الإعدادات وأنت داخل المنشأة
  allowed_ips: "",
};

export async function getSetting(key: string): Promise<string> {
  const db = getDb();
  const rows = await db
    .select()
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  if (rows.length > 0) return rows[0].value;
  const def = DEFAULTS[key] ?? "";
  await db
    .insert(settings)
    .values({ key, value: def })
    .onDuplicateKeyUpdate({ set: { key } });
  return def;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  await db
    .insert(settings)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value } });
}

/** تاريخ اليوم المحلي للمنشأة بصيغة YYYY-MM-DD بحسب فرق التوقيت المخزن */
export function localDateOf(d: Date, tzOffsetMin: number): string {
  return new Date(d.getTime() + tzOffsetMin * 60_000).toISOString().slice(0, 10);
}

/** تحويل وقت محلي مدخل (تاريخ + ساعة) إلى كائن Date بالـ UTC */
export function localToUtc(date: string, time: string, tzOffsetMin: number): Date {
  return new Date(Date.parse(`${date}T${time}:00.000Z`) - tzOffsetMin * 60_000);
}
