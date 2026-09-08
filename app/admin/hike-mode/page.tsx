import { HikeMode, type HikeModeData } from "./hike-mode";
import { requireStaffSession } from "../../lib/auth/guards";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export const metadata = {
  title: "Modo Hike | The Doggy Gang",
  description: "Check-in operativo para guías.",
};
export const dynamic = "force-dynamic";

async function loadHikeModeData(requestedHikeId?: string): Promise<HikeModeData | null> {
  const supabase = await createSupabaseServerClient();
  const { data: hikes } = await supabase
    .from("hikes")
    .select("id, name, starts_at, capacity, max_dogs")
    .gte("starts_at", new Date().toISOString())
    .is("deleted_at", null)
    .order("starts_at")
    .limit(20);
  if (!hikes?.length) return null;

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, booking_number, status, hike_id, booking_participants(id, snapshot), booking_dogs(id, snapshot), transport_reservations(id, booking_participant_id), check_ins(id, booking_participant_id)",
    )
    .in("hike_id", hikes.map((hike) => hike.id))
    .in("status", ["CONFIRMED", "PENDING_PAYMENT"])
    .order("created_at");

  const allBookings = bookings ?? [];
  const requested = hikes.find((hike) => hike.id === requestedHikeId);
  const selected = requested ?? hikes.find((hike) =>
    allBookings.some((booking) => booking.hike_id === hike.id),
  ) ?? hikes[0];

  return {
    hike: selected,
    availableHikes: hikes.map((hike) => ({
      id: hike.id,
      name: hike.name,
      startsAt: hike.starts_at,
    })),
    bookings: allBookings.filter((booking) => booking.hike_id === selected.id),
  };
}

export default async function HikeModePage({
  searchParams,
}: {
  searchParams: Promise<{ hike?: string }>;
}) {
  const { hike } = await searchParams;
  const session = await requireStaffSession(
    hike ? `/admin/hike-mode?hike=${encodeURIComponent(hike)}` : "/admin/hike-mode",
    true,
  );
  const data = session.mode === "live" ? await loadHikeModeData(hike) : null;
  return <HikeMode demo={session.mode === "demo"} data={data} />;
}
