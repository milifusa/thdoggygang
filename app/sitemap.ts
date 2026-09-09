import type { MetadataRoute } from "next";
import { getAdventures } from "./lib/data";
import { getProducts } from "./lib/products";
import { SITE_ORIGIN } from "./lib/site-url";

const origin = SITE_ORIGIN;

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [hikes, products] = await Promise.all([getAdventures(), getProducts()]);
  return [
    { url: origin, changeFrequency: "weekly", priority: 1 },
    {
      url: `${origin}/aventuras`,
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...hikes.map((hike) => ({
      url: `${origin}/aventuras/${hike.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
    { url: `${origin}/tienda`, changeFrequency: "daily" as const, priority: 0.8 },
    ...products.map((product) => ({
      url: `${origin}/tienda/${product.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    { url: `${origin}/terminos`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${origin}/privacidad`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
