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

const photoUpload = read("app/api/admin/photos/upload-url/route.ts");
const photoManager = read("app/admin/fotos/photo-manager.tsx");
const photoDownload = read("app/api/photos/[id]/download/route.ts");
check(
  photoUpload.includes("createSignedUploadUrl"),
  "Las fotos originales no usan una carga privada firmada.",
);
check(
  photoManager.includes("uploadToSignedUrl"),
  "Las fotos originales todavía pasan por el servidor web.",
);
check(
  photoDownload.includes('from(watermarked ? "hike-watermarked" : "hike-originals")'),
  "La descarga pagada no entrega el original privado.",
);
check(
  photoDownload.includes("download: downloadName"),
  "La descarga no define un nombre de archivo seguro.",
);

for (const route of [
  "app/api/adventure-checklist/route.ts",
  "app/api/notification-preferences/route.ts",
  "app/api/referrals/route.ts",
  "app/api/reviews/route.ts",
  "app/api/waitlist/route.ts",
  "app/api/passport/certificate/route.ts",
  "app/api/bookings/[id]/calendar/route.ts",
  "app/api/bookings/[id]/guide/route.ts",
]) {
  check(existsSync(join(root, route)), `Falta la ruta protegida ${route}.`);
  if (existsSync(join(root, route)))
    check(read(route).includes("auth.getUser()"), `${route} no verifica la sesión en servidor.`);
}
const memberMigration = read(
  "supabase/migrations/202609090002_member_value_features.sql",
);
check(
  memberMigration.includes("alter table public.reward_ledger enable row level security"),
  "El libro de recompensas no activa RLS.",
);
check(
  memberMigration.includes("revoke insert,update,delete on table public.reward_ledger from authenticated"),
  "Los clientes podrían modificar sus propios puntos.",
);
check(
  memberMigration.includes("protect_profile_referrals"),
  "Los códigos de recomendación no están protegidos contra manipulación.",
);
const capacityMigration = read(
  "supabase/migrations/202609090003_waitlist_capacity_hardening.sql",
);
check(
  capacityMigration.includes("bookings_capacity_transition_guard"),
  "El cupo no está protegido al iniciar el pago.",
);

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
