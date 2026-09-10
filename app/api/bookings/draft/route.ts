import { z } from "zod";
import { recalculateBookingTotal } from "../../../lib/server/booking-pricing";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

const schema = z.object({
  bookingId: z.string().uuid().nullable(),
  hikeSlug: z.string().regex(/^[a-z0-9-]+$/),
  personIds: z.array(z.string().uuid()).min(1),
  dogIds: z.array(z.string().uuid()),
  transportPersonIds: z.array(z.string().uuid()),
  productSelections: z
    .array(
      z.object({
        productId: z.string().uuid(),
        variant: z.string().max(80),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .max(30)
    .default([]),
  currentStep: z
    .enum([
      "manada",
      "personas",
      "perritos",
      "transporte",
      "productos",
      "responsiva",
      "pago",
      "confirmacion",
    ])
    .default("personas"),
});

function friendlyDraftError(message?: string) {
  if (!message) return "No pudimos guardar tu reservación. Intenta nuevamente.";
  if (/cupo suficiente/i.test(message)) return message;
  if (/hike not found/i.test(message))
    return "Esta aventura ya no está disponible para reservar.";
  if (/invalid participant/i.test(message))
    return "Una de las personas seleccionadas ya no está disponible. Actualiza la página e intenta nuevamente.";
  if (/invalid dog/i.test(message))
    return "Uno de los perritos seleccionados ya no está disponible. Actualiza la página e intenta nuevamente.";
  if (/minor requires|responsable/i.test(message))
    return "Selecciona también a la persona adulta responsable del menor.";
  if (/minor birth date required/i.test(message))
    return "Agrega la fecha de nacimiento del menor antes de continuar.";
  if (/draft not found/i.test(message))
    return "No encontramos el borrador. Actualiza la página para continuar.";
  return "No pudimos guardar tu avance. Intenta nuevamente; tu selección sigue en pantalla.";
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Revisa la selección de tu manada." },
      { status: 400 },
    );
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return Response.json(
      { error: "Tu sesión expiró. Vuelve a entrar." },
      { status: 401 },
    );
  const [{ data: profile }, { data: hike }] = await Promise.all([
    supabase.from("profiles").select("id").eq("auth_user_id", user.id).single(),
    supabase
      .from("hikes")
      .select("id")
      .eq("slug", parsed.data.hikeSlug)
      .is("deleted_at", null)
      .single(),
  ]);
  if (!profile || !hike)
    return Response.json(
      { error: "No encontramos tu perfil o el hike." },
      { status: 404 },
    );
  let effectiveBookingId = parsed.data.bookingId;
  if (!effectiveBookingId) {
    const { data: active } = await supabase
      .from("bookings")
      .select("id,status")
      .eq("profile_id", profile.id)
      .eq("hike_id", hike.id)
      .in("status", ["DRAFT", "PENDING_PAYMENT", "CONFIRMED"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (active?.status === "CONFIRMED")
      return Response.json(
        {
          error: "Ya tienes una reservación confirmada para este hike.",
          code: "ALREADY_CONFIRMED",
        },
        { status: 409 },
      );
    if (active?.status === "PENDING_PAYMENT")
      return Response.json(
        {
          error: "Ya tienes una reservación con pago pendiente para este hike.",
          code: "PAYMENT_PENDING",
        },
        { status: 409 },
      );
    if (active?.status === "DRAFT") effectiveBookingId = active.id;
  }
  const { data, error } = await supabase.rpc("save_booking_draft", {
    p_hike_slug: parsed.data.hikeSlug,
    p_booking_id: effectiveBookingId,
    p_person_ids: parsed.data.personIds,
    p_dog_ids: parsed.data.dogIds,
    p_transport_person_ids: parsed.data.transportPersonIds,
  });
  if (error || !data) {
    console.error("Booking draft save failed", {
      code: error?.code,
      message: error?.message,
      hikeSlug: parsed.data.hikeSlug,
      hasExistingDraft: Boolean(effectiveBookingId),
    });
    return Response.json(
      { error: friendlyDraftError(error?.message) },
      { status: 400 },
    );
  }
  const selections = parsed.data.productSelections;
  const productIds = [...new Set(selections.map((item) => item.productId))];
  let productSubtotal = 0;
  await supabase
    .from("booking_product_selections")
    .delete()
    .eq("booking_id", data);
  if (productIds.length) {
    const { data: products } = await supabase
      .from("products")
      .select("id,name,price_cents,stock,variants,pickup_enabled")
      .in("id", productIds)
      .eq("active", true)
      .is("deleted_at", null);
    if (!products || products.length !== productIds.length)
      return Response.json(
        { error: "Uno de los productos ya no está disponible." },
        { status: 409 },
      );
    const rows = [];
    for (const selection of selections) {
      const product = products.find((item) => item.id === selection.productId);
      if (
        !product ||
        !product.pickup_enabled ||
        selection.quantity > product.stock
      )
        return Response.json(
          { error: "Revisa la disponibilidad de los productos." },
          { status: 409 },
        );
      if (
        product.variants?.length &&
        !product.variants.includes(selection.variant)
      )
        return Response.json(
          { error: `Selecciona una variante válida para ${product.name}.` },
          { status: 400 },
        );
      productSubtotal += product.price_cents * selection.quantity;
      rows.push({
        booking_id: data,
        product_id: product.id,
        variant: selection.variant,
        quantity: selection.quantity,
        unit_price_cents: product.price_cents,
      });
    }
    const { error: selectionError } = await supabase
      .from("booking_product_selections")
      .insert(rows);
    if (selectionError)
      return Response.json({ error: selectionError.message }, { status: 400 });
  }
  let totalCents = productSubtotal;
  try {
    totalCents = (
      await recalculateBookingTotal({ bookingId: data, profileId: profile.id })
    ).totalCents;
  } catch (pricingError) {
    return Response.json(
      {
        error:
          pricingError instanceof Error
            ? pricingError.message
            : "No pudimos calcular el total de la reservación.",
      },
      { status: 400 },
    );
  }
  await supabase
    .from("bookings")
    .update({
      current_step: parsed.data.currentStep,
      last_activity_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", data);
  return Response.json({ bookingId: data, totalCents });
}
