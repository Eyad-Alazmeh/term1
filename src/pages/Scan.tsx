import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import jsQR from "jsqr";
import { trpc } from "@/providers/trpc";
import { fmtDuration } from "@/lib/fmt";

type QueueItem = { card: string; at: number };
const QUEUE_KEY = "scanQueue";

function loadQueue(): QueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as QueueItem[];
  } catch {
    return [];
  }
}
function saveQueue(q: QueueItem[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* ignore */
  }
}
// خطأ من السيرفر (له code) مقابل انقطاع اتصال
function isServerError(e: unknown): boolean {
  return Boolean((e as { data?: { code?: string } } | null)?.data?.code);
}

type Shown =
  | { kind: "ok"; action: "in" | "out"; name: string; minutes: number }
  | { kind: "queued" }
  | { kind: "err"; message: string };

// صفحة الجهاز الموجود عند المدخل: تفتح الكاميرا وتمسح بطاقات الموظفين
export default function Scan() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem("adminKey") ?? "");
  const [authed, setAuthed] = useState(() => Boolean(sessionStorage.getItem("adminKey")));
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  const login = trpc.hr.login.useMutation({
    onSuccess: () => {
      sessionStorage.setItem("adminKey", password);
      setAdminKey(password);
      setAuthed(true);
    },
    onError: (e) => setLoginError(e.message),
  });
  const scan = trpc.hr.scanPunch.useMutation();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const busyRef = useRef(false);
  const lastRef = useRef<{ card: string; t: number }>({ card: "", t: 0 });
  const [shown, setShown] = useState<Shown | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [pending, setPending] = useState(() => loadQueue().length);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((s: Shown) => {
    setShown(s);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShown(null), 4000);
  }, []);

  // إرسال المسحات المحفوظة أثناء انقطاع الإنترنت
  const flushQueue = useCallback(async () => {
    if (!adminKey) return;
    let q = loadQueue();
    while (q.length > 0) {
      try {
        await scan.mutateAsync({ adminKey, card: q[0].card, at: q[0].at });
        q = q.slice(1);
      } catch (e) {
        if (isServerError(e)) {
          q = q.slice(1); // مرفوض نهائياً (مكرر/بطاقة غير صالحة) فنتجاوزه
        } else {
          break; // ما زال الإنترنت مقطوعاً
        }
      }
      saveQueue(q);
      setPending(q.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  useEffect(() => {
    if (!authed) return;
    const t = setInterval(flushQueue, 15_000);
    window.addEventListener("online", flushQueue);
    flushQueue();
    return () => {
      clearInterval(t);
      window.removeEventListener("online", flushQueue);
    };
  }, [authed, flushQueue]);

  const handleCard = useCallback(
    async (card: string) => {
      const now = Date.now();
      // نتجاهل نفس البطاقة لو ظلّت أمام الكاميرا
      if (lastRef.current.card === card && now - lastRef.current.t < 6000) return;
      lastRef.current = { card, t: now };
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const r = await scan.mutateAsync({ adminKey, card });
        flash({ kind: "ok", action: r.action, name: r.employeeName, minutes: r.minutes });
      } catch (e) {
        if (isServerError(e)) {
          flash({ kind: "err", message: e instanceof Error ? e.message : "خطأ" });
        } else {
          const q = [...loadQueue(), { card, at: now }];
          saveQueue(q);
          setPending(q.length);
          flash({ kind: "queued" });
        }
      } finally {
        busyRef.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adminKey, flash],
  );

  // الكاميرا + قراءة الرمز
  useEffect(() => {
    if (!authed) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        const video = videoRef.current;
        if (!video || stopped) return;
        video.srcObject = stream;
        await video.play();
        const loop = () => {
          if (stopped) return;
          const c = canvasRef.current;
          if (c && video.readyState === video.HAVE_ENOUGH_DATA) {
            const w = video.videoWidth;
            const h = video.videoHeight;
            c.width = w;
            c.height = h;
            const ctx = c.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, w, h);
              const img = ctx.getImageData(0, 0, w, h);
              const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
              if (code?.data) void handleCard(code.data);
            }
          }
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        setCamError("تعذّر فتح الكاميرا. اسمح للموقع باستخدام الكاميرا (يتطلب اتصال HTTPS).");
      }
    }
    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [authed, handleCard]);

  if (!authed) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#fafaf7] px-4">
        <div className="w-full max-w-sm rounded-2xl border border-[#e5e2dc] bg-white p-6">
          <h1 className="text-center text-xl font-bold">جهاز المدخل</h1>
          <p className="mt-1 text-center text-sm text-[#6b6a64]">
            سجّل دخول الإدارة مرة واحدة على هذا الجهاز
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && password && login.mutate({ password })}
            placeholder="كلمة مرور الإدارة"
            className="mt-6 w-full rounded-xl border border-[#d8d5ce] bg-[#fafaf7] px-4 py-3 outline-none focus:border-[#1a7f4b]"
          />
          {loginError && (
            <p className="mt-3 rounded-lg bg-[#fdf0f3] px-3 py-2 text-sm font-medium text-[#db3356]">
              {loginError}
            </p>
          )}
          <button
            type="button"
            onClick={() => login.mutate({ password })}
            disabled={!password || login.isPending}
            className="mt-4 w-full rounded-xl bg-[#141413] py-3 font-bold text-white disabled:opacity-40"
          >
            {login.isPending ? "جارٍ التحقق…" : "فتح الماسح"}
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
    <div className="relative flex min-h-dvh flex-col bg-black text-white">
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      <div className="relative z-10 flex items-center justify-between bg-black/60 px-4 py-3 text-sm">
        <span>وجّه بطاقة الموظف نحو الكاميرا</span>
        {pending > 0 && (
          <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-black">
            بانتظار الإرسال: {pending}
          </span>
        )}
      </div>
      {camError && (
        <p className="relative z-10 m-4 rounded-lg bg-[#db3356] px-3 py-2 text-sm font-medium">{camError}</p>
      )}
      <div className="relative z-10 mt-auto p-4">
        {shown?.kind === "ok" && (
          <div
            className={`rounded-2xl p-5 text-center ${
              shown.action === "in" ? "bg-[#1a7f4b]" : "bg-[#db3356]"
            }`}
          >
            <div className="text-3xl font-bold">{shown.action === "in" ? "تسجيل دخول" : "تسجيل خروج"}</div>
            <div className="mt-2 text-xl">{shown.name}</div>
            {shown.action === "out" && shown.minutes > 0 && (
              <div className="mt-1 text-sm opacity-90">مدة الدوام: {fmtDuration(shown.minutes)}</div>
            )}
          </div>
        )}
        {shown?.kind === "queued" && (
          <div className="rounded-2xl bg-amber-500 p-5 text-center text-lg font-bold text-black">
            لا يوجد إنترنت — تم حفظ المسح وسيُرسل تلقائياً
          </div>
        )}
        {shown?.kind === "err" && (
          <div className="rounded-2xl bg-[#db3356] p-5 text-center text-lg font-bold">{shown.message}</div>
        )}
      </div>
    </div>
  );
}
