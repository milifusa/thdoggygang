import type { HikeModeData, OfflineOperation } from "../hike-mode-types";

const DB_NAME = "tdg-hike-operations";
const DB_VERSION = 1;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("packages")) db.createObjectStore("packages", { keyPath: "hike.id" });
      if (!db.objectStoreNames.contains("operations")) db.createObjectStore("operations", { keyPath: "operationId" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
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
  const existing = await transact<{ key: string; value: string } | undefined>("meta", "readonly", (store) => store.get("deviceId"));
  if (existing?.value) return existing.value;
  const value = crypto.randomUUID();
  await transact("meta", "readwrite", (store) => store.put({ key: "deviceId", value }));
  return value;
}

export async function saveHikePackage(data: HikeModeData) {
  await transact("packages", "readwrite", (store) => store.put(data));
}

export async function getHikePackage(hikeId: string) {
  const data = await transact<HikeModeData | undefined>("packages", "readonly", (store) => store.get(hikeId));
  if (data?.expiresAt && new Date(data.expiresAt).getTime() < Date.now()) {
    await deleteHikePackage(hikeId);
    return null;
  }
  return data ?? null;
}

export async function deleteHikePackage(hikeId: string) {
  await transact("packages", "readwrite", (store) => store.delete(hikeId));
}

export async function enqueueOperation(operation: OfflineOperation) {
  await transact("operations", "readwrite", (store) => store.put(operation));
}

export async function listOperations(hikeId: string) {
  const all = await transact<OfflineOperation[]>("operations", "readonly", (store) => store.getAll());
  return all.filter((operation) => operation.hikeId === hikeId);
}

export async function updateOperation(operation: OfflineOperation) {
  await transact("operations", "readwrite", (store) => store.put(operation));
}

export async function removeOperation(operationId: string) {
  await transact("operations", "readwrite", (store) => store.delete(operationId));
}
