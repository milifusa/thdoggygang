export const SITE_ORIGIN = "https://www.thedoggygang.com";

export function absoluteSiteUrl(path = "/") {
  return new URL(path, SITE_ORIGIN).toString();
}
