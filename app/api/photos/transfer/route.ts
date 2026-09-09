import { z } from "zod";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../lib/supabase/service";
import { getBankTransferConfig } from "../../../lib/payment-config";

const modeSchema = z.enum(["INDIVIDUAL", "FIVE", "TEN", "FULL"]);
export async function POST(request: Request) {
  if (!(await getBankTransferConfig()))
    return Response.json(
      { error: "La transferencia bancaria no está disponible." },
      { status: 503 },
    );
  const form = await request.formData();
  const hikeSlug = String(form.get("hikeSlug") ?? "");
  const mode = modeSchema.safeParse(
    String(form.get("purchaseMode") ?? "INDIVIDUAL"),
  );
  const idsParsed = z
    .array(z.string().uuid())
    .min(1)
    .max(500)
    .safeParse(JSON.parse(String(form.get("photoIds") ?? "[]")));
  const receipt = form.get("receipt");
  if (
    !mode.success ||
    !idsParsed.success ||
    !hikeSlug ||
    !(receipt instanceof File) ||
    !receipt.size
  )
    return Response.json(
      { error: "Selecciona las fotos y adjunta tu comprobante." },
      { status: 400 },
    );
  if (
    receipt.size > 10 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "application/pdf"].includes(receipt.type)
  )
    return Response.json(
      {
        error: "El comprobante debe ser JPG, PNG o PDF y pesar menos de 10 MB.",
      },
      { status: 400 },
    );
  const userClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user)
    return Response.json(
      { error: "Inicia sesión para comprar tus fotos." },
      { status: 401 },
    );
  const service = createSupabaseServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile)
    return Response.json(
      { error: "No encontramos tu perfil." },
      { status: 404 },
    );
  const ids = [...new Set(idsParsed.data)];
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
    const gallery = Array.isArray(photo.gallery)
      ? photo.gallery[0]
      : photo.gallery;
    const hike = Array.isArray(gallery?.hike) ? gallery.hike[0] : gallery?.hike;
    return gallery?.published_at && hike?.slug === hikeSlug;
  });
  if (valid.length !== ids.length)
    return Response.json(
      { error: "Una de las fotos ya no está disponible." },
      { status: 409 },
    );
  const gallery =
    valid[0] &&
    (Array.isArray(valid[0].gallery) ? valid[0].gallery[0] : valid[0].gallery);
  const hike =
    gallery && (Array.isArray(gallery.hike) ? gallery.hike[0] : gallery.hike);
  const { data: attendance } = hike
    ? await service
        .from("bookings")
        .select("id")
        .eq("profile_id", profile.id)
        .eq("hike_id", hike.id)
        .in("status", ["CONFIRMED", "COMPLETED"])
        .limit(1)
        .maybeSingle()
    : { data: null };
  if (!attendance)
    return Response.json(
      { error: "Esta galería es exclusiva para asistentes confirmados." },
      { status: 403 },
    );
  const expected = mode.data === "FIVE" ? 5 : mode.data === "TEN" ? 10 : null;
  if (expected && ids.length !== expected)
    return Response.json(
      { error: `Este paquete requiere exactamente ${expected} fotos.` },
      { status: 409 },
    );
  if (mode.data === "FULL") {
    const { data: all } = await service
      .from("photos")
      .select("id")
      .eq("gallery_id", gallery.id)
      .eq("access", "PAID")
      .eq("hidden", false)
      .is("deleted_at", null);
    const {data:owned}=await service.from("photo_purchases").select("photo_id,order_item:order_items!inner(order:orders!inner(status))").eq("profile_id",profile.id);
    const ownedIds=new Set((owned??[]).filter((purchase)=>{const item=Array.isArray(purchase.order_item)?purchase.order_item[0]:purchase.order_item;const order=Array.isArray(item?.order)?item.order[0]:item?.order;return order?.status==="PAID";}).map((purchase)=>purchase.photo_id));
    const remaining=(all??[]).filter((photo)=>!ownedIds.has(photo.id));
    if (
      remaining.length !== ids.length ||
      remaining.some((photo) => !ids.includes(photo.id))
    )
      return Response.json(
        { error: "Selecciona toda la galería para este paquete." },
        { status: 409 },
      );
  }
  const configured =
    mode.data === "FIVE"
      ? gallery.package_5_price_cents
      : mode.data === "TEN"
        ? gallery.package_10_price_cents
        : mode.data === "FULL"
          ? gallery.full_gallery_price_cents
          : null;
  if (
    mode.data !== "INDIVIDUAL" &&
    (configured === null || configured === undefined)
  )
    return Response.json(
      { error: "Este paquete ya no está disponible." },
      { status: 409 },
    );
  const total =
    configured ??
    valid.reduce((sum, photo) => sum + (photo.price_cents ?? 0), 0);
  if (total <= 0)
    return Response.json(
      { error: "La compra no tiene un monto válido." },
      { status: 400 },
    );
  const { data: order, error: orderError } = await service
    .from("orders")
    .insert({
      order_number: `FOTO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      profile_id: profile.id,
      status: "UNDER_REVIEW",
      total_cents: total,
      currency: "MXN",
    })
    .select("id,order_number")
    .single();
  if (orderError || !order)
    return Response.json(
      { error: "No pudimos crear la orden." },
      { status: 500 },
    );
  const unit = Math.floor(total / valid.length),
    remainder = total - unit * valid.length;
  const { data: items, error: itemError } = await service
    .from("order_items")
    .insert(
      valid.map((photo, index) => ({
        order_id: order.id,
        item_type: "PHOTO",
        reference_id: photo.id,
        description: photo.title ?? "Fotografía The Doggy Gang",
        quantity: 1,
        unit_price_cents:
          configured === null || configured === undefined
            ? (photo.price_cents ?? 0)
            : unit + (index < remainder ? 1 : 0),
      })),
    )
    .select("id,reference_id");
  if (itemError || !items)
    return Response.json(
      { error: "No pudimos preparar las fotografías." },
      { status: 500 },
    );
  await service
    .from("photo_purchases")
    .insert(
      items.map((item) => ({
        order_item_id: item.id,
        profile_id: profile.id,
        photo_id: item.reference_id,
        download_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      })),
    );
  const { data: payment, error: paymentError } = await service
    .from("payments")
    .insert({
      order_id: order.id,
      provider: "bank_transfer",
      provider_payment_id: `transfer:${crypto.randomUUID()}`,
      method: "TRANSFER",
      status: "UNDER_REVIEW",
      amount_cents: total,
    })
    .select("id")
    .single();
  if (paymentError || !payment)
    return Response.json(
      { error: "No pudimos registrar el pago." },
      { status: 500 },
    );
  const ext =
    receipt.type === "application/pdf"
      ? "pdf"
      : receipt.type === "image/png"
        ? "png"
        : "jpg";
  const path = `${profile.id}/photos/${order.id}/${crypto.randomUUID()}.${ext}`;
  const upload = await service.storage
    .from("payment-receipts")
    .upload(path, await receipt.arrayBuffer(), { contentType: receipt.type });
  if (upload.error)
    return Response.json(
      { error: "No pudimos guardar el comprobante." },
      { status: 500 },
    );
  await service
    .from("payment_receipts")
    .insert({
      payment_id: payment.id,
      uploaded_by: profile.id,
      storage_path: path,
    });
  return Response.json({ ok: true, orderNumber: order.order_number });
}
