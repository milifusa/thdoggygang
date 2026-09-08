import { requireStaffSession } from "../../lib/auth/guards";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { AdminMobileNav, AdminNav } from "../admin-nav";
import { TeamManager, type TeamMember } from "./team-manager";

export const dynamic = "force-dynamic";
export default async function TeamPage() {
  await requireStaffSession("/admin/equipo");
  const supabase = await createSupabaseServerClient();
  const [{ data: members }, { data: next }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,first_name,last_name,email,phone,role,active,created_at")
      .in("role", ["ADMIN", "GUIDE"])
      .is("deleted_at", null)
      .order("role")
      .order("first_name"),
    supabase
      .from("hikes")
      .select("id")
      .gte("starts_at", new Date().toISOString())
      .is("deleted_at", null)
      .order("starts_at")
      .limit(1)
      .maybeSingle(),
  ]);
  return (
    <main className="admin-page">
      <AdminNav active="/admin/equipo" hikeId={next?.id} />
      <section className="admin-content">
        <AdminMobileNav />
        <header>
          <div>
            <p>ACCESOS Y PERMISOS</p>
            <h1>Equipo.</h1>
          </div>
        </header>
        <section className="kpi-grid admin-kpi-first">
          <article>
            <span>ADMINISTRADORES</span>
            <strong>
              {members?.filter((m) => m.role === "ADMIN" && m.active).length ??
                0}
            </strong>
            <small>acceso completo</small>
          </article>
          <article>
            <span>GUÍAS</span>
            <strong>
              {members?.filter((m) => m.role === "GUIDE" && m.active).length ??
                0}
            </strong>
            <small>operación de hikes</small>
          </article>
          <article>
            <span>INACTIVOS</span>
            <strong>{members?.filter((m) => !m.active).length ?? 0}</strong>
            <small>sin acceso</small>
          </article>
        </section>
        <section className="admin-panel admin-module-panel">
          <div className="admin-section-head">
            <div>
              <p>PERSONAS AUTORIZADAS</p>
              <h2>Administra el equipo</h2>
            </div>
          </div>
          <TeamManager members={(members ?? []) as TeamMember[]} />
        </section>
      </section>
    </main>
  );
}
