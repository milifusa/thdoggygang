import { createSupabaseServerClient } from "./supabase/server";
import {
  getBankTransferConfig,
  getStripeSecretKey,
} from "./payment-config";
import { getShopSettings } from "./shop-settings";

export type ShopHikeOption = {
  id: string;
  slug: string;
  name: string;
  date: string;
  booked: boolean;
};

export async function getShopContext(requestedHikeId = "") {
  const supabase = await createSupabaseServerClient();
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
  const options: ShopHikeOption[] = (hikes ?? []).map((hike) => ({
    id: hike.id,
    slug: hike.slug,
    name: hike.name,
    date: new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeZone: "America/Mexico_City",
    }).format(new Date(hike.starts_at)),
    booked: bookedHikeIds.has(hike.id),
  }));
  const initialHikeId = options.some(
    (hike) => hike.booked && hike.id === requestedHikeId,
  )
    ? requestedHikeId
    : "";
  const [bankTransfer, stripeSecret, shopSettings] = await Promise.all([
    getBankTransferConfig(),
    getStripeSecretKey(),
    getShopSettings(),
  ]);
  return {
    hikes: options,
    initialHikeId,
    cardPaymentsEnabled: Boolean(stripeSecret),
    bankTransfer,
    shopSettings,
  };
}
