import "server-only";
import { createSupabaseServiceClient } from "./supabase/service";
export type ShopSettings = {
  shippingFeeCents: number;
  freeShippingThresholdCents: number | null;
  shippingNote: string;
};
export async function getShopSettings(): Promise<ShopSettings> {
  try {
    const { data } = await createSupabaseServiceClient()
      .from("shop_settings")
      .select("shipping_fee_cents,free_shipping_threshold_cents,shipping_note")
      .eq("id", 1)
      .maybeSingle();
    return {
      shippingFeeCents: data?.shipping_fee_cents ?? 8000,
      freeShippingThresholdCents: data?.free_shipping_threshold_cents ?? 50000,
      shippingNote: data?.shipping_note ?? "Envío nacional dentro de México.",
    };
  } catch {
    return {
      shippingFeeCents: 8000,
      freeShippingThresholdCents: 50000,
      shippingNote: "Envío nacional dentro de México.",
    };
  }
}
