import Link from "next/link";
import { ChevronRight, Download, FileCheck2, ShieldCheck } from "lucide-react";
import { requireStaffSession } from "../../lib/auth/guards";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { AdminMobileNav, AdminNav } from "../admin-nav";
import { adminDate, bookingStatus, money } from "../admin-utils";

export const dynamic = "force-dynamic";

type WaiverRow = { id: string; signed_at: string; pdf_path: string; document_hash: string };
type BookingRow = {
  id: string;
  booking_number: string;
  status: string;
  total_cents: number;
  created_at: string;
  hike: { id: string; name: string; starts_at: string } | Array<{ id: string; name: string; starts_at: string }> | null;
  signed_waivers: WaiverRow[];
};

export default async function ClientsAdminPage() {
  await requireStaffSession("/admin/clientes");
  const supabase = await createSupabaseServerClient();
  const [{ data: clients }, { data: next }] = await Promise.all([
    supabase.from("profiles").select("id,first_name,last_name,email,phone,created_at,person_profiles(id),dogs(id),bookings(id,booking_number,status,total_cents,created_at,hike:hikes(id,name,starts_at),signed_waivers(id,signed_at,pdf_path,document_hash))").eq("role", "CLIENT").is("deleted_at", null).order("created_at", { ascending: false }).limit(300),
    supabase.from("hikes").select("id").gte("starts_at", new Date().toISOString()).is("deleted_at", null).order("starts_at").limit(1).maybeSingle(),
  ]);

  return <main className="admin-page">
    <AdminNav active="/admin/clientes" hikeId={next?.id} />
    <section className="admin-content">
      <AdminMobileNav />
      <header><div><p>EXPEDIENTES Y RESPONSIVAS</p><h1>Clientes.</h1></div></header>
      <section className="admin-panel admin-module-panel">
        <div className="admin-section-head"><div><p>USUARIOS REGISTRADOS</p><h2>{clients?.length ?? 0} clientes</h2></div><ShieldCheck aria-hidden="true" /></div>
        <div className="admin-client-list">
          {clients?.map((client) => {
            const bookings = (client.bookings ?? []) as BookingRow[];
            const waiverCount = new Set(bookings.flatMap((booking) => booking.signed_waivers.map((waiver) => waiver.pdf_path))).size;
            return <details className="admin-client-card" key={client.id}>
              <summary>
                <div className="admin-client-avatar">{`${client.first_name?.[0] ?? ""}${client.last_name?.[0] ?? ""}`.toUpperCase()}</div>
                <div><strong>{`${client.first_name ?? ""} ${client.last_name ?? ""}`.trim() || "Cliente"}</strong><small>{client.email ?? client.phone ?? "Sin contacto"}</small></div>
                <span>{bookings.length} reservaciones</span><span>{waiverCount} responsivas</span><ChevronRight aria-hidden="true" />
              </summary>
              <div className="admin-client-detail">
                <div className="admin-client-contact"><span>CONTACTO</span><strong>{client.email ?? "Sin correo"}</strong><strong>{client.phone ?? "Sin teléfono"}</strong><small>{client.person_profiles.length} personas · {client.dogs.length} perritos</small></div>
                <div className="admin-client-bookings">
                  {bookings.length ? bookings.map((booking) => {
                    const hike = Array.isArray(booking.hike) ? booking.hike[0] : booking.hike;
                    const uniqueWaivers = Array.from(new Map(booking.signed_waivers.map((waiver) => [waiver.pdf_path, waiver])).values());
                    return <article key={booking.id}>
                      <div><span>{booking.booking_number}</span><strong>{hike?.name ?? "Hike"}</strong><small>{adminDate(booking.created_at)} · {money(booking.total_cents)} · {bookingStatus(booking.status)}</small></div>
                      <div className="admin-waiver-files">
                        {uniqueWaivers.length ? uniqueWaivers.map((waiver) => <Link href={`/api/admin/waivers/${waiver.id}/download`} key={waiver.id}><FileCheck2 aria-hidden="true" /><span><strong>Responsiva firmada</strong><small>{adminDate(waiver.signed_at)}</small></span><Download aria-hidden="true" /></Link>) : <span className="admin-no-waiver">Sin responsiva firmada</span>}
                      </div>
                    </article>;
                  }) : <p className="admin-empty-copy">Este cliente todavía no tiene reservaciones.</p>}
                </div>
              </div>
            </details>;
          })}
        </div>
      </section>
    </section>
  </main>;
}
