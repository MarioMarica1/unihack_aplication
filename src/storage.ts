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

const photoTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const photoExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];
export const photoAccept = [...photoTypes, ...photoExtensions].join(',');

export async function compressPhoto(file: File): Promise<string> {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!photoTypes.includes(file.type) && !photoExtensions.includes(extension)) {
    throw new Error('Alege o fotografie JPG, PNG, WebP sau HEIC.');
  }
  if (file.size > 15 * 1024 * 1024) throw new Error('Fotografia poate avea maximum 15 MB înainte de comprimare.');
  const url = URL.createObjectURL(file);
  const canvas = document.createElement('canvas');
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => { throw new Error('Browserul nu poate deschide această fotografie. Încearcă un fișier JPG sau PNG.'); });
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Procesarea imaginilor nu este disponibilă.');

    const originalSize = Math.max(img.naturalWidth, img.naturalHeight);
    let photo: Blob | null = null;
    // Supabase accepts JPEG up to 1 MB. Resize further if quality alone isn't enough.
    for (const maxSize of [1400, 960, 640]) {
      const scale = Math.min(1, maxSize / originalSize);
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.64]) {
        photo = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (photo?.type === 'image/jpeg' && photo.size > 0 && photo.size <= 500_000) break;
      }
      if (photo?.type === 'image/jpeg' && photo.size > 0 && photo.size <= 500_000) break;
    }
    if (photo?.type !== 'image/jpeg' || !photo.size || photo.size > 1_000_000) {
      throw new Error('Fotografia nu a putut fi comprimată. Încearcă să alegi din nou fișierul.');
    }
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Fotografia nu a putut fi pregătită. Încearcă din nou.'));
      reader.readAsDataURL(photo);
    });
  } finally {
    canvas.width = canvas.height = 1;
    URL.revokeObjectURL(url);
  }
}
