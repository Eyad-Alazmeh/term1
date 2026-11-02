import { useEffect, useState } from "react";
import { Link } from "react-router";
import QRCode from "qrcode";
import { trpc } from "@/providers/trpc";

// صفحة طباعة بطاقات الموظفين (QR خاص بكل موظف)
export default function Cards() {
  const adminKey = sessionStorage.getItem("adminKey") ?? "";
  const { data: facility } = trpc.hr.publicInfo.useQuery();
  const { data: cards, error } = trpc.hr.employeeCards.useQuery({ adminKey }, { enabled: Boolean(adminKey), retry: false });
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!cards) return;
    let cancelled = false;
    (async () => {
      const out: Record<string, string> = {};
      for (const c of cards) {
        out[c.code] = await QRCode.toDataURL(c.card, { width: 360, margin: 1 });
      }
      if (!cancelled) setImages(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [cards]);

  if (!adminKey || error) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#fafaf7] px-4 text-center">
        <p className="text-sm">
          سجّل دخول الإدارة أولاً من{" "}
          <Link to="/admin" className="underline underline-offset-4">
            لوحة الإدارة
          </Link>{" "}
          ثم عد لهذه الصفحة.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-white p-4">
      <div className="mx-auto mb-4 flex max-w-4xl items-center justify-between gap-3 print:hidden">
        <Link to="/admin" className="text-sm underline underline-offset-4">
          العودة للوحة الإدارة
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl bg-[#1a7f4b] px-5 py-2 font-bold text-white"
        >
          طباعة البطاقات
        </button>
      </div>
      <p className="mx-auto mb-4 max-w-4xl text-sm text-[#6b6a64] print:hidden">
        اطبع البطاقات وسلّم كل موظف بطاقته. يستطيع الموظف أيضاً تصوير بطاقته وحفظ الصورة في موبايله
        ويعرضها عند المدخل — لا يحتاج إنترنت.
      </p>
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3">
        {cards?.map((c) => (
          <div
            key={c.code}
            className="break-inside-avoid rounded-xl border border-[#d8d5ce] p-3 text-center"
          >
            <div className="text-xs text-[#6b6a64]">{facility?.facilityName}</div>
            {images[c.code] ? (
              <img src={images[c.code]} alt={c.name} className="mx-auto my-2 w-40" />
            ) : (
              <div className="mx-auto my-2 h-40 w-40" />
            )}
            <div className="font-bold">{c.name}</div>
            <div className="text-sm text-[#6b6a64]">
              {c.department ? `${c.department} — ` : ""}
              {c.code}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
