import { useEffect, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { Field, inputCls, btnPrimary, ErrorNote } from "./ui";

const WEEK_DAYS = [
  { v: 0, label: "الأحد" },
  { v: 1, label: "الاثنين" },
  { v: 6, label: "السبت" },
];

const TZ_OPTIONS = [
  { v: 120, label: "UTC+2 (مصر)" },
  { v: 180, label: "UTC+3 (العراق، السعودية، الخليج)" },
  { v: 240, label: "UTC+4 (الإمارات، عُمان)" },
];

export default function SettingsTab({ adminKey }: { adminKey: string }) {
  const utils = trpc.useUtils();
  const { data: settings } = trpc.hr.settingsGet.useQuery({ adminKey });

  const [facilityName, setFacilityName] = useState("");
  const [weekStart, setWeekStart] = useState(0);
  const [tzOffsetMin, setTzOffsetMin] = useState(180);
  const [verifyMode, setVerifyMode] = useState<"wifi" | "qr" | "scan">("scan");
  const [allowedIps, setAllowedIps] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setFacilityName(settings.facilityName);
      setWeekStart(settings.weekStart);
      setTzOffsetMin(settings.tzOffsetMin);
      setVerifyMode(settings.verifyMode);
      setAllowedIps(settings.allowedIps);
    }
  }, [settings]);

  const update = trpc.hr.settingsUpdate.useMutation({
    onSuccess: () => {
      utils.hr.settingsGet.invalidate();
      utils.hr.publicInfo.invalidate();
      setSaved(true);
      setError(null);
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (e) => setError(e.message),
  });

  function save() {
    setError(null);
    if (newPassword && newPassword !== confirmPassword) {
      setError("تأكيد كلمة المرور غير مطابق");
      return;
    }
    update.mutate({
      adminKey,
      facilityName: facilityName.trim() || undefined,
      weekStart,
      tzOffsetMin,
      verifyMode,
      allowedIps,
      newPassword: newPassword || undefined,
    });
  }

  return (
    <div className="space-y-6">
      {/* الإعدادات العامة */}
      <section className="rounded-2xl border border-[#e5e2dc] bg-white p-5">
        <h2 className="text-base font-bold">إعدادات المنشأة</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="اسم المنشأة">
            <input
              value={facilityName}
              onChange={(e) => setFacilityName(e.target.value)}
              className={inputCls}
              placeholder="معمل النور للبلاستيك"
            />
          </Field>
          <Field label="أول يوم بالأسبوع">
            <select value={weekStart} onChange={(e) => setWeekStart(Number(e.target.value))} className={inputCls}>
              {WEEK_DAYS.map((d) => (
                <option key={d.v} value={d.v}>
                  {d.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="توقيت المنشأة">
            <select value={tzOffsetMin} onChange={(e) => setTzOffsetMin(Number(e.target.value))} className={inputCls}>
              {TZ_OPTIONS.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <h3 className="mt-6 border-t border-[#f0eee9] pt-5 text-sm font-bold">
          تغيير كلمة مرور الإدارة
        </h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="كلمة المرور الجديدة (اتركها فارغة إذا لا تريد التغيير)">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="تأكيد كلمة المرور">
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        <ErrorNote message={error} />
        {saved && (
          <p className="mt-3 rounded-lg bg-[#eef7f1] px-3 py-2 text-sm font-medium text-[#1a7f4b]">
            تم حفظ الإعدادات
          </p>
        )}
        <button type="button" onClick={save} disabled={update.isPending} className={`${btnPrimary} mt-4`}>
          {update.isPending ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
        </button>
      </section>

      {/* طريقة التحقق من الموقع */}
      <section className="rounded-2xl border border-[#e5e2dc] bg-white p-5">
        <h2 className="text-base font-bold">التحقق من وجود الموظف داخل المنشأة</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="الطريقة">
            <select
              value={verifyMode}
              onChange={(e) => setVerifyMode(e.target.value as "wifi" | "qr" | "scan")}
              className={inputCls}
            >
              <option value="scan">مسح بطاقات الموظفين بجهاز عند المدخل</option>
              <option value="wifi">شبكة الواي فاي (بدون شاشة)</option>
              <option value="qr">QR متغيّر على شاشة المدخل</option>
            </select>
          </Field>
          {verifyMode === "wifi" && (
            <Field label="عناوين IP المسموحة (افصل بينها بفاصلة)">
              <input
                value={allowedIps}
                onChange={(e) => setAllowedIps(e.target.value)}
                className={`${inputCls} tnum`}
                placeholder="مثال: 185.12.34.56"
                dir="ltr"
              />
            </Field>
          )}
        </div>
        {verifyMode === "scan" && (
          <div className="mt-3 space-y-2 text-sm text-[#6b6a64]">
            <p>
              كل موظف يحمل بطاقة QR خاصة به (مطبوعة أو صورة محفوظة بموبايله دون حاجة لإنترنت). جهاز
              واحد عند المدخل (موبايل المدير أو الحارس) يمسح البطاقات بالكاميرا، ويحفظ المسحات
              ويرسلها لاحقاً إذا انقطع الإنترنت.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to="/cards" className={`${btnPrimary} inline-block`}>
                طباعة بطاقات الموظفين
              </Link>
              <Link to="/scan" className={`${btnPrimary} inline-block`}>
                فتح ماسح المدخل
              </Link>
            </div>
          </div>
        )}
        {verifyMode === "wifi" && (
          <div className="mt-3 text-sm text-[#6b6a64]">
            <p>
              افتح هذه الصفحة وأنت متصل بواي فاي المنشأة، ثم اضغط الزر ليُضاف عنوان الشبكة
              تلقائياً.
            </p>
            <p className="tnum mt-1" dir="ltr">
              {settings?.yourIp ? `Your IP: ${settings.yourIp}` : "تعذّر تحديد عنوانك (يعمل فقط بعد النشر على استضافة)"}
            </p>
            {settings?.yourIp && (
              <button
                type="button"
                className={`${btnPrimary} mt-2`}
                onClick={() => {
                  const list = allowedIps.split(",").map((x) => x.trim()).filter(Boolean);
                  if (!list.includes(settings.yourIp)) list.push(settings.yourIp);
                  setAllowedIps(list.join(","));
                }}
              >
                استعمال عنواني الحالي كعنوان المنشأة
              </button>
            )}
          </div>
        )}
        <p className="mt-3 text-xs text-[#8a887f]">لا تنسَ الضغط على «حفظ الإعدادات» أعلاه بعد التعديل.</p>
      </section>

      {/* شاشة المدخل */}
      <section className="rounded-2xl border border-[#e5e2dc] bg-white p-5">
        <h2 className="text-base font-bold">شاشة الـ QR عند المدخل (لنمط QR فقط)</h2>
        <p className="mt-1 text-sm leading-relaxed text-[#6b6a64]">
          الرمز لم يعد ورقة مطبوعة: صار يتغير كل 30 ثانية ويجب عرضه على شاشة أو تابلت مثبّت داخل
          المنشأة. افتح صفحة الشاشة على ذلك الجهاز وسجّل دخول الإدارة مرة واحدة. الموظف لا يستطيع
          التسجيل إلا بعد مسح الرمز الحي من المدخل.
        </p>
        <Link to="/display" className={`${btnPrimary} mt-4 inline-block`}>
          فتح شاشة المدخل
        </Link>
      </section>
    </div>
  );
}
