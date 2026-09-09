import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

const root = process.cwd();
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const read = (path) => readFileSync(join(root, path), "utf8");

const config = read("next.config.ts");
for (const header of [
  "Content-Security-Policy",
  "Strict-Transport-Security",
  "Referrer-Policy",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Permissions-Policy",
]) {
  check(config.includes(header), `Falta la cabecera ${header}.`);
}
check(
  config.includes("poweredByHeader: false"),
  "Debe ocultarse X-Powered-By.",
);

const proxy = read("app/lib/supabase/proxy.ts");
check(
  proxy.includes("maxAge: 60 * 60 * 48"),
  "La sesión no conserva explícitamente la ventana de 48 horas.",
);
check(proxy.includes("getClaims()"), "El proxy no valida/refresca la sesión.");

for (const name of ["magic_link", "confirmation", "invite", "recovery"]) {
  const template = read(`supabase/templates/${name}.html`);
  check(template.includes("{{ .TokenHash }}"), `${name} no usa TokenHash.`);
  check(
    template.includes("/auth/confirm?"),
    `${name} no usa confirmación protegida.`,
  );
  check(
    !template.includes("{{ .ConfirmationURL }}"),
    `${name} usa un enlace consumible por previsualización.`,
  );
  check(
    !template.includes("thdoggygang.vercel.app"),
    `${name} conserva el dominio temporal.`,
  );
}

const tracked = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);
const secretPatterns = [
  [/\bre_[A-Za-z0-9_-]{20,}\b/, "llave de Resend"],
  [/\bsk_(?:live|test)_[A-Za-z0-9_-]{16,}\b/, "llave secreta de Stripe"],
  [/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, "llave privada"],
];
for (const path of tracked) {
  if (!textExtensions.has(extname(path)) || !existsSync(join(root, path)))
    continue;
  const source = read(path);
  for (const [pattern, label] of secretPatterns)
    check(!pattern.test(source), `${path} contiene una posible ${label}.`);
  check(
    !/NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|PRIVATE|SERVICE_ROLE)/.test(source),
    `${path} expone el nombre de un secreto como variable pública.`,
  );
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Verificación de seguridad estática: OK");
