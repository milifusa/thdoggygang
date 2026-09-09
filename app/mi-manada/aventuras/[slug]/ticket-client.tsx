"use client";

import { QRCodeSVG } from "qrcode.react";
import { Download } from "lucide-react";

export function AdventureTicket({
  token,
  bookingNumber,
}: {
  token: string;
  bookingNumber: string;
}) {
  return (
    <>
      <div className="ticket-qr">
        <QRCodeSVG value={token} size={220} level="H" />
        <strong>QR DE CHECK-IN</strong>
        <small>{bookingNumber}</small>
      </div>
      <button className="button button-dark" onClick={() => window.print()}>
        <Download aria-hidden="true" /> GUARDAR EN MI TELÉFONO
      </button>
    </>
  );
}
