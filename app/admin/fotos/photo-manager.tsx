"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ExternalLink, Save, Trash2, Upload } from "lucide-react";

export type AdminPhoto = { id:string; title:string|null; caption:string|null; access:"FREE_WATERMARKED"|"FREE_ORIGINAL"|"PAID"; price_cents:number|null; url:string };

export function PhotoManager({ hikeId, photos }: { hikeId:string; photos:AdminPhoto[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("upload"); setMessage("");
    const form = new FormData(event.currentTarget); form.set("hikeId", hikeId);
    const response = await fetch("/api/admin/photos", { method:"POST", body:form }); const result = await response.json() as {error?:string;uploaded?:number};
    setBusy(""); if (!response.ok) return setMessage(result.error ?? "No pudimos cargar las fotos.");
    setMessage(`${result.uploaded ?? 0} fotos cargadas.`); event.currentTarget.reset(); router.refresh();
  }
  async function save(photo: AdminPhoto, form: HTMLFormElement) {
    setBusy(photo.id); setMessage(""); const data = new FormData(form);
    const response = await fetch(`/api/admin/photos/${photo.id}`, { method:"PATCH", headers:{"content-type":"application/json"}, body:JSON.stringify({ title:data.get("title") || null, caption:data.get("caption") || null, access:data.get("access"), priceCents:Math.round(Number(data.get("price") || 0)*100) }) });
    const result=await response.json() as {error?:string}; setBusy(""); if(!response.ok) return setMessage(result.error ?? "No pudimos guardar la foto."); setMessage("Foto actualizada."); router.refresh();
  }
  async function remove(photo: AdminPhoto) {
    if (!window.confirm("¿Quitar esta foto de la galería?")) return; setBusy(photo.id);
    const response=await fetch(`/api/admin/photos/${photo.id}`,{method:"DELETE"}); const result=await response.json() as {error?:string}; setBusy("");
    if(!response.ok) return setMessage(result.error ?? "No pudimos borrar la foto."); setMessage("Foto eliminada."); router.refresh();
  }
  return <>
    <form className="photo-upload-form" onSubmit={upload}>
      <div><strong>Cargar fotos</strong><span>Puedes subir hasta 12 imágenes a la vez. Se crean vistas previas optimizadas automáticamente.</span></div>
      <label>ACCESO<select name="access" defaultValue="PAID"><option value="PAID">De pago</option><option value="FREE_WATERMARKED">Gratis con marca</option><option value="FREE_ORIGINAL">Original gratis</option></select></label>
      <label>PRECIO MXN<input name="price" type="number" min="0" defaultValue="90" /></label>
      <label className="photo-file-picker"><Upload /> SELECCIONAR FOTOS<input required multiple name="photos" type="file" accept="image/jpeg,image/png,image/webp" /></label>
      <button className="button button-primary" disabled={busy==="upload"}>{busy==="upload" ? "CARGANDO…" : "CARGAR"}</button>
    </form>
    {message && <p className="admin-feedback">{message}</p>}
    <div className="admin-photo-grid">
      {photos.map((photo) => <form key={photo.id} onSubmit={(event)=>{event.preventDefault(); void save(photo,event.currentTarget);}}>
        <img src={photo.url} alt={photo.title ?? "Foto del hike"} />
        <label>TÍTULO<input name="title" defaultValue={photo.title ?? ""} /></label>
        <label>DESCRIPCIÓN<input name="caption" defaultValue={photo.caption ?? ""} /></label>
        <div><label>ACCESO<select name="access" defaultValue={photo.access}><option value="PAID">De pago</option><option value="FREE_WATERMARKED">Gratis con marca</option><option value="FREE_ORIGINAL">Original gratis</option></select></label><label>PRECIO<input name="price" type="number" min="0" defaultValue={(photo.price_cents ?? 0)/100} /></label></div>
        <div className="admin-photo-actions"><button disabled={busy===photo.id}><Save /> GUARDAR</button><button type="button" disabled={busy===photo.id} onClick={()=>void remove(photo)}><Trash2 /> BORRAR</button><a href={photo.url} target="_blank" rel="noreferrer"><ExternalLink /> VISTA</a></div>
      </form>)}
    </div>
  </>;
}
