/** أدوات تنسيق التواريخ والأوقات والمدد */

export function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
}

/** 452 دقيقة → "7س 32د" */
export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} د`;
  if (m === 0) return `${h} س`;
  return `${h} س ${m} د`;
}

/** 452 دقيقة → "7:32" للتقارير والتصدير */
export function fmtHoursMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

export function fmtDateAr(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("ar", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** بداية الأسبوع المحتوي على dateStr بحسب weekStart (0=الأحد) */
export function weekRange(dateStr: string, weekStart: number): { from: string; to: string } {
  const d = new Date(`${dateStr}T12:00:00`);
  const diff = (d.getDay() - weekStart + 7) % 7;
  const from = new Date(d.getTime() - diff * 86_400_000);
  const to = new Date(from.getTime() + 6 * 86_400_000);
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { from: iso(from), to: iso(to) };
}

export function monthRange(dateStr: string): { from: string; to: string } {
  const d = new Date(`${dateStr}T12:00:00`);
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const to = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(
    last.getDate(),
  ).padStart(2, "0")}`;
  return { from, to };
}

export const LEAVE_TYPES: Record<string, string> = {
  annual: "سنوية",
  sick: "مرضية",
  unpaid: "بدون أجر",
  other: "أخرى",
};
