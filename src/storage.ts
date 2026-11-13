import { createSeed, mutate } from './domain';
import type { Action, State } from './domain';

let dbPromise: Promise<IDBDatabase> | undefined;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('vecin-demo-v1') : null;
const listeners = new Set<() => void>();
channel?.addEventListener('message', () => listeners.forEach(fn => fn()));
function db(): Promise<IDBDatabase> {
  return dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('vecin-community-demo', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('state');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = undefined; reject(new Error('Browserul nu permite salvarea locală. Verifică permisiunile de stocare.')); };
  });
}
export async function loadState(): Promise<State> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('state', 'readwrite'); const store = tx.objectStore('state');
    let value: State; const req = store.get('current');
    req.onsuccess = () => { value = req.result || createSeed(); if (!req.result) store.put(value, 'current'); };
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(new Error('Datele locale nu au putut fi citite.'));
  });
}
export async function dispatch(action: Action): Promise<State> {
  const database = await db();
  const value = await new Promise<State>((resolve, reject) => {
    const tx = database.transaction('state', 'readwrite'); const store = tx.objectStore('state');
    let result: State; let failure: unknown; const req = store.get('current');
    req.onsuccess = () => {
      try { result = mutate(req.result || createSeed(), action); store.put(result, 'current'); }
      catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure || new Error('Salvarea a eșuat. Verifică spațiul disponibil și reîncearcă.'));
    tx.onerror = () => reject(new Error('Nu am putut salva. Datele introduse rămân în formular.'));
  });
  channel?.postMessage('changed'); listeners.forEach(fn => fn()); return value;
}
export function subscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

export async function compressPhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Alege o fotografie JPG, PNG sau WebP.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Fotografia poate avea maximum 15 MB înainte de comprimare.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Procesarea imaginilor nu este disponibilă.');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let quality = 0.8; let data = canvas.toDataURL('image/webp', quality);
    while (data.length * 0.75 > 500_000 && quality > 0.25) { quality -= 0.1; data = canvas.toDataURL('image/webp', quality); }
    if (data.length * 0.75 > 1_000_000) throw new Error('Fotografia nu a putut fi comprimată suficient. Alege una mai mică.');
    return data;
  } catch (error) { if (error instanceof Error && /fotografi|imagin/i.test(error.message)) throw error; throw new Error('Imaginea nu poate fi citită. Încearcă un fișier JPG sau PNG valid.'); }
  finally { URL.revokeObjectURL(url); }
}
