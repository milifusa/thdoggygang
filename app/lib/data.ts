import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "./config";

export type PricingMode = "PER_PERSON" | "PERSON_DOG_BUNDLE";

export type Adventure = {
  id: string;
  slug: string;
  title: string;
  date: string;
  shortDate: string;
  time: string;
  location: string;
  price: number;
  dogPrice: number;
  pricingMode: PricingMode;
  distance: string;
  duration: string;
  difficulty: string;
  elevation: string;
  terrain: string;
  spots: number;
  image: string;
  description: string;
  includes: string[];
  excludes: string[];
  packingList: string[];
  dogSuitability: string;
  rules: string;
  cancellationPolicy: string;
  transportAvailable: boolean;
  transportPrice: number;
  transportDeparture: string | null;
};

const defaultDogSuitability =
  "Recomendada para perros sociables, sanos y con condición para caminar al menos 2.5 horas. Tamaños pequeños bien acondicionados también son bienvenidos.";
const defaultRules =
  "Todos los perritos deben permanecer con correa. Pedimos respeto por el entorno, los ritmos del grupo y las indicaciones de guías.";
const defaultCancellation =
  "Puedes transferir tu lugar hasta 72 horas antes. Las rutas pueden reprogramarse por condiciones meteorológicas.";

const demoAdventures: Adventure[] = [
  {
    id: "demo-sendero",
    slug: "sendero-del-duende",
    title: "Sendero del Duende",
    date: "20 de septiembre de 2026",
    shortDate: "20 SEP",
    time: "07:00 AM",
    location: "Cholula, Puebla",
    price: 350,
    dogPrice: 0,
    pricingMode: "PER_PERSON",
    distance: "8 km",
    duration: "2.5 h",
    difficulty: "Fácil / media",
    elevation: "320 m",
    terrain: "Bosque y sendero",
    spots: 40,
    image: "/brand/profile-trail-sun.png",
    description:
      "Un sendero entre bosque, vistas abiertas y rincones que parecen salidos de un cuento.",
    includes: ["Guías de The Doggy Gang", "Kit de bienvenida", "Hidratación durante la ruta", "Galería digital de recuerdos"],
    excludes: [],
    packingList: ["Correa fija y placa", "Agua para tu perrito", "Calzado con buena tracción", "Bolsitas y snacks"],
    dogSuitability: defaultDogSuitability,
    rules: defaultRules,
    cancellationPolicy: defaultCancellation,
    transportAvailable: true,
    transportPrice: 200,
    transportDeparture: "Angelópolis",
  },
];

export function hikeCoverUrl(hikeId: string, coverPath: string | null | undefined) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl || !coverPath || !coverPath.startsWith(`${hikeId}/`)) {
    return "/brand/profile-trail-sun.png";
  }
  const encodedPath = coverPath.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl}/storage/v1/object/public/hike-covers/${encodedPath}`;
}

function mapHike(row: Record<string, unknown>): Adventure {
  const startsAt = new Date(String(row.starts_at));
  const transportValue = Array.isArray(row.transport_configurations)
    ? row.transport_configurations[0]
    : row.transport_configurations;
  const transport = transportValue && typeof transportValue === "object"
    ? transportValue as { mode?: string; price_cents?: number; departure_place?: string | null }
    : null;
  const formatDate = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Mexico_City",
  });
  const shortParts = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Mexico_City",
  }).formatToParts(startsAt);
  const day = shortParts.find((part) => part.type === "day")?.value ?? "";
  const month = (shortParts.find((part) => part.type === "month")?.value ?? "").replace(".", "").toUpperCase();
  const durationMinutes = row.duration_minutes ? Number(row.duration_minutes) : 0;
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.name),
    date: formatDate.format(startsAt),
    shortDate: `${day} ${month}`,
    time: new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/Mexico_City",
    }).format(startsAt),
    location: String(row.location_name),
    price: Number(row.price_cents ?? 0) / 100,
    dogPrice: Number(row.dog_price_cents ?? 0) / 100,
    pricingMode: row.pricing_mode === "PERSON_DOG_BUNDLE" ? "PERSON_DOG_BUNDLE" : "PER_PERSON",
    distance: row.distance_km ? `${Number(row.distance_km)} km` : "Por definir",
    duration: durationMinutes ? `${Number((durationMinutes / 60).toFixed(1))} h` : "Por definir",
    difficulty: String(row.difficulty || "Por definir"),
    elevation: row.elevation_m === null || row.elevation_m === undefined ? "Por definir" : `${Number(row.elevation_m)} m`,
    terrain: String(row.terrain || "Por definir"),
    spots: Number(row.capacity ?? 0),
    image: hikeCoverUrl(String(row.id), row.cover_path ? String(row.cover_path) : null),
    description: String(row.description),
    includes: Array.isArray(row.includes) ? row.includes.map(String) : [],
    excludes: Array.isArray(row.excludes) ? row.excludes.map(String) : [],
    packingList: Array.isArray(row.packing_list) ? row.packing_list.map(String) : [],
    dogSuitability: String(row.dog_suitability || defaultDogSuitability),
    rules: String(row.rules || defaultRules),
    cancellationPolicy: String(row.cancellation_policy || defaultCancellation),
    transportAvailable: Boolean(transport && transport.mode !== "NONE"),
    transportPrice: Number(transport?.price_cents ?? 0) / 100,
    transportDeparture: transport?.departure_place ?? null,
  };
}

export async function getAdventures(): Promise<Adventure[]> {
  if (!isSupabaseConfigured()) return demoAdventures;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase
    .from("hikes")
    .select("id, slug, name, description, starts_at, location_name, price_cents, dog_price_cents, pricing_mode, capacity, distance_km, elevation_m, duration_minutes, difficulty, terrain, includes, excludes, packing_list, dog_suitability, rules, cancellation_policy, cover_path, transport_configurations(mode, price_cents, departure_place)")
    .eq("published", true)
    .is("deleted_at", null)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at");
  if (error) {
    console.error("Could not load public hikes", error.message);
    return [];
  }
  return (data ?? []).map((row) => mapHike(row as unknown as Record<string, unknown>));
}

export async function getAdventure(slug: string): Promise<Adventure | null> {
  const adventures = await getAdventures();
  return adventures.find((item) => item.slug === slug) ?? null;
}

export function calculateHikeSubtotal(
  adventure: Adventure,
  peopleCount: number,
  dogCount: number,
) {
  if (adventure.pricingMode === "PERSON_DOG_BUNDLE") {
    const extraDogs = Math.max(0, dogCount - peopleCount);
    return peopleCount * adventure.price + extraDogs * adventure.dogPrice;
  }
  return peopleCount * adventure.price + dogCount * adventure.dogPrice;
}
