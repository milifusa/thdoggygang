export function publicPhotoUrl(bucket: "hike-previews" | "hike-watermarked", path: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return "";
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl}/storage/v1/object/public/${bucket}/${encoded}`;
}
