import { ChevronRight } from "lucide-react";
import { requireStaffSession } from "../../lib/auth/guards";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { AdminMobileNav, AdminNav } from "../admin-nav";
import { adminDate, bookingStatus, money, profileName } from "../admin-utils";

export const dynamic = "force-dynamic";

export default async function ReservationsAdminPage() {
  await requireStaffSession("/admin/reservaciones");
  const supabase = await createSupabaseServerClient();
  const [{ data: bookings }, { data: next }] = await Promise.all([
    supabase.from("bookings").select("id,booking_number,status,total_cents,created_at,profile:profiles(first_name,last_name,email,phone),hike:hikes(id,name,starts_at),booking_participants(id,snapshot),booking_dogs(id,snapshot),transport_reservations(id),signed_waivers(id),check_ins(id)").neq("status","CANCELLED").order("created_at", { ascending: false }).limit(300),
    supabase.from("hikes").select("id").gte("starts_at", new Date().toISOString()).is("deleted_at", null).order("starts_at").limit(1).maybeSingle(),
  ]);
  return <main className="admin-page"><AdminNav active="/admin/reservaciones" hikeId={next?.id} /><section className="admin-content"><AdminMobileNav />
    <header><div><p>CLIENTES Y ASISTENTES</p><h1>Reservaciones.</h1></div></header>
    <section className="admin-table admin-module-panel"><div className="admin-section-head"><div><p>HISTORIAL</p><h2>{bookings?.length ?? 0} reservaciones</h2></div></div>
      {bookings?.map((booking) => {
        const hike = Array.isArray(booking.hike) ? booking.hike[0] : booking.hike;
        const profileValue = Array.isArray(booking.profile) ? booking.profile[0] : booking.profile;
        return <details className="admin-booking" key={booking.id}><summary className="admin-row admin-row-wide">
          <span>{booking.booking_number}</span><strong>{profileName(booking.profile)}</strong><small>{hike?.name ?? "Hike"} · {booking.booking_participants.length} personas · {booking.booking_dogs.length} perritos</small><strong>{money(booking.total_cents)}</strong><em className={booking.status === "CONFIRMED" ? "paid" : ""}>{bookingStatus(booking.status)}</em><ChevronRight />
        </summary><div className="admin-booking-detail">
          <div><span>CONTACTO</span><strong>{profileValue?.email ?? "Sin correo"}</strong><strong>{profileValue?.phone ?? "Sin teléfono"}</strong><strong>{adminDate(booking.created_at)}</strong></div>
          <div><span>PERSONAS</span>{booking.booking_participants.map((p) => { const s = p.snapshot as {first_name?:string;last_name?:string}; return <strong key={p.id}>{s.first_name} {s.last_name}</strong>; })}</div>
          <div><span>PERRITOS</span>{booking.booking_dogs.length ? booking.booking_dogs.map((d) => { const s=d.snapshot as {name?:string;breed?:string}; return <strong key={d.id}>{s.name}{s.breed ? ` · ${s.breed}` : ""}</strong>; }) : <strong>Sin perritos</strong>}</div>
          <div><span>OPERACIÓN</span><strong>{booking.transport_reservations.length} lugares de transporte</strong><strong>{booking.signed_waivers.length} responsivas</strong><strong>{booking.check_ins.length} check-ins</strong></div>
        </div></details>;
      })}
    </section>
  </section></main>;
}
