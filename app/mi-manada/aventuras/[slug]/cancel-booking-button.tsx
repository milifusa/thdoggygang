"use client";
import { useState } from "react";
import { CircleX } from "lucide-react";

export function CancelBookingButton({
  bookingId,
  status,
  hasRequest,
}: {
  bookingId: string;
  status: string;
  hasRequest: boolean;
}) {
  const [message, setMessage] = useState(
    hasRequest ? "Tu solicitud está pendiente de revisión." : "",
  );
  const [busy, setBusy] = useState(false);
  if (["CANCELLED", "COMPLETED"].includes(status)) return null;
  const cancel = async () => {
    const reason = window
      .prompt(
        "Cuéntanos el motivo de la cancelación. Aplicaremos la política de este hike.",
      )
      ?.trim();
    if (!reason) return;
    setBusy(true);
    const response = await fetch(`/api/bookings/${bookingId}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const result = (await response.json()) as {
      error?: string;
      status?: string;
    };
    setBusy(false);
    if (!response.ok)
      return setMessage(result.error ?? "No pudimos registrar la cancelación.");
    setMessage(
      result.status === "REQUESTED"
        ? "Solicitud enviada. El equipo revisará el reembolso según la política del hike."
        : "Reservación cancelada.",
    );
    if (result.status === "CANCELLED")
      window.setTimeout(() => window.location.assign("/mi-manada"), 700);
  };
  return (
    <div className="ticket-cancel-action">
      <button disabled={busy || hasRequest} onClick={() => void cancel()}>
        <CircleX />
        {busy
          ? "ENVIANDO…"
          : hasRequest
            ? "CANCELACIÓN SOLICITADA"
            : "SOLICITAR CANCELACIÓN"}
      </button>
      {message && <small role="status">{message}</small>}
    </div>
  );
}
