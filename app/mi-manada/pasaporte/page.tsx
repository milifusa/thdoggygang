import Link from "next/link";
import { Award, Download, MapPin, Route } from "lucide-react";
import { requireClientSession } from "../../lib/auth/guards";
import { createSupabaseServerClient } from "../../lib/supabase/server";

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
  return <main className="member-feature-page"><header><Link className="wordmark" href="/">THE DOGGY <span>GANG</span></Link><Link href="/mi-manada">VOLVER A MI MANADA</Link></header><section className="feature-hero"><p className="eyebrow">PASAPORTE DE AVENTURAS</p><h1>Las huellas de tu manada.</h1><p>Cada hike confirmado se convierte en una marca real dentro de tu historia.</p><a className="button button-primary" href="/api/passport/certificate"><Download/> DESCARGAR CERTIFICADO</a></section><section className="passport-stats"><article><Award/><strong>{completed.length}</strong><span>AVENTURAS</span></article><article><Route/><strong>{distance.toFixed(1)}</strong><span>KILÓMETROS</span></article><article><MapPin/><strong>{elevation.toLocaleString("es-MX")}</strong><span>METROS DE DESNIVEL</span></article></section><section className="passport-level"><span>NIVEL ACTUAL</span><h2>{level}</h2><p>{completed.length<5?`Te faltan ${Math.max(0,5-completed.length)} aventuras para llegar a Explorador de la Manada.`:"Tu experiencia ya inspira a nuevos miembros de la manada."}</p></section><section className="passport-grid">{completed.length?completed.map(({booking,hike},index)=><article key={booking.id}><span>{String(index+1).padStart(2,"0")}</span><div><small>{new Intl.DateTimeFormat("es-MX",{dateStyle:"long",timeZone:"America/Mexico_City"}).format(new Date(hike!.starts_at))}</small><h2>{hike!.name}</h2><p>{hike!.location_name} · {Number(hike!.distance_km??0)} km</p></div><Award/></article>):<div className="feature-empty"><Award/><h2>Tu primer sello te está esperando.</h2><Link className="button button-dark" href="/aventuras">VER AVENTURAS</Link></div>}</section></main>;
}
