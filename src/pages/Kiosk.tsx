import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { fmtDuration } from "@/lib/fmt";
import { getDeviceId } from "@/lib/device";

type PunchResult = {
  action: "in" | "out";
  employeeName: string;
  time: Date;
  minutes: number;
};

const TICKET_KEY = "punchTicket";

/** التذكرة بصيغة "<expMs>.<sig>" — نفحص انتهاءها محلياً فقط لتجنّب عرض نموذج ميت */
function loadStoredTicket(): string | null {
  const t = sessionStorage.getItem(TICKET_KEY);
  if (!t) return null;
  const exp = Number(t.split(".")[0]);
  if (!Number.isFinite(exp) || exp < Date.now()) {
    sessionStorage.removeItem(TICKET_KEY);
    return null;
  }
  return t;
}

export default function Kiosk() {
  const { data: info } = trpc.hr.publicInfo.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const punch = trpc.hr.punch.useMutation();
  const startSession = trpc.hr.startSession.useMutation();

  const [ticket, setTicket] = useState<string | null>(() => loadStoredTicket());
  const [scanError, setScanError] = useState<string | null>(null);
  const startedRef = useRef(false);
  // نمط الواي فاي: الجاهزية تعتمد على كون الجهاز داخل شبكة المنشأة. نمط QR: على وجود تذكرة.
  const ready = info?.mode === "wifi" ? Boolean(info.onSite) : Boolean(ticket);

  const [code, setCode] = useState("");
  const [result, setResult] = useState<PunchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // الموظف يصل من مسح الـ QR فيكون الرابط ?t=... → نتحقق منه ونأخذ تذكرة
  useEffect(() => {
    if (startedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get("t");
    if (!t) return;
    startedRef.current = true;
    // نحذف الرمز من الرابط كي لا يبقى في السجل أو يُنسخ
    window.history.replaceState(null, "", window.location.pathname);
    startSession
      .mutateAsync({ t })
      .then((r) => {
        sessionStorage.setItem(TICKET_KEY, r.ticket);
        setTicket(r.ticket);
        setScanError(null);
      })
      .catch((e) => {
        setScanError(e instanceof Error ? e.message : "تعذّر التحقق من الرمز");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetSoon() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setResult(null);
      setError(null);
      setCode("");
      inputRef.current?.focus();
    }, 6000);
  }

  async function submit(action: "in" | "out") {
    const trimmed = code.trim();
    if (!trimmed || !ready || punch.isPending) return;
    setError(null);
    try {
      const r = await punch.mutateAsync({ code: trimmed, action, ticket: ticket ?? undefined, deviceId: getDeviceId() });
      setResult(r);
      // كل حركة (دخول أو خروج) تحتاج مسحاً جديداً للـ QR
      sessionStorage.removeItem(TICKET_KEY);
      setTicket(null);
      resetSoon();
    } catch (e) {
      setResult(null);
      const msg = e instanceof Error ? e.message : "حدث خطأ، حاول مرة أخرى";
      setError(msg);
      if (msg.includes("انتهت صلاحية الجلسة")) {
        sessionStorage.removeItem(TICKET_KEY);
        setTicket(null);
      }
      resetSoon();
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#fafaf7]">
      {/* الشريط العلوي */}
      <header className="border-b border-[#e5e2dc] px-4 py-3 text-center">
        <h1 className="text-lg font-semibold tracking-tight">
          {info?.facilityName ?? "نظام الحضور والانصراف"}
        </h1>
        <p className="mt-0.5 text-xs text-[#6b6a64]">
          {now.toLocaleDateString("ar", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </header>

      {/* الساعة */}
      <div className="tnum px-4 pt-6 text-center text-6xl font-bold tracking-tight">
        {now.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
      </div>

      {/* منطقة التسجيل */}
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-8">
        {result ? (
          <div
            className={`rounded-2xl border p-6 text-center transition-all ${
              result.action === "in"
                ? "border-[#1a7f4b] bg-[#eef7f1]"
                : "border-[#db3356] bg-[#fdf0f3]"
            }`}
          >
            <div
              className={`text-4xl font-bold ${
                result.action === "in" ? "text-[#1a7f4b]" : "text-[#db3356]"
              }`}
            >
              تم التسجيل
            </div>
            <div className="mt-3 text-xl font-semibold">{result.employeeName}</div>
            <div className="mt-1 text-[#6b6a64]">
              {result.action === "in" ? "تسجيل دخول" : "تسجيل خروج"} — الساعة{" "}
              <span className="tnum font-semibold text-[#141413]">
                {result.time.toLocaleTimeString("ar", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            {result.action === "out" && result.minutes > 0 && (
              <div className="mt-2 text-sm text-[#6b6a64]">
                مدة الدوام: {fmtDuration(result.minutes)}
              </div>
            )}
          </div>
        ) : !info ? (
          <div className="p-6 text-center text-sm text-[#6b6a64]">جارٍ التحميل…</div>
        ) : !ready ? (
          <div className="rounded-2xl border border-[#e5e2dc] bg-white p-6 text-center">
            <div className="text-xl font-bold">
              {info.mode === "scan"
                ? "التسجيل عند المدخل"
                : info.mode === "wifi"
                  ? "أنت خارج المنشأة"
                  : "امسح الرمز أولاً"}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[#6b6a64]">
              {info.mode === "scan"
                ? "التسجيل يتم بعرض بطاقتك (رمز الـ QR الخاص بك) على جهاز المسح عند مدخل المنشأة. لا حاجة لإنترنت على هاتفك."
                : info.mode === "wifi"
                ? "التسجيل متاح فقط من داخل المنشأة. اتصل بشبكة الواي فاي الخاصة بها (وأطفئ بيانات الموبايل) ثم أعد فتح الصفحة."
                : "لا يمكن التسجيل إلا من داخل المنشأة. امسح رمز الـ QR الظاهر على الشاشة عند المدخل بكاميرا هاتفك، ثم أدخل رقمك الوظيفي."}
            </p>
            {(scanError || error) && (
              <p className="mt-4 rounded-lg bg-[#fdf0f3] px-3 py-2 text-sm font-medium text-[#db3356]">
                {scanError || error}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-[#e5e2dc] bg-white p-6">
            <label htmlFor="emp-code" className="block text-base font-semibold">
              الرقم الوظيفي
            </label>
            <input
              id="emp-code"
              ref={inputRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="مثال: 101"
              className="tnum mt-3 w-full rounded-xl border border-[#d8d5ce] bg-[#fafaf7] px-4 py-4 text-center text-2xl font-semibold tracking-widest outline-none focus:border-[#1a7f4b] focus:ring-2 focus:ring-[#1a7f4b]/20"
            />
            {error && (
              <p className="mt-3 rounded-lg bg-[#fdf0f3] px-3 py-2 text-center text-sm font-medium text-[#db3356]">
                {error}
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => submit("in")}
                disabled={!code.trim() || punch.isPending}
                className="rounded-xl bg-[#1a7f4b] py-4 text-xl font-bold text-white transition-colors hover:bg-[#156a3e] active:bg-[#125c36] disabled:cursor-not-allowed disabled:opacity-40"
              >
                تسجيل دخول
              </button>
              <button
                type="button"
                onClick={() => submit("out")}
                disabled={!code.trim() || punch.isPending}
                className="rounded-xl bg-[#db3356] py-4 text-xl font-bold text-white transition-colors hover:bg-[#c42a4a] active:bg-[#a82340] disabled:cursor-not-allowed disabled:opacity-40"
              >
                تسجيل خروج
              </button>
            </div>
          </div>
        )}
        <Link
          to="/leave"
          className="mt-4 block w-full rounded-xl border border-[#d8d5ce] bg-white py-3 text-center text-base font-semibold text-[#141413] transition-colors hover:bg-[#f3f1ec]"
        >
          تقديم إجازة / متابعة طلباتي
        </Link>
      </main>

      <footer className="px-4 py-4 text-center">
        <Link
          to="/admin"
          className="text-xs text-[#a3a198] underline underline-offset-4 hover:text-[#6b6a64]"
        >
          دخول الإدارة
        </Link>
      </footer>
    </div>
  );
}
