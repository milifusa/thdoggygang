"use client";
import { FormEvent, useState } from "react";

export function WaitlistButton({ hikeId, slug }: { hikeId: string; slug: string }) {
  const [open,setOpen]=useState(false); const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setBusy(true);const data=new FormData(event.currentTarget);const response=await fetch("/api/waitlist",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({hikeId,peopleCount:Number(data.get("peopleCount")),dogCount:Number(data.get("dogCount"))})});const result=await response.json() as {error?:string;position?:number;reserveUrl?:string};setBusy(false);if(response.status===401){location.href=`/ingresar?next=${encodeURIComponent(`/aventuras/${slug}`)}`;return;}if(result.reserveUrl){location.href=result.reserveUrl;return;}setMessage(response.ok?`Quedaste en la lista${result.position?` en la posición ${result.position}`:""}. Te avisaremos si se libera lugar.`:result.error??"No pudimos registrarte.");};
  if(!open)return <button className="button button-primary full-button" type="button" onClick={()=>setOpen(true)}>UNIRME A LA LISTA DE ESPERA</button>;
  return <form className="waitlist-form" id="lista-espera" onSubmit={submit}><strong>LISTA DE ESPERA</strong><label>PERSONAS<input name="peopleCount" type="number" min="1" max="12" defaultValue="1"/></label><label>PERRITOS<input name="dogCount" type="number" min="0" max="12" defaultValue="1"/></label><button className="button button-primary" disabled={busy}>{busy?"GUARDANDO…":"GUARDAR MI LUGAR"}</button>{message&&<p role="status">{message}</p>}</form>;
}
