"use client";

import { useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Download } from "lucide-react";

function drawCenteredText(
  context: CanvasRenderingContext2D,
  text: string,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = `${line} ${word}`.trim();
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  lines.forEach((value, index) =>
    context.fillText(value, 600, y + index * lineHeight),
  );
  return y + lines.length * lineHeight;
}

function loadCanvasImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No pudimos cargar el logo."));
    image.src = source;
  });
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const corner = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + corner, y);
  context.arcTo(x + width, y, x + width, y + height, corner);
  context.arcTo(x + width, y + height, x, y + height, corner);
  context.arcTo(x, y + height, x, y, corner);
  context.arcTo(x, y, x + width, y, corner);
  context.closePath();
}

async function saveImage(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: "Pase The Doggy Gang",
      text: "Guarda esta imagen para mostrar tu QR durante el check-in.",
    });
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export function AdventureTicket({
  token,
  bookingNumber,
  hikeName,
  hikeDate,
  location,
}: {
  token: string;
  bookingNumber: string;
  hikeName: string;
  hikeDate: string;
  location: string;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const qrId = `ticket-qr-${bookingNumber}`;

  const savePass = async () => {
    setSaving(true);
    setMessage("");
    try {
      const qr = document.getElementById(qrId);
      if (!(qr instanceof HTMLCanvasElement))
        throw new Error("No pudimos preparar el QR.");
      await Promise.all([
        document.fonts.load('400 72px "Protest Riot"'),
        document.fonts.load('700 30px "Atkinson Hyperlegible"'),
      ]);
      const logo = await loadCanvasImage("/brand/logo-horizontal-sun.png");
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 1700;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No pudimos preparar la imagen.");

      context.fillStyle = "#f7f1e7";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#121638";
      context.fillRect(0, 0, canvas.width, 270);
      context.drawImage(logo, 322, 30, 556, 228);

      context.fillStyle = "#ffc36a";
      context.beginPath();
      context.arc(78, 230, 13, 0, Math.PI * 2);
      context.arc(112, 230, 9, 0, Math.PI * 2);
      context.arc(139, 230, 6, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.arc(1061, 230, 6, 0, Math.PI * 2);
      context.arc(1088, 230, 9, 0, Math.PI * 2);
      context.arc(1122, 230, 13, 0, Math.PI * 2);
      context.fill();

      context.textAlign = "center";
      context.fillStyle = "#121638";
      roundedRect(context, 418, 306, 364, 52, 26);
      context.fill();
      context.fillStyle = "#ffffff";
      context.font = '700 21px "Atkinson Hyperlegible", Arial, sans-serif';
      context.letterSpacing = "4px";
      context.fillText("PASE DE AVENTURA", 600, 341);
      context.letterSpacing = "0px";

      context.fillStyle = "#2b211c";
      context.font = '400 72px "Protest Riot", "Trebuchet MS", sans-serif';
      const y = drawCenteredText(context, hikeName, 450, 1020, 76);

      const infoY = y + 24;
      context.fillStyle = "#ffffff";
      roundedRect(context, 70, infoY, 515, 100, 22);
      context.fill();
      roundedRect(context, 615, infoY, 515, 100, 22);
      context.fill();
      context.fillStyle = "#ffc36a";
      context.beginPath();
      context.arc(125, infoY + 50, 28, 0, Math.PI * 2);
      context.arc(670, infoY + 50, 28, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#121638";
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(112, infoY + 45);
      context.lineTo(138, infoY + 45);
      context.moveTo(116, infoY + 35);
      context.lineTo(116, infoY + 55);
      context.moveTo(134, infoY + 35);
      context.lineTo(134, infoY + 55);
      context.stroke();
      context.beginPath();
      context.arc(670, infoY + 45, 12, Math.PI, 0);
      context.lineTo(670, infoY + 70);
      context.closePath();
      context.stroke();
      context.fillStyle = "#2b211c";
      context.textAlign = "left";
      context.font = '700 17px "Atkinson Hyperlegible", Arial, sans-serif';
      context.fillText("FECHA Y HORA", 170, infoY + 35);
      context.fillText("PUNTO DE ENCUENTRO", 715, infoY + 35);
      context.font = '400 23px "Atkinson Hyperlegible", Arial, sans-serif';
      context.fillText(hikeDate, 170, infoY + 69, 385);
      context.fillText(location, 715, infoY + 69, 385);

      const qrSize = 500;
      const qrX = (canvas.width - qrSize) / 2;
      const cardY = infoY + 135;
      context.fillStyle = "#ffc36a";
      roundedRect(context, 114, cardY + 16, 972, 690, 34);
      context.fill();
      context.fillStyle = "#ffffff";
      roundedRect(context, 90, cardY, 1020, 690, 34);
      context.fill();
      context.strokeStyle = "#121638";
      context.lineWidth = 4;
      roundedRect(context, 90, cardY, 1020, 690, 34);
      context.stroke();

      context.fillStyle = "#dcebdd";
      roundedRect(context, 438, cardY + 30, 324, 54, 27);
      context.fill();
      context.fillStyle = "#28623d";
      context.textAlign = "center";
      context.font = '700 20px "Atkinson Hyperlegible", Arial, sans-serif';
      context.fillText("LISTO PARA CHECK-IN", 620, cardY + 66);
      context.strokeStyle = "#28623d";
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(471, cardY + 55);
      context.lineTo(479, cardY + 64);
      context.lineTo(495, cardY + 45);
      context.stroke();

      const qrY = cardY + 112;
      context.fillStyle = "#ffffff";
      context.fillRect(qrX - 28, qrY - 28, qrSize + 56, qrSize + 56);
      context.imageSmoothingEnabled = false;
      context.drawImage(qr, qrX, qrY, qrSize, qrSize);
      context.fillStyle = "#2b211c";
      context.font = '700 22px "Atkinson Hyperlegible", Arial, sans-serif';
      context.letterSpacing = "3px";
      context.fillText("QR DE CHECK-IN", 600, qrY + qrSize + 50);
      context.fillStyle = "#756b64";
      context.font = '700 22px "Atkinson Hyperlegible", Arial, sans-serif';
      context.letterSpacing = "1px";
      context.fillText(bookingNumber, 600, qrY + qrSize + 88);
      context.letterSpacing = "0px";

      context.fillStyle = "#121638";
      roundedRect(context, 70, 1532, 1060, 104, 28);
      context.fill();
      context.fillStyle = "#ffc36a";
      context.font = '400 31px "Protest Riot", "Trebuchet MS", sans-serif';
      context.textAlign = "left";
      context.fillText("Nos vemos en el camino.", 125, 1596);
      context.fillStyle = "#ffffff";
      context.font = '700 19px "Atkinson Hyperlegible", Arial, sans-serif';
      context.textAlign = "right";
      context.fillText(
        "MUESTRA ESTE PASE AL EQUIPO",
        1075,
        1593,
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png", 1),
      );
      if (!blob) throw new Error("No pudimos crear la imagen.");
      await saveImage(blob, `pase-${bookingNumber.toLowerCase()}.png`);
      setMessage("Tu pase quedó listo como imagen.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(
        error instanceof Error
          ? error.message
          : "No pudimos guardar la imagen.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="ticket-qr">
        <QRCodeCanvas id={qrId} value={token} size={220} level="H" />
        <strong>QR DE CHECK-IN</strong>
        <small>{bookingNumber}</small>
      </div>
      <button
        className="button button-dark"
        type="button"
        disabled={saving}
        onClick={() => void savePass()}
      >
        <Download aria-hidden="true" />
        {saving ? "PREPARANDO IMAGEN…" : "GUARDAR IMAGEN EN MI TELÉFONO"}
      </button>
      {message && (
        <p className="ticket-download-message" role="status">
          {message}
        </p>
      )}
    </>
  );
}
