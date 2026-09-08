import { SiteHeader } from "../components/SiteHeader";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { getProducts } from "../lib/products";
import { Shop } from "./shop";

export const dynamic="force-dynamic";
export const metadata={title:"Equipo de hiking | The Doggy Gang",description:"Correas y accesorios para caminar en manada."};
export default async function ShopPage(){
  const [products,supabase]=await Promise.all([getProducts(),createSupabaseServerClient()]);
  const {data:hikes}=await supabase.from("hikes").select("id,name,starts_at").gte("starts_at",new Date().toISOString()).eq("published",true).is("deleted_at",null).order("starts_at");
  const options=(hikes??[]).map((h)=>({id:h.id,name:h.name,date:new Intl.DateTimeFormat("es-MX",{dateStyle:"medium",timeZone:"America/Mexico_City"}).format(new Date(h.starts_at))}));
  return <><SiteHeader/><Shop products={products} hikes={options} cardPaymentsEnabled={Boolean(process.env.STRIPE_SECRET_KEY)}/></>;
}
