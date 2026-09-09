"use client";
import { useState } from "react";
import { Mail, RefreshCw } from "lucide-react";

export function ReminderButton({ bookingId }: { bookingId: string }) {
  const [state,setState]=useState<"IDLE"|"SENDING"|"SENT">("IDLE");
  const [message,setMessage]=useState("");
  const send=async()=>{if(!window.confirm("¿Enviar ahora el enlace seguro para continuar esta reservación?"))return;setState("SENDING");setMessage("");const response=await fetch(`/api/admin/bookings/${bookingId}/remind`,{method:"POST"});const payload=await response.json() as {error?:string};if(response.ok){setState("SENT");setMessage("Enviado");}else{setState("IDLE");setMessage(payload.error??"No enviado");}};
  return <span className="reservation-reminder"><button type="button" disabled={state!=="IDLE"} onClick={()=>void send()}>{state==="SENDING"?<RefreshCw className="spin"/>:<Mail/>}{state==="SENT"?"ENVIADO":"RECORDAR"}</button>{message&&<small>{message}</small>}</span>;
}

export function BulkReminderButton({ bookingIds }: { bookingIds: string[] }) {
  const [sending,setSending]=useState(false);const [message,setMessage]=useState("");
  const send=async()=>{if(!bookingIds.length||!window.confirm(`¿Enviar recordatorios a ${bookingIds.length} borradores visibles?`))return;setSending(true);setMessage("");const response=await fetch("/api/admin/bookings/remind",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({bookingIds})});const payload=await response.json() as {results?:Array<{ok:boolean}>;error?:string};const sent=payload.results?.filter((item)=>item.ok).length??0;setMessage(response.ok?`${sent} enviados`:`${sent} enviados; algunos requieren revisión`);setSending(false);};
  return <span className="bulk-reminder"><button disabled={sending||!bookingIds.length} onClick={()=>void send()}>{sending?<RefreshCw className="spin"/>:<Mail/>}RECORDAR BORRADORES</button>{message&&<small>{message}</small>}</span>;
}
