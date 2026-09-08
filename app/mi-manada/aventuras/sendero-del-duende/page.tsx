'use client';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';

export default function MyAdventurePage() {
  return <main className="ticket-page"><header><Link href="/mi-manada">← MIS AVENTURAS</Link><Link className="wordmark" href="/">THE DOGGY <span>GANG</span></Link></header><section className="ticket-shell"><p className="eyebrow">CHECK-IN · 20 SEP</p><h1>Tu pase a la<br />aventura.</h1><p>Sube el brillo de tu pantalla y muestra este código al equipo de The Doggy Gang.</p><div className="ticket"><div className="ticket-top"><span>CONFIRMADA</span><h2>Sendero del Duende</h2><p>20 SEP 2026 · 07:00 AM<br />Cholula, Puebla</p></div><div className="ticket-qr"><QRCodeSVG value="tdg:checkin:7f9f5c2e-74bc-4f89-a310-86b4109d9d25" size={220} level="H" /><strong>QR DE CHECK-IN</strong><small>TDG · 7F9F5C2E</small></div><div className="ticket-members"><div><span>PERSONAS</span><strong>Mishele · Eduardo · Máximo</strong></div><div><span>PERRITOS</span><strong>🐾 Mona</strong></div></div></div><button className="button button-dark" onClick={() => window.print()}>GUARDAR EN MI TELÉFONO</button></section></main>;
}
