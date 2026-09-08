export type SignedCheckinPayload = {
  purpose: "checkin";
  version: 2;
  tokenId: string;
  bookingId: string;
  hikeId: string;
  issuedAt: number;
  expiresAt: number;
};

export type OfflineAuthorizationPayload = {
  purpose: "hike-offline";
  version: 1;
  authorizationId: string;
  profileId: string;
  hikeId: string;
  deviceId: string;
  issuedAt: number;
  expiresAt: number;
};

export type SignedPayload = SignedCheckinPayload | OfflineAuthorizationPayload;

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function importPrivateKey() {
  const encoded = process.env.QR_SIGNING_PRIVATE_KEY;
  if (!encoded) throw new Error("QR signing is not configured.");
  return crypto.subtle.importKey(
    "pkcs8",
    fromBase64Url(encoded),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function importPublicKey(encoded: string) {
  return crypto.subtle.importKey(
    "spki",
    fromBase64Url(encoded),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

export async function signPayload(payload: SignedPayload) {
  const encodedPayload = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    await importPrivateKey(),
    new TextEncoder().encode(encodedPayload),
  );
  return `tdg:v2.${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`;
}

export function parseSignedPayload(token: string): SignedPayload | null {
  try {
    const [prefix, payloadPart, signaturePart] = token.split(".");
    if (prefix !== "tdg:v2" || !payloadPart || !signaturePart) return null;
    return JSON.parse(new TextDecoder().decode(fromBase64Url(payloadPart))) as SignedPayload;
  } catch {
    return null;
  }
}

export async function verifySignedPayload(token: string, publicKey?: string) {
  const [prefix, payloadPart, signaturePart] = token.split(".");
  if (prefix !== "tdg:v2" || !payloadPart || !signaturePart) return null;
  const encodedPublicKey = publicKey ?? process.env.NEXT_PUBLIC_QR_SIGNING_PUBLIC_KEY;
  if (!encodedPublicKey) return null;
  try {
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      await importPublicKey(encodedPublicKey),
      fromBase64Url(signaturePart),
      new TextEncoder().encode(payloadPart),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadPart))) as SignedPayload;
    if (!payload.expiresAt || Date.now() > payload.expiresAt) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function hashSignedToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
