import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { LEAVE_TYPES, todayStr } from "@/lib/fmt";
import { getDeviceId } from "@/lib/device";

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "قيد المراجعة", cls: "bg-[#fff6e0] text-[#9a6b00]" },
  approved: { label: "مقبولة", cls: "bg-[#eef7f1] text-[#1a7f4b]" },
  rejected: { label: "مرفوضة", cls: "bg-[#fdf0f3] text-[#db3356]" },
};

const CODE_KEY = "leaveCode";

// صفحة الموظف: تقديم طلب إجازة ومتابعة حالة طلباته (لا تحتاج وجوده في المنشأة)
export default function Leave() {
  const utils = trpc.useUtils();
  const { data: info } = trpc.hr.publicInfo.useQuery();
  const deviceId = getDeviceId();

  const [code, setCode] = useState(() => localStorage.getItem(CODE_KEY) ?? "");
  const [codeInput, setCodeInput] = useState("");

  const today = todayStr();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [type, setType] = useState<"annual" | "sick" | "unpaid" | "other">("annual");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const mine = trpc.hr.myLeaves.useQuery(
    { code, deviceId },
    { enabled: Boolean(code), retry: false },
  );

  const request = trpc.hr.leaveRequest.useMutation({
    onSuccess: () => {
      setMsg({ ok: true, text: "تم إرسال طلبك. عد لاحقاً لمعرفة إن كان قد قُبل" });
      setNote("");
      utils.hr.myLeaves.invalidate();
    },
    onError: (e) => setMsg({ ok: false, text: e.message }),
  });
  const cancel = trpc.hr.leaveCancel.useMutation({
    onSuccess: () => utils.hr.myLeaves.invalidate(),
  });

  function forgetCode() {
    localStorage.removeItem(CODE_KEY);
    setCode("");
    setMsg(null);
  }

  function continueWithCode() {
    const c = codeInput.trim();
    if (!c) return;
    localStorage.setItem(CODE_KEY, c);
    setCode(c);
    setCodeInput("");
  }

  const card = "rounded-2xl border border-[#e5e2dc] bg-white p-5";
  const field =
    "mt-1 w-full rounded-xl border border-[#d8d5ce] bg-[#fafaf7] px-3 py-3 outline-none focus:border-[#1a7f4b]";

  return (
    <div className="min-h-dvh bg-[#fafaf7]">
      <header className="border-b border-[#e5e2dc] px-4 py-3 text-center">
        <h1 className="text-lg font-semibold">{info?.facilityName ?? "نظام الحضور والانصراف"}</h1>
        <p className="mt-0.5 text-xs text-[#6b6a64]">طلبات الإجازة</p>
      </header>

      <main className="mx-auto w-full max-w-md space-y-4 px-4 py-6">
        <Link to="/" className="text-sm text-[#6b6a64] underline underline-offset-4">
          ← العودة لتسجيل الحضور
        </Link>

        {!code || mine.error ? (
          <section className={card}>
            <label htmlFor="lc" className="block text-base font-semibold">
              الرقم الوظيفي
            </label>
            <input
              id="lc"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && continueWithCode()}
              inputMode="numeric"
              autoComplete="off"
              className={`${field} tnum text-center text-xl tracking-widest`}
            />
            {mine.error && (
              <p className="mt-3 rounded-lg bg-[#fdf0f3] px-3 py-2 text-sm font-medium text-[#db3356]">
                {mine.error.message}
              </p>
            )}
            <button
              type="button"
              onClick={continueWithCode}
              disabled={!codeInput.trim()}
              className="mt-4 w-full rounded-xl bg-[#141413] py-3 font-bold text-white disabled:opacity-40"
            >
              متابعة
            </button>
          </section>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">{mine.data?.employeeName ?? "…"}</span>
              <button
                type="button"
                onClick={forgetCode}
                className="text-[#6b6a64] underline underline-offset-4"
              >
                تغيير الرقم
              </button>
            </div>

            <section className={card}>
              <h2 className="text-base font-bold">طلب إجازة جديد</h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="lf" className="text-sm text-[#6b6a64]">
                    من تاريخ
                  </label>
                  <input
                    id="lf"
                    type="date"
                    value={fromDate}
                    min={today}
                    onChange={(e) => {
                      setFromDate(e.target.value);
                      if (toDate < e.target.value) setToDate(e.target.value);
                    }}
                    className={`${field} tnum`}
                  />
                </div>
                <div>
                  <label htmlFor="lt" className="text-sm text-[#6b6a64]">
                    إلى تاريخ
                  </label>
                  <input
                    id="lt"
                    type="date"
                    value={toDate}
                    min={fromDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className={`${field} tnum`}
                  />
                </div>
              </div>
              <label htmlFor="ly" className="mt-3 block text-sm text-[#6b6a64]">
                نوع الإجازة
              </label>
              <select
                id="ly"
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
                className={field}
              >
                {Object.entries(LEAVE_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <label htmlFor="ln" className="mt-3 block text-sm text-[#6b6a64]">
                السبب (اختياري)
              </label>
              <textarea
                id="ln"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={field}
              />
              {msg && (
                <p
                  className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${
                    msg.ok ? "bg-[#eef7f1] text-[#1a7f4b]" : "bg-[#fdf0f3] text-[#db3356]"
                  }`}
                >
                  {msg.text}
                </p>
              )}
              <button
                type="button"
                disabled={request.isPending}
                onClick={() => {
                  setMsg(null);
                  request.mutate({ code, deviceId, fromDate, toDate, type, note });
                }}
                className="mt-4 w-full rounded-xl bg-[#1a7f4b] py-3 text-lg font-bold text-white disabled:opacity-40"
              >
                {request.isPending ? "جارٍ الإرسال…" : "تقديم الطلب"}
              </button>
            </section>

            <section className={card}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">طلباتي</h2>
                <button
                  type="button"
                  onClick={() => mine.refetch()}
                  className="text-sm text-[#6b6a64] underline underline-offset-4"
                >
                  تحديث
                </button>
              </div>
              {mine.isLoading ? (
                <p className="mt-3 text-sm text-[#6b6a64]">جارٍ التحميل…</p>
              ) : !mine.data || mine.data.leaves.length === 0 ? (
                <p className="mt-3 text-sm text-[#6b6a64]">لا توجد طلبات بعد</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {mine.data.leaves.map((l) => {
                    const st = STATUS[l.status];
                    return (
                      <li key={l.id} className="rounded-xl border border-[#eeece6] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="tnum text-sm font-semibold">
                            {l.fromDate === l.toDate ? l.fromDate : `${l.fromDate} → ${l.toDate}`}
                          </span>
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${st.cls}`}>
                            {st.label}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-[#6b6a64]">
                          {LEAVE_TYPES[l.type]}
                          {l.note ? ` — ${l.note}` : ""}
                        </div>
                        {l.decisionNote && (
                          <div className="mt-1 text-sm text-[#141413]">
                            ملاحظة الإدارة: {l.decisionNote}
                          </div>
                        )}
                        {l.status === "pending" && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm("إلغاء هذا الطلب؟"))
                                cancel.mutate({ code, deviceId, id: l.id });
                            }}
                            className="mt-2 text-sm text-[#db3356] underline underline-offset-4"
                          >
                            إلغاء الطلب
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
