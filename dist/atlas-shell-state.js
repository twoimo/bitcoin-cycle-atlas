export const SHELL_STORAGE_KEY = 'atlas.shell.v1';
export function readShellPreference(storage) {
  try { const value = JSON.parse(storage?.getItem(SHELL_STORAGE_KEY) || 'null'); return value?.version === 1 && value.compact === true; } catch { return false; }
}
export function writeShellPreference(storage, compact) {
  try { storage?.setItem(SHELL_STORAGE_KEY, JSON.stringify({ version: 1, compact: compact === true })); } catch { /* A private/readonly preview still works. */ }
}
