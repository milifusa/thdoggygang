import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "./config";

export type Product={id:string;slug:string;name:string;description:string;category:string;priceCents:number;stock:number;variants:string[];image:string;pickupEnabled:boolean;shippingEnabled:boolean;shippingFeeCents:number};
export function productImageUrl(path:string|null|undefined){
  if(!path)return "/brand/profile-trail-sun.png";if(path.startsWith("/"))return path;
  const base=process.env.NEXT_PUBLIC_SUPABASE_URL;if(!base)return "/brand/profile-trail-sun.png";
  return `${base}/storage/v1/object/public/product-images/${path.split("/").map(encodeURIComponent).join("/")}`;
}
function mapProduct(row:Record<string,unknown>):Product{return{id:String(row.id),slug:String(row.slug),name:String(row.name),description:String(row.description),category:String(row.category),priceCents:Number(row.price_cents),stock:Number(row.stock),variants:Array.isArray(row.variants)?row.variants.map(String):[],image:productImageUrl(row.image_path?String(row.image_path):null),pickupEnabled:Boolean(row.pickup_enabled),shippingEnabled:Boolean(row.shipping_enabled),shippingFeeCents:Number(row.shipping_fee_cents??0)};}
export async function getProducts():Promise<Product[]>{
  if(!isSupabaseConfigured())return[];
  const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await supabase.from("products").select("*").eq("active",true).is("deleted_at",null).gt("stock",0).order("created_at");
  if(error)return[];return(data??[]).map((row)=>mapProduct(row as Record<string,unknown>));
}
