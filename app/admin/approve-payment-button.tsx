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
