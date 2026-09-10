import { z } from "zod";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { createProductOrder } from "../../../lib/server/product-order";
import { getStripeSecretKey } from "../../../lib/payment-config";

const address = z.object({
  recipient: z.string().min(2),
  phone: z.string().regex(/^\+?52\d{10}$/),
  street: z.string().min(2),
  exterior: z.string().min(1),
  interior: z.string().optional(),
  colony: z.string().min(2),
  city: z.string().min(2),
  state: z.string().min(2),
  postalCode: z.string().regex(/^\d{5}$/),
  references: z.string().optional(),
});
const schema = z.object({
  selections: z
    .array(
      z.object({
        productId: z.string().uuid(),
        variant: z.string().max(80),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(30),
  fulfillmentMode: z.enum(["HIKE_PICKUP", "SHIPPING"]),
  pickupHikeId: z.string().uuid().nullable(),
  address: address.nullable(),
});
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Revisa tu carrito y los datos de entrega." },
      { status: 400 },
    );
  const stripeKey = await getStripeSecretKey();
  if (!stripeKey)
    return Response.json(
      {
        error:
          "El pago con tarjeta aún no está configurado. Puedes pagar por transferencia.",
      },
      { status: 503 },
    );
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return Response.json(
      { error: "Inicia sesión para completar tu compra." },
      { status: 401 },
    );
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile)
    return Response.json(
      { error: "No encontramos tu perfil." },
      { status: 404 },
    );
  try {
    const prepared = await createProductOrder({
      profileId: profile.id,
      ...parsed.data,
    });
    const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
    const form = new URLSearchParams({
      mode: "payment",
      "payment_method_types[0]": "card",
      success_url: `${origin}/tienda?pedido=confirmado`,
      cancel_url: `${origin}/tienda?pedido=cancelado`,
      client_reference_id: prepared.order.id,
      "metadata[order_id]": prepared.order.id,
      "metadata[purchase_type]": "products",
    });
    if (profile.email) form.set("customer_email", profile.email);
    prepared.lines.forEach(({ product, selection }, index) => {
      form.set(`line_items[${index}][price_data][currency]`, "mxn");
      form.set(
        `line_items[${index}][price_data][unit_amount]`,
        String(product.price_cents),
      );
      form.set(
        `line_items[${index}][price_data][product_data][name]`,
        product.name,
      );
      form.set(`line_items[${index}][quantity]`, String(selection.quantity));
    });
    if (prepared.shipping > 0) {
      const i = prepared.lines.length;
      form.set(`line_items[${i}][price_data][currency]`, "mxn");
      form.set(
        `line_items[${i}][price_data][unit_amount]`,
        String(prepared.shipping),
      );
      form.set(
        `line_items[${i}][price_data][product_data][name]`,
        "Envío a domicilio",
      );
      form.set(`line_items[${i}][quantity]`, "1");
    }
    const stripeResponse = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      },
    );
    const checkout = (await stripeResponse.json()) as {
      id?: string;
      url?: string;
      error?: { message?: string };
    };
    if (!stripeResponse.ok || !checkout.id || !checkout.url)
      return Response.json(
        { error: checkout.error?.message ?? "Stripe no pudo iniciar el pago." },
        { status: 502 },
      );
    await prepared.service
      .from("payments")
      .insert({
        order_id: prepared.order.id,
        provider: "stripe",
        provider_payment_id: checkout.id,
        method: "CARD",
        status: "PENDING",
        amount_cents: prepared.total,
      });
    return Response.json({ url: checkout.url });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No pudimos crear tu pedido.",
      },
      { status: 400 },
    );
  }
}
export { schema as productCheckoutSchema };
