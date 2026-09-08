import { requireStaffSession } from "../../lib/auth/guards";
import { getLandingSettings } from "../../lib/landing-content";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { AdminMobileNav, AdminNav } from "../admin-nav";
import { SiteContentForm } from "./site-content-form";
import { getLoginSettings } from "../../lib/login-content";
import { LoginContentForm } from "./login-content-form";

export const dynamic="force-dynamic";
export default async function SiteAdminPage(){
  await requireStaffSession("/admin/sitio");const [landing,login,supabase]=await Promise.all([getLandingSettings(),getLoginSettings(),createSupabaseServerClient()]);const {data:next}=await supabase.from("hikes").select("id").gte("starts_at",new Date().toISOString()).is("deleted_at",null).order("starts_at").limit(1).maybeSingle();
  return <main className="admin-page"><AdminNav active="/admin/sitio" hikeId={next?.id}/><section className="admin-content"><AdminMobileNav/><header><div><p>CONTENIDO PÚBLICO</p><h1>Sitio.</h1></div></header><nav className="site-admin-tabs"><a href="#general">GENERAL</a><a href="#home">HOME</a><a href="#ingreso">INGRESO</a><a href="#footer">FOOTER</a></nav><section id="ingreso" className="admin-panel admin-module-panel"><div className="admin-section-head"><div><p>PÁGINA DE INGRESO</p><h2>Diseño, textos e imágenes del acceso</h2></div></div><LoginContentForm initial={login.content} desktopImage={login.desktopImage} mobileImage={login.mobileImage} metadata={login.metadata as Record<string,unknown>}/></section><section id="home" className="admin-panel admin-module-panel site-home-panel"><div className="admin-section-head"><div><p>HOME Y FOOTER</p><h2>Edita la página principal completa</h2></div></div><SiteContentForm content={landing.content} heroImage={landing.heroImage} howImage={landing.howImage}/></section></section></main>;
}
