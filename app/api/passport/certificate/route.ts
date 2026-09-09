import { buildPassportCertificate } from "../../../lib/passport-certificate";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET() {
  const supabase=await createSupabaseServerClient(); const {data:{user}}=await supabase.auth.getUser();
  if(!user)return new Response("No autorizado",{status:401});
  const {data:profile}=await supabase.from("profiles").select("id,first_name,last_name").eq("auth_user_id",user.id).single();
  if(!profile)return new Response("No encontrado",{status:404});
  const {data:bookings}=await supabase.from("bookings").select("status,hike:hikes(starts_at,distance_km,elevation_m)").eq("profile_id",profile.id).in("status",["CONFIRMED","COMPLETED"]);
  const completed=(bookings??[]).filter((booking)=>{const hike=Array.isArray(booking.hike)?booking.hike[0]:booking.hike;return hike&&(booking.status==="COMPLETED"||new Date(hike.starts_at)<new Date());});
  const distance=completed.reduce((sum,booking)=>{const hike=Array.isArray(booking.hike)?booking.hike[0]:booking.hike;return sum+Number(hike?.distance_km??0);},0);
  const elevation=completed.reduce((sum,booking)=>{const hike=Array.isArray(booking.hike)?booking.hike[0]:booking.hike;return sum+Number(hike?.elevation_m??0);},0);
  const pdf=await buildPassportCertificate({memberName:`${profile.first_name} ${profile.last_name}`.trim(),profileId:profile.id,adventureCount:completed.length,distanceKm:distance,elevationM:elevation,issuedAt:new Date()});
  return new Response(Buffer.from(pdf),{headers:{"content-type":"application/pdf","content-disposition":"attachment; filename=certificado-the-doggy-gang.pdf","cache-control":"private, no-store"}});
}
