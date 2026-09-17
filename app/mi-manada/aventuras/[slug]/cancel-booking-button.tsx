"use client";

import { useState } from "react";
import { CircleX, Clock3, Dog, WalletCards, X } from "lucide-react";

const currency = (cents: number) =>
  (cents / 100).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });

export function CancelBookingButton({
  bookingId,
  status,
  hasRequest,
  hoursRemaining,
  totalCents,
  minimumNoticeHours,
  policyText,
  lateMessage,
}: {
  bookingId: string;
  status: string;
  hasRequest: boolean;
  hoursRemaining: number;
  totalCents: number;
  minimumNoticeHours: number;
  policyText: string;
  lateMessage: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState(
    hasRequest ? "Tu solicitud está pendiente de revisión." : "",
  );
  const [busy, setBusy] = useState(false);
  if (["CANCELLED", "COMPLETED"].includes(status)) return null;
  const eligible = hoursRemaining >= minimumNoticeHours;
  const createsCredit = status === "CONFIRMED";
  const cancel = async () => {
    if (reason.trim().length < 10) {
      setMessage("Cuéntanos el motivo con al menos 10 caracteres.");
      return;
    }
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/bookings/${bookingId}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      creditAmountCents?: number;
    };
    setBusy(false);
    if (!response.ok) return setMessage(result.error ?? "No pudimos registrar la cancelación.");
    setMessage(
      result.creditAmountCents
        ? `Cancelación lista. Agregamos ${currency(result.creditAmountCents)} a tu crédito de la manada.`
        : "Reservación cancelada.",
    );
    window.setTimeout(() => window.location.assign("/mi-manada"), 1400);
  };
  return (
    <div className="ticket-cancel-action">
      <button disabled={busy || hasRequest} onClick={() => setOpen(true)}>
        <CircleX />
        {hasRequest ? "CANCELACIÓN SOLICITADA" : "CANCELAR MI LUGAR"}
      </button>
      {message && <small role="status">{message}</small>}
      {open && (
        <div className="cancellation-dialog-backdrop" role="presentation">
          <section className="cancellation-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
            <button className="cancellation-dialog-close" onClick={() => setOpen(false)} aria-label="Cerrar"><X /></button>
            <div className="cancellation-dialog-icon"><Dog /></div>
            <p className="eyebrow">CANCELACIÓN DE AVENTURA</p>
            <h2 id="cancel-title">{eligible ? "Antes de soltar tu lugar…" : "La manada ya está en marcha."}</h2>
            <div className={`cancellation-deadline-card ${eligible ? "eligible" : "late"}`}>
              <Clock3 />
              <div><strong>{hoursRemaining} HORAS PARA EL HIKE</strong><span>El plazo cierra {minimumNoticeHours} horas antes.</span></div>
            </div>
            {eligible ? (
              <>
                <div className="cancellation-credit-card">
                  <WalletCards />
                  <div>
                    <strong>{createsCredit ? `${currency(totalCents)} EN CRÉDITO` : "SIN CARGO PENDIENTE"}</strong>
                    <p>{createsCredit ? "No devolvemos dinero al método original. Este monto quedará en tu cuenta para pagar otro hike." : "Como esta reservación aún no está pagada, se cancelará sin generar crédito."}</p>
                  </div>
                </div>
                <p className="cancellation-policy-copy">{policyText}</p>
                <label className="cancellation-reason">¿POR QUÉ NO PODRÁS ACOMPAÑARNOS?<textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Cuéntanos brevemente…" /></label>
                {message && <p className="cancellation-dialog-message" role="alert">{message}</p>}
                <button className="cancellation-confirm" disabled={busy || reason.trim().length < 10} onClick={() => void cancel()}>{busy ? "CANCELANDO…" : createsCredit ? "CANCELAR Y GUARDAR MI CRÉDITO" : "CANCELAR RESERVACIÓN"}</button>
              </>
            ) : (
              <>
                <p className="cancellation-late-copy">{lateMessage}</p>
                <p className="cancellation-help-copy">Si ocurrió algo extraordinario, escríbenos para que el equipo revise tu caso personalmente.</p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
