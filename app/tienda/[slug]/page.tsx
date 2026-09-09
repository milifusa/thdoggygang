import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "../../components/SiteHeader";
import { getProduct } from "../../lib/products";
import { getShopContext } from "../../lib/shop-context";
import { SITE_ORIGIN } from "../../lib/site-url";
import { Shop } from "../shop";

const origin = SITE_ORIGIN;
const absolute = (value: string) =>
  value.startsWith("http") ? value : `${origin}${value}`;
const concise = (value: string, length = 155) =>
  value.length <= length ? value : `${value.slice(0, length - 1).trim()}…`;

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product)
    return {
      title: "Producto no disponible | The Doggy Gang",
      robots: { index: false, follow: false },
    };
  const title = `${product.name} para perros | The Doggy Gang`;
  const description = concise(
    `${product.description} Disponible en México con envío a domicilio o entrega durante un hike.`,
  );
  return {
    title,
    description,
    alternates: { canonical: `/tienda/${product.slug}` },
    openGraph: {
      type: "website",
      title,
      description,
      url: `/tienda/${product.slug}`,
      images: [{ url: absolute(product.image), alt: product.name }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [absolute(product.image)],
    },
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ hike?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const [product, context] = await Promise.all([
    getProduct(slug),
    getShopContext(query.hike),
  ]);
  if (!product) notFound();
  const url = `${origin}/tienda/${product.slug}`;
  const purchasable =
    context.cardPaymentsEnabled || Boolean(context.bankTransfer);
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: product.name,
    image: [absolute(product.image)],
    description: product.description,
    sku: product.id,
    category: product.category,
    brand: { "@type": "Brand", name: "The Doggy Gang" },
    ...(purchasable
      ? {
          offers: {
            "@type": "Offer",
            url,
            priceCurrency: "MXN",
            price: (product.priceCents / 100).toFixed(2),
            availability:
              product.stock > 0
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
            itemCondition: "https://schema.org/NewCondition",
            seller: { "@id": `${origin}/#organization` },
          },
        }
      : {}),
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <SiteHeader />
      <Shop
        products={[product]}
        hikes={context.hikes}
        initialHikeId={context.initialHikeId}
        cardPaymentsEnabled={context.cardPaymentsEnabled}
        bankTransfer={context.bankTransfer}
        shopSettings={context.shopSettings}
        heroEyebrow={product.category.toUpperCase()}
        heroTitle={product.name}
        heroIntro={product.description}
        initialProductId={product.id}
        showProductLinks={false}
      />
    </>
  );
}
