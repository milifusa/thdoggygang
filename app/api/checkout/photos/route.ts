import { z } from "zod";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../lib/supabase/service";
import { getStripeSecretKey } from "../../../lib/payment-config";

const schema = z.object({
  photoIds: z.array(z.string().uuid()).min(1).max(500),
  hikeSlug: z.string().min(1).max(160),
  purchaseMode: z
    .enum(["INDIVIDUAL", "FIVE", "TEN", "FULL"])
    .default("INDIVIDUAL"),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Selecciona al menos una foto." },
      { status: 400 },
    );
  const stripeKey = await getStripeSecretKey();
  if (!stripeKey)
    return Response.json(
      { error: "El pago con tarjeta aún no está configurado." },
      { status: 503 },
    );
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return Response.json(
      { error: "Inicia sesión para comprar tus fotos." },
      { status: 401 },
    );
  const service = createSupabaseServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("id,email")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile)
    return Response.json(
      { error: "No encontramos tu perfil." },
      { status: 404 },
    );
  const ids = [...new Set(parsed.data.photoIds)];
  const { data: photos } = await service
    .from("photos")
    .select(
      "id,title,price_cents,gallery:hike_galleries!photos_gallery_id_fkey(id,published_at,package_5_price_cents,package_10_price_cents,full_gallery_price_cents,hike:hikes!inner(id,slug,name))",
    )
    .in("id", ids)
    .eq("access", "PAID")
    .eq("hidden", false)
    .is("deleted_at", null);
  const valid = (photos ?? []).filter((photo) => {
    const g = Array.isArray(photo.gallery) ? photo.gallery[0] : photo.gallery;
    const h = Array.isArray(g?.hike) ? g.hike[0] : g?.hike;
    return g?.published_at && h?.slug === parsed.data.hikeSlug;
  });
  if (valid.length !== ids.length)
    return Response.json(
      { error: "Una de las fotos ya no está disponible." },
      { status: 409 },
    );
  const galleryValue = (valid[0] && Array.isArray(valid[0].gallery)
    ? valid[0].gallery[0]
    : valid[0]?.gallery) as unknown as {
    id: string;
    package_5_price_cents: number | null;
    package_10_price_cents: number | null;
    full_gallery_price_cents: number | null;
    hike: { id: string } | Array<{ id: string }>;
  } | null;
  const galleryHike =
    galleryValue &&
    (Array.isArray(galleryValue.hike)
      ? galleryValue.hike[0]
      : galleryValue.hike);
  const { data: attendance } = galleryHike
    ? await service
        .from("bookings")
        .select("id")
        .eq("profile_id", profile.id)
        .eq("hike_id", galleryHike.id)
        .in("status", ["CONFIRMED", "COMPLETED"])
        .limit(1)
        .maybeSingle()
    : { data: null };
  if (!attendance)
    return Response.json(
      { error: "Esta galería es exclusiva para asistentes confirmados." },
      { status: 403 },
    );
  const mode = parsed.data.purchaseMode;
  const expectedCount = mode === "FIVE" ? 5 : mode === "TEN" ? 10 : null;
  if (expectedCount && ids.length !== expectedCount)
    return Response.json(
      { error: `Este paquete requiere exactamente ${expectedCount} fotos.` },
      { status: 409 },
    );
  if (mode === "FULL") {
    const { data: allPaid } = await service
      .from("photos")
      .select("id")
      .eq("gallery_id", galleryValue?.id)
      .eq("access", "PAID")
      .eq("hidden", false)
      .is("deleted_at", null);
    const { data: owned } = await service
      .from("photo_purchases")
      .select(
        "photo_id,order_item:order_items!inner(order:orders!inner(status))",
      )
      .eq("profile_id", profile.id);
    const ownedIds = new Set(
      (owned ?? [])
        .filter((purchase) => {
          const item = Array.isArray(purchase.order_item)
            ? purchase.order_item[0]
            : purchase.order_item;
          const order = Array.isArray(item?.order)
            ? item.order[0]
            : item?.order;
          return order?.status === "PAID";
        })
        .map((purchase) => purchase.photo_id),
    );
    const remaining = (allPaid ?? [])
      .map((photo) => photo.id)
      .filter((id) => !ownedIds.has(id));
    if (
      remaining.length !== ids.length ||
      remaining.some((id) => !ids.includes(id))
    )
      return Response.json(
        {
          error:
            "Selecciona todas las fotos disponibles para usar este paquete.",
        },
        { status: 409 },
      );
  }
  const configuredTotal =
    mode === "FIVE"
      ? galleryValue?.package_5_price_cents
      : mode === "TEN"
        ? galleryValue?.package_10_price_cents
        : mode === "FULL"
          ? galleryValue?.full_gallery_price_cents
          : null;
  if (
    mode !== "INDIVIDUAL" &&
    (configuredTotal === null || configuredTotal === undefined)
  )
    return Response.json(
      { error: "Este paquete ya no está disponible." },
      { status: 409 },
    );
  const total =
    configuredTotal ??
    valid.reduce((sum, photo) => sum + (photo.price_cents ?? 0), 0);
  if (total <= 0)
    return Response.json(
      { error: "La compra no tiene un monto válido." },
      { status: 400 },
    );
  const orderNumber = `FOTO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const { data: order, error: orderError } = await service
    .from("orders")
    .insert({
      order_number: orderNumber,
      profile_id: profile.id,
      status: "PENDING",
      total_cents: total,
      currency: "MXN",
    })
    .select("id")
    .single();
  if (orderError || !order)
    return Response.json(
      { error: "No pudimos crear la orden." },
      { status: 500 },
    );
  const baseUnit = Math.floor(total / valid.length);
  const remainder = total - baseUnit * valid.length;
  const items = valid.map((photo, index) => ({
    order_id: order.id,
    item_type: "PHOTO",
    reference_id: photo.id,
    description: photo.title ?? "Fotografía The Doggy Gang",
    quantity: 1,
    unit_price_cents:
      configuredTotal === null || configuredTotal === undefined
        ? (photo.price_cents ?? 0)
        : baseUnit + (index < remainder ? 1 : 0),
  }));
  const { data: orderItems, error: itemError } = await service
    .from("order_items")
    .insert(items)
    .select("id,reference_id");
  if (itemError || !orderItems)
    return Response.json(
      { error: "No pudimos preparar las fotografías." },
      { status: 500 },
    );
  await service.from("photo_purchases").insert(
    orderItems.map((item) => ({
      order_item_id: item.id,
      profile_id: profile.id,
      photo_id: item.reference_id,
      download_expires_at: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    })),
  );
  const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  const form = new URLSearchParams({
    mode: "payment",
    "payment_method_types[0]": "card",
    success_url: `${origin}/galeria/${parsed.data.hikeSlug}?pago=exitoso`,
    cancel_url: `${origin}/galeria/${parsed.data.hikeSlug}?pago=cancelado`,
    client_reference_id: order.id,
    "metadata[order_id]": order.id,
    "metadata[purchase_type]": "photos",
  });
  if (profile.email) form.set("customer_email", profile.email);
  const checkoutLines =
    configuredTotal === null || configuredTotal === undefined
      ? valid.map((photo) => ({
          name: photo.title ?? "Fotografía The Doggy Gang",
          amount: photo.price_cents ?? 0,
          quantity: 1,
        }))
      : [
          {
            name:
              mode === "FULL"
                ? "Galería completa"
                : `Paquete de ${valid.length} fotografías`,
            amount: total,
            quantity: 1,
          },
        ];
  checkoutLines.forEach((line, index) => {
    form.set(`line_items[${index}][price_data][currency]`, "mxn");
    form.set(
      `line_items[${index}][price_data][unit_amount]`,
      String(line.amount),
    );
    form.set(`line_items[${index}][price_data][product_data][name]`, line.name);
    form.set(`line_items[${index}][quantity]`, String(line.quantity));
  });
  const stripeResponse = await fetch(
    "https://api.stripe.com/v1/checkout/sessions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    },
  );
  const checkout = (await stripeResponse.json()) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };
  if (!stripeResponse.ok || !checkout.id || !checkout.url)
    return Response.json(
      { error: checkout.error?.message ?? "Stripe no pudo iniciar el pago." },
      { status: 502 },
    );
  await service.from("payments").insert({
    order_id: order.id,
    provider: "stripe",
    provider_payment_id: checkout.id,
    method: "CARD",
    status: "PENDING",
    amount_cents: total,
  });
  return Response.json({ url: checkout.url });
}
