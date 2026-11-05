/**
 * @file transientStorage.ts
 * @description In-memory replacement for localStorage. Nothing is persisted to
 * the browser; all state is discarded when the page is closed or reloaded.
 */

const store = new Map<string, string>();

export const transientStorage = {
  getItem: (key: string): string | null => store.get(key) ?? null,
  setItem: (key: string, value: string): void => { store.set(key, String(value)); },
  removeItem: (key: string): void => { store.delete(key); },
  clear: (): void => store.clear(),
};
