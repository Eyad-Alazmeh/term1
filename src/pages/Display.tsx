import { useEffect, useState } from "react";
import { Link } from "react-router";
import QRCode from "qrcode";
import { trpc } from "@/providers/trpc";

// شاشة المدخل: تعرض QR يتغير كل 30 ثانية. تُفتح على تابلت/شاشة داخل المنشأة فقط.
export default function Display() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem("adminKey") ?? "");
  const [authed, setAuthed] = useState(() => Boolean(sessionStorage.getItem("adminKey")));
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const login = trpc.hr.login.useMutation({
    onSuccess: () => {
      sessionStorage.setItem("adminKey", password);
      setAdminKey(password);
      setAuthed(true);
      setError(null);
    },
    onError: (e) => setError(e.message),
  });

  const { data: facility } = trpc.hr.publicInfo.useQuery();
  const { data, error: tokenError } = trpc.hr.displayToken.useQuery(
    { adminKey },
    { enabled: authed, refetchInterval: 4000, retry: false },
  );

  const [qr, setQr] = useState("");
  useEffect(() => {
    if (!data?.token) return;
    const url = `${window.location.origin}/?t=${data.token}`;
    QRCode.toDataURL(url, { width: 640, margin: 2 }).then(setQr).catch(() => {});
  }, [data?.token]);

  useEffect(() => {
    if (tokenError) {
      sessionStorage.removeItem("adminKey");
      setAuthed(false);
    }
  }, [tokenError]);

  if (!authed) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#fafaf7] px-4">
        <div className="w-full max-w-sm rounded-2xl border border-[#e5e2dc] bg-white p-6">
          <h1 className="text-center text-xl font-bold">شاشة المدخل</h1>
          <p className="mt-1 text-center text-sm text-[#6b6a64]">
            افتح هذه الصفحة على شاشة داخل المنشأة فقط
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && password && login.mutate({ password })}
            placeholder="كلمة مرور الإدارة"
            className="mt-6 w-full rounded-xl border border-[#d8d5ce] bg-[#fafaf7] px-4 py-3 outline-none focus:border-[#1a7f4b]"
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
            className="mt-4 w-full rounded-xl bg-[#141413] py-3 font-bold text-white disabled:opacity-40"
          >
            {login.isPending ? "جارٍ التحقق…" : "فتح الشاشة"}
          </button>
          <div className="mt-4 text-center">
            <Link to="/admin" className="text-xs text-[#8a887f] underline underline-offset-4">
              لوحة الإدارة
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-4 text-center">
      <h1 className="text-3xl font-bold">{facility?.facilityName ?? "نظام الحضور والانصراف"}</h1>
      <p className="mt-2 text-lg text-[#6b6a64]">امسح الرمز بكاميرا هاتفك ثم أدخل رقمك الوظيفي</p>
      {qr ? (
        <img
          src={qr}
          alt="QR"
          className="mt-8 w-full max-w-[420px] rounded-2xl border border-[#e5e2dc]"
        />
      ) : (
        <div className="mt-8 flex h-[320px] w-[320px] items-center justify-center rounded-2xl border border-dashed border-[#d8d5ce] text-sm text-[#8a887f]">
          جارٍ توليد الرمز…
        </div>
      )}
      <p className="mt-6 text-sm text-[#8a887f]">الرمز يتجدد تلقائياً كل 30 ثانية</p>
    </div>
  );
}
