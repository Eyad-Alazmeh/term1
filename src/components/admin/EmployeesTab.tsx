import { useState } from "react";
import { trpc } from "@/providers/trpc";
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

type Employee = {
  id: number;
  code: string;
  name: string;
  department: string | null;
  dailyHours: number;
  active: boolean;
  deviceBound: boolean;
};

export default function EmployeesTab({ adminKey }: { adminKey: string }) {
  const utils = trpc.useUtils();
  const { data: emps, isLoading } = trpc.hr.employeesList.useQuery({ adminKey });

  const [editing, setEditing] = useState<Employee | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [dailyHours, setDailyHours] = useState(8);
  const [error, setError] = useState<string | null>(null);

  const create = trpc.hr.employeeCreate.useMutation({
    onSuccess: () => {
      utils.hr.employeesList.invalidate();
      reset();
    },
    onError: (e) => setError(e.message),
  });
  const update = trpc.hr.employeeUpdate.useMutation({
    onSuccess: () => {
      utils.hr.employeesList.invalidate();
      reset();
    },
    onError: (e) => setError(e.message),
  });
  const resetDevice = trpc.hr.employeeResetDevice.useMutation({
    onSuccess: () => utils.hr.employeesList.invalidate(),
    onError: (e) => setError(e.message),
  });
  const remove = trpc.hr.employeeRemove.useMutation({
    onSuccess: () => utils.hr.employeesList.invalidate(),
    onError: (e) => setError(e.message),
  });

  function reset() {
    setEditing(null);
    setCode("");
    setName("");
    setDepartment("");
    setDailyHours(8);
    setError(null);
  }

  function submit() {
    setError(null);
    if (editing) {
      update.mutate({
        adminKey,
        id: editing.id,
        code,
        name,
        department,
        dailyHours,
        active: editing.active,
      });
    } else {
      create.mutate({ adminKey, code, name, department, dailyHours });
    }
  }

  function startEdit(emp: Employee) {
    setEditing(emp);
    setCode(emp.code);
    setName(emp.name);
    setDepartment(emp.department ?? "");
    setDailyHours(emp.dailyHours);
    setError(null);
  }

  const busy = create.isPending || update.isPending;

  return (
    <div className="space-y-6">
      {/* نموذج الإضافة / التعديل */}
      <section className="rounded-2xl border border-[#e5e2dc] bg-white p-5">
        <h2 className="text-base font-bold">
          {editing ? `تعديل: ${editing.name}` : "إضافة موظف جديد"}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="الرقم الوظيفي">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={`${inputCls} tnum`}
              placeholder="101"
            />
          </Field>
          <Field label="اسم الموظف">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="الاسم الكامل"
            />
          </Field>
          <Field label="القسم (اختياري)">
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className={inputCls}
              placeholder="الإنتاج، الإدارة…"
            />
          </Field>
          <Field label="ساعات الدوام اليومية">
            <input
              type="number"
              min={1}
              max={24}
              value={dailyHours}
              onChange={(e) => setDailyHours(Number(e.target.value) || 8)}
              className={`${inputCls} tnum`}
            />
          </Field>
        </div>
        <ErrorNote message={error} />
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={!code.trim() || !name.trim() || busy}
            className={btnPrimary}
          >
            {busy ? "جارٍ الحفظ…" : editing ? "حفظ التعديل" : "إضافة الموظف"}
          </button>
          {editing && (
            <button type="button" onClick={reset} className={btnGhost}>
              إلغاء
            </button>
          )}
        </div>
      </section>

      {/* جدول الموظفين */}
      <section>
        <h2 className="mb-3 text-base font-bold">
          الموظفون {emps ? `(${emps.length})` : ""}
        </h2>
        {isLoading ? (
          <EmptyState text="جارٍ التحميل…" />
        ) : !emps || emps.length === 0 ? (
          <EmptyState text="لا يوجد موظفون بعد — أضف أول موظف من النموذج أعلاه" />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[#e5e2dc] bg-white">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-[#e5e2dc] text-right text-xs text-[#8a887f]">
                  <th className="px-4 py-3 font-semibold">الرقم</th>
                  <th className="px-4 py-3 font-semibold">الاسم</th>
                  <th className="px-4 py-3 font-semibold">القسم</th>
                  <th className="px-4 py-3 font-semibold">الدوام اليومي</th>
                  <th className="px-4 py-3 font-semibold">الحالة</th>
                  <th className="px-4 py-3 font-semibold">الجهاز</th>
                  <th className="px-4 py-3 font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {emps.map((emp) => (
                  <tr key={emp.id} className="border-b border-[#f0eee9] last:border-0">
                    <td className="tnum px-4 py-3 font-semibold">{emp.code}</td>
                    <td className="px-4 py-3">{emp.name}</td>
                    <td className="px-4 py-3 text-[#6b6a64]">{emp.department || "—"}</td>
                    <td className="tnum px-4 py-3">{emp.dailyHours} ساعات</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          update.mutate({
                            adminKey,
                            id: emp.id,
                            code: emp.code,
                            name: emp.name,
                            department: emp.department ?? "",
                            dailyHours: emp.dailyHours,
                            active: !emp.active,
                          })
                        }
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          emp.active
                            ? "bg-[#eef7f1] text-[#1a7f4b]"
                            : "bg-[#f0eee9] text-[#8a887f]"
                        }`}
                      >
                        {emp.active ? "فعّال" : "موقوف"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {emp.deviceBound ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`فك ربط جهاز "${emp.name}"؟ سيُربط بأول جهاز يسجّل منه بعد ذلك.`)) {
                              resetDevice.mutate({ adminKey, id: emp.id });
                            }
                          }}
                          className="rounded-full bg-[#eef7f1] px-3 py-1 text-xs font-bold text-[#1a7f4b]"
                        >
                          مربوط — فك الربط
                        </button>
                      ) : (
                        <span className="text-xs text-[#8a887f]">غير مربوط</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button type="button" onClick={() => startEdit(emp)} className={btnEdit}>
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                `حذف الموظف "${emp.name}" مع كل سجلاته؟ لا يمكن التراجع.`,
                              )
                            ) {
                              remove.mutate({ adminKey, id: emp.id });
                            }
                          }}
                          className={btnDanger}
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
