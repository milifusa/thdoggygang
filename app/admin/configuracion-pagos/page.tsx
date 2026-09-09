import { requireStaffSession } from "../../lib/auth/guards";
import { getPaymentSettingsForAdmin } from "../../lib/payment-config";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { AdminMobileNav, AdminNav } from "../admin-nav";
import { PaymentSettingsForm } from "./payment-settings-form";

export const dynamic="force-dynamic";
export default async function PaymentSettingsPage(){await requireStaffSession("/admin/configuracion-pagos");const supabase=await createSupabaseServerClient();const [{data:next},settings]=await Promise.all([supabase.from("hikes").select("id").gte("starts_at",new Date().toISOString()).is("deleted_at",null).order("starts_at").limit(1).maybeSingle(),getPaymentSettingsForAdmin()]);return <main className="admin-page"><AdminNav active="/admin/configuracion-pagos" hikeId={next?.id}/><section className="admin-content"><AdminMobileNav/><header><div><p>COBROS Y CREDENCIALES</p><h1>Configuración de pagos.</h1></div></header><section className="admin-panel admin-module-panel"><PaymentSettingsForm initial={settings}/></section></section></main>}
