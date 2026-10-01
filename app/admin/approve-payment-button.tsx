"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ApprovePaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const approve = async () => {
    setState("saving");
    const response = await fetch(`/api/admin/payments/${paymentId}/approve`, {
      method: "POST",
    });
    if (!response.ok) {
      setState("error");
      return;
    }
    router.refresh();
  };
  return (
    <button
      className="approve-payment"
      onClick={approve}
      disabled={state === "saving"}
    >
      {state === "saving"
        ? "APROBANDO…"
        : state === "error"
          ? "REINTENTAR"
          : "APROBAR PAGO →"}
    </button>
  );
}

function pesosToCents(value: string) {
  const normalized = value.trim().replace(/[$,\s]/gu, "");
  if (!/^\d+(?:\.\d{1,2})?$/u.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function RejectTransferPaymentButton({
  paymentId,
  expectedAmountCents,
}: {
  paymentId: string;
  expectedAmountCents: number;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const reject = async () => {
    const amount = window.prompt(
      "Monto que realmente llegó al banco en MXN. Escribe 0 si no recibieron dinero.",
      "0.00",
    );
    if (amount === null) return;
    const receivedAmountCents = pesosToCents(amount);
    if (
      receivedAmountCents === null ||
      receivedAmountCents < 0 ||
      receivedAmountCents >= expectedAmountCents
    ) {
      setState("error");
      setMessage(
        "Escribe un importe válido menor al total esperado. Si llegó completo, aprueba el pago.",
      );
      return;
    }
    const reason = window
      .prompt("Motivo del rechazo", "Transferencia incompleta")
      ?.trim();
    if (!reason) return;
    const credit = (receivedAmountCents / 100).toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
    });
    if (
      !window.confirm(
        `Se cancelará la reservación y se abonarán ${credit} como crédito, exactamente el importe recibido. ¿Continuar?`,
      )
    )
      return;

    setState("saving");
    setMessage("");
    const response = await fetch(`/api/admin/payments/${paymentId}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason, receivedAmountCents }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) {
      setState("error");
      setMessage(payload.error ?? "No pudimos rechazar la transferencia.");
      return;
    }
    router.refresh();
  };
  return (
    <span className="reject-transfer-control">
      <button
        className="reject-payment"
        onClick={() => void reject()}
        disabled={state === "saving"}
      >
        {state === "saving" ? "RECHAZANDO…" : "RECHAZAR TRANSFERENCIA"}
      </button>
      {message && <small role="alert">{message}</small>}
    </span>
  );
}

export function RefundPaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const refund = async () => {
    const reason = window.prompt("Motivo del reembolso")?.trim();
    if (
      !reason ||
      !window.confirm("¿Procesar el reembolso total de este pago?")
    )
      return;
    setState("saving");
    const response = await fetch(`/api/admin/payments/${paymentId}/refund`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (!response.ok) {
      setState("error");
      return;
    }
    router.refresh();
  };
  return (
    <button
      className="refund-payment"
      onClick={() => void refund()}
      disabled={state === "saving"}
    >
      {state === "saving"
        ? "REEMBOLSANDO…"
        : state === "error"
          ? "REINTENTAR REEMBOLSO"
          : "REEMBOLSAR"}
    </button>
  );
}
