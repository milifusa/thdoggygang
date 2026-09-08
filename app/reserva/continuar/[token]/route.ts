import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../lib/supabase/service";

async function hash(value:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(digest),(byte)=>byte.toString(16).padStart(2,"0")).join("");}
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  const supabase=await createSupabaseServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){const next=new URL(request.url).pathname;redirect(`/ingresar?next=${encodeURIComponent(next)}`);}
  const {data:profile}=await supabase.from("profiles").select("id").eq("auth_user_id",user.id).single();
  const service=createSupabaseServiceClient();
  const {data:entry}=await service.from("booking_continue_tokens").select("id,current_step,expires_at,revoked_at,booking:bookings(id,profile_id,status,hike:hikes(slug))").eq("token_hash",await hash(token)).single();
  const booking=Array.isArray(entry?.booking)?entry?.booking[0]:entry?.booking;
  if(!entry||entry.revoked_at||new Date(entry.expires_at).getTime()<Date.now()||!booking||booking.profile_id!==profile?.id||!["DRAFT","PENDING_PAYMENT"].includes(booking.status)) redirect("/mi-manada?continue=invalid");
  await service.from("booking_continue_tokens").update({used_at:new Date().toISOString()}).eq("id",entry.id);
  const hike=Array.isArray(booking.hike)?booking.hike[0]:booking.hike;
  redirect(`/reservar/${hike?.slug}?booking=${booking.id}&step=${entry.current_step}`);
}
