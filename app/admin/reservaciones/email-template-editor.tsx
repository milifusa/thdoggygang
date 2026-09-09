"use client";

import { FormEvent, useState } from "react";
import { Mail, Save } from "lucide-react";

export function EmailTemplateEditor({ template }: { template: { key:string;subject:string;heading:string;body:string;button_label:string;active:boolean } }) {
  const [message,setMessage]=useState("");const [saving,setSaving]=useState(false);
  const save=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setSaving(true);setMessage("");const form=new FormData(event.currentTarget);const response=await fetch(`/api/admin/email-templates/${template.key}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({subject:form.get("subject"),heading:form.get("heading"),body:form.get("body"),buttonLabel:form.get("buttonLabel"),active:form.get("active")==="on"})});const payload=await response.json() as {error?:string};setMessage(response.ok?"Plantilla guardada.":payload.error??"No pudimos guardarla.");setSaving(false);};
  return <details className="email-template-editor"><summary><Mail/> EDITAR CORREO DE RECORDATORIO</summary><form onSubmit={save}><label>ASUNTO<input name="subject" defaultValue={template.subject} required/></label><label>ENCABEZADO<input name="heading" defaultValue={template.heading} required/></label><label>MENSAJE<textarea name="body" defaultValue={template.body} required/></label><label>TEXTO DEL BOTÓN<input name="buttonLabel" defaultValue={template.button_label} required/></label><label className="cms-toggle"><input type="checkbox" name="active" defaultChecked={template.active}/><i/><b>Plantilla activa</b></label><small>Variables disponibles: {"{nombre_cliente}"}, {"{hike}"}, {"{fecha_hike}"}, {"{paso_pendiente}"} y {"{url_continuar}"}.</small><button disabled={saving}><Save/> {saving?"GUARDANDO":"GUARDAR PLANTILLA"}</button>{message&&<p>{message}</p>}</form></details>;
}
