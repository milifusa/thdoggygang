function base64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
function fromBase64(value: string) { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }

async function encryptionKey() {
  const encoded = process.env.QR_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error('QR token encryption is not configured.');
  const raw = fromBase64(encoded);
  if (raw.byteLength !== 32) throw new Error('QR_TOKEN_ENCRYPTION_KEY must be 32 bytes in base64.');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function hashQrToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function encryptQrToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), new TextEncoder().encode(token));
  return `${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}

export async function decryptQrToken(value: string) {
  const [ivPart, payloadPart] = value.split('.');
  if (!ivPart || !payloadPart) throw new Error('Invalid encrypted QR token.');
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(ivPart) }, await encryptionKey(), fromBase64(payloadPart));
  return new TextDecoder().decode(decrypted);
}
