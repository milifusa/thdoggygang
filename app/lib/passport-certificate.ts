import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

type CertificateData = {
  memberName: string;
  profileId: string;
  adventureCount: number;
  distanceKm: number;
  elevationM: number;
  issuedAt: Date;
};

const colors = {
  navy: rgb(18 / 255, 23 / 255, 58 / 255),
  cocoa: rgb(38 / 255, 30 / 255, 24 / 255),
  sun: rgb(253 / 255, 192 / 255, 110 / 255),
  cream: rgb(249 / 255, 245 / 255, 235 / 255),
  paper: rgb(1, 253 / 255, 247 / 255),
  muted: rgb(101 / 255, 92 / 255, 84 / 255),
  green: rgb(38 / 255, 54 / 255, 27 / 255),
};

function fitText(font: PDFFont, text: string, maxWidth: number, initialSize: number, minimumSize = 18) {
  let size = initialSize;
  while (size > minimumSize && font.widthOfTextAtSize(text, size) > maxWidth) size -= 1;
  return size;
}

function drawStat(page: PDFPage, font: PDFFont, bold: PDFFont, x: number, value: string, label: string) {
  page.drawRectangle({ x, y: 145, width: 128, height: 78, color: colors.cream, borderColor: colors.sun, borderWidth: 1 });
  page.drawText(value, { x: x + 15, y: 177, size: fitText(bold, value, 98, 25, 16), font: bold, color: colors.navy });
  page.drawText(label, { x: x + 15, y: 158, size: 7.5, font, color: colors.muted });
}

export async function buildPassportCertificate(data: CertificateData) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const logoBytes = await readFile(join(process.cwd(), "public/brand/logo-circular-sun.png"));
  const logo = await pdf.embedPng(logoBytes);
  const level = data.adventureCount >= 10
    ? "GUARDIAN DE LA MONTANA"
    : data.adventureCount >= 5
      ? "EXPLORADOR DE LA MANADA"
      : data.adventureCount >= 1
        ? "CAMINANTE DE SENDERO"
        : "NUEVO EXPLORADOR";

  page.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: colors.cream });
  page.drawRectangle({ x: 18, y: 18, width: 806, height: 559, color: colors.paper, borderColor: colors.navy, borderWidth: 1.5 });
  page.drawRectangle({ x: 30, y: 30, width: 782, height: 535, borderColor: colors.sun, borderWidth: 0.8 });
  page.drawRectangle({ x: 30, y: 30, width: 226, height: 535, color: colors.navy });

  const logoScale = logo.scaleToFit(142, 142);
  page.drawImage(logo, { x: 72, y: 350, width: logoScale.width, height: logoScale.height });
  page.drawText("THE DOGGY GANG", { x: 74, y: 319, size: 15, font: bold, color: colors.sun });
  page.drawText("M E X I C O", { x: 107, y: 300, size: 8, font: bold, color: colors.paper });
  page.drawLine({ start: { x: 73, y: 278 }, end: { x: 213, y: 278 }, thickness: 0.8, color: colors.sun });
  page.drawText("P A S A P O R T E", { x: 74, y: 249, size: 7.5, font: bold, color: colors.sun });
  page.drawText("D E  A V E N T U R A S", { x: 74, y: 232, size: 7.5, font: bold, color: colors.sun });
  page.drawText("Cada aventura empieza con un si.", { x: 74, y: 75, size: 10, font: oblique, color: colors.paper, maxWidth: 138, lineHeight: 14 });
  page.drawText("T D G  -  M X", { x: 74, y: 52, size: 7, font: bold, color: colors.sun });

  page.drawText("C E R T I F I C A D O   D E   A V E N T U R A S", { x: 296, y: 518, size: 7.4, font: bold, color: colors.green });
  page.drawLine({ start: { x: 296, y: 500 }, end: { x: 780, y: 500 }, thickness: 2.2, color: colors.sun });
  page.drawText(data.adventureCount ? "ESTA HISTORIA PERTENECE A" : "TU HISTORIA COMIENZA AQUI", { x: 296, y: 458, size: 8, font: bold, color: colors.muted });
  const name = data.memberName.trim() || "MIEMBRO DE LA MANADA";
  page.drawText(name, { x: 296, y: 407, size: fitText(bold, name, 484, 39, 23), font: bold, color: colors.navy, maxWidth: 484 });
  page.drawText(level, { x: 296, y: 376, size: 13, font: bold, color: colors.green });
  page.drawText(
    data.adventureCount
      ? "Por cada sendero recorrido, cada kilometro compartido y cada huella que ya forma parte de la manada."
      : "Este es el punto de partida. Tu primer sendero, tu primer sello y una nueva historia ya te estan esperando.",
    { x: 296, y: 326, size: 12, font: regular, color: colors.muted, maxWidth: 462, lineHeight: 18 },
  );

  drawStat(page, regular, bold, 296, String(data.adventureCount).padStart(2, "0"), "AVENTURAS");
  drawStat(page, regular, bold, 436, data.distanceKm.toFixed(1), "KILOMETROS");
  drawStat(page, regular, bold, 576, data.elevationM.toLocaleString("es-MX"), "METROS DE DESNIVEL");

  page.drawLine({ start: { x: 296, y: 112 }, end: { x: 485, y: 112 }, thickness: 0.7, color: colors.muted });
  page.drawText("T H E  D O G G Y  G A N G  -  M X", { x: 296, y: 96, size: 7, font: bold, color: colors.navy });
  const issued = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" }).format(data.issuedAt);
  page.drawText(`EMITIDO EL ${issued.toUpperCase()}`, { x: 296, y: 59, size: 7, font: bold, color: colors.muted });
  page.drawText(`ID ${data.profileId.slice(0, 8).toUpperCase()}`, { x: 700, y: 59, size: 7, font: bold, color: colors.muted });

  return pdf.save();
}
