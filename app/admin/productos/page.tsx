import { requireStaffSession } from "../../lib/auth/guards";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { productImageUrl } from "../../lib/products";
import { AdminMobileNav, AdminNav } from "../admin-nav";
import { ProductManager, type AdminProduct } from "./product-manager";
import { adminDate, money, profileName } from "../admin-utils";
import { getShopSettings } from "../../lib/shop-settings";
import { FulfillmentControl } from "../reservaciones/[bookingId]/reservation-detail-actions";

export const dynamic = "force-dynamic";
export default async function ProductsAdminPage() {
  await requireStaffSession("/admin/productos");
  const supabase = await createSupabaseServerClient();
  const [{ data: rows }, { data: next }, { data: orderItems }, shopSettings] =
    await Promise.all([
      supabase
        .from("products")
        .select("*")
        .is("deleted_at", null)
        .order("created_at"),
      supabase
        .from("hikes")
        .select("id")
        .gte("starts_at", new Date().toISOString())
        .is("deleted_at", null)
        .order("starts_at")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("order_items")
        .select(
          "id,description,quantity,unit_price_cents,created_at,order_item_fulfillments(id,status,delivery_location,note),order:orders(order_number,status,fulfillment_mode,shipping_address,tracking_number,profile:profiles(first_name,last_name,email,phone),pickup_hike:hikes(name,starts_at))",
        )
        .eq("item_type", "PRODUCT")
        .order("created_at", { ascending: false })
        .limit(100),
      getShopSettings(),
    ]);
  const products: AdminProduct[] = (rows ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    category: p.category,
    price_cents: p.price_cents,
    stock: p.stock,
    variants: p.variants ?? [],
    image: productImageUrl(p.image_path),
    pickup_enabled: p.pickup_enabled,
    shipping_enabled: p.shipping_enabled,
    shipping_fee_cents: p.shipping_fee_cents,
    active: p.active,
  }));
  return (
    <main className="admin-page">
      <AdminNav active="/admin/productos" hikeId={next?.id} />
      <section className="admin-content">
        <AdminMobileNav />
        <header>
          <div>
            <p>TIENDA E INVENTARIO</p>
            <h1>Productos.</h1>
          </div>
        </header>
        <section className="admin-panel admin-module-panel">
          <div className="admin-section-head">
            <div>
              <p>CATÁLOGO</p>
              <h2>{products.length} productos cargados</h2>
            </div>
          </div>
          <ProductManager products={products} shopSettings={shopSettings} />
        </section>
        <section className="admin-panel">
          <div className="admin-section-head">
            <div>
              <p>VENTAS</p>
              <h2>Pedidos recientes</h2>
            </div>
            <span>{orderItems?.length ?? 0}</span>
          </div>
          <div className="product-orders">
            {orderItems?.map((item) => {
              const order = Array.isArray(item.order)
                ? item.order[0]
                : item.order;
              const hike = Array.isArray(order?.pickup_hike)
                ? order.pickup_hike[0]
                : order?.pickup_hike;
              const address = order?.shipping_address as {
                street?: string;
                exterior?: string;
                colony?: string;
                city?: string;
                state?: string;
                postalCode?: string;
              } | null;
              const fulfillment = Array.isArray(item.order_item_fulfillments)
                ? item.order_item_fulfillments[0]
                : item.order_item_fulfillments;
              return (
                <article key={item.id}>
                  <div>
                    <strong>{item.description}</strong>
                    <small>
                      {item.quantity} × {money(item.unit_price_cents)}
                    </small>
                  </div>
                  {fulfillment && (
                    <FulfillmentControl
                      id={fulfillment.id}
                      status={fulfillment.status}
                      location={fulfillment.delivery_location}
                      note={fulfillment.note}
                    />
                  )}
                  <div>
                    <strong>{order?.order_number}</strong>
                    <small>
                      {profileName(order?.profile)} ·{" "}
                      {adminDate(item.created_at)}
                    </small>
                  </div>
                  <div>
                    <span>{order?.status}</span>
                    <small>
                      {order?.fulfillment_mode === "HIKE_PICKUP"
                        ? `Entrega: ${hike?.name ?? "hike"}`
                        : `Envío: ${address?.street ?? ""} ${address?.exterior ?? ""}, ${address?.colony ?? ""}, ${address?.city ?? ""} ${address?.postalCode ?? ""}`}
                    </small>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}
