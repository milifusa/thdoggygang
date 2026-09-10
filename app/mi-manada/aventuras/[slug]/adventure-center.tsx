"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarPlus, Check, Download, MapPin, ShoppingBag, Star } from "lucide-react";

const checklist = [
  ["GEAR", "Equipo y calzado preparados"], ["WATER", "Agua para personas y perritos"],
  ["FOOD", "Snacks y alimento necesarios"], ["ID", "Identificación personal"],
  ["DOG_TAG", "Placa y correa del perrito"], ["VACCINES", "Vacunas revisadas"],
] as const;

export function AdventureCenter({ bookingId, status, signed, participants, checkedIn, daysUntil, meetingPoint, meetingPoints, completedKeys, shopUrl, canReview, initialReview }: {
  bookingId: string; status: string; signed: number; participants: number; checkedIn: number; daysUntil: number; meetingPoint: string;
  meetingPoints: Array<{ id: string; label: string; address: string; mapsUrl: string }>;
  completedKeys: string[]; shopUrl: string; canReview: boolean;
  initialReview: { route_rating: number; guide_rating: number; transport_rating: number | null; body: string } | null;
}) {
  const [done, setDone] = useState(new Set(completedKeys));
  const [notice, setNotice] = useState("");
  const [review, setReview] = useState(initialReview ?? { route_rating: 5, guide_rating: 5, transport_rating: null, body: "" });
  const [savingReview, setSavingReview] = useState(false);
  const [downloading, setDownloading] = useState<"calendar" | "guide" | null>(null);
  const paid = status === "CONFIRMED" || status === "COMPLETED";
  const visibleMeetingPoints = meetingPoints.length
    ? meetingPoints
    : [{
        id: "legacy-location",
        label: "Punto de encuentro",
        address: meetingPoint,
        mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(meetingPoint)}`,
      }];
  const steps = [
    { label: "Reservación", complete: status !== "DRAFT" }, { label: "Pago", complete: paid },
    { label: "Responsivas", complete: participants > 0 && signed >= participants }, { label: "Preparación", complete: done.size >= checklist.length },
    { label: "Check-in", complete: participants > 0 && checkedIn >= participants },
  ];
  const toggle = async (key: string) => {
    const completed = !done.has(key);
    const previous = new Set(done);
    const next = new Set(done);
    if (completed) next.add(key);
    else next.delete(key);
    setDone(next);
    setNotice("");
    try {
      const response = await fetch("/api/adventure-checklist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookingId, itemKey: key, completed }) });
      if (!response.ok) throw new Error("Checklist save failed");
    } catch {
      setDone(previous);
      setNotice("No pudimos guardar este cambio.");
    }
  };
  const submitReview = async () => {
    setSavingReview(true); setNotice("");
    const response = await fetch("/api/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookingId, routeRating: review.route_rating, guideRating: review.guide_rating, transportRating: review.transport_rating, body: review.body }) });
    const result = await response.json() as { error?: string }; setSavingReview(false);
    setNotice(response.ok ? "Tu reseña verificada quedó publicada." : result.error ?? "No pudimos guardar la reseña.");
  };
  const downloadProtected = async (
    kind: "calendar" | "guide",
    filename: string,
  ) => {
    setDownloading(kind);
    setNotice("");
    try {
      const response = await fetch(`/api/bookings/${bookingId}/${kind}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (response.status === 401) {
        window.location.assign(
          `/ingresar?next=${encodeURIComponent(window.location.pathname)}`,
        );
        return;
      }
      if (!response.ok)
        throw new Error(
          (await response.text()) || "No pudimos preparar el archivo.",
        );
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
      setNotice(
        kind === "calendar"
          ? "El evento quedó listo para agregar a tu calendario."
          : "La guía se descargó correctamente.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "No pudimos descargar el archivo.",
      );
    } finally {
      setDownloading(null);
    }
  };
  return <section className="adventure-center">
    <div className="adventure-center-heading"><div><p className="eyebrow">CENTRO DE AVENTURA</p><h2>Todo lo que necesitas, en un solo lugar.</h2></div><span>{daysUntil} DÍAS</span></div>
    <div className="adventure-progress">{steps.map((step) => <div className={step.complete ? "complete" : ""} key={step.label}><i>{step.complete ? <Check /> : null}</i><span>{step.label}</span></div>)}</div>
    <div className="adventure-tool-grid">
      <button type="button" disabled={downloading !== null} onClick={() => void downloadProtected("calendar", "aventura-the-doggy-gang.ics")}><CalendarPlus /><span><strong>{downloading === "calendar" ? "Preparando calendario…" : "Agregar al calendario"}</strong><small>Incluye alerta un día antes</small></span></button>
      {visibleMeetingPoints.map((point) => <a className="meeting-point-tool" href={point.mapsUrl} target="_blank" rel="noreferrer" key={point.id}><MapPin /><span><strong>{meetingPoints.length > 1 ? point.label : "Abrir ubicación"}</strong><small>{point.address || "Abrir ubicación exacta"}</small>{meetingPoints.length > 1 && <em>ABRIR EN MAPS</em>}</span></a>)}
      <button type="button" disabled={downloading !== null} onClick={() => void downloadProtected("guide", "guia-the-doggy-gang.pdf")}><Download /><span><strong>{downloading === "guide" ? "Preparando guía…" : "Descargar guía"}</strong><small>PDF para consultar sin conexión</small></span></button>
      <Link href={shopUrl}><ShoppingBag /><span><strong>Agregar productos</strong><small>Recíbelos durante este hike</small></span></Link>
    </div>
    <div className="adventure-prep"><div><span>LISTA PERSONAL</span><strong>{done.size}/{checklist.length} preparados</strong></div>{checklist.map(([key,label]) => <button type="button" className={done.has(key) ? "done" : ""} key={key} onClick={() => void toggle(key)}><i>{done.has(key) && <Check />}</i>{label}</button>)}</div>
    {canReview && <div className="verified-review"><div><Star /><span><strong>Cuenta cómo estuvo</strong><small>Reseña verificada por tu reservación</small></span></div><label>RUTA<select value={review.route_rating} onChange={(e) => setReview({...review,route_rating:Number(e.target.value)})}>{[5,4,3,2,1].map(v=><option key={v} value={v}>{v} de 5</option>)}</select></label><label>GUÍAS<select value={review.guide_rating} onChange={(e) => setReview({...review,guide_rating:Number(e.target.value)})}>{[5,4,3,2,1].map(v=><option key={v} value={v}>{v} de 5</option>)}</select></label><textarea aria-label="Comentario" maxLength={1200} placeholder="¿Qué le dirías a otra persona sobre esta aventura?" value={review.body} onChange={(e)=>setReview({...review,body:e.target.value})}/><button className="button button-dark" type="button" disabled={savingReview} onClick={() => void submitReview()}>{savingReview ? "GUARDANDO…" : initialReview ? "ACTUALIZAR RESEÑA" : "PUBLICAR RESEÑA"}</button></div>}
    {notice && <p className="adventure-center-notice" role="status">{notice}</p>}
  </section>;
}
