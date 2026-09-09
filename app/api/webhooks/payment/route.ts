import { createClient } from "@supabase/supabase-js";

async function hasValidSignature(
  body: string,
  secret: string,
  signature: string,
) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signatureBytes = Uint8Array.from(
    signature.match(/.{2}/g) ?? [],
    (pair) => Number.parseInt(pair, 16),
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(body),
  );
}

export async function POST(request: Request) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  const received = request.headers.get("x-doggy-signature");
  const raw = await request.text();
  if (!secret || !received || !(await hasValidSignature(raw, secret, received)))
    return Response.json({ error: "Firma inválida" }, { status: 401 });
  const payload = JSON.parse(raw) as {
    provider: string;
    paymentId: string;
    status: string;
    paidAt?: string;
  };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey)
    return Response.json({ error: "Servicio no configurado" }, { status: 503 });
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  const status =
    payload.status === "paid"
      ? "PAID"
      : payload.status === "failed"
        ? "FAILED"
        : "PENDING";
  const { data, error } = await supabase
    .from("payments")
    .update({
      status,
      raw_status: payload.status,
      paid_at:
        payload.paidAt ?? (status === "PAID" ? new Date().toISOString() : null),
    })
    .eq("provider", payload.provider)
    .eq("provider_payment_id", payload.paymentId)
    .select("order_id")
    .single();
  if (error)
    return Response.json({ error: "Pago no encontrado" }, { status: 404 });
  if (status === "PAID")
    await supabase
      .from("orders")
      .update({ status: "PAID" })
      .eq("id", data.order_id);
  return Response.json({ received: true });
}
