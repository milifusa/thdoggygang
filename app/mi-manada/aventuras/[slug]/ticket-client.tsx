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
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 1600;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No pudimos preparar la imagen.");

      context.fillStyle = "#f7f1e7";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#121638";
      context.fillRect(0, 0, canvas.width, 220);
      context.textAlign = "center";
      context.fillStyle = "#ffc36a";
      context.font = "900 54px Arial, sans-serif";
      context.fillText("THE DOGGY GANG", 600, 102);
      context.fillStyle = "#ffffff";
      context.font = "700 24px Arial, sans-serif";
      context.fillText("PASE DE AVENTURA", 600, 154);

      context.fillStyle = "#2b211c";
      context.font = "900 64px Arial, sans-serif";
      let y = drawCenteredText(context, hikeName, 315, 980, 76);
      context.font = "400 31px Arial, sans-serif";
      y = drawCenteredText(context, hikeDate, y + 38, 1000, 44);
      context.fillStyle = "#6c625b";
      context.font = "400 28px Arial, sans-serif";
      y = drawCenteredText(context, location, y + 10, 1000, 40);

      const qrSize = 720;
      const qrX = (canvas.width - qrSize) / 2;
      const qrY = Math.max(570, y + 55);
      context.fillStyle = "#ffffff";
      context.fillRect(qrX - 45, qrY - 45, qrSize + 90, qrSize + 90);
      context.drawImage(qr, qrX, qrY, qrSize, qrSize);
      context.fillStyle = "#2b211c";
      context.font = "900 25px Arial, sans-serif";
      context.fillText("QR DE CHECK-IN", 600, qrY + qrSize + 98);
      context.fillStyle = "#756b64";
      context.font = "500 24px Arial, sans-serif";
      context.fillText(bookingNumber, 600, qrY + qrSize + 142);
      context.fillStyle = "#121638";
      context.fillRect(70, 1490, 1060, 4);
      context.font = "700 22px Arial, sans-serif";
      context.fillText(
        "Muestra esta imagen al equipo durante el check-in",
        600,
        1545,
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
