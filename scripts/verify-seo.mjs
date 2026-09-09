import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const layout = read("app/layout.tsx");
const sitemap = read("app/sitemap.ts");
const robots = read("app/robots.ts");
const hike = read("app/aventuras/[slug]/page.tsx");
const product = read("app/tienda/[slug]/page.tsx");

check(layout.includes("Organization"), "Falta el esquema Organization.");
check(layout.includes("max-image-preview"), "Faltan directivas SEO para imágenes.");
check(sitemap.includes("getAdventures"), "El sitemap no incluye hikes dinámicos.");
check(sitemap.includes("getProducts"), "El sitemap no incluye productos dinámicos.");
check(robots.includes("sitemap.xml"), "robots.txt no anuncia el sitemap.");
check(robots.includes('"/admin/"'), "robots.txt no excluye el administrador.");
check(hike.includes("'@type': 'Event'"), "Los hikes no incluyen esquema Event.");
check(hike.includes("alternates: { canonical"), "Los hikes no tienen canonical.");
check(product.includes('"@type": "Product"'), "Falta el esquema Product.");
check(product.includes('"@type": "Offer"'), "Los productos no incluyen Offer.");
check(product.includes("alternates: { canonical"), "Los productos no tienen canonical.");

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Verificación SEO estática: OK");
