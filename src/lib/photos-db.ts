// Almacenamiento persistente de fotos con IndexedDB (guarda los archivos como
// Blob, así soporta muchas fotos sin el límite de localStorage). Todo se ejecuta
// solo en el navegador (nunca en el servidor).

const DB_NAME = "recuerdos-db";
const STORE = "photos";

export interface PhotoRecord {
  id: string;
  blob: Blob;
  name: string;
  date: number; // fecha de la foto (timestamp)
  added: number; // cuándo se agregó
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addPhotos(files: File[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    const record: PhotoRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      blob: f,
      name: f.name,
      date: f.lastModified || Date.now(),
      added: Date.now(),
    };
    store.put(record);
  }
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function getAllPhotos(): Promise<PhotoRecord[]> {
  const db = await openDB();
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  return new Promise((res, rej) => {
    const req = store.getAll();
    req.onsuccess = () => res((req.result as PhotoRecord[]) ?? []);
    req.onerror = () => rej(req.error);
  });
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
