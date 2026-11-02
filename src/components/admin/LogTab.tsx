import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { fmtTime, fmtDuration, todayStr } from "@/lib/fmt";
import {
  Field,
  inputCls,
  btnPrimary,
  btnGhost,
  btnDanger,
  btnEdit,
  EmptyState,
  ErrorNote,
} from "./ui";

type Row = {
  id: number;
  employeeId: number;
  workDate: string;
  checkIn: Date;
  checkOut: Date | null;
  note: string | null;
  employeeName: string;
  employeeCode: string;
};

function toTimeInput(d: Date | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function LogTab({ adminKey }: { adminKey: string }) {
  const utils = trpc.useUtils();
  const today = todayStr();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [employeeId, setEmployeeId] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  // نموذج الإضافة اليدوية
  const [showAdd, setShowAdd] = useState(false);
  const [addEmp, setAddEmp] = useState("");
  const [addDate, setAddDate] = useState(today);
  const [addIn, setAddIn] = useState("08:00");
  const [addOut, setAddOut] = useState("");
  const [addNote, setAddNote] = useState("");

  // التعديل
  const [editing, setEditing] = useState<Row | null>(null);
  const [editIn, setEditIn] = useState("");
  const [editOut, setEditOut] = useState("");
  const [editNote, setEditNote] = useState("");

  const { data: emps } = trpc.hr.employeesList.useQuery({ adminKey });
  const { data: rows, isLoading } = trpc.hr.attendanceList.useQuery({
    adminKey,
    from,
    to,
    employeeId,
  });

  const invalidate = () => {
    utils.hr.attendanceList.invalidate();
    utils.hr.report.invalidate();
  };

  const addMut = trpc.hr.attendanceAdd.useMutation({
    onSuccess: () => {
      invalidate();
      setShowAdd(false);
      setAddNote("");
      setError(null);
    },
    onError: (e) => setError(e.message),
  });
  const updMut = trpc.hr.attendanceUpdate.useMutation({
    onSuccess: () => {
      invalidate();
      setEditing(null);
      setError(null);
    },
    onError: (e) => setError(e.message),
  });
  const delMut = trpc.hr.attendanceRemove.useMutation({
    onSuccess: () => invalidate(),
    onError: (e) => setError(e.message),
  });

  const stats = useMemo(() => {
    if (!rows) return null;
    const openNow = rows.filter((r) => !r.checkOut && r.workDate === today).length;
    const minutes = rows.reduce(
      (s, r) => (r.checkOut ? s + Math.round((new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 60000) : s),
      0,
    );
    return { count: rows.length, openNow, minutes };
  }, [rows, today]);

  return (
    <div className="space-y-5">
      {/* الفلاتر */}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="من تاريخ">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} tnum w-40`} />
        </Field>
        <Field label="إلى تاريخ">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} tnum w-40`} />
        </Field>
        <Field label="الموظف">
          <select
            value={employeeId ?? ""}
            onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : undefined)}
            className={`${inputCls} w-44`}
          >
            <option value="">الكل</option>
            {emps?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.code} — {e.name}
              </option>
            ))}
          </select>
        </Field>
        <button type="button" onClick={() => { setFrom(today); setTo(today); }} className={btnGhost}>
          اليوم
        </button>
        <button type="button" onClick={() => setShowAdd((v) => !v)} className={btnPrimary}>
          {showAdd ? "إغلاق النموذج" : "إضافة سجل يدوي"}
        </button>
      </div>

      {/* ملخص سريع */}
      {stats && (
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded-full border border-[#e5e2dc] bg-white px-4 py-1.5">
            السجلات: <b className="tnum">{stats.count}</b>
          </span>
          <span className="rounded-full border border-[#e5e2dc] bg-white px-4 py-1.5">
            على رأس العمل الآن: <b className="tnum text-[#1a7f4b]">{stats.openNow}</b>
          </span>
          <span className="rounded-full border border-[#e5e2dc] bg-white px-4 py-1.5">
            مجموع الساعات: <b className="tnum">{fmtDuration(stats.minutes)}</b>
          </span>
        </div>
      )}

      {/* نموذج إضافة يدوي */}
      {showAdd && (
        <section className="rounded-2xl border border-[#e5e2dc] bg-white p-5">
          <h3 className="text-sm font-bold">إضافة سجل يدوي (نسيان بصمة مثلاً)</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="الموظف">
              <select value={addEmp} onChange={(e) => setAddEmp(e.target.value)} className={inputCls}>
                <option value="">اختر…</option>
                {emps?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code} — {e.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="التاريخ">
              <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} className={`${inputCls} tnum`} />
            </Field>
            <Field label="وقت الدخول">
              <input type="time" value={addIn} onChange={(e) => setAddIn(e.target.value)} className={`${inputCls} tnum`} />
            </Field>
            <Field label="وقت الخروج (اختياري)">
              <input type="time" value={addOut} onChange={(e) => setAddOut(e.target.value)} className={`${inputCls} tnum`} />
            </Field>
            <Field label="ملاحظة">
              <input value={addNote} onChange={(e) => setAddNote(e.target.value)} className={inputCls} placeholder="اختياري" />
            </Field>
          </div>
          <ErrorNote message={error} />
          <button
            type="button"
            disabled={!addEmp || addMut.isPending}
            onClick={() =>
              addMut.mutate({
                adminKey,
                employeeId: Number(addEmp),
                workDate: addDate,
                checkInTime: addIn,
                checkOutTime: addOut || null,
                note: addNote,
              })
            }
            className={`${btnPrimary} mt-4`}
          >
            {addMut.isPending ? "جارٍ الحفظ…" : "حفظ السجل"}
          </button>
        </section>
      )}

      {/* الجدول */}
      {isLoading ? (
        <EmptyState text="جارٍ التحميل…" />
      ) : !rows || rows.length === 0 ? (
        <EmptyState text="لا توجد حركات ضمن هذه الفترة" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e5e2dc] bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[#e5e2dc] text-right text-xs text-[#8a887f]">
                <th className="px-4 py-3 font-semibold">الموظف</th>
                <th className="px-4 py-3 font-semibold">التاريخ</th>
                <th className="px-4 py-3 font-semibold">الدخول</th>
                <th className="px-4 py-3 font-semibold">الخروج</th>
                <th className="px-4 py-3 font-semibold">المدة</th>
                <th className="px-4 py-3 font-semibold">ملاحظة</th>
                <th className="px-4 py-3 font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[#f0eee9] last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-semibold">{r.employeeName}</span>{" "}
                    <span className="tnum text-xs text-[#8a887f]">({r.employeeCode})</span>
                  </td>
                  <td className="tnum px-4 py-3">{r.workDate}</td>
                  <td className="tnum px-4 py-3 text-[#1a7f4b]">{fmtTime(r.checkIn)}</td>
                  <td className="tnum px-4 py-3">
                    {r.checkOut ? (
                      <span className="text-[#db3356]">{fmtTime(r.checkOut)}</span>
                    ) : (
                      <span className="rounded-full bg-[#eef7f1] px-2 py-0.5 text-xs font-bold text-[#1a7f4b]">
                        على رأس العمل
                      </span>
                    )}
                  </td>
                  <td className="tnum px-4 py-3">
                    {r.checkOut
                      ? fmtDuration(Math.round((new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 60000))
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-[#6b6a64]">{r.note || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className={btnEdit}
                        onClick={() => {
                          setEditing(r);
                          setEditIn(toTimeInput(r.checkIn));
                          setEditOut(toTimeInput(r.checkOut));
                          setEditNote(r.note ?? "");
                        }}
                      >
                        تعديل
                      </button>
                      <button
                        type="button"
                        className={btnDanger}
                        onClick={() => {
                          if (window.confirm("حذف هذا السجل؟")) delMut.mutate({ adminKey, id: r.id });
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

      {/* نافذة التعديل */}
      {editing && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold">
              تعديل سجل: {editing.employeeName} — <span className="tnum">{editing.workDate}</span>
            </h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="وقت الدخول">
                <input type="time" value={editIn} onChange={(e) => setEditIn(e.target.value)} className={`${inputCls} tnum`} />
              </Field>
              <Field label="وقت الخروج">
                <input type="time" value={editOut} onChange={(e) => setEditOut(e.target.value)} className={`${inputCls} tnum`} />
              </Field>
            </div>
            <Field label="ملاحظة" className="mt-3">
              <input value={editNote} onChange={(e) => setEditNote(e.target.value)} className={inputCls} />
            </Field>
            <ErrorNote message={error} />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={updMut.isPending}
                onClick={() =>
                  updMut.mutate({
                    adminKey,
                    id: editing.id,
                    workDate: editing.workDate,
                    checkInTime: editIn,
                    checkOutTime: editOut || null,
                    note: editNote,
                  })
                }
                className={btnPrimary}
              >
                {updMut.isPending ? "جارٍ الحفظ…" : "حفظ"}
              </button>
              <button type="button" onClick={() => setEditing(null)} className={btnGhost}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
