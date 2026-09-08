import { requireStaffSession } from "../../lib/auth/guards";
import { getLandingSettings } from "../../lib/landing-content";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { AdminMobileNav, AdminNav } from "../admin-nav";
import { SiteContentForm } from "./site-content-form";

export const dynamic="force-dynamic";
export default async function SiteAdminPage(){
  await requireStaffSession("/admin/sitio");const [landing,supabase]=await Promise.all([getLandingSettings(),createSupabaseServerClient()]);const {data:next}=await supabase.from("hikes").select("id").gte("starts_at",new Date().toISOString()).is("deleted_at",null).order("starts_at").limit(1).maybeSingle();
  return <main className="admin-page"><AdminNav active="/admin/sitio" hikeId={next?.id}/><section className="admin-content"><AdminMobileNav/><header><div><p>CONTENIDO PÚBLICO</p><h1>Landing.</h1></div></header><section className="admin-panel admin-module-panel"><div className="admin-section-head"><div><p>TEXTOS E IMÁGENES</p><h2>Edita la página principal completa</h2></div></div><SiteContentForm content={landing.content} heroImage={landing.heroImage} howImage={landing.howImage}/></section></section></main>;
}
