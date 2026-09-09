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

const robots = await fetch(`${origin}/robots.txt`);
const robotsText = await robots.text();
if (!robots.ok || !robotsText.includes(`${origin}/sitemap.xml`))
  failures.push("robots.txt no publica el sitemap canónico.");
if (!robotsText.includes("Disallow: /admin/"))
  failures.push("robots.txt no excluye el administrador.");

const sitemap = await fetch(`${origin}/sitemap.xml`);
const sitemapText = await sitemap.text();
if (!sitemap.ok || !sitemapText.includes(`${origin}/aventuras`))
  failures.push("sitemap.xml no incluye aventuras.");
if (!sitemapText.includes(`${origin}/tienda`))
  failures.push("sitemap.xml no incluye la tienda.");

const sitemapUrls = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
  (match) => match[1],
);
for (const [kind, pattern, schemaType] of [
  ["hike", `${origin}/aventuras/`, '"@type":"Event"'],
  ["producto", `${origin}/tienda/`, '"@type":"Product"'],
]) {
  const url = sitemapUrls.find((item) => item.startsWith(pattern));
  if (!url) {
    failures.push(`El sitemap no contiene ningún ${kind} individual.`);
    continue;
  }
  const response = await fetch(url);
  const html = await response.text();
  if (!response.ok) failures.push(`${url} respondió ${response.status}.`);
  if (!html.includes(schemaType))
    failures.push(`${url} no contiene datos estructurados de ${kind}.`);
  if (!html.includes(`rel="canonical" href="${url}"`))
    failures.push(`${url} no contiene una URL canónica correcta.`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Verificación de producción: OK (${origin})`);
