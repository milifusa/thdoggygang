import { z } from "zod";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../lib/supabase/service";

const schema=z.object({photoIds:z.array(z.string().uuid()).min(1).max(30),hikeSlug:z.string().min(1).max(160)});

export async function POST(request:Request){
  const parsed=schema.safeParse(await request.json().catch(()=>null)); if(!parsed.success)return Response.json({error:"Selecciona al menos una foto."},{status:400});
  const stripeKey=process.env.STRIPE_SECRET_KEY; if(!stripeKey)return Response.json({error:"El pago con tarjeta aún no está configurado."},{status:503});
  const supabase=await createSupabaseServerClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user)return Response.json({error:"Inicia sesión para comprar tus fotos."},{status:401});
  const service=createSupabaseServiceClient(); const {data:profile}=await service.from("profiles").select("id,email").eq("auth_user_id",user.id).single(); if(!profile)return Response.json({error:"No encontramos tu perfil."},{status:404});
  const ids=[...new Set(parsed.data.photoIds)]; const {data:photos}=await service.from("photos").select("id,title,price_cents,gallery:hike_galleries!inner(published_at,hike:hikes!inner(slug,name))").in("id",ids).eq("access","PAID").is("deleted_at",null);
  const valid=(photos??[]).filter((photo)=>{const g=Array.isArray(photo.gallery)?photo.gallery[0]:photo.gallery;const h=Array.isArray(g?.hike)?g.hike[0]:g?.hike;return g?.published_at&&h?.slug===parsed.data.hikeSlug;});
  if(valid.length!==ids.length)return Response.json({error:"Una de las fotos ya no está disponible."},{status:409});
  const total=valid.reduce((sum,photo)=>sum+(photo.price_cents??0),0); if(total<=0)return Response.json({error:"La compra no tiene un monto válido."},{status:400});
  const orderNumber=`FOTO-${crypto.randomUUID().slice(0,8).toUpperCase()}`; const {data:order,error:orderError}=await service.from("orders").insert({order_number:orderNumber,profile_id:profile.id,status:"PENDING",total_cents:total,currency:"MXN"}).select("id").single(); if(orderError||!order)return Response.json({error:"No pudimos crear la orden."},{status:500});
  const items=valid.map((photo)=>({order_id:order.id,item_type:"PHOTO",reference_id:photo.id,description:photo.title??"Fotografía The Doggy Gang",quantity:1,unit_price_cents:photo.price_cents??0})); const {data:orderItems,error:itemError}=await service.from("order_items").insert(items).select("id,reference_id"); if(itemError||!orderItems)return Response.json({error:"No pudimos preparar las fotografías."},{status:500});
  await service.from("photo_purchases").insert(orderItems.map((item)=>({order_item_id:item.id,profile_id:profile.id,photo_id:item.reference_id,download_expires_at:new Date(Date.now()+30*24*60*60*1000).toISOString()})));
  const origin=process.env.APP_ORIGIN??new URL(request.url).origin; const form=new URLSearchParams({mode:"payment",success_url:`${origin}/galeria/${parsed.data.hikeSlug}?pago=exitoso`,cancel_url:`${origin}/galeria/${parsed.data.hikeSlug}?pago=cancelado`,client_reference_id:order.id,"metadata[order_id]":order.id,"metadata[purchase_type]":"photos"});
  if(profile.email)form.set("customer_email",profile.email);
  valid.forEach((photo,index)=>{form.set(`line_items[${index}][price_data][currency]`,"mxn");form.set(`line_items[${index}][price_data][unit_amount]`,String(photo.price_cents));form.set(`line_items[${index}][price_data][product_data][name]`,photo.title??"Fotografía The Doggy Gang");form.set(`line_items[${index}][quantity]`,"1");});
  const stripeResponse=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{Authorization:`Bearer ${stripeKey}`,"Content-Type":"application/x-www-form-urlencoded"},body:form}); const checkout=await stripeResponse.json() as {id?:string;url?:string;error?:{message?:string}};
  if(!stripeResponse.ok||!checkout.id||!checkout.url)return Response.json({error:checkout.error?.message??"Stripe no pudo iniciar el pago."},{status:502});
  await service.from("payments").insert({order_id:order.id,provider:"stripe",provider_payment_id:checkout.id,method:"CARD",status:"PENDING",amount_cents:total});
  return Response.json({url:checkout.url});
}
