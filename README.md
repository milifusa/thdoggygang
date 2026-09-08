# The Doggy Gang

Plataforma web mobile-first para descubrir y reservar hikes con perros, gestionar la manada, firmar responsivas, pagar, hacer check-in con QR y comprar fotografías.

## Recorridos incluidos

- Sitio público y detalle completo de una aventura.
- Wizard de reservación: personas, perritos, transporte, firma, pago y QR.
- Acceso sin contraseña por email magic link o teléfono OTP con Supabase Auth.
- Área “Mi manada”, pase QR e historial de aventuras.
- Galería seleccionable con paquetes de fotos.
- Dashboard administrativo y Modo Hike para teléfono con cámara, búsqueda manual, alertas y check-in por participante.
- API para generar responsivas PDF, validar QR, registrar check-ins y procesar webhooks de pago firmados.
- Esquema PostgreSQL completo, RLS y buckets privados versionados como migraciones.

Sin credenciales se conserva una demo interactiva. Al configurar Supabase, la reserva usa automáticamente perfiles reales, guarda cada paso de forma atómica, genera y almacena la responsiva firmada, crea órdenes de pago y emite el QR después de la confirmación.

## Desarrollo

Requiere Node.js 22.13 o superior.

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Supabase

1. Crear un proyecto de Supabase.
2. Vincular el proyecto con Supabase CLI.
3. Aplicar `supabase/migrations` con `supabase db push`.
4. Habilitar email OTP y/o phone OTP en Authentication.
5. Generar `QR_TOKEN_ENCRYPTION_KEY` con 32 bytes aleatorios codificados en base64.
6. Copiar las variables de `.env.example` a desarrollo, Preview y Production.

La `SUPABASE_SERVICE_ROLE_KEY` y la llave de cifrado del QR sólo pueden existir del lado servidor. Los originales de fotos, comprobantes y responsivas permanecen privados y deben entregarse mediante signed URLs después de autorizar al usuario.

### Correos de acceso con Resend

En producción, Supabase Auth debe enviar sus correos mediante el SMTP de Resend. Primero se verifica el dominio `thedoggygang.com` en Resend y después, en Supabase → Authentication → SMTP Settings, se configuran:

- Host: `smtp.resend.com`
- Puerto: `465`
- Usuario: `resend`
- Contraseña: una API key de Resend guardada únicamente en el panel de Supabase
- Remitente sugerido: `The Doggy Gang <acceso@thedoggygang.com>`

Las plantillas de acceso, confirmación, invitación y recuperación están versionadas en `supabase/templates`. La API key nunca debe incluirse en el repositorio ni en variables públicas de la aplicación.

## Pagos

El flujo de tarjeta crea un Stripe Checkout alojado y verifica `checkout.session.completed` mediante `Stripe-Signature`. El flujo de transferencia sube el comprobante al bucket privado, lo deja en revisión y permite que ADMIN lo apruebe. Ambos métodos confirman la reservación y generan un token QR cifrado; la base sólo usa su hash para validarlo.

## Vercel

El repositorio está preparado para despliegues de Preview en pull requests y producción desde `main`. En Vercel se deben configurar todas las variables de `.env.example` por ambiente. La aplicación nunca confirma un pago por el redirect del navegador: el estado se actualiza desde el webhook verificado.

## Procesamiento de fotografía

La UI y el modelo de datos están listos para originals, thumbnails, previews y watermarks. La transformación masiva y generación de ZIPs debe ejecutarse en una cola externa o worker, nunca dentro de una petición larga de Vercel.
