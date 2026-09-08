import { z } from "zod";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { createSupabaseServiceClient } from "../../../../lib/supabase/service";

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;if(!z.string().uuid().safeParse(id).success)return Response.json({error:"Foto inválida."},{status:400});
  const service=createSupabaseServiceClient();const {data:photo}=await service.from("photos").select("id,access,original_path").eq("id",id).is("deleted_at",null).single();if(!photo)return Response.json({error:"Foto no disponible."},{status:404});
  let allowed=photo.access==="FREE_ORIGINAL";
  if(!allowed&&photo.access==="PAID"){const supabase=await createSupabaseServerClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return Response.redirect(new URL("/ingresar",_.url));
    const {data:profile}=await service.from("profiles").select("id").eq("auth_user_id",user.id).single();if(profile){const {data:purchases}=await service.from("photo_purchases").select("order_item:order_items(order:orders(status))").eq("profile_id",profile.id).eq("photo_id",id);allowed=(purchases??[]).some((purchase)=>{const item=Array.isArray(purchase.order_item)?purchase.order_item[0]:purchase.order_item;const order=Array.isArray(item?.order)?item.order[0]:item?.order;return order?.status==="PAID";});}}
  if(!allowed)return Response.json({error:"Esta foto requiere una compra confirmada."},{status:403});
  const {data,error}=await service.storage.from("hike-originals").createSignedUrl(photo.original_path,300,{download:true});if(error||!data)return Response.json({error:"No pudimos preparar la descarga."},{status:500});return Response.redirect(data.signedUrl);
}
