"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, Save, Trash2 } from "lucide-react";

export type AdminProduct={id:string;name:string;slug:string;description:string;category:string;price_cents:number;stock:number;variants:string[];image:string;pickup_enabled:boolean;shipping_enabled:boolean;shipping_fee_cents:number;active:boolean};

function ProductFields({product}:{product?:AdminProduct}){
  return <div className="product-form-grid">
    <label>NOMBRE<input required name="name" defaultValue={product?.name}/></label><label>SLUG<input required pattern="[a-z0-9-]+" name="slug" defaultValue={product?.slug}/></label>
    <label className="full-field">DESCRIPCIÓN<textarea required minLength={10} name="description" defaultValue={product?.description}/></label>
    <label>CATEGORÍA<input required name="category" defaultValue={product?.category??"Equipo de hiking"}/></label><label>PRECIO MXN<input required min="0" step="1" name="price" type="number" defaultValue={product?(product.price_cents/100):""}/></label>
    <label>INVENTARIO<input required min="0" name="stock" type="number" defaultValue={product?.stock??0}/></label><label>VARIANTES<input name="variants" defaultValue={product?.variants.join(", ")} placeholder="Gris, Rojo, Azul"/></label>
    <label>COSTO DE ENVÍO MXN<input required min="0" name="shippingFee" type="number" defaultValue={product?(product.shipping_fee_cents/100):80}/></label><label>IMAGEN<input name="image" type="file" accept="image/jpeg,image/png,image/webp"/></label>
    <label className="product-check"><input name="pickupEnabled" type="checkbox" defaultChecked={product?.pickup_enabled??true}/> Entrega en hike</label><label className="product-check"><input name="shippingEnabled" type="checkbox" defaultChecked={product?.shipping_enabled??true}/> Envío a domicilio</label><label className="product-check"><input name="active" type="checkbox" defaultChecked={product?.active??true}/> Producto activo</label>
  </div>;
}
export function ProductManager({products}:{products:AdminProduct[]}){
  const router=useRouter();const [busy,setBusy]=useState("");const [message,setMessage]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>,id?:string){event.preventDefault();setBusy(id??"new");setMessage("");const response=await fetch(id?`/api/admin/products/${id}`:"/api/admin/products",{method:id?"PATCH":"POST",body:new FormData(event.currentTarget)});const result=await response.json() as {error?:string};setBusy("");if(!response.ok)return setMessage(result.error??"No pudimos guardar el producto.");setMessage(id?"Producto actualizado.":"Producto creado.");if(!id)event.currentTarget.reset();router.refresh();}
  async function remove(id:string){if(!window.confirm("¿Quitar este producto de la tienda?"))return;setBusy(id);const response=await fetch(`/api/admin/products/${id}`,{method:"DELETE"});const result=await response.json() as {error?:string};setBusy("");if(!response.ok)return setMessage(result.error??"No pudimos eliminarlo.");setMessage("Producto retirado.");router.refresh();}
  return <><details className="new-product-panel"><summary><PackagePlus/> CARGAR NUEVO PRODUCTO</summary><form onSubmit={(event)=>void submit(event)}><ProductFields/><button className="button button-primary" disabled={busy==="new"}>{busy==="new"?"GUARDANDO…":"CREAR PRODUCTO"}</button></form></details>
    {message&&<p className="admin-feedback">{message}</p>}<div className="admin-products-grid">{products.map((product)=><article key={product.id}><img src={product.image} alt={product.name}/><div className="product-admin-title"><span>{product.category}</span><h3>{product.name}</h3><strong>{`$${(product.price_cents/100).toLocaleString("es-MX")} MXN · ${product.stock} disponibles`}</strong></div><details><summary>EDITAR PRODUCTO</summary><form onSubmit={(event)=>void submit(event,product.id)}><ProductFields product={product}/><div className="admin-photo-actions"><button disabled={busy===product.id}><Save/> GUARDAR</button><button type="button" disabled={busy===product.id} onClick={()=>void remove(product.id)}><Trash2/> RETIRAR</button></div></form></details></article>)}</div></>;
}
