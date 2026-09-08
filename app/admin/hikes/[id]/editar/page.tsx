import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffSession } from "../../../../lib/auth/guards";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { hikeCoverUrl } from "../../../../lib/data";
import {
  NewHikeForm,
  type HikeFormInitial,
} from "../../nuevo/form";

export const dynamic = "force-dynamic";

export default async function EditHikePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireStaffSession(`/admin/hikes/${id}/editar`);
  let initial: HikeFormInitial | undefined;
  if (session.mode === "live") {
    const supabase = await createSupabaseServerClient();
    const { data: hike } = await supabase
      .from("hikes")
      .select("name, slug, description, starts_at, location_name, price_cents, dog_price_cents, pricing_mode, capacity, max_dogs, distance_km, elevation_m, duration_minutes, difficulty, terrain, includes, excludes, packing_list, dog_suitability, rules, cancellation_policy, cover_path, published, transport_configurations(mode, capacity, price_cents, departure_place, departure_at, return_details, rules)")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!hike) notFound();
    const localDate = new Intl.DateTimeFormat("sv-SE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Mexico_City",
    }).format(new Date(hike.starts_at)).replace(" ", "T");
    const transportValue = Array.isArray(hike.transport_configurations) ? hike.transport_configurations[0] : hike.transport_configurations;
    const transportLocalDate = transportValue?.departure_at ? new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Mexico_City" }).format(new Date(transportValue.departure_at)).replace(" ", "T") : "";
    initial = {
      name: hike.name,
      slug: hike.slug,
      description: hike.description,
      startsAt: localDate,
      location: hike.location_name,
      price: hike.price_cents / 100,
      dogPrice: hike.dog_price_cents / 100,
      pricingMode: hike.pricing_mode === "PERSON_DOG_BUNDLE" ? "PERSON_DOG_BUNDLE" : "PER_PERSON",
      capacity: hike.capacity,
      maxDogs: hike.max_dogs,
      distance: hike.distance_km === null ? null : Number(hike.distance_km),
      elevation: hike.elevation_m,
      duration: hike.duration_minutes,
      difficulty: hike.difficulty,
      terrain: hike.terrain,
      includes: hike.includes ?? [],
      excludes: hike.excludes ?? [],
      packingList: hike.packing_list ?? [],
      dogSuitability: hike.dog_suitability ?? "",
      rules: hike.rules ?? "",
      cancellationPolicy: hike.cancellation_policy ?? "",
      coverUrl: hike.cover_path?.startsWith(`${id}/`) ? hikeCoverUrl(id, hike.cover_path) : null,
      published: hike.published,
      transportMode: transportValue?.mode === "OPTIONAL" || transportValue?.mode === "INCLUDED" ? transportValue.mode : "NONE",
      transportCapacity: transportValue?.capacity ?? null,
      transportPrice: (transportValue?.price_cents ?? 0) / 100,
      transportDeparturePlace: transportValue?.departure_place ?? "",
      transportDepartureAt: transportLocalDate,
      transportReturnDetails: transportValue?.return_details ?? "",
      transportRules: transportValue?.rules ?? "",
    };
  }
  return (
    <main className="admin-form-page">
      <header>
        <Link href="/admin">DASHBOARD</Link>
        <Link className="wordmark" href="/">
          THE DOGGY <span>GANG</span>
        </Link>
        <span>ADMIN</span>
      </header>
      <section>
        <p className="eyebrow">ADMIN · HIKES</p>
        <h1>Edita la aventura.</h1>
        <p>Actualiza la información publicada y guarda los cambios.</p>
        <NewHikeForm
          demo={session.mode === "demo"}
          hikeId={id}
          initial={initial}
        />
      </section>
    </main>
  );
}
