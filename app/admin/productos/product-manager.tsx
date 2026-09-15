"use client";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, Save, Trash2 } from "lucide-react";
import type { ShopSettings } from "../../lib/shop-settings";
import {
  prepareImageForUpload,
  readJsonResponse,
} from "../../lib/client-image-upload";

export type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  price_cents: number;
  stock: number;
  variants: string[];
  image: string;
  pickup_enabled: boolean;
  shipping_enabled: boolean;
  shipping_fee_cents: number;
  active: boolean;
  updated_at: string;
};

function ProductImageField({ currentImage }: { currentImage?: string }) {
  const [selectedPreview, setSelectedPreview] = useState("");
  const [fileName, setFileName] = useState("");

  useEffect(
    () => () => {
      if (selectedPreview) URL.revokeObjectURL(selectedPreview);
    },
    [selectedPreview],
  );

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setSelectedPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return file ? URL.createObjectURL(file) : "";
    });
    setFileName(file?.name ?? "");
  }

  return (
    <label className="product-image-field full-field">
      IMAGEN DEL PRODUCTO
      <span className="product-image-picker">
        <img
          src={selectedPreview || currentImage || "/brand/profile-trail-sun.png"}
          alt="Vista previa del producto"
        />
        <span>
          <strong>
            {fileName ? "NUEVA IMAGEN SELECCIONADA" : "CAMBIAR IMAGEN"}
          </strong>
          <small>
            {fileName || "JPG, PNG, WebP o una foto compatible del celular"}
          </small>
          <input
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={selectImage}
          />
        </span>
      </span>
    </label>
  );
}

function ProductFields({ product }: { product?: AdminProduct }) {
  return (
    <div className="product-form-grid">
      <label>
        NOMBRE
        <input required name="name" defaultValue={product?.name} />
      </label>
      <label>
        DIRECCIÓN DEL PRODUCTO
        <input
          name="slug"
          defaultValue={product?.slug}
          placeholder="Se crea automáticamente"
        />
        <small>Puede dejarse vacía; se genera a partir del nombre.</small>
      </label>
      <label className="full-field">
        DESCRIPCIÓN
        <textarea
          required
          minLength={10}
          name="description"
          defaultValue={product?.description}
        />
      </label>
      <label>
        CATEGORÍA
        <input
          required
          name="category"
          defaultValue={product?.category ?? "Equipo de hiking"}
        />
      </label>
      <label>
        PRECIO MXN
        <input
          required
          min="0"
          step="0.01"
          name="price"
          type="number"
          defaultValue={product ? product.price_cents / 100 : ""}
        />
      </label>
      <label>
        INVENTARIO
        <input
          required
          min="0"
          step="1"
          name="stock"
          type="number"
          defaultValue={product?.stock ?? 0}
        />
      </label>
      <label>
        VARIANTES
        <input
          name="variants"
          defaultValue={product?.variants.join(", ")}
          placeholder="Gris, Rojo, Azul"
        />
      </label>
      <label>
        COSTO DE ENVÍO MXN
        <input
          required
          min="0"
          step="0.01"
          name="shippingFee"
          type="number"
          defaultValue={product ? product.shipping_fee_cents / 100 : 80}
        />
      </label>
      <ProductImageField currentImage={product?.image} />
      <label className="product-check">
        <input
          name="pickupEnabled"
          type="checkbox"
          defaultChecked={product?.pickup_enabled ?? true}
        />{" "}
        Entrega en hike
      </label>
      <label className="product-check">
        <input
          name="shippingEnabled"
          type="checkbox"
          defaultChecked={product?.shipping_enabled ?? true}
        />{" "}
        Envío a domicilio
      </label>
      <label className="product-check">
        <input
          name="active"
          type="checkbox"
          defaultChecked={product?.active ?? true}
        />{" "}
        Producto activo
      </label>
    </div>
  );
}
export function ProductManager({
  products,
  shopSettings,
}: {
  products: AdminProduct[];
  shopSettings: ShopSettings;
}) {
  const router = useRouter();
  const [catalog, setCatalog] = useState(products);
  const [newFormVersion, setNewFormVersion] = useState(0);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [productMessages, setProductMessages] = useState<
    Record<string, { kind: "success" | "error"; text: string }>
  >({});

  function setBusyFor(key: string, value: boolean) {
    setBusy((current) => ({ ...current, [key]: value }));
  }

  function setProductMessage(
    key: string,
    kind: "success" | "error",
    text: string,
  ) {
    setProductMessages((current) => ({ ...current, [key]: { kind, text } }));
  }

  async function submit(event: FormEvent<HTMLFormElement>, id?: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const key = id ?? "new";
    setBusyFor(key, true);
    if (id)
      setProductMessages((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    setMessage("");
    const body = new FormData(form);
    const image = body.get("image");
    if (image instanceof File && image.size) {
      try {
        if (id)
          setProductMessage(id, "success", "Preparando la nueva imagen…");
        else setMessage("Preparando y optimizando la imagen…");
        body.set("image", await prepareImageForUpload(image));
      } catch (error) {
        setBusyFor(key, false);
        const text =
          error instanceof Error
            ? error.message
            : "No pudimos preparar la imagen.";
        if (id) return setProductMessage(id, "error", text);
        return setMessage(text);
      }
    }
    try {
      const response = await fetch(
        id ? `/api/admin/products/${id}` : "/api/admin/products",
        {
          method: id ? "PATCH" : "POST",
          body,
        },
      );
      const result = await readJsonResponse<{
        error?: string;
        product?: AdminProduct;
      }>(response);
      if (!response.ok || !result.product) {
        const text = result.error ?? "No pudimos guardar el producto.";
        if (id) return setProductMessage(id, "error", text);
        return setMessage(text);
      }
      if (id) {
        setCatalog((current) =>
          current.map((product) =>
            product.id === id ? result.product! : product,
          ),
        );
        setProductMessage(id, "success", "Cambios guardados correctamente.");
      } else {
        setCatalog((current) => [...current, result.product!]);
        setMessage("Producto creado.");
        form.reset();
        setNewFormVersion((current) => current + 1);
      }
      router.refresh();
    } catch {
      const text = "Se perdió la conexión. Intenta guardar nuevamente.";
      if (id) setProductMessage(id, "error", text);
      else setMessage(text);
    } finally {
      setBusyFor(key, false);
    }
  }
  async function remove(id: string) {
    if (!window.confirm("¿Quitar este producto de la tienda?")) return;
    setBusyFor(id, true);
    const response = await fetch(`/api/admin/products/${id}`, {
      method: "DELETE",
    });
    const result = (await response.json()) as { error?: string };
    setBusyFor(id, false);
    if (!response.ok)
      return setMessage(result.error ?? "No pudimos eliminarlo.");
    setMessage("Producto retirado.");
    setCatalog((current) => current.filter((product) => product.id !== id));
    router.refresh();
  }
  async function saveShopSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyFor("settings", true);
    const data = new FormData(event.currentTarget);
    const threshold = String(data.get("threshold") ?? "");
    const response = await fetch("/api/admin/shop-settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        shippingFeeCents: Math.round(Number(data.get("shippingFee")) * 100),
        freeShippingThresholdCents: threshold
          ? Math.round(Number(threshold) * 100)
          : null,
        shippingNote: data.get("shippingNote"),
      }),
    });
    const result = (await response.json()) as { error?: string };
    setBusyFor("settings", false);
    setMessage(
      response.ok
        ? "Configuración de envíos guardada."
        : (result.error ?? "No pudimos guardarla."),
    );
  }
  return (
    <>
      <form className="shop-settings-form" onSubmit={saveShopSettings}>
        <div>
          <strong>ENVÍOS A DOMICILIO</strong>
          <span>Una sola regla para toda la tienda.</span>
        </div>
        <label>
          COSTO MXN
          <input
            required
            min="0"
            type="number"
            name="shippingFee"
            defaultValue={shopSettings.shippingFeeCents / 100}
          />
        </label>
        <label>
          ENVÍO GRATIS DESDE
          <input
            min="0"
            type="number"
            name="threshold"
            defaultValue={
              shopSettings.freeShippingThresholdCents === null
                ? ""
                : shopSettings.freeShippingThresholdCents / 100
            }
          />
        </label>
        <label>
          MENSAJE
          <input
            required
            name="shippingNote"
            defaultValue={shopSettings.shippingNote}
          />
        </label>
        <button disabled={busy.settings}>
          <Save />
          GUARDAR ENVÍOS
        </button>
      </form>
      <details className="new-product-panel">
        <summary>
          <PackagePlus /> CARGAR NUEVO PRODUCTO
        </summary>
        <form onSubmit={(event) => void submit(event)}>
          <ProductFields key={newFormVersion} />
          <button className="button button-primary" disabled={busy.new}>
            {busy.new ? "GUARDANDO…" : "CREAR PRODUCTO"}
          </button>
        </form>
      </details>
      {message && <p className="admin-feedback">{message}</p>}
      <div className="admin-products-grid">
        {catalog.map((product) => (
          <article key={product.id}>
            <img src={product.image} alt={product.name} />
            <div className="product-admin-title">
              <span>{product.category}</span>
              <h3>{product.name}</h3>
              <strong>{`$${(product.price_cents / 100).toLocaleString("es-MX")} MXN · ${product.stock} disponibles`}</strong>
            </div>
            <details>
              <summary>EDITAR PRODUCTO</summary>
              <form onSubmit={(event) => void submit(event, product.id)}>
                <ProductFields
                  key={`${product.id}:${product.updated_at}`}
                  product={product}
                />
                {productMessages[product.id] && (
                  <p
                    className={`product-save-feedback ${productMessages[product.id].kind}`}
                    aria-live="polite"
                  >
                    {productMessages[product.id].text}
                  </p>
                )}
                <div className="admin-photo-actions">
                  <button disabled={busy[product.id]}>
                    <Save /> {busy[product.id] ? "GUARDANDO…" : "GUARDAR CAMBIOS"}
                  </button>
                  <button
                    type="button"
                    disabled={busy[product.id]}
                    onClick={() => void remove(product.id)}
                  >
                    <Trash2 /> RETIRAR
                  </button>
                </div>
              </form>
            </details>
          </article>
        ))}
      </div>
    </>
  );
}
