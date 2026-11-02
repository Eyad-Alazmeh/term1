import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { LEAVE_TYPES, todayStr } from "@/lib/fmt";
import { Field, inputCls, btnPrimary, btnDanger, EmptyState, ErrorNote } from "./ui";

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "قيد المراجعة", cls: "bg-[#fff6e0] text-[#9a6b00]" },
  approved: { label: "مقبولة", cls: "bg-[#eef7f1] text-[#1a7f4b]" },
  rejected: { label: "مرفوضة", cls: "bg-[#fdf0f3] text-[#db3356]" },
};

export default function LeavesTab({ adminKey }: { adminKey: string }) {
  const utils = trpc.useUtils();
  const { data: emps } = trpc.hr.employeesList.useQuery({ adminKey });
  const { data: rows, isLoading } = trpc.hr.leavesList.useQuery({ adminKey });

  const today = todayStr();
  const [empId, setEmpId] = useState("");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [type, setType] = useState<"annual" | "sick" | "unpaid" | "other">("annual");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = trpc.hr.leaveAdd.useMutation({
    onSuccess: () => {
      utils.hr.leavesList.invalidate();
      setNote("");
      setError(null);
    },
    onError: (e) => setError(e.message),
  });
  const setStatus = trpc.hr.leaveSetStatus.useMutation({
    onSuccess: () => utils.hr.leavesList.invalidate(),
    onError: (e) => setError(e.message),
  });
  const remove = trpc.hr.leaveRemove.useMutation({
    onSuccess: () => utils.hr.leavesList.invalidate(),
  });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#e5e2dc] bg-white p-5">
        <h2 className="text-base font-bold">تسجيل إجازة</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="الموظف">
            <select value={empId} onChange={(e) => setEmpId(e.target.value)} className={inputCls}>
              <option value="">اختر…</option>
              {emps?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.code} — {e.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="من تاريخ">
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={`${inputCls} tnum`} />
          </Field>
          <Field label="إلى تاريخ">
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={`${inputCls} tnum`} />
          </Field>
          <Field label="نوع الإجازة">
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={inputCls}>
              {Object.entries(LEAVE_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ملاحظة (اختياري)">
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <ErrorNote message={error} />
        <button
          type="button"
          disabled={!empId || add.isPending}
          onClick={() =>
            add.mutate({ adminKey, employeeId: Number(empId), fromDate, toDate, type, note })
          }
          className={`${btnPrimary} mt-4`}
        >
          {add.isPending ? "جارٍ الحفظ…" : "تسجيل الإجازة"}
        </button>
      </section>

      <section>
        <h2 className="mb-3 text-base font-bold">الإجازات المسجلة</h2>
        {isLoading ? (
          <EmptyState text="جارٍ التحميل…" />
        ) : !rows || rows.length === 0 ? (
          <EmptyState text="لا توجد إجازات مسجلة" />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[#e5e2dc] bg-white">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-[#e5e2dc] text-right text-xs text-[#8a887f]">
                  <th className="px-4 py-3 font-semibold">الموظف</th>
                  <th className="px-4 py-3 font-semibold">من</th>
                  <th className="px-4 py-3 font-semibold">إلى</th>
                  <th className="px-4 py-3 font-semibold">النوع</th>
                  <th className="px-4 py-3 font-semibold">ملاحظة</th>
                  <th className="px-4 py-3 font-semibold">الحالة</th>
                  <th className="px-4 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {[...rows].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending")).map((l) => (
                  <tr key={l.id} className="border-b border-[#f0eee9] last:border-0">
                    <td className="px-4 py-3 font-semibold">{l.employeeName}</td>
                    <td className="tnum px-4 py-3">{l.fromDate}</td>
                    <td className="tnum px-4 py-3">{l.toDate}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-[#eef4fc] px-3 py-1 text-xs font-bold text-[#1a5fb4]">
                        {LEAVE_TYPES[l.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#6b6a64]">{l.note || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS[l.status].cls}`}>
                        {STATUS[l.status].label}
                      </span>
                      {l.decisionNote && (
                        <div className="mt-1 text-xs text-[#6b6a64]">{l.decisionNote}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                      {l.status !== "approved" && (
                        <button
                          type="button"
                          className={btnPrimary}
                          onClick={() => setStatus.mutate({ adminKey, id: l.id, status: "approved" })}
                        >
                          قبول
                        </button>
                      )}
                      {l.status === "pending" && (
                        <button
                          type="button"
                          className={btnDanger}
                          onClick={() => {
                            const reason = window.prompt("سبب الرفض (اختياري)") ?? undefined;
                            setStatus.mutate({ adminKey, id: l.id, status: "rejected", decisionNote: reason });
                          }}
                        >
                          رفض
                        </button>
                      )}
                      <button
                        type="button"
                        className={btnDanger}
                        onClick={() => {
                          if (window.confirm("حذف هذه الإجازة؟"))
                            remove.mutate({ adminKey, id: l.id });
                        }}
                      >
                        حذف
                      </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
