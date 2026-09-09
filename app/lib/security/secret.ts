import "server-only";

function base64(bytes: Uint8Array) { return Buffer.from(bytes).toString("base64"); }
function fromBase64(value: string) { return new Uint8Array(Buffer.from(value, "base64")); }

async function encryptionKey() {
  const encoded = process.env.SETTINGS_ENCRYPTION_KEY || process.env.QR_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("La llave de cifrado de configuración no está disponible.");
  const raw = fromBase64(encoded);
  if (raw.byteLength !== 32) throw new Error("La llave de cifrado debe contener 32 bytes en base64.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  return `${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(value: string) {
  const [ivPart, payloadPart] = value.split(".");
  if (!ivPart || !payloadPart) throw new Error("El secreto cifrado no es válido.");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(ivPart) }, await encryptionKey(), fromBase64(payloadPart));
  return new TextDecoder().decode(decrypted);
}
