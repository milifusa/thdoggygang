import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "./config";
import {
  normalizeInstagramEmbed,
  normalizeInstagramUrl,
  normalizeLegalUrl,
  normalizeWhatsappUrl,
} from "./public-links";

export type LandingStep = { title: string; body: string };
export type LandingContent = {
  heroEyebrow: string;
  heroTitle: string;
  heroAccent: string;
  heroIntro: string;
  heroButton: string;
  introEyebrow: string;
  introTitle: string;
  introAccent: string;
  introBody: string;
  introLink: string;
  adventuresEyebrow: string;
  adventuresTitle: string;
  adventuresBody: string;
  adventuresButton: string;
  howEyebrow: string;
  howTitle: string;
  howSteps: LandingStep[];
  instagramEyebrow: string;
  instagramTitle: string;
  instagramBody: string;
  instagramCta: string;
  instagramUrl: string;
  instagramEmbeds: string[];
  quote: string;
  quoteAttribution: string;
  footerText: string;
  footerInstagramUrl: string;
  footerWhatsappUrl: string;
  footerTermsUrl: string;
};

export const defaultLandingContent: LandingContent = {
  heroEyebrow: "HIKES · PERRITOS · NATURALEZA",
  heroTitle: "Aventuras que se disfrutan mejor en",
  heroAccent: "manada.",
  heroIntro:
    "Caminamos juntos, descubrimos lugares increíbles y creamos historias con nuestros mejores amigos.",
  heroButton: "VER PRÓXIMAS AVENTURAS",
  introEyebrow: "SOMOS THE DOGGY GANG",
  introTitle: "No es sólo un hike. Es su día",
  introAccent: "favorito.",
  introBody:
    "Creamos experiencias al aire libre para personas que saben que la vida es mejor con cuatro patas al lado.",
  introLink: "CONOCE A LA MANADA",
  adventuresEyebrow: "ELIGE TU PRÓXIMA HISTORIA",
  adventuresTitle: "Próximas aventuras",
  adventuresBody: "Senderos nuevos, amigos nuevos y muchas colitas felices.",
  adventuresButton: "VER TODAS LAS AVENTURAS",
  howEyebrow: "ASÍ DE FÁCIL",
  howTitle: "Tu próxima aventura, en tres pasos.",
  howSteps: [
    {
      title: "Elige una aventura",
      body: "Encuentra el sendero ideal para ti y tu perrito.",
    },
    {
      title: "Arma tu manada",
      body: "Selecciona quién viene, firma y reserva tu lugar.",
    },
    {
      title: "Disfruta el camino",
      body: "Muestra tu QR, conoce a la manada y crea recuerdos.",
    },
  ],
  instagramEyebrow: "DESDE LA MONTAÑA",
  instagramTitle: "Así se vive en la manada.",
  instagramBody:
    "Rutas reales, perros libres para explorar y recuerdos compartidos desde Puebla.",
  instagramCta: "SEGUIR @THE_DOGGY_GANGMX",
  instagramUrl: "https://www.instagram.com/the_doggy_gangmx/",
  instagramEmbeds: [
    "https://www.instagram.com/p/DcfMAamMgFB/embed/captioned/",
    "https://www.instagram.com/reel/DcyxwONxgfK/embed/captioned/",
    "https://www.instagram.com/reel/Dci9RxaRr7X/embed/captioned/",
  ],
  quote: "Los mejores caminos se recorren con huellas al lado.",
  quoteAttribution: "THE DOGGY GANG · PUEBLA, MX",
  footerText: "Aventuras reales. Perritos felices. Una gran manada.",
  footerInstagramUrl: "https://www.instagram.com/the_doggy_gangmx/",
  footerWhatsappUrl: "",
  footerTermsUrl: "/terminos",
};

export type LandingSettings = {
  content: LandingContent;
  heroImage: string;
  howImage: string;
  heroImagePath: string | null;
  howImagePath: string | null;
};
const fallbackHero = "/brand/profile-trail-sun.png";
const fallbackHow = "/brand/profile-trail-sun.png";

export function siteAssetUrl(path: string | null | undefined) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !path) return "";
  return `${base}/storage/v1/object/public/site-assets/${path.split("/").map(encodeURIComponent).join("/")}`;
}
export async function getLandingSettings(): Promise<LandingSettings> {
  if (!isSupabaseConfigured())
    return {
      content: defaultLandingContent,
      heroImage: fallbackHero,
      howImage: fallbackHow,
      heroImagePath: null,
      howImagePath: null,
    };
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data } = await supabase
    .from("site_content")
    .select("content,hero_image_path,how_image_path")
    .eq("id", "landing")
    .maybeSingle();
  const raw = (
    data?.content && typeof data.content === "object" ? data.content : {}
  ) as Partial<LandingContent>;
  const storedInstagramUrl = normalizeInstagramUrl(raw.instagramUrl);
  const storedFooterInstagramUrl = normalizeInstagramUrl(
    raw.footerInstagramUrl,
  );
  const storedEmbeds = Array.isArray(raw.instagramEmbeds)
    ? raw.instagramEmbeds.map(normalizeInstagramEmbed)
    : [];
  const content = {
    ...defaultLandingContent,
    ...raw,
    instagramUrl: storedInstagramUrl || defaultLandingContent.instagramUrl,
    footerInstagramUrl:
      storedFooterInstagramUrl || defaultLandingContent.footerInstagramUrl,
    footerWhatsappUrl: normalizeWhatsappUrl(raw.footerWhatsappUrl),
    footerTermsUrl: normalizeLegalUrl(raw.footerTermsUrl),
    howSteps:
      Array.isArray(raw.howSteps) && raw.howSteps.length === 3
        ? raw.howSteps
        : defaultLandingContent.howSteps,
    instagramEmbeds:
      storedEmbeds.length === 3 && storedEmbeds.every(Boolean)
        ? storedEmbeds
        : defaultLandingContent.instagramEmbeds,
  };
  return {
    content,
    heroImage: siteAssetUrl(data?.hero_image_path) || fallbackHero,
    howImage: siteAssetUrl(data?.how_image_path) || fallbackHow,
    heroImagePath: data?.hero_image_path ?? null,
    howImagePath: data?.how_image_path ?? null,
  };
}
