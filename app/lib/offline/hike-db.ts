import type { HikeModeData, OfflineOperation } from "../hike-mode-types";

const DB_NAME = "tdg-hike-operations";
const DB_VERSION = 2;
type EncryptedPackage = {
  hikeId: string;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
  expiresAt?: string;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (
        (event as IDBVersionChangeEvent).oldVersion < 2 &&
        db.objectStoreNames.contains("packages")
      )
        db.deleteObjectStore("packages");
      if (!db.objectStoreNames.contains("packages"))
        db.createObjectStore("packages", { keyPath: "hikeId" });
      if (!db.objectStoreNames.contains("operations"))
        db.createObjectStore("operations", { keyPath: "operationId" });
      if (!db.objectStoreNames.contains("meta"))
        db.createObjectStore("meta", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function getDeviceId() {
  const existing = await transact<{ key: string; value: string } | undefined>(
    "meta",
    "readonly",
    (store) => store.get("deviceId"),
  );
  if (existing?.value) return existing.value;
  const value = crypto.randomUUID();
  await transact("meta", "readwrite", (store) =>
    store.put({ key: "deviceId", value }),
  );
  return value;
}

async function getEncryptionKey() {
  const existing = await transact<
    { key: string; value: CryptoKey } | undefined
  >("meta", "readonly", (store) => store.get("packageEncryptionKey"));
  if (existing?.value) return existing.value;
  const value = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  await transact("meta", "readwrite", (store) =>
    store.put({ key: "packageEncryptionKey", value }),
  );
  return value;
}

export async function saveHikePackage(data: HikeModeData) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );
  await transact("packages", "readwrite", (store) =>
    store.put({
      hikeId: data.hike.id,
      iv: iv.buffer,
      ciphertext,
      expiresAt: data.expiresAt,
    } satisfies EncryptedPackage),
  );
}

export async function getHikePackage(hikeId: string) {
  const encrypted = await transact<EncryptedPackage | undefined>(
    "packages",
    "readonly",
    (store) => store.get(hikeId),
  );
  if (
    encrypted?.expiresAt &&
    new Date(encrypted.expiresAt).getTime() < Date.now()
  ) {
    await clearHikeData(hikeId);
    return null;
  }
  if (!encrypted) return null;
  try {
    const key = await getEncryptionKey();
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(encrypted.iv) },
      key,
      encrypted.ciphertext,
    );
    return JSON.parse(new TextDecoder().decode(plain)) as HikeModeData;
  } catch {
    await deleteHikePackage(hikeId);
    return null;
  }
}

export async function deleteHikePackage(hikeId: string) {
  await transact("packages", "readwrite", (store) => store.delete(hikeId));
}

export async function clearHikeData(hikeId: string) {
  await deleteHikePackage(hikeId);
  const operations = await listOperations(hikeId);
  await Promise.all(
    operations.map((operation) => removeOperation(operation.operationId)),
  );
}

export async function enqueueOperation(operation: OfflineOperation) {
  await transact("operations", "readwrite", (store) => store.put(operation));
}

export async function listOperations(hikeId: string) {
  const all = await transact<OfflineOperation[]>(
    "operations",
    "readonly",
    (store) => store.getAll(),
  );
  return all.filter((operation) => operation.hikeId === hikeId);
}

export async function updateOperation(operation: OfflineOperation) {
  await transact("operations", "readwrite", (store) => store.put(operation));
}

export async function removeOperation(operationId: string) {
  await transact("operations", "readwrite", (store) =>
    store.delete(operationId),
  );
}
