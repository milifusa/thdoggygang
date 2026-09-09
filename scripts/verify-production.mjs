const origin = (
  process.env.PRODUCTION_ORIGIN || "https://www.thedoggygang.com"
).replace(/\/$/, "");
const requiredHeaders = [
  "content-security-policy",
  "strict-transport-security",
  "referrer-policy",
  "x-content-type-options",
  "x-frame-options",
  "permissions-policy",
];
const routes = [
  "/",
  "/aventuras",
  "/ingresar",
  "/tienda",
  "/terminos",
  "/privacidad",
];
const failures = [];

for (const route of routes) {
  const response = await fetch(`${origin}${route}`, { redirect: "manual" });
  if (response.status >= 400)
    failures.push(`${route} respondió ${response.status}.`);
  for (const header of requiredHeaders)
    if (!response.headers.has(header))
      failures.push(`${route} no incluye ${header}.`);
  if (response.headers.has("x-powered-by"))
    failures.push(`${route} expone X-Powered-By.`);
}

const admin = await fetch(`${origin}/admin`, { redirect: "manual" });
if (![302, 303, 307, 308].includes(admin.status))
  failures.push(`/admin no redirigió a login; respondió ${admin.status}.`);
const location = admin.headers.get("location") ?? "";
if (!location.includes("/ingresar"))
  failures.push("/admin no protege la ruta con login.");

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Verificación de producción: OK (${origin})`);
