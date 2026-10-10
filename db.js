// The IndexedDB record contains only credential metadata and AES-GCM ciphertext.
const DB_NAME = 'finance-poc-02-secure-unlock';
const STORE = 'state';
const KEY = 'test-vault';

export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Закрой другие окна PWA и повтори попытку.'));
  });
}

async function transaction(mode, operation) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || new Error('Запись IndexedDB отменена.'));
      tx.onerror = () => reject(tx.error || new Error('Ошибка IndexedDB.'));
      const request = operation(tx.objectStore(STORE));
      request.onsuccess = () => { result = request.result; };
    });
  } finally {
    db.close();
  }
}
export const readVault = () => transaction('readonly', store => store.get(KEY));
export const saveVault = value => transaction('readwrite', store => store.put(value, KEY));
