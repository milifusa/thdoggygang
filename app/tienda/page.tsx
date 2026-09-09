import { SiteHeader } from "../components/SiteHeader";
import { getProducts } from "../lib/products";
import { getShopContext } from "../lib/shop-context";
import { Shop } from "./shop";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Equipo de hiking | The Doggy Gang",
  description:
    "Compra correas y accesorios de hiking para perros. Entrega a domicilio en México o recibe tu equipo durante un hike de The Doggy Gang.",
  alternates: { canonical: "/tienda" },
  openGraph: {
    title: "Equipo de hiking para perros | The Doggy Gang",
    description: "Correas y accesorios para caminar con tu perro.",
    url: "/tienda",
  },
};
export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ hike?: string }>;
}) {
  const query = await searchParams;
  const [products, context] = await Promise.all([
    getProducts(),
    getShopContext(query.hike),
  ]);
  return (
    <>
      <SiteHeader />
      <Shop
        products={products}
        hikes={context.hikes}
        initialHikeId={context.initialHikeId}
        cardPaymentsEnabled={context.cardPaymentsEnabled}
        bankTransfer={context.bankTransfer}
        shopSettings={context.shopSettings}
      />
    </>
  );
}
