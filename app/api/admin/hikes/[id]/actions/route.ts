import { z } from "zod";
import { adminClient } from "../../route";

const schema = z.object({
  action: z.enum(["DUPLICATE", "PUBLISH", "UNPUBLISH", "CANCEL"]),
});
const idSchema = z.string().uuid();
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!idSchema.safeParse(id).success || !parsed.success)
    return Response.json({ error: "Acción inválida." }, { status: 400 });
  const supabase = await adminClient();
  if (!supabase)
    return Response.json({ error: "No autorizado." }, { status: 403 });
  if (parsed.data.action !== "DUPLICATE") {
    const now = new Date().toISOString();
    const update =
      parsed.data.action === "PUBLISH"
        ? { published: true, cancelled_at: null }
        : parsed.data.action === "UNPUBLISH"
          ? { published: false }
          : { published: false, cancelled_at: now };
    const { error } = await supabase
      .from("hikes")
      .update(update)
      .eq("id", id)
      .is("deleted_at", null);
    if (error)
      return Response.json(
        { error: "No pudimos actualizar el hike." },
        { status: 400 },
      );
    if (parsed.data.action === "CANCEL") {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: admin } = user
        ? await supabase
            .from("profiles")
            .select("id")
            .eq("auth_user_id", user.id)
            .single()
        : { data: null };
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id,status,orders(payments(status,amount_cents))")
        .eq("hike_id", id)
        .in("status", ["DRAFT", "PENDING_PAYMENT", "CONFIRMED"]);
      for (const booking of bookings ?? []) {
        const paid = (booking.orders ?? [])
          .flatMap((order) => order.payments ?? [])
          .filter((payment) => payment.status === "PAID")
          .reduce((sum, payment) => sum + payment.amount_cents, 0);
        await supabase
          .from("bookings")
          .update({ status: "CANCELLED", cancelled_at: now })
          .eq("id", booking.id);
        if (admin && paid > 0)
          await supabase
            .from("booking_cancellation_requests")
            .insert({
              booking_id: booking.id,
              requested_by: admin.id,
              reason: "Hike cancelado por administración",
              status: "APPROVED",
              refundable_amount_cents: paid,
              resolved_by: admin.id,
              resolution_note: "Reembolso pendiente de procesamiento",
              resolved_at: now,
            });
      }
      if (admin)
        await supabase
          .from("audit_logs")
          .insert({
            actor_profile_id: admin.id,
            action: "HIKE_CANCELLED",
            entity_type: "hike",
            entity_id: id,
            metadata: { affected_bookings: bookings?.length ?? 0 },
          });
      return Response.json({
        ok: true,
        affectedBookings: bookings?.length ?? 0,
      });
    }
    return Response.json({ ok: true });
  }
  const [{ data: hike }, { data: transport }] = await Promise.all([
    supabase
      .from("hikes")
      .select(
        "name,slug,description,story_title,starts_at,location_name,meeting_point,price_cents,dog_price_cents,pricing_mode,capacity,max_dogs,distance_km,elevation_m,duration_minutes,difficulty,terrain,recommended_dog_sizes,includes,excludes,packing_list,recommendations,rules,cancellation_policy,cover_path",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("transport_configurations")
      .select(
        "mode,capacity,price_cents,departure_place,departure_at,return_details,rules",
      )
      .eq("hike_id", id)
      .maybeSingle(),
  ]);
  if (!hike)
    return Response.json({ error: "No encontramos el hike." }, { status: 404 });
  const suffix = Date.now().toString().slice(-6);
  const { data: copy, error } = await supabase
    .from("hikes")
    .insert({
      ...hike,
      name: `${hike.name} copia`,
      slug: `${hike.slug}-copia-${suffix}`,
      published: false,
      cancelled_at: null,
    })
    .select("id")
    .single();
  if (error || !copy)
    return Response.json(
      { error: "No pudimos duplicar el hike." },
      { status: 400 },
    );
  if (transport)
    await supabase
      .from("transport_configurations")
      .insert({ ...transport, hike_id: copy.id });
  return Response.json({ ok: true, id: copy.id });
}
