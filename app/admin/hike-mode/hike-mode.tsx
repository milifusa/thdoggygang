'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type Screen = 'home' | 'scanner' | 'booking' | 'success' | 'search';

export function HikeMode() {
  const [screen, setScreen] = useState<Screen>('home');
  const [present, setPresent] = useState(['mishele','eduardo','maximo']);
  const [ack, setAck] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const scanLoop = useRef<number | null>(null);
  useEffect(() => () => { const stream = video.current?.srcObject as MediaStream | null; stream?.getTracks().forEach((track) => track.stop()); if (scanLoop.current) cancelAnimationFrame(scanLoop.current); }, []);
  const openScanner = async () => {
    setScreen('scanner'); setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (video.current) {
        video.current.srcObject = stream; await video.current.play();
        const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
        if (Detector) {
          const detector = new Detector({ formats: ['qr_code'] });
          const scan = async () => {
            if (!video.current || video.current.readyState < 2) { scanLoop.current = requestAnimationFrame(scan); return; }
            try { const codes = await detector.detect(video.current); if (codes.some((code) => code.rawValue.startsWith('tdg:checkin:'))) { showBooking(); return; } } catch { /* keep the camera responsive while it focuses */ }
            scanLoop.current = requestAnimationFrame(scan);
          };
          scanLoop.current = requestAnimationFrame(scan);
        }
      }
    }
    catch { setCameraError('No pudimos abrir la cámara. Revisa el permiso o busca la reservación manualmente.'); }
  };
  const stopCamera = () => { const stream = video.current?.srcObject as MediaStream | null; stream?.getTracks().forEach((track) => track.stop()); if (scanLoop.current) cancelAnimationFrame(scanLoop.current); scanLoop.current = null; };
  const showBooking = () => { stopCamera(); setScreen('booking'); };
  const toggle = (id: string) => setPresent((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items,id]);
  const confirm = () => { setScreen('success'); window.setTimeout(() => { setAck(false); setScreen('scanner'); }, 1500); };
  return <main className="hike-mode"><header><Link href="/admin">×</Link><div><span>MODO HIKE</span><strong>Sendero del Duende</strong></div><div className="live-dot"><i /> EN VIVO</div></header><section className="hike-counter"><div><strong>38</strong><span>/ 40 CHECK-INS</span></div><div className="counter-bar"><i style={{width:'95%'}} /></div></section>
    {screen === 'home' && <section className="hike-home"><div className="hike-stats"><article><strong>40</strong><span>ESPERADOS</span></article><article><strong>38</strong><span>CHECK-IN</span></article><article><strong>26</strong><span>PERRITOS</span></article><article><strong>18</strong><span>TRANSPORTE</span></article></div><button className="scan-main" onClick={openScanner}><span>⌗</span><strong>ESCANEAR QR</strong><small>Apunta al código de la reservación</small></button><div className="hike-actions"><button onClick={() => setScreen('search')}><span>⌕</span><strong>BUSCAR PERSONA</strong></button><button><span>🐾</span><strong>VER PERRITOS</strong></button><button><span>BUS</span><strong>TRANSPORTE</strong></button><button><span>!</span><strong>ALERTAS <i>4</i></strong></button></div></section>}
    {screen === 'scanner' && <section className="scanner-screen"><div className="scanner-view"><video ref={video} playsInline muted /><div className="scan-frame"><i /><i /><i /><i /></div>{cameraError && <p>{cameraError}</p>}</div><p>Centra el QR dentro del recuadro</p><button className="demo-scan" onClick={showBooking}>SIMULAR QR DE RESERVACIÓN</button><button className="manual-link" onClick={() => { stopCamera(); setScreen('search'); }}>¿No tienen QR? Buscar manualmente →</button></section>}
    {screen === 'search' && <section className="manual-search"><button onClick={() => setScreen('home')}>← VOLVER</button><span>CHECK-IN MANUAL</span><h1>Busca a alguien<br />de la manada.</h1><label>⌕<input autoFocus placeholder="Nombre, teléfono, email o perrito" /></label><button className="search-result" onClick={showBooking}><span className="profile-initials">ML</span><div><strong>Mishele Lojan</strong><small>TDG-1048 · 3 personas · Mona</small></div><i>→</i></button></section>}
    {screen === 'booking' && <section className="checkin-card"><button className="checkin-back" onClick={() => setScreen('home')}>← CANCELAR</button><div className="valid-qr">✓ QR VÁLIDO</div><p>RESERVACIÓN TDG-1048</p><h1>Familia Lojan</h1><div className="checkin-meta"><span>3 PERSONAS</span><span>1 PERRITO</span><span>✓ PAGADO</span></div><h2>¿Quién llegó?</h2>{[['mishele','Mishele Lojan','Titular'],['eduardo','Eduardo Flores','Adulto'],['maximo','Máximo Flores','Menor · Tutor: Mishele']].map(([id,name,detail]) => <button className={`check-person ${present.includes(id) ? 'selected' : ''}`} onClick={() => toggle(id)} key={id}><i>{present.includes(id) ? '✓' : ''}</i><span><strong>{name}</strong><small>{detail}</small></span></button>)}<div className="dog-alert"><div><span>⚠ IMPORTANTE</span><strong>🐶 Mona</strong><p>Sensible a grupos grandes al inicio. Darle espacio durante la formación.</p></div><label><input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} /> ENTENDIDO</label></div><button className="confirm-checkin" disabled={!ack || present.length === 0} onClick={confirm}>CONFIRMAR {present.length} CHECK-INS →</button></section>}
    {screen === 'success' && <section className="checkin-success"><div>✓</div><h1>¡Listos para<br />la aventura!</h1><p>{present.length} personas registradas</p><span>Preparando siguiente escaneo…</span></section>}
  </main>;
}
