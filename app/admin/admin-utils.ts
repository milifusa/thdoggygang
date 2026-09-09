export function profileName(profileValue: unknown) {
  const profile = Array.isArray(profileValue) ? profileValue[0] : profileValue;
  if (!profile || typeof profile !== "object") return "Cliente";
  const value = profile as { first_name?: string; last_name?: string };
  return (
    `${value.first_name ?? ""} ${value.last_name ?? ""}`.trim() || "Cliente"
  );
}

export function money(cents: number | null | undefined) {
  return ((cents ?? 0) / 100).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });
}

export function bookingStatus(status: string) {
  return (
    (
      {
        CONFIRMED: "CONFIRMADA",
        PENDING_PAYMENT: "PAGO PENDIENTE",
        DRAFT: "BORRADOR",
        CANCELLED: "CANCELADA",
        COMPLETED: "COMPLETADA",
      } as Record<string, string>
    )[status] ?? status
  );
}

export function paymentStatus(status: string) {
  return (
    (
      {
        PAID: "PAGADO",
        PENDING: "PENDIENTE",
        UNDER_REVIEW: "POR REVISAR",
        FAILED: "FALLIDO",
        REFUNDED: "REEMBOLSADO",
        CANCELLED: "CANCELADO",
      } as Record<string, string>
    )[status] ?? status
  );
}

export function adminDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(new Date(value));
}
