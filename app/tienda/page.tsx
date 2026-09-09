import { SiteHeader } from "../components/SiteHeader";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { getProducts } from "../lib/products";
import { Shop } from "./shop";
import {
  getBankTransferConfig,
  getStripeSecretKey,
} from "../lib/payment-config";
import { getShopSettings } from "../lib/shop-settings";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Equipo de hiking | The Doggy Gang",
  description: "Correas y accesorios para caminar en manada.",
};
export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ hike?: string }>;
}) {
  const query = await searchParams;
  const [products, supabase] = await Promise.all([
    getProducts(),
    createSupabaseServerClient(),
  ]);
  const [
    { data: hikes },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase
      .from("hikes")
      .select("id,name,slug,starts_at")
      .gte("starts_at", new Date().toISOString())
      .eq("published", true)
      .is("deleted_at", null)
      .order("starts_at"),
    supabase.auth.getUser(),
  ]);
  let bookedHikeIds = new Set<string>();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (profile) {
      const { data: bookings } = await supabase
        .from("bookings")
        .select("hike_id")
        .eq("profile_id", profile.id)
        .eq("status", "CONFIRMED");
      bookedHikeIds = new Set(
        (bookings ?? []).map((booking) => booking.hike_id),
      );
    }
  }
  const options = (hikes ?? []).map((h) => ({
    id: h.id,
    slug: h.slug,
    name: h.name,
    date: new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeZone: "America/Mexico_City",
    }).format(new Date(h.starts_at)),
    booked: bookedHikeIds.has(h.id),
  }));
  const initialHikeId = options.some(
    (hike) => hike.booked && hike.id === query.hike,
  )
    ? query.hike
    : "";
  const [bankTransfer, stripeSecret, shopSettings] = await Promise.all([
    getBankTransferConfig(),
    getStripeSecretKey(),
    getShopSettings(),
  ]);
  return (
    <>
      <SiteHeader />
      <Shop
        products={products}
        hikes={options}
        initialHikeId={initialHikeId}
        cardPaymentsEnabled={Boolean(stripeSecret)}
        bankTransfer={bankTransfer}
        shopSettings={shopSettings}
      />
    </>
  );
}
