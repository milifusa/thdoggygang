import { z } from "zod";
import { adminClient } from "../../hikes/route";
import { parseProductForm,uploadImage } from "../route";

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;if(!z.string().uuid().safeParse(id).success)return Response.json({error:"Producto inválido."},{status:400});const supabase=await adminClient();if(!supabase)return Response.json({error:"No autorizado."},{status:403});
  const {form,parsed}=await parseProductForm(request);if(!parsed.success)return Response.json({error:"Revisa los datos del producto."},{status:400});const {data:current}=await supabase.from("products").select("image_path").eq("id",id).single();let imagePath=current?.image_path??null;
  try{const uploaded=await uploadImage(supabase,form.get("image"),id);if(uploaded)imagePath=uploaded;}catch(error){return Response.json({error:error instanceof Error?error.message:"Imagen inválida."},{status:400});}
  const v=parsed.data;const {error}=await supabase.from("products").update({name:v.name,slug:v.slug,description:v.description,category:v.category,price_cents:v.priceCents,stock:v.stock,variants:v.variants,image_path:imagePath,pickup_enabled:v.pickupEnabled,shipping_enabled:v.shippingEnabled,shipping_fee_cents:v.shippingFeeCents,active:v.active,updated_at:new Date().toISOString()}).eq("id",id);
  if(!error&&imagePath!==current?.image_path&&current?.image_path&&!current.image_path.startsWith("/"))await supabase.storage.from("product-images").remove([current.image_path]);
  return error?Response.json({error:error.message},{status:400}):Response.json({ok:true});
}
export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;const supabase=await adminClient();if(!supabase)return Response.json({error:"No autorizado."},{status:403});const {error}=await supabase.from("products").update({active:false,deleted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id);return error?Response.json({error:error.message},{status:400}):Response.json({ok:true});}
