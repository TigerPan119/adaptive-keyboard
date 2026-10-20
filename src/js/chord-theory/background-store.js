const DATABASE_NAME = "chord-theory-visuals";
const STORE_NAME = "backgrounds";
const CUSTOM_BACKGROUND_KEY = "custom-background";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open background storage."));
  });
}

export async function saveCustomBackground(file) {
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({ blob: file, name: file.name }, CUSTOM_BACKGROUND_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Could not save background."));
    });
  } finally {
    database.close();
  }
}

export async function loadCustomBackground() {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(CUSTOM_BACKGROUND_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Could not restore background."));
    });
  } finally {
    database.close();
  }
}
