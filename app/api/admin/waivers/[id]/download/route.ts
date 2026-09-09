import { requireStaffSession } from "../../../../../lib/auth/guards";
import { createSupabaseServiceClient } from "../../../../../lib/supabase/service";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireStaffSession("/admin/clientes");
  if (session.mode !== "live" || !session.profile)
    return new Response("No disponible.", { status: 503 });
  const { id } = await params;
  const service = createSupabaseServiceClient();
  const { data: waiver } = await service
    .from("signed_waivers")
    .select("id,pdf_path,booking:bookings(id,booking_number,profile_id)")
    .eq("id", id)
    .maybeSingle();
  if (!waiver)
    return new Response("Responsiva no encontrada.", { status: 404 });
  const booking = Array.isArray(waiver.booking)
    ? waiver.booking[0]
    : waiver.booking;
  const { data: file, error } = await service.storage
    .from("signed-waivers")
    .download(waiver.pdf_path);
  if (error || !file)
    return new Response("El archivo de la responsiva no está disponible.", {
      status: 404,
    });
  await service.from("audit_logs").insert({
    actor_profile_id: session.profile.id,
    action: "WAIVER_DOWNLOADED",
    entity_type: "signed_waiver",
    entity_id: waiver.id,
    metadata: {
      booking_id: booking?.id ?? null,
      profile_id: booking?.profile_id ?? null,
    },
  });
  const safeNumber = String(
    booking?.booking_number ?? waiver.id.slice(0, 8),
  ).replace(/[^a-zA-Z0-9-]/g, "-");
  return new Response(await file.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="responsiva-${safeNumber}.pdf"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
}
