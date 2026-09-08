"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BusFront, Check, CircleAlert, CircleCheck, CloudDownload, Dog, House, PackageCheck, Phone, QrCode, RefreshCw, Search, Signal, SignalZero, UserRoundCheck, X } from "lucide-react";
import type { HikeBooking, HikeModeData, OfflineOperation } from "../../lib/hike-mode-types";
import { enqueueOperation, getDeviceId, getHikePackage, listOperations, removeOperation, saveHikePackage, updateOperation } from "../../lib/offline/hike-db";
import { verifySignedPayload } from "../../lib/security/signed-token";

type Filter = "ALL" | "PENDING" | "CHECKED" | "ALERTS" | "TRANSPORT" | "DELIVERIES";

function personName(person?: HikeBooking["booking_participants"][number]) {
  return `${person?.snapshot.first_name ?? ""} ${person?.snapshot.last_name ?? ""}`.trim() || "Persona sin nombre";
}
function bookingName(booking: HikeBooking) { return personName(booking.booking_participants[0]); }
function hasDogAlert(booking: HikeBooking) { return booking.booking_dogs.some((dog) => Boolean(dog.snapshot.reactivity || dog.snapshot.medical_conditions || dog.snapshot.medications || dog.snapshot.notes)); }
function formatTime(value?: string | null) {
  if (!value) return "Sin sincronizar";
  return new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function HikeMode({ demo, data: initialData }: { demo: boolean; data: HikeModeData | null }) {
  const [data, setData] = useState(initialData);
  const [online, setOnline] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [selected, setSelected] = useState<HikeBooking | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [pending, setPending] = useState<OfflineOperation[]>([]);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const scanLoop = useRef<number | null>(null);

  const hydrateQueue = useCallback(async (hikeId: string) => setPending(await listOperations(hikeId)), []);
  const loadPackage = useCallback(async (hikeId: string, currentDeviceId: string, quiet = false) => {
    if (!navigator.onLine || demo) return null;
    if (!quiet) setPreparing(true);
    try {
      const response = await fetch(`/api/hike-mode/package?hike=${encodeURIComponent(hikeId)}&device=${encodeURIComponent(currentDeviceId)}`, { cache: "no-store" });
      const payload = await response.json() as HikeModeData & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No pudimos preparar el hike.");
      await saveHikePackage(payload);
      setData(payload);
      setLastSync(new Date().toISOString());
      setMessage("Paquete operativo listo para trabajar sin señal.");
      return payload;
    } catch (error) {
      if (!quiet) setMessage(error instanceof Error ? error.message : "No pudimos descargar el paquete operativo.");
      return null;
    } finally { if (!quiet) setPreparing(false); }
  }, [demo]);

  const syncQueue = useCallback(async () => {
    if (!data?.authorization || !navigator.onLine || syncing) return;
    const queued = (await listOperations(data.hike.id)).filter((operation) => operation.state !== "SYNCED");
    if (!queued.length) { setLastSync(new Date().toISOString()); return; }
    setSyncing(true);
    for (const operation of queued) await updateOperation({ ...operation, state: "SYNCING", error: undefined });
    try {
      const response = await fetch("/api/hike-mode/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ authorization: data.authorization, operations: queued }) });
      const payload = await response.json() as { error?: string; syncedAt?: string; results?: Array<{ operationId: string; ok: boolean; error?: string }> };
      if (!response.ok) throw new Error(payload.error ?? "No pudimos sincronizar.");
      for (const result of payload.results ?? []) {
        const operation = queued.find((item) => item.operationId === result.operationId);
        if (!operation) continue;
        if (result.ok) await removeOperation(operation.operationId);
        else await updateOperation({ ...operation, state: "CONFLICT", error: result.error ?? "Requiere revisión" });
      }
      setLastSync(payload.syncedAt ?? new Date().toISOString());
      await hydrateQueue(data.hike.id);
    } catch (error) {
      for (const operation of queued) await updateOperation({ ...operation, state: "PENDING", error: error instanceof Error ? error.message : "Pendiente de sincronización" });
      await hydrateQueue(data.hike.id);
    } finally { setSyncing(false); }
  }, [data, hydrateQueue, syncing]);

  useEffect(() => {
    let active = true;
    const start = async () => {
      setOnline(navigator.onLine);
      const id = await getDeviceId();
      if (!active) return;
      setDeviceId(id);
      if ("serviceWorker" in navigator) await navigator.serviceWorker.register("/hike-mode-sw.js").catch(() => null);
      if (!initialData?.hike.id) return;
      const cached = await getHikePackage(initialData.hike.id);
      if (cached && active) setData(cached);
      await hydrateQueue(initialData.hike.id);
      if (navigator.onLine) await loadPackage(initialData.hike.id, id, true);
    };
    void start();
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { active = false; window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [hydrateQueue, initialData?.hike.id, loadPackage]);
  useEffect(() => { const syncWhenOnline=()=>{void syncQueue();};window.addEventListener("online",syncWhenOnline);return()=>window.removeEventListener("online",syncWhenOnline);}, [syncQueue]);
  useEffect(() => () => { const stream = video.current?.srcObject as MediaStream | null; stream?.getTracks().forEach((track) => track.stop()); if (scanLoop.current) cancelAnimationFrame(scanLoop.current); }, []);

  const checkedIds = useMemo(() => new Set(data?.bookings.flatMap((booking) => booking.check_ins.map((checkIn) => checkIn.booking_participant_id)) ?? []), [data]);
  const expected = data?.bookings.reduce((sum, booking) => sum + booking.booking_participants.length, 0) ?? 0;
  const checked = checkedIds.size;
  const alerts = data?.bookings.filter(hasDogAlert) ?? [];
  const transport = data?.bookings.reduce((sum, booking) => sum + booking.transport_reservations.length, 0) ?? 0;
  const deliveries = useMemo(() => data?.deliveries.filter((delivery) => delivery.status !== "DELIVERED") ?? [], [data?.deliveries]);
  const visibleBookings = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es-MX");
    return (data?.bookings ?? []).filter((booking) => {
      const content = [booking.booking_number, bookingName(booking), booking.profile?.email, booking.profile?.phone, ...booking.booking_dogs.map((dog) => dog.snapshot.name)].join(" ").toLocaleLowerCase("es-MX");
      if (normalized && !content.includes(normalized)) return false;
      const isChecked = booking.booking_participants.every((person) => checkedIds.has(person.id));
      if (filter === "PENDING") return !isChecked;
      if (filter === "CHECKED") return isChecked;
      if (filter === "ALERTS") return hasDogAlert(booking);
      if (filter === "TRANSPORT") return booking.transport_reservations.length > 0;
      if (filter === "DELIVERIES") return deliveries.some((delivery) => delivery.bookingId === booking.id);
      return true;
    });
  }, [checkedIds, data?.bookings, deliveries, filter, query]);

  const queueCheckins = async (booking: HikeBooking, participantIds: string[]) => {
    const operations: OfflineOperation[] = participantIds.filter((id) => !checkedIds.has(id)).map((participantId) => ({ operationId: crypto.randomUUID(), hikeId: booking.hike_id, bookingId: booking.id, participantId, type: "CHECK_IN", deviceId, clientTimestamp: new Date().toISOString(), payload: {}, state: "PENDING" }));
    if (!operations.length) { setMessage("Esta reservación ya tiene todos sus check-ins."); return; }
    for (const operation of operations) await enqueueOperation(operation);
    setData((current) => current ? ({ ...current, bookings: current.bookings.map((item) => item.id === booking.id ? ({ ...item, check_ins: [...item.check_ins, ...operations.map((operation) => ({ id: operation.operationId, booking_participant_id: operation.participantId!, checked_in_at: operation.clientTimestamp }))] }) : item) }) : current);
    await hydrateQueue(booking.hike_id);
    setSelected(null);
    setMessage(`${operations.length} check-in${operations.length === 1 ? "" : "s"} guardado${operations.length === 1 ? "" : "s"}.`);
  };
  const markDelivered = async (delivery: HikeModeData["deliveries"][number]) => {
    if (!data) return;
    const operation: OfflineOperation = { operationId: crypto.randomUUID(), hikeId: data.hike.id, bookingId: delivery.bookingId || undefined, orderItemId: delivery.orderItemId, type: "PRODUCT_DELIVERY", deviceId, clientTimestamp: new Date().toISOString(), payload: { deliveryLocation: data.hike.meeting_point ?? data.hike.location_name }, state: "PENDING" };
    await enqueueOperation(operation);
    setData({ ...data, deliveries: data.deliveries.map((item) => item.orderItemId === delivery.orderItemId ? { ...item, status: "DELIVERED", deliveredAt: operation.clientTimestamp } : item) });
    await hydrateQueue(data.hike.id);
  };
  const stopScanner = () => { const stream = video.current?.srcObject as MediaStream | null; stream?.getTracks().forEach((track) => track.stop()); if (scanLoop.current) cancelAnimationFrame(scanLoop.current); scanLoop.current = null; };
  const handleQr = async (token: string) => {
    if (!data) return;
    const payload = await verifySignedPayload(token, data.publicKey);
    if (!payload || payload.purpose !== "checkin") { setMessage("El QR no es válido o ya venció."); return; }
    if (payload.hikeId !== data.hike.id) { setMessage("Este QR pertenece a otro hike."); return; }
    const booking = data.bookings.find((item) => item.id === payload.bookingId && item.qrToken === token);
    if (!booking) { setMessage("El QR no está incluido en el paquete operativo vigente."); return; }
    stopScanner(); setScannerOpen(false); setSelected(booking);
  };
  const openScanner = async () => {
    setMessage(""); setScannerOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      if (!video.current) return;
      video.current.srcObject = stream; await video.current.play();
      const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
      if (!Detector) { setMessage("Este navegador no permite leer QR con la cámara. Usa la búsqueda."); return; }
      const detector = new Detector({ formats: ["qr_code"] });
      const scan = async () => { if (!video.current || video.current.readyState < 2) { scanLoop.current = requestAnimationFrame(scan); return; } const match = (await detector.detect(video.current).catch(() => [])).find((code) => code.rawValue.startsWith("tdg:v2.")); if (match) { await handleQr(match.rawValue); return; } scanLoop.current = requestAnimationFrame(scan); };
      scanLoop.current = requestAnimationFrame(scan);
    } catch { setMessage("No pudimos abrir la cámara. Revisa el permiso o usa la búsqueda."); }
  };

  if (!data) return <main className="field-mode-empty"><CircleAlert /><h1>No hay un hike disponible.</h1><Link href="/admin">VOLVER AL ADMINISTRADOR</Link></main>;
  const hikeDate = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(data.hike.starts_at));
  return <main className="field-mode">
    <header className="field-header"><Link href="/admin" aria-label="Volver al administrador"><House /></Link><div><span>MODO HIKE</span><select value={data.hike.id} onChange={(event) => { window.location.href = `/admin/hike-mode?hike=${event.target.value}`; }}>{data.availableHikes.map((hike) => <option value={hike.id} key={hike.id}>{hike.name}</option>)}</select><small>{hikeDate} · {data.hike.location_name}</small></div><button className={online ? "connection-online" : "connection-offline"} onClick={() => void syncQueue()}>{online ? <Signal /> : <SignalZero />}<span>{online ? "EN LÍNEA" : "SIN SEÑAL"}</span></button></header>
    <section className="field-package-bar"><div><strong>{data.preparedAt ? "PAQUETE OFFLINE LISTO" : "PREPARA ESTE HIKE"}</strong><span>{pending.length} cambios pendientes · última sincronización {formatTime(lastSync ?? data.preparedAt)}</span></div><button disabled={preparing || !online} onClick={() => void loadPackage(data.hike.id, deviceId)}>{preparing ? <RefreshCw className="spin" /> : <CloudDownload />}{preparing ? "PREPARANDO" : "PREPARAR OFFLINE"}</button></section>
    <section className="field-kpis"><article><UserRoundCheck /><div><strong>{checked}/{expected}</strong><span>CHECK-INS</span></div></article><article><Dog /><div><strong>{data.bookings.reduce((sum, booking) => sum + booking.booking_dogs.length, 0)}</strong><span>PERRITOS</span></div></article><article><BusFront /><div><strong>{transport}</strong><span>TRANSPORTE</span></div></article><article className={alerts.length ? "has-alert" : ""}><CircleAlert /><div><strong>{alerts.length}</strong><span>ALERTAS</span></div></article><article><PackageCheck /><div><strong>{deliveries.length}</strong><span>ENTREGAS</span></div></article></section>
    <section className="field-tools"><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, reservación, correo, teléfono o perrito" /></label><nav aria-label="Filtros operativos">{([['ALL','Todos'],['PENDING','Pendientes'],['CHECKED','Check-in'],['ALERTS','Alertas'],['TRANSPORT','Transporte'],['DELIVERIES','Entregas']] as Array<[Filter,string]>).map(([value,label]) => <button className={filter === value ? "active" : ""} onClick={() => { setFilter(value); if (value === 'DELIVERIES') setDeliveryOpen(true); }} key={value}>{label}</button>)}</nav></section>
    {message && <div className="field-message"><CircleAlert /><span>{message}</span><button onClick={() => setMessage("")}><X /></button></div>}
    <section className="field-results"><div className="field-section-title"><div><span>LLEGADAS</span><h1>{filter === "PENDING" ? "Pendientes por llegar" : "Reservaciones del hike"}</h1></div><strong>{visibleBookings.length}</strong></div><div className="field-booking-list">{visibleBookings.map((booking) => { const complete = booking.booking_participants.every((person) => checkedIds.has(person.id)); return <button className={complete ? "checked" : ""} onClick={() => setSelected(booking)} key={booking.id}><span className="booking-state">{complete ? <CircleCheck /> : <span>{booking.booking_participants.filter((person) => !checkedIds.has(person.id)).length}</span>}</span><span className="booking-person"><strong>{bookingName(booking)}</strong><small>{booking.booking_number} · {booking.booking_participants.length} personas · {booking.booking_dogs.length} perritos</small></span><span className="booking-flags">{hasDogAlert(booking) && <i><CircleAlert /> ALERTA</i>}{booking.transport_reservations.length > 0 && <i><BusFront /> {booking.transport_reservations.length}</i>}{deliveries.some((delivery) => delivery.bookingId === booking.id) && <i><PackageCheck /> ENTREGA</i>}</span><ArrowLeft className="row-arrow" /></button>; })}{!visibleBookings.length && <div className="field-no-results"><Search /><strong>Sin resultados</strong><span>Prueba otro nombre o cambia los filtros.</span></div>}</div></section>
    <button className="field-scan-sticky" onClick={() => void openScanner()}><QrCode /><span>ESCANEAR QR</span></button>
    {scannerOpen && <div className="field-modal field-scanner-modal"><section><header><button onClick={() => { stopScanner(); setScannerOpen(false); }}><X /></button><div><span>CHECK-IN</span><h2>Escanear QR</h2></div></header><div className="field-camera"><video ref={video} muted playsInline /><i /></div><p>Centra el código de la reservación dentro del recuadro. Funciona aun sin señal si preparaste el hike.</p></section></div>}
    {selected && <div className="field-modal"><section className="field-booking-sheet"><header><button onClick={() => setSelected(null)}><X /></button><div><span>{selected.booking_number}</span><h2>{bookingName(selected)}</h2></div></header>{hasDogAlert(selected) && <div className="field-dog-alert"><CircleAlert /><div><strong>INDICACIONES DE PERRITOS</strong>{selected.booking_dogs.filter((dog) => dog.snapshot.reactivity || dog.snapshot.medical_conditions || dog.snapshot.medications || dog.snapshot.notes).map((dog) => <p key={dog.id}><b>{dog.snapshot.name ?? "Perrito"}:</b> {[dog.snapshot.reactivity,dog.snapshot.medical_conditions,dog.snapshot.medications,dog.snapshot.notes].filter(Boolean).join(" · ")}</p>)}</div></div>}<div className="field-people"><span>ASISTENTES</span>{selected.booking_participants.map((person) => <article key={person.id}><span>{checkedIds.has(person.id) ? <CircleCheck /> : <span />}</span><div><strong>{personName(person)}</strong><small>{person.snapshot.is_minor ? "Menor" : "Adulto"}{selected.signed_waivers.some((waiver) => waiver.booking_participant_id === person.id) ? " · Responsiva firmada" : " · Responsiva pendiente"}</small></div></article>)}</div><div className="field-sheet-actions"><button onClick={() => void queueCheckins(selected, selected.booking_participants.map((person) => person.id))}><Check /> CONFIRMAR CHECK-IN PENDIENTE</button>{selected.booking_participants.some((person) => person.snapshot.emergency_contact_phone) && <a href={`tel:${selected.booking_participants.find((person) => person.snapshot.emergency_contact_phone)?.snapshot.emergency_contact_phone}`}><Phone /> CONTACTO DE EMERGENCIA</a>}</div></section></div>}
    {deliveryOpen && <div className="field-modal"><section className="field-booking-sheet field-delivery-sheet"><header><button onClick={() => setDeliveryOpen(false)}><X /></button><div><span>PRODUCTOS</span><h2>Entregas en este hike</h2></div></header>{data.deliveries.map((delivery) => <article key={delivery.orderItemId}><PackageCheck /><div><strong>{delivery.quantity} × {delivery.description}</strong><small>{data.bookings.find((booking) => booking.id === delivery.bookingId)?.booking_number ?? "Pedido independiente"}</small></div><button disabled={delivery.status === "DELIVERED"} onClick={() => void markDelivered(delivery)}>{delivery.status === "DELIVERED" ? "ENTREGADO" : "MARCAR ENTREGA"}</button></article>)}{!data.deliveries.length && <div className="field-no-results"><PackageCheck /><strong>No hay entregas pendientes</strong></div>}</section></div>}
  </main>;
}
