import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import EmployeesTab from "@/components/admin/EmployeesTab";
import LogTab from "@/components/admin/LogTab";
import LeavesTab from "@/components/admin/LeavesTab";
import ReportsTab from "@/components/admin/ReportsTab";
import SettingsTab from "@/components/admin/SettingsTab";

const TABS = [
  { id: "log", label: "سجل الحركات" },
  { id: "reports", label: "التقارير" },
  { id: "employees", label: "الموظفون" },
  { id: "leaves", label: "الإجازات" },
  { id: "settings", label: "الإعدادات" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Admin() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem("adminKey") ?? "");
  const [authed, setAuthed] = useState(() => Boolean(sessionStorage.getItem("adminKey")));
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("log");

  const login = trpc.hr.login.useMutation({
    onSuccess: () => {
      sessionStorage.setItem("adminKey", password);
      setAdminKey(password);
      setAuthed(true);
      setError(null);
    },
    onError: (e) => setError(e.message),
  });

  function logout() {
    sessionStorage.removeItem("adminKey");
    setAuthed(false);
    setAdminKey("");
    setPassword("");
  }

  if (!authed) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#fafaf7] px-4">
        <div className="w-full max-w-sm rounded-2xl border border-[#e5e2dc] bg-white p-6">
          <h1 className="text-center text-xl font-bold">دخول الإدارة</h1>
          <p className="mt-1 text-center text-sm text-[#6b6a64]">نظام الحضور والانصراف</p>
          <label htmlFor="admin-pass" className="mt-6 block text-sm font-semibold">
            كلمة المرور
          </label>
          <input
            id="admin-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && password && login.mutate({ password })}
            className="mt-2 w-full rounded-xl border border-[#d8d5ce] bg-[#fafaf7] px-4 py-3 outline-none focus:border-[#1a7f4b] focus:ring-2 focus:ring-[#1a7f4b]/20"
          />
          {error && (
            <p className="mt-3 rounded-lg bg-[#fdf0f3] px-3 py-2 text-sm font-medium text-[#db3356]">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => login.mutate({ password })}
            disabled={!password || login.isPending}
            className="mt-4 w-full rounded-xl bg-[#141413] py-3 font-bold text-white transition-colors hover:bg-[#2a2a28] disabled:opacity-40"
          >
            {login.isPending ? "جارٍ التحقق…" : "دخول"}
          </button>
          <p className="mt-3 text-center text-xs text-[#8a887f]">
            كلمة المرور الافتراضية: 1234 — غيّرها من الإعدادات
          </p>
          <div className="mt-4 text-center">
            <Link to="/" className="text-xs text-[#8a887f] underline underline-offset-4">
              العودة لشاشة التسجيل
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#fafaf7]">
      <header className="sticky top-0 z-10 border-b border-[#e5e2dc] bg-[#fafaf7]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-lg font-bold tracking-tight">لوحة الإدارة</h1>
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="rounded-lg border border-[#d8d5ce] px-3 py-1.5 text-sm font-medium text-[#3c3b37] transition-colors hover:bg-white"
            >
              شاشة التسجيل
            </Link>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-[#d8d5ce] px-3 py-1.5 text-sm font-medium text-[#db3356] transition-colors hover:bg-[#fdf0f3]"
            >
              خروج
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? "bg-[#141413] text-white"
                  : "text-[#6b6a64] hover:bg-[#efede8]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {tab === "log" && <LogTab adminKey={adminKey} />}
        {tab === "reports" && <ReportsTab adminKey={adminKey} />}
        {tab === "employees" && <EmployeesTab adminKey={adminKey} />}
        {tab === "leaves" && <LeavesTab adminKey={adminKey} />}
        {tab === "settings" && <SettingsTab adminKey={adminKey} />}
      </main>
    </div>
  );
}
