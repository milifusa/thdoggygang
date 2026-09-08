import { Download } from "lucide-react";
import { requireStaffSession } from "../../lib/auth/guards";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { AdminMobileNav, AdminNav } from "../admin-nav";
import { adminDate } from "../admin-utils";

export const dynamic = "force-dynamic";

export default async function ReportsAdminPage() {
  await requireStaffSession("/admin/reportes");
  const supabase = await createSupabaseServerClient();
  const { data: hikes } = await supabase.from("hikes").select("id,name,starts_at").is("deleted_at", null).order("starts_at", { ascending: false }).limit(100);
  const next = [...(hikes ?? [])].reverse().find((hike) => new Date(hike.starts_at) >= new Date());
  return <main className="admin-page"><AdminNav active="/admin/reportes" hikeId={next?.id} /><section className="admin-content"><AdminMobileNav />
    <header><div><p>EXPORTACIONES</p><h1>Reportes.</h1></div></header>
    <section className="admin-panel admin-module-panel"><div className="admin-section-head"><div><p>POR HIKE</p><h2>Archivos útiles para operar y conciliar</h2></div></div>
      <div className="report-grid">
        {hikes?.map((hike) => <article key={hike.id}><div><strong>{hike.name}</strong><small>{adminDate(hike.starts_at)}</small></div>
          <a href={`/api/admin/reports/manifest?hike=${hike.id}`}><Download /> MANIFIESTO DE ASISTENTES</a>
          <a href={`/api/admin/reports/payments?hike=${hike.id}`}><Download /> CONCILIACIÓN DE PAGOS</a>
        </article>)}
      </div>
    </section>
  </section></main>;
}
