import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

// الرمز الظاهر على شاشة المدخل يتغير كل STEP_MS.
// الرمز يُقبل لمدة قصيرة بعد ظهوره (الحالي + الخطوة السابقة ≈ 60 ثانية)
// كي لا يفشل مسح الموظف إذا تأخر قليلاً.
export const STEP_MS = 30_000;
const ACCEPT_STEPS_BACK = 1;
// بعد مسح QR صحيح يحصل الموظف على "تذكرة" يستعملها لتسجيل حركة واحدة خلال هذه المدة
export const TICKET_TTL_MS = 3 * 60_000;

function secret(): string {
  // في الإنتاج APP_SECRET إجباري (env.ts). في التطوير نستعمل قيمة احتياطية.
  return env.appSecret || "dev-only-secret-change-me";
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function stepOf(ms: number): number {
  return Math.floor(ms / STEP_MS);
}

/** الرمز الحالي الذي يُعرض في الـ QR */
export function currentQrToken(now = Date.now()): { token: string; msLeft: number } {
  const step = stepOf(now);
  return {
    token: sign(`qr:${step}`).slice(0, 22),
    msLeft: (step + 1) * STEP_MS - now,
  };
}

export function verifyQrToken(token: string, now = Date.now()): boolean {
  const step = stepOf(now);
  for (let i = 0; i <= ACCEPT_STEPS_BACK; i++) {
    if (safeEqual(token, sign(`qr:${step - i}`).slice(0, 22))) return true;
  }
  return false;
}

/** تذكرة قصيرة العمر تُعطى للموظف بعد مسح QR صحيح */
export function issueTicket(now = Date.now()): string {
  const exp = now + TICKET_TTL_MS;
  return `${exp}.${sign(`ticket:${exp}`)}`;
}

export function verifyTicket(ticket: string, now = Date.now()): boolean {
  const [expStr, sig] = ticket.split(".");
  const exp = Number(expStr);
  if (!sig || !Number.isFinite(exp) || exp < now) return false;
  return safeEqual(sig, sign(`ticket:${exp}`));
}

/** بطاقة الموظف: "<الرقم الوظيفي>.<توقيع>" — تمنع تزوير بطاقة موظف آخر بمجرد تخمين رقمه */
export function makeCard(code: string): string {
  return `${code}.${sign(`card:${code}`).slice(0, 12)}`;
}

/** يعيد الرقم الوظيفي إذا كان توقيع البطاقة صحيحاً، وإلا null */
export function parseCard(card: string): string | null {
  const i = card.lastIndexOf(".");
  if (i <= 0) return null;
  const code = card.slice(0, i);
  return safeEqual(card, makeCard(code)) ? code : null;
}
