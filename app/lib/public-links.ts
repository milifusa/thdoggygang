const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);
const WHATSAPP_HOSTS = new Set([
  "wa.me",
  "api.whatsapp.com",
  "web.whatsapp.com",
  "www.whatsapp.com",
]);

function parseHttps(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function normalizeInstagramUrl(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  const url = parseHttps(text);
  return url && INSTAGRAM_HOSTS.has(url.hostname.toLowerCase())
    ? url.toString()
    : "";
}

export function normalizeInstagramEmbed(value: unknown) {
  const normalized = normalizeInstagramUrl(value);
  if (!normalized) return "";
  const url = new URL(normalized);
  if (!/^\/(p|reel)\/[A-Za-z0-9_-]+\//.test(url.pathname)) return "";
  return normalized;
}

export function normalizeWhatsappUrl(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.startsWith("#")) return "";

  const digits = text.replace(/\D/g, "");
  if (/^\d{10}$/.test(digits)) return `https://wa.me/52${digits}`;
  if (/^52\d{10}$/.test(digits) && !text.includes("://"))
    return `https://wa.me/${digits}`;

  const url = parseHttps(text);
  return url && WHATSAPP_HOSTS.has(url.hostname.toLowerCase())
    ? url.toString()
    : "";
}

export function normalizeLegalUrl(value: unknown, fallback = "/terminos") {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.startsWith("#")) return fallback;
  if (text.startsWith("/") && !text.startsWith("//")) return text;
  return parseHttps(text)?.toString() ?? fallback;
}
