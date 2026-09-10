"use client";
import { useRef, useState } from "react";
import {
  CircleX,
  Download,
  Mail,
  RefreshCw,
  RotateCcw,
  Save,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

export function ReservationQr({
  bookingId,
  enabled,
}: {
  bookingId: string;
  enabled: boolean;
}) {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const load = async (method: "GET" | "POST" = "GET") => {
    setLoading(true);
    const response = await fetch(`/api/admin/bookings/${bookingId}/qr`, {
      method,
    });
    const payload = (await response.json()) as {
      token?: string;
      error?: string;
    };
    if (payload.token) setToken(payload.token);
    setMessage(
      payload.error ??
        (method === "POST" ? "QR anterior revocado. Nuevo QR generado." : ""),
    );
    setLoading(false);
  };
  const download = () => {
    const svg = wrap.current?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
      type: "image/svg+xml",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `qr-${bookingId}.svg`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <div className="reservation-qr-action">
      <div ref={wrap}>
        {token ? (
          <QRCodeSVG value={token} size={190} level="M" />
        ) : (
          <button onClick={() => void load()} disabled={loading || !enabled}>
            {loading ? <RefreshCw className="spin" /> : null}
            {enabled ? "MOSTRAR QR" : "QR NO DISPONIBLE"}
          </button>
        )}
      </div>
      {token && (
        <div>
          <button onClick={download}>
            <Download />
            DESCARGAR
          </button>
          <button onClick={() => void load("POST")} disabled={loading}>
            <RefreshCw />
            REGENERAR Y REVOCAR ANTERIOR
          </button>
        </div>
      )}
      {message && <small>{message}</small>}
    </div>
  );
}
export function DetailReminder({ bookingId }: { bookingId: string }) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const send = async () => {
    setLoading(true);
    const response = await fetch(`/api/admin/bookings/${bookingId}/remind`, {
      method: "POST",
    });
    const payload = (await response.json()) as {
      error?: string;
      recipient?: string;
    };
    setMessage(
      response.ok
        ? `Enviado a ${payload.recipient}`
        : (payload.error ?? "No enviado"),
    );
    setLoading(false);
  };
  return (
    <div className="detail-action">
      <button disabled={loading} onClick={() => void send()}>
        {loading ? <RefreshCw className="spin" /> : <Mail />}ENVIAR RECORDATORIO
      </button>
      {message && <small>{message}</small>}
    </div>
  );
}
export function BookingNote({ bookingId }: { bookingId: string }) {
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const save = async () => {
    const response = await fetch(`/api/admin/bookings/${bookingId}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const payload = (await response.json()) as { error?: string };
    if (response.ok) {
      setBody("");
      setMessage("Nota guardada. Recarga para verla en el historial.");
    } else setMessage(payload.error ?? "No guardada");
  };
  return (
    <div className="booking-note-form">
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Añadir una nota operativa privada"
      />
      <button disabled={body.trim().length < 2} onClick={() => void save()}>
        <Save />
        GUARDAR NOTA
      </button>
      {message && <small>{message}</small>}
    </div>
  );
}
export function FulfillmentControl({
  id,
  status,
  location,
  note,
}: {
  id: string;
  status: string;
  location: string | null;
  note: string | null;
}) {
  const [current, setCurrent] = useState(status);
  const [saving, setSaving] = useState(false);
  const save = async (value: string) => {
    let deliveryLocation = location ?? undefined;
    let deliveryNote = note ?? undefined;
    let trackingNumber: string | undefined;
    if (value === "DELIVERED") {
      deliveryLocation =
        window
          .prompt("Lugar de entrega", location ?? "Punto de encuentro")
          ?.trim() || undefined;
      deliveryNote =
        window.prompt("Nota de entrega (opcional)", note ?? "")?.trim() ||
        undefined;
      if (!deliveryLocation) return;
    }
    if (value === "SHIPPED") {
      trackingNumber =
        window.prompt("Número de guía o seguimiento")?.trim() || undefined;
      if (!trackingNumber) return;
    }
    setSaving(true);
    const response = await fetch(`/api/admin/fulfillments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: value,
        deliveryLocation,
        note: deliveryNote,
        trackingNumber,
      }),
    });
    if (response.ok) setCurrent(value);
    setSaving(false);
  };
  return (
    <select
      value={current}
      disabled={saving}
      onChange={(event) => void save(event.target.value)}
    >
      <option value="PENDING">Pendiente</option>
      <option value="PREPARED">Preparado</option>
      <option value="DELIVERED">Entregado</option>
      <option value="SHIPPED">Enviado</option>
      <option value="CANCELLED">Cancelado</option>
    </select>
  );
}

export function CheckinCorrection({ checkinId }: { checkinId: string }) {
  const [message, setMessage] = useState("");
  const correct = async () => {
    const reason = window
      .prompt("Motivo obligatorio para corregir este check-in")
      ?.trim();
    if (!reason) return;
    const response = await fetch(`/api/admin/checkins/${checkinId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const payload = (await response.json()) as { error?: string };
    if (response.ok) window.location.reload();
    else setMessage(payload.error ?? "No se pudo corregir.");
  };
  return (
    <span className="checkin-correction">
      <button onClick={() => void correct()}>CORREGIR CHECK-IN</button>
      {message && <small>{message}</small>}
    </span>
  );
}

export function AdminBookingActions({
  bookingId,
  status,
  hasPaidPayment,
  hasCancellationRequest,
}: {
  bookingId: string;
  status: string;
  hasPaidPayment: boolean;
  hasCancellationRequest: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (
    action: "CANCEL" | "COMPLETE" | "REOPEN" | "REJECT_CANCELLATION" | "REFUND",
  ) => {
    const label =
      action === "REFUND"
        ? "reembolso"
        : action === "REJECT_CANCELLATION"
          ? "rechazo"
          : "cambio";
    const reason = window
      .prompt(`Motivo obligatorio para este ${label}`)
      ?.trim();
    if (!reason) return;
    if (
      (action === "REFUND" || action === "CANCEL") &&
      !window.confirm(
        action === "REFUND"
          ? "Se devolverá el pago, se restaurará el inventario comprado y se liberarán los lugares de personas y perritos. ¿Continuar?"
          : "Se cancelará la reservación y se liberarán los lugares de personas y perritos. Esta acción no devuelve pagos. ¿Continuar?",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/admin/bookings/${bookingId}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    const result = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok)
      return setMessage(result.error ?? "No pudimos completar la acción.");
    window.location.reload();
  };
  return (
    <div className="admin-booking-actions">
      <strong>ACCIONES DE RESERVACIÓN</strong>
      <p className="booking-capacity-note">
        {hasPaidPayment
          ? "REEMBOLSAR Y CANCELAR devuelve el pago, repone el inventario y libera el cupo una sola vez. Mientras una solicitud esté pendiente, sus lugares continúan reservados."
          : "CANCELAR libera los lugares de personas y perritos. Esta reservación no tiene un pago confirmado que devolver."}
      </p>
      <div>
        {!["CANCELLED", "COMPLETED"].includes(status) && (
          <button disabled={busy} onClick={() => void run("CANCEL")}>
            <CircleX />
            CANCELAR
          </button>
        )}
        {status === "CONFIRMED" && (
          <button disabled={busy} onClick={() => void run("COMPLETE")}>
            <Save />
            MARCAR COMPLETADA
          </button>
        )}
        {status === "CANCELLED" && !hasPaidPayment && (
          <button disabled={busy} onClick={() => void run("REOPEN")}>
            <RotateCcw />
            REABRIR COMO BORRADOR
          </button>
        )}
        {hasPaidPayment && status !== "CANCELLED" && (
          <button
            className="danger"
            disabled={busy}
            onClick={() => void run("REFUND")}
          >
            <RotateCcw />
            REEMBOLSAR Y CANCELAR
          </button>
        )}
        {hasCancellationRequest && (
          <button
            disabled={busy}
            onClick={() => void run("REJECT_CANCELLATION")}
          >
            RECHAZAR SOLICITUD
          </button>
        )}
      </div>
      {message && <small role="alert">{message}</small>}
    </div>
  );
}
