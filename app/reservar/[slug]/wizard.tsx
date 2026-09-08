'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { Adventure } from '../../lib/data';

const steps = ['Personas', 'Perritos', 'Transporte', 'Responsivas', 'Pago', 'Listo'];
const people = [
  { id: 'mishele', name: 'Mishele Lojan', detail: 'Titular · Adulto', initials: 'ML' },
  { id: 'eduardo', name: 'Eduardo Flores', detail: 'Acompañante · Adulto', initials: 'EF' },
  { id: 'maximo', name: 'Máximo Flores', detail: 'Acompañante · Menor', initials: 'MF' },
];
const dogs = [
  { id: 'mona', name: 'Mona', detail: 'Westie · 5 años · 3 aventuras', image: 'https://images.unsplash.com/photo-1586671267731-da2cf3ceeb80?auto=format&fit=crop&w=300&q=80' },
  { id: 'bruno', name: 'Bruno', detail: 'Border Collie · 3 años · 1 aventura', image: 'https://images.unsplash.com/photo-1551717743-49959800b1f6?auto=format&fit=crop&w=300&q=80' },
];

function SignaturePad({ onSigned }: { onSigned: (value: boolean) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - box.left) * (event.currentTarget.width / box.width), y: (event.clientY - box.top) * (event.currentTarget.height / box.height) };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId); const ctx = event.currentTarget.getContext('2d'); const p = point(event); ctx?.beginPath(); ctx?.moveTo(p.x, p.y);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return; const ctx = event.currentTarget.getContext('2d'); const p = point(event); if (ctx) { ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.strokeStyle = '#090909'; ctx.lineTo(p.x, p.y); ctx.stroke(); onSigned(true); }
  };
  const clear = () => { const node = canvas.current; node?.getContext('2d')?.clearRect(0, 0, node.width, node.height); onSigned(false); };
  return <div className="signature-wrap"><canvas ref={canvas} width={820} height={220} onPointerDown={start} onPointerMove={move} onPointerUp={() => drawing.current = false} onPointerCancel={() => drawing.current = false} aria-label="Área para firmar" /><div className="signature-line"><span>FIRMA AQUÍ CON TU DEDO</span><button type="button" onClick={clear}>BORRAR</button></div></div>;
}

export function BookingWizard({ adventure }: { adventure: Adventure }) {
  const [step, setStep] = useState(0);
  const [selectedPeople, setSelectedPeople] = useState(['mishele']);
  const [selectedDogs, setSelectedDogs] = useState(['mona']);
  const [transport, setTransport] = useState(false);
  const [transportPeople, setTransportPeople] = useState(['mishele']);
  const [signed, setSigned] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [payment, setPayment] = useState<'card' | 'transfer'>('card');
  const [processing, setProcessing] = useState(false);
  const total = useMemo(() => selectedPeople.length * adventure.price + (transport ? transportPeople.length * 200 : 0), [selectedPeople, transport, transportPeople, adventure.price]);
  const toggle = (id: string, values: string[], setter: (value: string[]) => void) => setter(values.includes(id) ? values.filter((item) => item !== id) : [...values, id]);
  const next = () => {
    if (step === 4) { setProcessing(true); window.setTimeout(() => { setProcessing(false); setStep(5); }, 900); return; }
    setStep((current) => Math.min(5, current + 1)); window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const canContinue = step === 0 ? selectedPeople.length > 0 : step === 1 ? selectedDogs.length > 0 : step === 3 ? signed && accepted : true;

  return (
    <main className="wizard-page">
      <header className="wizard-header"><Link className="wordmark" href="/">THE DOGGY <span>GANG</span></Link><Link href={`/aventuras/${adventure.slug}`} className="close-wizard" aria-label="Cerrar">×</Link></header>
      <div className="wizard-progress" aria-label={`Paso ${step + 1} de 6`}>
        {steps.map((label, index) => <div className={index <= step ? 'active' : ''} key={label}><i /><span>{index + 1}. {label}</span></div>)}
      </div>

      {step < 5 ? <div className="wizard-layout">
        <section className="wizard-main">
          <p className="wizard-kicker">PASO {step + 1} DE 6</p>
          {step === 0 && <><h1>¿Quién viene a<br />esta aventura?</h1><p className="wizard-lead">Tu manada ya está guardada. Sólo elige quién se apunta esta vez.</p><div className="select-list">{people.map((person) => <button type="button" className={`select-card ${selectedPeople.includes(person.id) ? 'selected' : ''}`} key={person.id} onClick={() => toggle(person.id, selectedPeople, setSelectedPeople)}><span className="profile-initials">{person.initials}</span><span><strong>{person.name}</strong><small>{person.detail}</small></span><i>{selectedPeople.includes(person.id) ? '✓' : ''}</i></button>)}</div><button className="add-row" type="button">＋ AGREGAR OTRA PERSONA</button></>}
          {step === 1 && <><h1>¿Qué perritos<br />vienen?</h1><p className="wizard-lead">Ellos también cuentan cada aventura. Selecciona a los exploradores de cuatro patas.</p><div className="select-list">{dogs.map((dog) => <button type="button" className={`select-card dog-select ${selectedDogs.includes(dog.id) ? 'selected' : ''}`} key={dog.id} onClick={() => toggle(dog.id, selectedDogs, setSelectedDogs)}><img src={dog.image} alt={dog.name} /><span><strong>{dog.name}</strong><small>{dog.detail}</small></span><i>{selectedDogs.includes(dog.id) ? '✓' : ''}</i></button>)}</div>{selectedDogs.includes('mona') && <div className="unchanged-box"><strong>¿Ha cambiado algo que debamos saber sobre Mona?</strong><label><input type="radio" defaultChecked name="changed" /> No, todo sigue igual</label><label><input type="radio" name="changed" /> Sí, quiero actualizar su perfil</label></div>}<button className="add-row" type="button">＋ AGREGAR PERRITO</button></>}
          {step === 2 && <><h1>¿Cómo llega<br />la manada?</h1><p className="wizard-lead">Puedes encontrarnos en el sendero o subirte al transporte del grupo.</p><div className="choice-grid"><button type="button" onClick={() => setTransport(false)} className={!transport ? 'selected' : ''}><span>🚙</span><strong>Llegamos por nuestra cuenta</strong><small>Te compartiremos el punto exacto.</small><i>{!transport ? '✓' : ''}</i></button><button type="button" onClick={() => setTransport(true)} className={transport ? 'selected' : ''}><span>🚌</span><strong>Necesitamos transporte</strong><small>Desde Angelópolis · $200 por persona.</small><i>{transport ? '✓' : ''}</i></button></div>{transport && <div className="transport-people"><h3>¿Quién necesita transporte?</h3>{people.filter((person) => selectedPeople.includes(person.id)).map((person) => <label key={person.id}><input type="checkbox" checked={transportPeople.includes(person.id)} onChange={() => toggle(person.id, transportPeople, setTransportPeople)} /><span>{person.name}</span><small>＋ $200</small></label>)}</div>}</>}
          {step === 3 && <><h1>Un acuerdo<br />para cuidarnos.</h1><p className="wizard-lead">Esta responsiva se genera para tu reservación y queda ligada a las personas y perritos seleccionados.</p><div className="waiver-document"><div className="waiver-title"><span>RESPONSIVA · VERSIÓN 2.1</span><strong>{adventure.title}</strong><small>{adventure.date} · {adventure.location}</small></div><p>Declaro que yo y las personas menores bajo mi tutela participamos voluntariamente. Confirmo que los perritos registrados tienen condiciones adecuadas para la ruta y me comprometo a seguir las indicaciones del equipo.</p><p>Entiendo los riesgos inherentes a una actividad al aire libre y autorizo al equipo a actuar conforme al protocolo de emergencia registrado.</p></div><SignaturePad onSigned={setSigned} /><label className="accept-row"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /> He leído y acepto la responsiva de esta aventura.</label></>}
          {step === 4 && <><h1>Último paso.<br />Reserva tu lugar.</h1><p className="wizard-lead">Elige cómo quieres pagar. Tu QR se genera cuando confirmemos el pago.</p><div className="payment-tabs"><button className={payment === 'card' ? 'active' : ''} onClick={() => setPayment('card')}>TARJETA</button><button className={payment === 'transfer' ? 'active' : ''} onClick={() => setPayment('transfer')}>TRANSFERENCIA</button></div>{payment === 'card' ? <div className="card-form"><label>NOMBRE EN LA TARJETA<input placeholder="Mishele Lojan" /></label><label>NÚMERO DE TARJETA<input inputMode="numeric" placeholder="••••  ••••  ••••  4242" /></label><div><label>VENCIMIENTO<input placeholder="MM / AA" /></label><label>CVV<input inputMode="numeric" placeholder="•••" /></label></div><p>🔒 Los datos son procesados de forma segura por el proveedor de pago y nunca se guardan en The Doggy Gang.</p></div> : <div className="bank-box"><span>DATOS PARA TRANSFERENCIA</span><strong>Banco Mutt</strong><p>THE DOGGY GANG EXPERIENCIAS<br />CLABE 012 345 678901234 5<br />Referencia: TDG-SEP-LOJAN</p><label className="receipt-upload">SUBIR COMPROBANTE<input type="file" accept="image/*,.pdf" /></label></div>}</>}
          <div className="wizard-actions"><button type="button" disabled={step === 0} onClick={() => setStep((current) => current - 1)} className="back-button">← ATRÁS</button><button type="button" disabled={!canContinue || processing} onClick={next} className="button button-primary">{processing ? 'CONFIRMANDO…' : step === 4 ? `PAGAR $${total.toLocaleString('es-MX')} MXN →` : 'CONTINUAR →'}</button></div>
        </section>
        <aside className="wizard-summary"><img src={adventure.image} alt={adventure.title} /><div><span>TU AVENTURA</span><h3>{adventure.title}</h3><p>{adventure.shortDate} · {adventure.time}<br />{adventure.location}</p></div><dl><div><dt>Personas</dt><dd>{selectedPeople.length}</dd></div><div><dt>Perritos</dt><dd>{selectedDogs.length}</dd></div><div><dt>Hike</dt><dd>${(selectedPeople.length * adventure.price).toLocaleString('es-MX')}</dd></div>{transport && <div><dt>Transporte</dt><dd>${(transportPeople.length * 200).toLocaleString('es-MX')}</dd></div>}<div className="summary-total"><dt>TOTAL</dt><dd>${total.toLocaleString('es-MX')} <small>MXN</small></dd></div></dl><p className="draft-saved">✓ Tu avance se guarda automáticamente</p></aside>
      </div> : <Confirmation adventure={adventure} peopleCount={selectedPeople.length} dogCount={selectedDogs.length} transport={transport} total={total} />}
    </main>
  );
}

function Confirmation({ adventure, peopleCount, dogCount, transport, total }: { adventure: Adventure; peopleCount: number; dogCount: number; transport: boolean; total: number }) {
  const token = 'tdg:checkin:7f9f5c2e-74bc-4f89-a310-86b4109d9d25';
  return <section className="confirmation"><div className="success-mark">✓</div><p className="eyebrow">RESERVACIÓN CONFIRMADA</p><h1>¡Ya eres parte de<br />esta aventura!</h1><p>Nos vemos muy pronto en <strong>{adventure.title}</strong>. Guarda este QR; lo escanearemos al llegar.</p><div className="confirmation-card"><div className="confirmation-info"><span>{adventure.shortDate}</span><h2>{adventure.title}</h2><p>{adventure.time} · {adventure.location}</p><dl><div><dt>Personas</dt><dd>{peopleCount}</dd></div><div><dt>Perritos</dt><dd>{dogCount}</dd></div><div><dt>Transporte</dt><dd>{transport ? 'Sí' : 'Por cuenta propia'}</dd></div><div><dt>Pago</dt><dd>${total.toLocaleString('es-MX')} MXN · Pagado</dd></div></dl></div><div className="qr-panel"><QRCodeSVG value={token} size={190} level="H" /><strong>TU QR DE CHECK-IN</strong><small>TDG · 7F9F5C2E</small></div></div><div className="confirmation-actions"><Link className="button button-dark" href="/mi-manada">VER MIS AVENTURAS →</Link><button className="button outline-button" onClick={() => window.print()}>GUARDAR QR</button></div></section>;
}
