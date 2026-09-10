import { z } from "zod";
import { adminClient } from "../../hikes/route";

function cell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const hikeId = new URL(request.url).searchParams.get("hike");
  if (!z.string().uuid().safeParse(hikeId).success)
    return Response.json({ error: "Hike inválido." }, { status: 400 });
  const supabase = await adminClient();
  if (!supabase)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const { data: hike } = await supabase
    .from("hikes")
    .select("slug")
    .eq("id", hikeId!)
    .single();
  const { data: rows } = await supabase
    .from("payments")
    .select(
      "provider,provider_payment_id,method,status,amount_cents,paid_at,created_at,order:orders(order_number,booking:bookings!inner(hike_id,booking_number,profile:profiles!bookings_profile_id_fkey(first_name,last_name,email)))",
    )
    .eq("order.booking.hike_id", hikeId!)
    .order("created_at");
  const output: unknown[][] = [
    [
      "Orden",
      "Reservación",
      "Cliente",
      "Email",
      "Método",
      "Proveedor",
      "Estatus",
      "Monto MXN",
      "Fecha",
      "Referencia",
    ],
  ];
  for (const payment of rows ?? []) {
    const order = Array.isArray(payment.order)
      ? payment.order[0]
      : payment.order;
    const booking = Array.isArray(order?.booking)
      ? order.booking[0]
      : order?.booking;
    const p = Array.isArray(booking?.profile)
      ? booking.profile[0]
      : booking?.profile;
    output.push([
      order?.order_number,
      booking?.booking_number,
      `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim(),
      p?.email,
      payment.method,
      payment.provider,
      payment.status,
      (payment.amount_cents / 100).toFixed(2),
      payment.paid_at ?? payment.created_at,
      payment.provider_payment_id,
    ]);
  }
  const body =
    "\uFEFF" + output.map((row) => row.map(cell).join(",")).join("\r\n");
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="pagos-${hike?.slug ?? "hike"}.csv"`,
    },
  });
}
