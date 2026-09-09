import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "./lib/site-url";

const origin = SITE_ORIGIN;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/auth/",
        "/ingresar",
        "/mi-manada/",
        "/mis-fotos",
        "/reservar/",
        "/reserva/",
      ],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
