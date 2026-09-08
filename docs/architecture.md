# Arquitectura

## Capas

1. **Experiencia web:** App Router, TypeScript, componentes de servidor para contenido y componentes cliente únicamente para firma, cámara, selección y QR.
2. **Dominio:** perfiles reutilizables, snapshots inmutables por reservación, órdenes separadas de pagos y check-in individual.
3. **Persistencia:** Supabase PostgreSQL con constraints, índices y RLS. Storage conserva blobs privados; Postgres conserva metadata y ownership.
4. **Integraciones:** pagos detrás de un adaptador. El webhook valida firma antes de actualizar `payments` y `orders`.
5. **Operación:** Modo Hike usa una operación idempotente por intento (`client_operation_id`) para tolerar reintentos. La siguiente fase puede persistir una cola cifrada en IndexedDB para operación offline.

## Seguridad

- El QR contiene un token aleatorio; la base conserva únicamente SHA-256 del token.
- La API de lookup devuelve sólo los datos operativos necesarios.
- RLS distingue CLIENT, GUIDE asignado al hike y ADMIN.
- Cambiar el rol se bloquea mediante trigger, incluso si un cliente edita su propio perfil.
- Las firmas guardan versión, hash, timestamp, IP y user agent.
- Nunca se guardan PAN, CVV ni datos completos de tarjeta.
- Fotos originales, comprobantes y PDFs se sirven con signed URLs cortas.

## Mapa de rutas

| Ruta | Uso |
| --- | --- |
| `/` | Home pública |
| `/aventuras/[slug]` | Detalle del hike |
| `/reservar/[slug]` | Inscripción end-to-end |
| `/ingresar` | Email/phone OTP |
| `/mi-manada` | Cuenta e historial |
| `/mi-manada/aventuras/sendero-del-duende` | QR del cliente |
| `/galeria/sendero-del-duende` | Selección y compra de fotos |
| `/admin` | Operación administrativa |
| `/admin/hike-mode` | Scanner y check-in en campo |

## Siguiente integración de producción

El MVP visual ya consume los contratos del dominio, pero usa datos representativos. La siguiente iteración sustituye esos fixtures por queries de Supabase, añade un proveedor de pagos concreto, conecta el procesador asíncrono de imágenes y protege rutas con sesión/rol en middleware.
