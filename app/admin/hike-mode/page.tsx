import { HikeMode } from "./hike-mode";
import type { HikeModeData } from "../../lib/hike-mode-types";
import { requireStaffSession } from "../../lib/auth/guards";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export const metadata = {
  title: "Modo Hike | The Doggy Gang",
  description: "Check-in operativo para guías.",
};
export const dynamic = "force-dynamic";

async function loadHikeModeData(requestedHikeId:string|undefined,profile:{id:string;role:string}): Promise<HikeModeData | null> {
  const supabase = await createSupabaseServerClient();
  let query=supabase
    .from("hikes")
    .select("id, name, starts_at, location_name,meeting_point,capacity, max_dogs")
    .gte("starts_at", new Date().toISOString())
    .is("deleted_at", null)
    .order("starts_at")
    .limit(20);
  if(profile.role==="GUIDE"){
    const {data:assignments}=await supabase.from("guide_hikes").select("hike_id").eq("profile_id",profile.id);
    const ids=(assignments??[]).map((assignment)=>assignment.hike_id);
    if(!ids.length)return null;
    query=query.in("id",ids);
  }
  const {data:hikes}=await query;
  if (!hikes?.length) return null;

  const requested = hikes.find((hike) => hike.id === requestedHikeId);
  const selected = requested ?? hikes[0];

  return {
    hike: selected,
    availableHikes: hikes.map((hike) => ({
      id: hike.id,
      name: hike.name,
      startsAt: hike.starts_at,
    })),
    bookings: [],
    deliveries: [],
    transportDeparture: { completedAt: null, passengerCount: 0, note: null },
    publicKey: process.env.NEXT_PUBLIC_QR_SIGNING_PUBLIC_KEY ?? "",
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
  const data = session.mode === "live" ? await loadHikeModeData(hike,session.profile) : null;
  return <HikeMode demo={session.mode === "demo"} data={data} />;
}
