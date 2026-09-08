import Link from "next/link";
import { Bolt, ExternalLink, Pencil, Plus } from "lucide-react";
import { requireStaffSession } from "../../lib/auth/guards";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { AdminMobileNav, AdminNav } from "../admin-nav";
import { adminDate, money } from "../admin-utils";
import { HikeDeleteButton } from "../hike-delete-button";

export const dynamic = "force-dynamic";

export default async function HikesAdminPage() {
  await requireStaffSession("/admin/hikes");
  const supabase = await createSupabaseServerClient();
  const { data: hikes } = await supabase.from("hikes")
    .select("id,name,slug,starts_at,location_name,capacity,max_dogs,price_cents,dog_price_cents,pricing_mode,published,cover_path,transport_configurations(mode,capacity,price_cents,departure_place)")
    .is("deleted_at", null).order("starts_at", { ascending: false });
  const next = [...(hikes ?? [])].reverse().find((hike) => new Date(hike.starts_at) >= new Date());
  return <main className="admin-page">
    <AdminNav active="/admin/hikes" hikeId={next?.id} />
    <section className="admin-content">
      <AdminMobileNav />
      <header><div><p>PROGRAMACIÓN</p><h1>Hikes.</h1></div><div className="admin-head-actions"><Link href="/admin/hikes/nuevo"><Plus /> NUEVO HIKE</Link></div></header>
      <section className="admin-panel admin-module-panel">
        <div className="admin-section-head"><div><p>AVENTURAS</p><h2>{hikes?.length ?? 0} hikes configurados</h2></div></div>
        <div className="admin-hike-list admin-hike-list-detailed">
          {hikes?.map((hike) => {
            const transportValue = Array.isArray(hike.transport_configurations) ? hike.transport_configurations[0] : hike.transport_configurations;
            return <article key={hike.id}>
              <time dateTime={hike.starts_at}>{adminDate(hike.starts_at)}</time>
              <div><strong>{hike.name}</strong><small>{hike.location_name} · {hike.capacity} lugares · {hike.pricing_mode === "PERSON_DOG_BUNDLE" ? `${money(hike.price_cents)} paquete` : `${money(hike.price_cents)} persona + ${money(hike.dog_price_cents)} perrito`}</small><small>Transporte: {transportValue?.mode === "NONE" || !transportValue ? "sin transporte" : `${transportValue.mode === "INCLUDED" ? "incluido" : money(transportValue.price_cents)} · ${transportValue.departure_place ?? "salida por definir"}`}</small></div>
              <span className={hike.published ? "status-live" : ""}>{hike.published ? "PUBLICADO" : "BORRADOR"}</span>
              <div className="admin-item-actions">
                <Link href={`/aventuras/${hike.slug}`}><ExternalLink /> VER</Link>
                <Link href={`/admin/hikes/${hike.id}/editar`}><Pencil /> EDITAR</Link>
                <Link className="admin-operate" href={`/admin/hike-mode?hike=${hike.id}`}><Bolt /> OPERAR</Link>
                <HikeDeleteButton hikeId={hike.id} hikeName={hike.name} />
              </div>
            </article>;
          })}
        </div>
      </section>
    </section>
  </main>;
}
