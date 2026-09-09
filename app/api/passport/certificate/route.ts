import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET() {
  const supabase=await createSupabaseServerClient(); const {data:{user}}=await supabase.auth.getUser();
  if(!user)return new Response("No autorizado",{status:401});
  const {data:profile}=await supabase.from("profiles").select("id,first_name,last_name").eq("auth_user_id",user.id).single();
  if(!profile)return new Response("No encontrado",{status:404});
  const {data:bookings}=await supabase.from("bookings").select("status,hike:hikes(starts_at,distance_km,elevation_m)").eq("profile_id",profile.id).in("status",["CONFIRMED","COMPLETED"]);
  const completed=(bookings??[]).filter((booking)=>{const hike=Array.isArray(booking.hike)?booking.hike[0]:booking.hike;return hike&&(booking.status==="COMPLETED"||new Date(hike.starts_at)<new Date());});
  const distance=completed.reduce((sum,booking)=>{const hike=Array.isArray(booking.hike)?booking.hike[0]:booking.hike;return sum+Number(hike?.distance_km??0);},0);
  const pdf=await PDFDocument.create();const page=pdf.addPage([842,595]);const regular=await pdf.embedFont(StandardFonts.Helvetica);const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({x:0,y:0,width:842,height:595,color:rgb(.96,.94,.9)});page.drawRectangle({x:24,y:24,width:794,height:547,borderWidth:3,borderColor:rgb(.07,.09,.23)});page.drawText("THE DOGGY GANG",{x:311,y:510,size:24,font:bold,color:rgb(.07,.09,.23)});page.drawText("PASAPORTE DE AVENTURAS",{x:326,y:478,size:11,font:bold,color:rgb(.72,.39,.14)});page.drawText(`${profile.first_name} ${profile.last_name}`.trim(),{x:130,y:352,size:42,font:bold,color:rgb(.15,.12,.1),maxWidth:582});page.drawText("MIEMBRO DE LA MANADA",{x:132,y:326,size:11,font:bold,color:rgb(.4,.38,.35)});page.drawText(`${completed.length} aventuras completadas`,{x:132,y:235,size:22,font:bold,color:rgb(.15,.12,.1)});page.drawText(`${distance.toFixed(1)} kilometros recorridos`,{x:132,y:202,size:16,font:regular,color:rgb(.3,.28,.25)});page.drawText(`Emitido el ${new Intl.DateTimeFormat("es-MX",{dateStyle:"long"}).format(new Date())}`,{x:132,y:96,size:10,font:regular,color:rgb(.45,.42,.38)});page.drawText("Cada aventura empieza con un si.",{x:520,y:96,size:11,font:bold,color:rgb(.72,.39,.14)});
  return new Response(Buffer.from(await pdf.save()),{headers:{"content-type":"application/pdf","content-disposition":"attachment; filename=pasaporte-the-doggy-gang.pdf","cache-control":"private, no-store"}});
}
