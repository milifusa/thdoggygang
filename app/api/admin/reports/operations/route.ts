import { z } from "zod";
import { adminClient } from "../../hikes/route";
const kindSchema = z.enum(["products", "photos", "transport", "cancellations"]);
const cell = (value: unknown) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;
const one = <T>(value: T | T[] | null | undefined) =>
  Array.isArray(value) ? value[0] : value;
function output(rows: unknown[][], name: string) {
  return new Response(
    "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n"),
    {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${name}.csv"`,
      },
    },
  );
}
export async function GET(request: Request) {
  const url = new URL(request.url);
  const hikeId = url.searchParams.get("hike");
  const kind = kindSchema.safeParse(url.searchParams.get("kind"));
  if (!z.string().uuid().safeParse(hikeId).success || !kind.success)
    return Response.json({ error: "Reporte inválido." }, { status: 400 });
  const supabase = await adminClient();
  if (!supabase)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  const { data: hike } = await supabase
    .from("hikes")
    .select("slug")
    .eq("id", hikeId!)
    .single();
  if (kind.data === "transport") {
    const { data } = await supabase
      .from("bookings")
      .select(
        "booking_number,status,profile:profiles!bookings_profile_id_fkey(first_name,last_name,email,phone),transport_reservations(id,price_cents,booking_participant:booking_participants(snapshot))",
      )
      .eq("hike_id", hikeId!);
    const rows: unknown[][] = [
      [
        "Reservación",
        "Estatus",
        "Cliente",
        "Email",
        "Teléfono",
        "Pasajero",
        "Costo MXN",
      ],
    ];
    for (const booking of data ?? []) {
      const profile = one(booking.profile);
      for (const transport of booking.transport_reservations ?? []) {
        const participant = one(transport.booking_participant);
        const snapshot = participant?.snapshot as
          | { first_name?: string; last_name?: string }
          | undefined;
        rows.push([
          booking.booking_number,
          booking.status,
          `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim(),
          profile?.email,
          profile?.phone,
          `${snapshot?.first_name ?? ""} ${snapshot?.last_name ?? ""}`.trim(),
          (transport.price_cents / 100).toFixed(2),
        ]);
      }
    }
    return output(rows, `transporte-${hike?.slug ?? "hike"}`);
  }
  if (kind.data === "cancellations") {
    const { data } = await supabase
      .from("booking_cancellation_requests")
      .select(
        "status,reason,refundable_amount_cents,created_at,resolved_at,resolution_note,booking:bookings!inner(booking_number,hike_id,profile:profiles!bookings_profile_id_fkey(first_name,last_name,email))",
      )
      .eq("booking.hike_id", hikeId!);
    const rows: unknown[][] = [
      [
        "Reservación",
        "Cliente",
        "Email",
        "Estatus",
        "Motivo",
        "Reembolso MXN",
        "Solicitada",
        "Resuelta",
        "Resolución",
      ],
    ];
    for (const item of data ?? []) {
      const booking = one(item.booking);
      const profile = one(booking?.profile);
      rows.push([
        booking?.booking_number,
        `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim(),
        profile?.email,
        item.status,
        item.reason,
        (item.refundable_amount_cents / 100).toFixed(2),
        item.created_at,
        item.resolved_at,
        item.resolution_note,
      ]);
    }
    return output(rows, `cancelaciones-${hike?.slug ?? "hike"}`);
  }
  const itemType = kind.data === "products" ? "PRODUCT" : "PHOTO";
  const { data } = await supabase
    .from("order_items")
    .select(
      "description,quantity,unit_price_cents,created_at,order:orders(order_number,status,fulfillment_mode,pickup_hike_id,booking:bookings(hike_id,booking_number),profile:profiles(first_name,last_name,email))",
    )
    .eq("item_type", itemType)
    .order("created_at");
  const rows: unknown[][] = [
    [
      "Orden",
      "Reservación",
      "Cliente",
      "Email",
      "Artículo",
      "Cantidad",
      "Precio unitario MXN",
      "Total MXN",
      "Estatus",
      "Entrega",
      "Fecha",
    ],
  ];
  for (const item of data ?? []) {
    const order = one(item.order);
    const booking = one(order?.booking);
    if ((booking?.hike_id ?? order?.pickup_hike_id) !== hikeId) continue;
    const profile = one(order?.profile);
    rows.push([
      order?.order_number,
      booking?.booking_number,
      `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim(),
      profile?.email,
      item.description,
      item.quantity,
      (item.unit_price_cents / 100).toFixed(2),
      ((item.unit_price_cents * item.quantity) / 100).toFixed(2),
      order?.status,
      order?.fulfillment_mode,
      item.created_at,
    ]);
  }
  return output(rows, `${kind.data}-${hike?.slug ?? "hike"}`);
}
