"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Mail,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  EMAIL_TEMPLATE_DEFINITIONS,
  type EmailTemplateKey,
} from "../../lib/email-template-config";

type Delivery = {
  id: string;
  template_key: string;
  recipient: string;
  subject: string;
  status: string;
  source: string;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  created_at: string;
  booking: { booking_number: string } | null;
};

const stateLabels: Record<string, string> = {
  QUEUED: "En cola",
  SENT: "Enviado",
  DELAYED: "Demorado",
  DELIVERED: "Entregado",
  OPENED: "Abierto",
  CLICKED: "Enlace abierto",
  BOUNCED: "Rebotado",
  COMPLAINED: "Reportado",
  FAILED: "Falló",
  SUPPRESSED: "Bloqueado",
};

const problemStates = new Set([
  "BOUNCED",
  "COMPLAINED",
  "FAILED",
  "SUPPRESSED",
]);

function date(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function EmailDeliveryHistory({
  initialDeliveries,
}: {
  initialDeliveries: Delivery[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return initialDeliveries.filter((delivery) => {
      const stateMatches =
        filter === "ALL" ||
        (filter === "PROBLEM" && problemStates.has(delivery.status)) ||
        delivery.status === filter;
      const textMatches =
        !needle ||
        [delivery.recipient, delivery.subject, delivery.booking?.booking_number]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(needle));
      return stateMatches && textMatches;
    });
  }, [filter, initialDeliveries, query]);
  const delivered = initialDeliveries.filter((item) =>
    ["DELIVERED", "OPENED", "CLICKED"].includes(item.status),
  ).length;
  const opened = initialDeliveries.filter((item) =>
    ["OPENED", "CLICKED"].includes(item.status),
  ).length;
  const problems = initialDeliveries.filter((item) =>
    problemStates.has(item.status),
  ).length;

  async function resend(delivery: Delivery) {
    setBusy(delivery.id);
    setMessage("");
    const response = await fetch(
      `/api/admin/email-deliveries/${delivery.id}/resend`,
      {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      },
    );
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok)
      setMessage(result.error ?? "No pudimos reenviar el correo.");
    else {
      setMessage(`Correo reenviado a ${delivery.recipient}.`);
      router.refresh();
    }
    setBusy(null);
  }

  return (
    <section className="email-delivery-section">
      <header>
        <div>
          <span>ACTIVIDAD DE CORREOS</span>
          <h2>Envíos y entregas.</h2>
          <p>
            Consulta qué salió, qué llegó y qué necesita atención. Los enlaces
            se regeneran al reenviar.
          </p>
        </div>
        <div className="email-delivery-kpis">
          <b>
            <Mail aria-hidden="true" />
            {initialDeliveries.length}
            <small>registrados</small>
          </b>
          <b>
            <CheckCircle2 aria-hidden="true" />
            {delivered}
            <small>entregados</small>
          </b>
          <b>
            <Mail aria-hidden="true" />
            {opened}
            <small>abiertos</small>
          </b>
          <b className={problems ? "warning" : ""}>
            <TriangleAlert aria-hidden="true" />
            {problems}
            <small>con problema</small>
          </b>
        </div>
      </header>
      <div className="email-delivery-toolbar">
        <label>
          <Search aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Correo, asunto o reservación"
          />
        </label>
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="ALL">Todos los estados</option>
          <option value="SENT">Enviados</option>
          <option value="DELIVERED">Entregados</option>
          <option value="OPENED">Abiertos</option>
          <option value="CLICKED">Con clic</option>
          <option value="PROBLEM">Con problema</option>
        </select>
      </div>
      {message ? <p className="email-delivery-message">{message}</p> : null}
      <div className="email-delivery-list">
        {rows.length ? (
          rows.map((delivery) => {
            const definition =
              EMAIL_TEMPLATE_DEFINITIONS[
                delivery.template_key as EmailTemplateKey
              ];
            return (
              <article key={delivery.id}>
                <div className="email-delivery-main">
                  <span>{definition?.label ?? delivery.template_key}</span>
                  <strong>{delivery.recipient}</strong>
                  <p>{delivery.subject}</p>
                  {delivery.booking?.booking_number ? (
                    <small>{delivery.booking.booking_number}</small>
                  ) : null}
                </div>
                <div className="email-delivery-state">
                  <b data-state={delivery.status}>
                    {stateLabels[delivery.status] ?? delivery.status}
                  </b>
                  <small>
                    {date(
                      delivery.clicked_at ??
                        delivery.opened_at ??
                        delivery.delivered_at ??
                        delivery.sent_at ??
                        delivery.created_at,
                    )}
                  </small>
                  {delivery.error_message ? (
                    <em>{delivery.error_message}</em>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={
                    busy === delivery.id || delivery.status === "QUEUED"
                  }
                  onClick={() => void resend(delivery)}
                >
                  <RefreshCw aria-hidden="true" />
                  {busy === delivery.id ? "REENVIANDO" : "REENVIAR"}
                </button>
              </article>
            );
          })
        ) : (
          <p className="email-delivery-empty">
            No hay correos que coincidan con los filtros.
          </p>
        )}
      </div>
    </section>
  );
}
