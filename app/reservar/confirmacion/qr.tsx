'use client';
import { QRCodeSVG } from 'qrcode.react';

export function LiveQr({ token, reference }: { token: string; reference: string }) {
  return <div className="live-qr-card"><QRCodeSVG value={token} size={210} level="H" /><strong>TU QR DE CHECK-IN</strong><small>{reference}</small><button className="button button-primary" onClick={() => window.print()}>GUARDAR QR</button></div>;
}
