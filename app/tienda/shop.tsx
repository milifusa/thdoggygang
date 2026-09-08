"use client";
import { useMemo,useState } from "react";
import { Minus,Plus,ShoppingBag,Truck } from "lucide-react";
import type { Product } from "../lib/products";

type HikeOption={id:string;name:string;date:string};
const money=(cents:number)=>(cents/100).toLocaleString("es-MX",{style:"currency",currency:"MXN"});

export function Shop({products,hikes,cardPaymentsEnabled}:{products:Product[];hikes:HikeOption[];cardPaymentsEnabled:boolean}){
  const [quantities,setQuantities]=useState<Record<string,number>>({});
  const [variants,setVariants]=useState<Record<string,string>>(Object.fromEntries(products.map((p)=>[p.id,p.variants[0]??""])));
  const [fulfillment,setFulfillment]=useState<"SHIPPING"|"HIKE_PICKUP">("SHIPPING");
  const [pickupHikeId,setPickupHikeId]=useState(hikes[0]?.id??"");
  const [payment,setPayment]=useState<"card"|"transfer">(cardPaymentsEnabled?"card":"transfer");
  const [receipt,setReceipt]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [address,setAddress]=useState({recipient:"",phone:"+52",street:"",exterior:"",interior:"",colony:"",city:"",state:"Puebla",postalCode:"",references:""});
  const selected=products.filter((p)=>(quantities[p.id]??0)>0);
  const subtotal=useMemo(()=>selected.reduce((sum,p)=>sum+p.priceCents*(quantities[p.id]??0),0),[selected,quantities]);
  const shipping=fulfillment==="SHIPPING"&&subtotal<50000?Math.max(...selected.map((p)=>p.shippingFeeCents),0):0;
  const total=subtotal+shipping;
  function change(id:string,delta:number,stock:number){setQuantities((current)=>({...current,[id]:Math.min(stock,Math.max(0,(current[id]??0)+delta))}));}
  async function checkout(){
    if(!selected.length)return setMessage("Agrega al menos un producto.");
    if(fulfillment==="SHIPPING"&&(!address.recipient||!address.street||!address.exterior||!address.colony||!address.city||!/^[0-9]{5}$/.test(address.postalCode)||!/^\+?52\d{10}$/.test(address.phone)))return setMessage("Completa la dirección, código postal y teléfono mexicano.");
    if(fulfillment==="HIKE_PICKUP"&&!pickupHikeId)return setMessage("Selecciona el hike donde recogerás tu pedido.");
    if(payment==="transfer"&&!receipt)return setMessage("Sube tu comprobante de transferencia.");
    setBusy(true);setMessage("");
    const payload={selections:selected.map((p)=>({productId:p.id,variant:variants[p.id]??"",quantity:quantities[p.id]})),fulfillmentMode:fulfillment,pickupHikeId:fulfillment==="HIKE_PICKUP"?pickupHikeId:null,address:fulfillment==="SHIPPING"?address:null};
    const response=payment==="card"
      ?await fetch("/api/checkout/products",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)})
      :await(()=>{const form=new FormData();form.set("payload",JSON.stringify(payload));form.set("receipt",receipt!);return fetch("/api/products/transfer",{method:"POST",body:form});})();
    const result=await response.json() as {url?:string;orderNumber?:string;error?:string};setBusy(false);
    if(response.status===401){window.location.href="/ingresar?next=%2Ftienda";return;}
    if(!response.ok)return setMessage(result.error??"No pudimos completar tu pedido.");
    if(result.url){window.location.href=result.url;return;}
    setMessage("Pedido "+(result.orderNumber??"")+" recibido. Revisaremos tu transferencia.");setQuantities({});
  }
  return <main className="shop-page">
    <section className="shop-hero"><p className="eyebrow light">EQUIPO DE HIKING</p><h1>Listos para<br/>caminar juntos.</h1><p>Equipo seleccionado para hacer más cómodas las aventuras de tu manada.</p></section>
    <section className="shop-shell">
      <div className="shop-products">{products.map((product)=>{
        const quantity=quantities[product.id]??0;
        const selectedVariant=variants[product.id]??product.variants[0]??"";
        return <article className={quantity>0?"selected":""} key={product.id}>
          <img src={product.image} alt={product.name}/>
          <div>
            <span>{product.category}</span>
            <h2>{product.name}</h2>
            <p>{product.description}</p>
            <strong>{money(product.priceCents)} MXN</strong>
            {product.variants.length>0&&<fieldset className="shop-variant-options">
              <legend>ELIGE UNA OPCIÓN</legend>
              <div>{product.variants.map((variant)=><button
                type="button"
                key={variant}
                aria-pressed={selectedVariant===variant}
                className={selectedVariant===variant?"active":""}
                onClick={()=>setVariants((current)=>({...current,[product.id]:variant}))}
              >{variant}</button>)}</div>
            </fieldset>}
            <div className="shop-product-action">
              <span>CANTIDAD</span>
              <div className="product-quantity">
                <button type="button" onClick={()=>change(product.id,-1,product.stock)} disabled={quantity===0} aria-label={`Quitar ${product.name}`}><Minus/></button>
                <span>{quantity}</span>
                <button type="button" onClick={()=>change(product.id,1,product.stock)} disabled={quantity>=product.stock} aria-label={`Agregar ${product.name}`}><Plus/></button>
              </div>
            </div>
            <small>{product.stock} disponibles</small>
          </div>
        </article>;
      })}</div>
      <aside className="shop-checkout">
        <div className="shop-cart-title"><ShoppingBag/><div><span>TU PEDIDO</span><strong>{selected.reduce((sum,p)=>sum+(quantities[p.id]??0),0)} productos</strong></div></div>
        {selected.map((p)=><div className="shop-line" key={p.id}><span>{quantities[p.id]} × {p.name}{variants[p.id]?" · "+variants[p.id]:""}</span><strong>{money((quantities[p.id]??0)*p.priceCents)}</strong></div>)}
        <div className="fulfillment-tabs"><button className={fulfillment==="SHIPPING"?"active":""} onClick={()=>setFulfillment("SHIPPING")}><Truck/> DOMICILIO</button><button className={fulfillment==="HIKE_PICKUP"?"active":""} onClick={()=>setFulfillment("HIKE_PICKUP")}><ShoppingBag/> EN UN HIKE</button></div>
        {fulfillment==="SHIPPING"?<div className="shipping-form"><input placeholder="Nombre de quien recibe" value={address.recipient} onChange={(e)=>setAddress({...address,recipient:e.target.value})}/><input placeholder="+52 222 123 4567" value={address.phone} onChange={(e)=>setAddress({...address,phone:e.target.value.replace(/[\s()-]/g,"")})}/><input placeholder="Calle" value={address.street} onChange={(e)=>setAddress({...address,street:e.target.value})}/><div><input placeholder="Número exterior" value={address.exterior} onChange={(e)=>setAddress({...address,exterior:e.target.value})}/><input placeholder="Interior" value={address.interior} onChange={(e)=>setAddress({...address,interior:e.target.value})}/></div><input placeholder="Colonia" value={address.colony} onChange={(e)=>setAddress({...address,colony:e.target.value})}/><input placeholder="Ciudad o municipio" value={address.city} onChange={(e)=>setAddress({...address,city:e.target.value})}/><div><input placeholder="Estado" value={address.state} onChange={(e)=>setAddress({...address,state:e.target.value})}/><input inputMode="numeric" maxLength={5} placeholder="Código postal" value={address.postalCode} onChange={(e)=>setAddress({...address,postalCode:e.target.value.replace(/\D/g,"")})}/></div><textarea placeholder="Referencias para la entrega" value={address.references} onChange={(e)=>setAddress({...address,references:e.target.value})}/><small>Envío gratis desde $500 MXN. Entrega estimada de 1 a 2 días hábiles en Cholula y Puebla.</small></div>:<select className="hike-pickup-select" value={pickupHikeId} onChange={(e)=>setPickupHikeId(e.target.value)}><option value="">Selecciona un hike</option>{hikes.map((hike)=><option value={hike.id} key={hike.id}>{hike.name} · {hike.date}</option>)}</select>}
        <div className="payment-tabs"><button disabled={!cardPaymentsEnabled} className={payment==="card"?"active":""} onClick={()=>setPayment("card")}>{cardPaymentsEnabled?"TARJETA":"TARJETA · PRÓXIMAMENTE"}</button><button className={payment==="transfer"?"active":""} onClick={()=>setPayment("transfer")}>TRANSFERENCIA</button></div>
        {payment==="transfer"&&<><div className="bank-box"><span>DATOS PARA TRANSFERENCIA</span><strong>Banco Mutt</strong><p>THE DOGGY GANG EXPERIENCIAS<br/>CLABE 012 345 678901234 5</p></div><label className="receipt-upload">{receipt?"ARCHIVO · "+receipt.name:"SUBIR COMPROBANTE"}<input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e)=>setReceipt(e.target.files?.[0]??null)}/></label></>}
        <dl><div><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div><div><dt>Entrega</dt><dd>{shipping?money(shipping):"Gratis"}</dd></div><div><dt>Total</dt><dd>{money(total)} MXN</dd></div></dl>
        {message&&<p className="wizard-error">{message}</p>}<button className="button button-primary full-button" disabled={busy||!selected.length} onClick={()=>void checkout()}>{busy?"PROCESANDO…":"COMPRAR · "+money(total)}</button>
      </aside>
    </section>
  </main>;
}
