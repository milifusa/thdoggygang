import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "./config";
import { siteAssetUrl } from "./landing-content";

export type LoginContent = {
  quote: string; quoteVisible: boolean; eyebrow: string; title: string; description: string;
  emailTab: string; phoneTab: string; emailLabel: string; emailPlaceholder: string; emailCta: string;
  phoneLabel: string; phonePlaceholder: string; phoneCta: string; codeLabel: string; verifyCta: string;
  legalText: string; termsLabel: string; termsUrl: string; privacyLabel: string; privacyUrl: string;
  imagePosition: "center" | "top" | "bottom" | "left" | "right";
};

export const defaultLoginContent: LoginContent = {
  quote: "Cada aventura empieza con un sí.", quoteVisible: true,
  eyebrow: "BIENVENIDO A TU MANADA", title: "Qué gusto verte de nuevo.",
  description: "Entra sin contraseñas. Te enviaremos un acceso seguro.",
  emailTab: "EMAIL", phoneTab: "TELÉFONO", emailLabel: "TU EMAIL", emailPlaceholder: "hola@email.com", emailCta: "ENVIAR ACCESO",
  phoneLabel: "TU TELÉFONO", phonePlaceholder: "2220000000", phoneCta: "ENVIAR CÓDIGO", codeLabel: "CÓDIGO DE 6 DÍGITOS", verifyCta: "VERIFICAR Y ENTRAR",
  legalText: "Al continuar aceptas nuestros", termsLabel: "términos y condiciones", termsUrl: "/terminos",
  privacyLabel: "aviso de privacidad", privacyUrl: "/privacidad", imagePosition: "center",
};

const fallbackImage = "https://images.unsplash.com/photo-1534361960057-19889db9621e?auto=format&fit=crop&w=1600&q=90";

export async function getLoginSettings() {
  if (!isSupabaseConfigured()) return { content: defaultLoginContent, desktopImage: fallbackImage, mobileImage: fallbackImage, metadata: {} };
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await client.from("site_content").select("content,hero_image_path,mobile_image_path,image_metadata").eq("id", "login").maybeSingle();
  const raw = data?.content && typeof data.content === "object" ? data.content as Partial<LoginContent> : {};
  const content = { ...defaultLoginContent, ...raw };
  const desktopImage = siteAssetUrl(data?.hero_image_path) || fallbackImage;
  return { content, desktopImage, mobileImage: siteAssetUrl(data?.mobile_image_path) || desktopImage, metadata: data?.image_metadata ?? {} };
}
