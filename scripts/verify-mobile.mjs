import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const css = readFileSync(join(root, "app/globals.css"), "utf8");
const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
const wizard = readFileSync(
  join(root, "app/reservar/[slug]/wizard.tsx"),
  "utf8",
);
const ticket = readFileSync(
  join(root, "app/mi-manada/aventuras/[slug]/ticket-client.tsx"),
  "utf8",
);
const adventureCenter = readFileSync(
  join(root, "app/mi-manada/aventuras/[slug]/adventure-center.tsx"),
  "utf8",
);
const hikeMode = readFileSync(
  join(root, "app/admin/hike-mode/hike-mode.tsx"),
  "utf8",
);
const rewardsAdmin = readFileSync(
  join(root, "app/admin/recompensas/page.tsx"),
  "utf8",
);
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

check(
  css.includes(".wizard-main.wizard-step-enter") &&
    css.includes("animation: tdg-step-in-mobile"),
  "El contenido animado del wizard puede volver a romper el pie fijo en móvil.",
);
check(
  css.includes(".wizard-action-row") && wizard.includes("wizard-action-row"),
  "Las acciones móviles del wizard no tienen su contenedor estable.",
);
check(
  css.includes(
    'input:not([type="checkbox"]):not([type="radio"]):not([type="range"])',
  ) && css.includes("font-size: 16px !important"),
  "Los campos pequeños pueden provocar zoom automático en Safari móvil.",
);
check(
  css.includes("overflow-x: clip") &&
    layout.includes("interactiveWidget: 'resizes-content'"),
  "Falta protección contra desplazamiento horizontal o teclado móvil.",
);
check(
  wizard.includes("const continueLabel") &&
    wizard.includes("AGREGA UN PERRITO") &&
    wizard.includes("FIRMA PARA CONTINUAR"),
  "El flujo no explica qué requisito impide avanzar.",
);
check(
  wizard.indexOf("{syncMessage && (") >
    wizard.indexOf('className="wizard-actions"'),
  "Los errores deben mostrarse dentro del pie visible del wizard.",
);
check(
  ticket.includes("QRCodeCanvas") &&
    ticket.includes('canvas.toBlob(resolve, "image/png", 1)') &&
    !ticket.includes("window.print()"),
  "El pase móvil debe guardarse como una imagen PNG real.",
);
check(
  ticket.includes("/brand/logo-horizontal-sun.png") &&
    ticket.includes('"Protest Riot"') &&
    ticket.includes('"Atkinson Hyperlegible"'),
  "El pase descargable no usa el imagotipo y las tipografías oficiales.",
);
check(
  adventureCenter.includes('credentials: "include"') &&
    adventureCenter.includes("downloadProtected"),
  "Las descargas del Centro de aventura no conservan explícitamente la sesión.",
);
check(
  hikeMode.includes('import("qr-scanner")') &&
    hikeMode.includes("QrScanner.scanImage") &&
    hikeMode.includes('timeZone: "America/Mexico_City"') &&
    !hikeMode.includes("BarcodeDetector"),
  "Modo hike no tiene un lector QR compatible con iPhone, Android y fotografías.",
);
check(
  hikeMode.includes("INFORMACIÓN IMPORTANTE") &&
    hikeMode.includes("ARTÍCULOS COMPRADOS") &&
    hikeMode.includes("selectedDeliveries"),
  "La ficha de check-in no destaca perritos y artículos comprados.",
);
check(
  css.includes(".account-page,.account-content{min-width:0;max-width:100%}") &&
    css.includes("@media(max-width:900px){.account-page{width:100%;overflow-x:clip}") &&
    css.includes("grid-template-columns:repeat(2,minmax(0,1fr))") &&
    css.includes(".next-adventure.empty-adventure{grid-template-columns:1fr!important"),
  "Mi Manada puede volver a desbordarse horizontalmente en algunos celulares.",
);
check(
  rewardsAdmin.includes('className="reward-admin-card"') &&
    css.includes(".reward-admin-detail") &&
    css.includes("grid-template-columns: 1fr;") &&
    css.includes(".reward-unlock"),
  "La vista administrativa de recompensas no tiene una adaptación móvil verificable.",
);
check(
  css.includes(".meeting-points-editor") &&
    css.includes(".meeting-points-list fieldset") &&
    css.includes(".meeting-point-url") &&
    css.includes(".meeting-point-remove"),
  "El editor de puntos de encuentro no tiene controles móviles verificables.",
);

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Verificación móvil estática: OK");
