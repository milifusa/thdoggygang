import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { publicPhotoUrl } from "../../lib/photos";
import { PhotoGallery, type GalleryPhoto } from "./photo-gallery";

export const dynamic = "force-dynamic";

export default async function GalleryPage({ params }: { params:Promise<{slug:string}> }) {
  const { slug }=await params; const supabase=await createSupabaseServerClient();
  const {data:hike}=await supabase.from("hikes").select("id,name,starts_at").eq("slug",slug).is("deleted_at",null).maybeSingle();
  if(!hike) notFound();
  const {data:gallery}=await supabase.from("hike_galleries").select("id,title,published_at").eq("hike_id",hike.id).not("published_at","is",null).maybeSingle();
  const {data:rows}=gallery ? await supabase.from("photos").select("id,title,caption,access,price_cents,preview_path,watermarked_path").eq("gallery_id",gallery.id).is("deleted_at",null).order("sort_order").order("created_at") : {data:[]};
  const photos:GalleryPhoto[]=(rows??[]).map((photo)=>({id:photo.id,title:photo.title,caption:photo.caption,access:photo.access,priceCents:photo.price_cents??0,url:publicPhotoUrl(photo.access==="PAID"||photo.access==="FREE_WATERMARKED"?"hike-watermarked":"hike-previews",photo.access==="PAID"||photo.access==="FREE_WATERMARKED"?photo.watermarked_path:photo.preview_path)}));
  return <PhotoGallery hikeName={hike.name} hikeSlug={slug} hikeDate={hike.starts_at} photos={photos}/>;
}
