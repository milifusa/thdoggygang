'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type Screen = 'home' | 'scanner' | 'booking' | 'success' | 'search';
type LiveBooking = { id: string; booking_number: string; status: string; hike_id: string; booking_participants: Array<{ id: string; snapshot: { first_name?: string; last_name?: string; is_minor?: boolean } }>; booking_dogs: Array<{ id: string; snapshot: { name?: string; reactivity?: string; notes?: string } }> };

export function HikeMode({ demo }: { demo: boolean }) {
  const [screen, setScreen] = useState<Screen>('home');
  const [present, setPresent] = useState(['mishele','eduardo','maximo']);
  const [ack, setAck] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [liveBooking, setLiveBooking] = useState<LiveBooking | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LiveBooking[]>([]);
  const [searching, setSearching] = useState(false);
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
            try { const code = (await detector.detect(video.current)).find((item) => item.rawValue.startsWith('tdg:checkin:')); if (code) { await showBooking(code.rawValue); return; } } catch { /* keep the camera responsive while it focuses */ }
            scanLoop.current = requestAnimationFrame(scan);
          };
          scanLoop.current = requestAnimationFrame(scan);
        }
      }
    }
    catch { setCameraError('No pudimos abrir la cámara. Revisa el permiso o busca la reservación manualmente.'); }
  };
  const stopCamera = () => { const stream = video.current?.srcObject as MediaStream | null; stream?.getTracks().forEach((track) => track.stop()); if (scanLoop.current) cancelAnimationFrame(scanLoop.current); scanLoop.current = null; };
  const showBooking = async (token?: string) => {
    stopCamera(); setCameraError('');
    if (!demo && token) {
      const response = await fetch('/api/checkin/lookup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
      const payload = await response.json() as { booking?: LiveBooking | LiveBooking[]; error?: string };
      if (!response.ok || !payload.booking) { setCameraError(payload.error ?? 'No encontramos esta reservación.'); setScreen('scanner'); return; }
      const booking = Array.isArray(payload.booking) ? payload.booking[0] : payload.booking; setLiveBooking(booking); setPresent(booking.booking_participants.map((participant) => participant.id));
    }
    setScreen('booking');
  };
  const toggle = (id: string) => setPresent((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items,id]);
  const openSearchResult = (booking: LiveBooking) => { setLiveBooking(booking); setPresent(booking.booking_participants.map((participant) => participant.id)); setScreen('booking'); };
  const search = async () => {
    if (demo || searchQuery.trim().length < 2) return; setSearching(true); setCameraError('');
    const response = await fetch(`/api/checkin/search?q=${encodeURIComponent(searchQuery)}`); const payload = await response.json() as { bookings?: LiveBooking[]; error?: string };
    if (!response.ok) setCameraError(payload.error ?? 'No pudimos buscar.'); else setSearchResults(payload.bookings ?? []); setSearching(false);
  };
  const confirm = async () => {
    if (!demo && liveBooking) {
      const response = await fetch('/api/checkin/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hikeId: liveBooking.hike_id, bookingId: liveBooking.id, participantIds: present, method: 'QR', clientOperationId: crypto.randomUUID() }) });
      if (!response.ok) { setCameraError('No pudimos guardar el check-in. Intenta otra vez.'); return; }
    }
    setScreen('success'); window.setTimeout(() => { setAck(false); setLiveBooking(null); setScreen('scanner'); }, 1500);
  };
  const checkinPeople = liveBooking ? liveBooking.booking_participants.map((participant, index) => ({ id: participant.id, name: `${participant.snapshot.first_name ?? ''} ${participant.snapshot.last_name ?? ''}`.trim(), detail: `${index === 0 ? 'Titular' : 'Acompañante'}${participant.snapshot.is_minor ? ' · Menor' : ''}` })) : [{ id: 'mishele', name: 'Mishele Lojan', detail: 'Titular' }, { id: 'eduardo', name: 'Eduardo Flores', detail: 'Adulto' }, { id: 'maximo', name: 'Máximo Flores', detail: 'Menor · Tutor: Mishele' }];
  const firstDog = liveBooking?.booking_dogs[0]?.snapshot; const requiresAck = demo || Boolean(firstDog?.reactivity || firstDog?.notes); const leadLastName = checkinPeople[0]?.name.split(' ').at(-1) ?? 'Manada';
  return <main className="hike-mode"><header><Link href="/admin">×</Link><div><span>MODO HIKE</span><strong>Sendero del Duende</strong></div><div className="live-dot"><i /> EN VIVO</div></header><section className="hike-counter"><div><strong>38</strong><span>/ 40 CHECK-INS</span></div><div className="counter-bar"><i style={{width:'95%'}} /></div></section>
    {screen === 'home' && <section className="hike-home"><div className="hike-stats"><article><strong>40</strong><span>ESPERADOS</span></article><article><strong>38</strong><span>CHECK-IN</span></article><article><strong>26</strong><span>PERRITOS</span></article><article><strong>18</strong><span>TRANSPORTE</span></article></div><button className="scan-main" onClick={openScanner}><span>⌗</span><strong>ESCANEAR QR</strong><small>Apunta al código de la reservación</small></button><div className="hike-actions"><button onClick={() => setScreen('search')}><span>⌕</span><strong>BUSCAR PERSONA</strong></button><button><span>🐾</span><strong>VER PERRITOS</strong></button><button><span>BUS</span><strong>TRANSPORTE</strong></button><button><span>!</span><strong>ALERTAS <i>4</i></strong></button></div></section>}
    {screen === 'scanner' && <section className="scanner-screen"><div className="scanner-view"><video ref={video} playsInline muted /><div className="scan-frame"><i /><i /><i /><i /></div>{cameraError && <p>{cameraError}</p>}</div><p>Centra el QR dentro del recuadro</p>{demo && <button className="demo-scan" onClick={() => showBooking()}>SIMULAR QR DE RESERVACIÓN</button>}<button className="manual-link" onClick={() => { stopCamera(); setScreen('search'); }}>¿No tienen QR? Buscar manualmente →</button></section>}
    {screen === 'search' && <section className="manual-search"><button onClick={() => setScreen('home')}>← VOLVER</button><span>CHECK-IN MANUAL</span><h1>Busca a alguien<br />de la manada.</h1><label>⌕<input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void search(); }} placeholder="Nombre, reservación o perrito" /><button onClick={search}>{searching ? '…' : 'BUSCAR'}</button></label>{cameraError && <p className="hike-error">{cameraError}</p>}{demo ? <button className="search-result" onClick={() => showBooking()}><span className="profile-initials">ML</span><div><strong>Mishele Lojan</strong><small>TDG-1048 · 3 personas · Mona</small></div><i>→</i></button> : searchResults.map((booking) => { const lead = booking.booking_participants[0]?.snapshot; return <button className="search-result" key={booking.id} onClick={() => openSearchResult(booking)}><span className="profile-initials">{lead?.first_name?.[0]}{lead?.last_name?.[0]}</span><div><strong>{lead?.first_name} {lead?.last_name}</strong><small>{booking.booking_number} · {booking.booking_participants.length} personas · {booking.booking_dogs.length} perritos</small></div><i>→</i></button>; })}</section>}
    {screen === 'booking' && <section className="checkin-card"><button className="checkin-back" onClick={() => setScreen('home')}>← CANCELAR</button><div className="valid-qr">✓ RESERVACIÓN ENCONTRADA</div><p>RESERVACIÓN {liveBooking?.booking_number ?? 'TDG-1048'}</p><h1>Familia {leadLastName}</h1><div className="checkin-meta"><span>{checkinPeople.length} PERSONAS</span><span>{liveBooking?.booking_dogs.length ?? 1} PERRITO</span><span>{liveBooking?.status === 'PENDING_PAYMENT' ? '⚠ PAGO PENDIENTE' : '✓ PAGADO'}</span></div><h2>¿Quién llegó?</h2>{checkinPeople.map(({id,name,detail}) => <button className={`check-person ${present.includes(id) ? 'selected' : ''}`} onClick={() => toggle(id)} key={id}><i>{present.includes(id) ? '✓' : ''}</i><span><strong>{name}</strong><small>{detail}</small></span></button>)}{requiresAck && <div className="dog-alert"><div><span>⚠ IMPORTANTE</span><strong>🐶 {firstDog?.name ?? 'Mona'}</strong><p>{firstDog?.reactivity || firstDog?.notes || 'Sensible a grupos grandes al inicio. Darle espacio durante la formación.'}</p></div><label><input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} /> ENTENDIDO</label></div>}{cameraError && <p className="hike-error">{cameraError}</p>}<button className="confirm-checkin" disabled={(requiresAck && !ack) || present.length === 0} onClick={confirm}>CONFIRMAR {present.length} CHECK-INS →</button></section>}
    {screen === 'success' && <section className="checkin-success"><div>✓</div><h1>¡Listos para<br />la aventura!</h1><p>{present.length} personas registradas</p><span>Preparando siguiente escaneo…</span></section>}
  </main>;
}
