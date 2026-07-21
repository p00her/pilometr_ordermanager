import type { Order } from '../types';

const DB_NAME = 'orderManager';
const DB_VERSION = 1;
const ORDERS_STORE = 'orders';
const META_STORE = 'meta';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ORDERS_STORE)) {
        db.createObjectStore(ORDERS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveOrders(orders: Order[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(ORDERS_STORE, 'readwrite');
  const store = tx.objectStore(ORDERS_STORE);
  for (const order of orders) {
    store.put(order);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllOrders(): Promise<Order[]> {
  const db = await openDB();
  const tx = db.transaction(ORDERS_STORE, 'readonly');
  const store = tx.objectStore(ORDERS_STORE);
  const req = store.getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getOrderById(id: number): Promise<Order | undefined> {
  const db = await openDB();
  const tx = db.transaction(ORDERS_STORE, 'readonly');
  const store = tx.objectStore(ORDERS_STORE);
  const req = store.get(id);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result ?? undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function getMeta(key: string): Promise<string | undefined> {
  const db = await openDB();
  const tx = db.transaction(META_STORE, 'readonly');
  const store = tx.objectStore(META_STORE);
  const req = store.get(key);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result?.value);
    req.onerror = () => reject(req.error);
  });
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(META_STORE, 'readwrite');
  const store = tx.objectStore(META_STORE);
  store.put({ key, value });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function mergeOrders(apiOrders: Order[]): Promise<Order[]> {
  const existing = await getAllOrders();
  const map = new Map<number, Order>();
  for (const o of existing) map.set(o.id, o);
  for (const o of apiOrders) map.set(o.id, o);
  const merged = Array.from(map.values());
  await saveOrders(merged);
  return merged;
}

export async function replaceOrders(apiOrders: Order[]): Promise<Order[]> {
  const db = await openDB();
  const tx = db.transaction(ORDERS_STORE, 'readwrite');
  const store = tx.objectStore(ORDERS_STORE);
  store.clear();
  for (const order of apiOrders) {
    store.put(order);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(apiOrders);
    tx.onerror = () => reject(tx.error);
  });
}

const STORAGE_CACHE_TTL = 300_000;

export async function getCachedStorageItems(itemIds: number[]): Promise<Map<number, Record<string, number>>> {
  const db = await openDB();
  const tx = db.transaction(META_STORE, 'readonly');
  const store = tx.objectStore(META_STORE);
  const now = Date.now();
  const result = new Map<number, Record<string, number>>();
  for (const id of itemIds) {
    const req = store.get('storage_' + id);
    const entry = await new Promise<{ key: string; value: { data: Record<string, number>; cachedAt: number } } | undefined>(
      (resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }
    );
    if (entry && now - entry.value.cachedAt < STORAGE_CACHE_TTL) {
      result.set(id, entry.value.data);
    }
  }
  return result;
}

export async function setCachedStorageItems(
  items: { id: number; [key: string]: unknown }[]
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(META_STORE, 'readwrite');
  const store = tx.objectStore(META_STORE);
  const now = Date.now();
  for (const item of items) {
    const { id, ...data } = item;
    store.put({ key: 'storage_' + id, value: { data, cachedAt: now } });
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
