import { createSupabaseServiceClient } from "../supabase/service";
import { getShopSettings } from "../shop-settings";

export type ProductSelection = {
  productId: string;
  variant: string;
  quantity: number;
};
export type ShippingAddress = {
  recipient: string;
  phone: string;
  street: string;
  exterior: string;
  interior?: string;
  colony: string;
  city: string;
  state: string;
  postalCode: string;
  references?: string;
};

export async function createProductOrder({
  profileId,
  selections,
  fulfillmentMode,
  pickupHikeId,
  address,
}: {
  profileId: string;
  selections: ProductSelection[];
  fulfillmentMode: "HIKE_PICKUP" | "SHIPPING";
  pickupHikeId: string | null;
  address: ShippingAddress | null;
}) {
  const service = createSupabaseServiceClient();
  const productIds = [...new Set(selections.map((item) => item.productId))];
  const { data: products } = await service
    .from("products")
    .select(
      "id,name,price_cents,stock,variants,pickup_enabled,shipping_enabled,shipping_fee_cents",
    )
    .in("id", productIds)
    .eq("active", true)
    .is("deleted_at", null);
  if (!products || products.length !== productIds.length)
    throw new Error("Uno de los productos ya no está disponible.");
  const lines = selections.map((selection) => {
    const product = products.find((item) => item.id === selection.productId);
    if (
      !product ||
      selection.quantity < 1 ||
      selection.quantity > product.stock
    )
      throw new Error("Revisa el inventario de tu carrito.");
    if (
      product.variants?.length &&
      !product.variants.includes(selection.variant)
    )
      throw new Error(`Selecciona una opción válida para ${product.name}.`);
    if (fulfillmentMode === "SHIPPING" && !product.shipping_enabled)
      throw new Error(`${product.name} no está disponible para envío.`);
    if (fulfillmentMode === "HIKE_PICKUP" && !product.pickup_enabled)
      throw new Error(`${product.name} no se entrega en hikes.`);
    return { product, selection };
  });
  if (fulfillmentMode === "SHIPPING" && !address)
    throw new Error("Completa la dirección de entrega.");
  if (fulfillmentMode === "HIKE_PICKUP" && !pickupHikeId)
    throw new Error("Selecciona el hike de entrega.");
  let pickupBookingId: string | null = null;
  if (pickupHikeId) {
    const [{ data: hike }, { data: booking }] = await Promise.all([
      service
        .from("hikes")
        .select("id")
        .eq("id", pickupHikeId)
        .gte("starts_at", new Date().toISOString())
        .is("deleted_at", null)
        .maybeSingle(),
      service
        .from("bookings")
        .select("id")
        .eq("profile_id", profileId)
        .eq("hike_id", pickupHikeId)
        .eq("status", "CONFIRMED")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!hike) throw new Error("El hike elegido ya no está disponible.");
    if (fulfillmentMode === "HIKE_PICKUP" && !booking)
      throw new Error(
        "Sólo puedes elegir entrega en un hike que ya tengas confirmado.",
      );
    pickupBookingId = booking?.id ?? null;
  }
  const subtotal = lines.reduce(
    (sum, line) => sum + line.product.price_cents * line.selection.quantity,
    0,
  );
  const settings = await getShopSettings();
  const qualifies =
    settings.freeShippingThresholdCents !== null &&
    subtotal >= settings.freeShippingThresholdCents;
  const shipping =
    fulfillmentMode === "SHIPPING" && !qualifies
      ? settings.shippingFeeCents
      : 0;
  const total = subtotal + shipping;
  const { data: order, error } = await service
    .from("orders")
    .insert({
      order_number: `TIENDA-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      profile_id: profileId,
      booking_id: fulfillmentMode === "HIKE_PICKUP" ? pickupBookingId : null,
      status: "PENDING",
      total_cents: total,
      currency: "MXN",
      fulfillment_mode: fulfillmentMode,
      pickup_hike_id: fulfillmentMode === "HIKE_PICKUP" ? pickupHikeId : null,
      shipping_address: fulfillmentMode === "SHIPPING" ? address : null,
      shipping_cents: shipping,
    })
    .select("id,order_number")
    .single();
  if (error || !order) throw new Error("No pudimos crear tu pedido.");
  const items = lines.map(({ product, selection }) => ({
    order_id: order.id,
    item_type: "PRODUCT",
    reference_id: product.id,
    description: `${product.name}${selection.variant ? ` · ${selection.variant}` : ""}`,
    quantity: selection.quantity,
    unit_price_cents: product.price_cents,
  }));
  if (shipping > 0)
    items.push({
      order_id: order.id,
      item_type: "SHIPPING",
      reference_id: null as unknown as string,
      description: "Envío a domicilio",
      quantity: 1,
      unit_price_cents: shipping,
    });
  const { error: itemError } = await service.from("order_items").insert(items);
  if (itemError) throw new Error("No pudimos preparar tu pedido.");
  return { service, order, total, shipping, lines };
}
