import { Fragment, useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import {
  fmtTime,
  fmtDuration,
  fmtHoursMinutes,
  fmtDateAr,
  todayStr,
  weekRange,
  monthRange,
} from "@/lib/fmt";
import { Field, inputCls, btnGhost, EmptyState } from "./ui";

type Mode = "daily" | "weekly" | "monthly";

const MODE_LABEL: Record<Mode, string> = {
  daily: "يومي",
  weekly: "أسبوعي",
  monthly: "شهري",
};

export default function ReportsTab({ adminKey }: { adminKey: string }) {
  const today = todayStr();
  const [mode, setMode] = useState<Mode>("monthly");
  const [date, setDate] = useState(today);
  const [employeeId, setEmployeeId] = useState<number | undefined>(undefined);
  const [openEmp, setOpenEmp] = useState<number | null>(null);

  const { data: emps } = trpc.hr.employeesList.useQuery({ adminKey });
  const { data: settings } = trpc.hr.settingsGet.useQuery({ adminKey });

  const range = useMemo(() => {
    if (mode === "daily") return { from: date, to: date };
    if (mode === "weekly") return weekRange(date, settings?.weekStart ?? 0);
    return monthRange(date);
  }, [mode, date, settings?.weekStart]);

  const { data: report, isLoading } = trpc.hr.report.useQuery({
    adminKey,
    from: range.from,
    to: range.to,
    employeeId,
  });

  const totals = useMemo(() => {
    if (!report) return null;
    return {
      days: report.reduce((s, r) => s + r.daysPresent, 0),
      minutes: report.reduce((s, r) => s + r.totalMinutes, 0),
      leaves: report.reduce((s, r) => s + r.leaveDays, 0),
    };
  }, [report]);

  function exportCsv() {
    if (!report) return;
    const lines: string[] = [];
    lines.push(
      ["الرقم الوظيفي", "الاسم", "القسم", "أيام الحضور", "أيام الإجازة", "الساعات الفعلية"].join(","),
    );
    for (const r of report) {
      lines.push(
        [
          r.employee.code,
          `"${r.employee.name}"`,
          `"${r.employee.department ?? ""}"`,
          r.daysPresent,
          r.leaveDays,
          fmtHoursMinutes(r.totalMinutes),
        ].join(","),
      );
    }
    lines.push("");
    lines.push("تفصيل الأيام");
    lines.push(["الرقم الوظيفي", "الاسم", "التاريخ", "الدخول", "الخروج", "الساعات"].join(","));
    for (const r of report) {
      for (const d of r.days) {
        lines.push(
          [
            r.employee.code,
            `"${r.employee.name}"`,
            d.date,
            fmtTime(d.firstIn),
            d.lastOut ? fmtTime(d.lastOut) : "لم يخرج",
            fmtHoursMinutes(d.minutes),
          ].join(","),
        );
      }
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `تقرير-الحضور-${MODE_LABEL[mode]}-${range.from}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-5">
      {/* الفلاتر */}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="نوع التقرير">
          <div className="flex overflow-hidden rounded-xl border border-[#d8d5ce]">
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-5 py-2.5 text-sm font-bold transition-colors ${
                  mode === m ? "bg-[#141413] text-white" : "bg-white text-[#6b6a64] hover:bg-[#f5f3ee]"
                }`}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
        </Field>
        <Field label={mode === "monthly" ? "أي يوم من الشهر" : "التاريخ"}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} tnum w-44`} />
        </Field>
        <Field label="الموظف">
          <select
            value={employeeId ?? ""}
            onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : undefined)}
            className={`${inputCls} w-44`}
          >
            <option value="">كل الموظفين</option>
            {emps?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.code} — {e.name}
              </option>
            ))}
          </select>
        </Field>
        <button type="button" onClick={exportCsv} disabled={!report?.length} className={btnGhost}>
          تصدير إكسل (CSV)
        </button>
        <button type="button" onClick={() => window.print()} disabled={!report?.length} className={btnGhost}>
          طباعة
        </button>
      </div>

      <p className="text-sm text-[#6b6a64]">
        الفترة: <b className="tnum">{fmtDateAr(range.from)}</b> إلى{" "}
        <b className="tnum">{fmtDateAr(range.to)}</b>
      </p>

      {/* ملخص عام */}
      {totals && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-[#e5e2dc] bg-white p-4 text-center">
            <div className="tnum text-2xl font-bold">{totals.days}</div>
            <div className="mt-1 text-xs text-[#8a887f]">مجموع أيام الحضور</div>
          </div>
          <div className="rounded-2xl border border-[#e5e2dc] bg-white p-4 text-center">
            <div className="tnum text-2xl font-bold text-[#1a7f4b]">{fmtDuration(totals.minutes)}</div>
            <div className="mt-1 text-xs text-[#8a887f]">مجموع الساعات الفعلية</div>
          </div>
          <div className="rounded-2xl border border-[#e5e2dc] bg-white p-4 text-center">
            <div className="tnum text-2xl font-bold text-[#1a5fb4]">{totals.leaves}</div>
            <div className="mt-1 text-xs text-[#8a887f]">مجموع أيام الإجازات</div>
          </div>
        </div>
      )}

      {/* جدول الملخص */}
      <div className="print-area">
        {isLoading ? (
          <EmptyState text="جارٍ التحميل…" />
        ) : !report || report.length === 0 ? (
          <EmptyState text="لا توجد بيانات" />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[#e5e2dc] bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[#e5e2dc] text-right text-xs text-[#8a887f]">
                  <th className="px-4 py-3 font-semibold">الموظف</th>
                  <th className="px-4 py-3 font-semibold">أيام الحضور</th>
                  <th className="px-4 py-3 font-semibold">أيام الإجازة</th>
                  <th className="px-4 py-3 font-semibold">الساعات الفعلية</th>
                  <th className="px-4 py-3 font-semibold">المقرر</th>
                  <th className="px-4 py-3 font-semibold">الفرق</th>
                </tr>
              </thead>
              <tbody>
                {report.map((r) => {
                  const scheduled = r.daysPresent * r.employee.dailyHours * 60;
                  const diff = r.totalMinutes - scheduled;
                  const open = openEmp === r.employee.id;
                  return (
                    <Fragment key={r.employee.id}>
                      <tr
                        onClick={() => setOpenEmp(open ? null : r.employee.id)}
                        className="cursor-pointer border-b border-[#f0eee9] transition-colors hover:bg-[#faf9f6]"
                      >
                        <td className="px-4 py-3">
                          <span className="font-semibold">{r.employee.name}</span>{" "}
                          <span className="tnum text-xs text-[#8a887f]">({r.employee.code})</span>
                          <span className="mr-2 text-xs text-[#b5b3aa]">{open ? "▲" : "▼"}</span>
                        </td>
                        <td className="tnum px-4 py-3">{r.daysPresent}</td>
                        <td className="tnum px-4 py-3 text-[#1a5fb4]">{r.leaveDays}</td>
                        <td className="tnum px-4 py-3 font-bold">{fmtHoursMinutes(r.totalMinutes)}</td>
                        <td className="tnum px-4 py-3 text-[#8a887f]">{fmtHoursMinutes(scheduled)}</td>
                        <td className={`tnum px-4 py-3 font-semibold ${diff >= 0 ? "text-[#1a7f4b]" : "text-[#db3356]"}`}>
                          {diff >= 0 ? "+" : "−"}{fmtHoursMinutes(Math.abs(diff))}
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-[#f0eee9] bg-[#faf9f6]">
                          <td colSpan={6} className="px-6 py-3">
                            {r.days.length === 0 ? (
                              <p className="text-sm text-[#8a887f]">لا حضور مسجل في هذه الفترة</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-right text-[#8a887f]">
                                    <th className="py-1.5 font-semibold">التاريخ</th>
                                    <th className="py-1.5 font-semibold">الدخول</th>
                                    <th className="py-1.5 font-semibold">الخروج</th>
                                    <th className="py-1.5 font-semibold">الساعات</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.days.map((d) => (
                                    <tr key={d.date} className="border-t border-[#efede8]">
                                      <td className="tnum py-1.5">{d.date}</td>
                                      <td className="tnum py-1.5 text-[#1a7f4b]">{fmtTime(d.firstIn)}</td>
                                      <td className="tnum py-1.5">
                                        {d.lastOut ? (
                                          <span className="text-[#db3356]">{fmtTime(d.lastOut)}</span>
                                        ) : (
                                          <span className="font-bold text-[#1a7f4b]">على رأس العمل</span>
                                        )}
                                      </td>
                                      <td className="tnum py-1.5 font-semibold">{fmtHoursMinutes(d.minutes)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
