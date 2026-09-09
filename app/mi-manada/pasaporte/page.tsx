import Link from "next/link";
import { requireClientSession } from "../../lib/auth/guards";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { PassportBook, type PassportAdventure } from "./passport-book";

export const dynamic = "force-dynamic";

export default async function PassportPage() {
  const session = await requireClientSession("/mi-manada/pasaporte");
  if (session.mode !== "live" || !session.profile) return null;
  const supabase = await createSupabaseServerClient();
  const { data: bookings } = await supabase.from("bookings").select("id,status,hike:hikes(id,name,slug,starts_at,location_name,distance_km,elevation_m,cover_path)").eq("profile_id",session.profile.id).in("status",["CONFIRMED","COMPLETED"]).order("created_at",{ascending:false});
  const completed=(bookings??[]).map((booking)=>({booking,hike:Array.isArray(booking.hike)?booking.hike[0]:booking.hike})).filter(({booking,hike})=>hike&&(booking.status==="COMPLETED"||new Date(hike.starts_at)<new Date()));
  const distance=completed.reduce((sum,{hike})=>sum+Number(hike?.distance_km??0),0);
  const elevation=completed.reduce((sum,{hike})=>sum+Number(hike?.elevation_m??0),0);
  const level=completed.length>=10?"GUARDIÁN DE LA MONTAÑA":completed.length>=5?"EXPLORADOR DE LA MANADA":completed.length>=1?"CAMINANTE DE SENDERO":"NUEVO EXPLORADOR";
  const adventures: PassportAdventure[] = completed.map(({booking,hike})=>({
    id: booking.id,
    name: hike!.name,
    date: new Intl.DateTimeFormat("es-MX",{dateStyle:"long",timeZone:"America/Mexico_City"}).format(new Date(hike!.starts_at)),
    location: hike!.location_name,
    distance: Number(hike!.distance_km??0),
    elevation: Number(hike!.elevation_m??0),
  }));
  const memberName = [session.profile.first_name, session.profile.last_name].filter(Boolean).join(" ") || "MIEMBRO DE LA MANADA";
  return <main className="member-feature-page passport-feature-page"><header><Link className="wordmark" href="/">THE DOGGY <span>GANG</span></Link><Link href="/mi-manada">VOLVER A MI MANADA</Link></header><PassportBook memberName={memberName} adventures={adventures} distance={distance} elevation={elevation} level={level}/></main>;
}
