/** معرّف عشوائي يُحفظ في المتصفح ويُستعمل لربط الموظف بجهازه */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem("deviceId");
    if (!id || id.length < 16) {
      // randomUUID يحتاج HTTPS؛ getRandomValues يشتغل حتى على http داخل الشبكة المحلية
      const b = crypto.getRandomValues(new Uint8Array(16));
      id = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("deviceId", id);
    }
    return id;
  } catch {
    return "";
  }
}
