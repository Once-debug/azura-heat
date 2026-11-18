// localStorage save game: mission progress, cash, player position and lifetime stats.
// Every access is wrapped so a sandboxed or private-mode browser simply plays unsaved.

const KEY = 'azura-heat-save-v1';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable: the run simply is not kept */
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

export function hasSave() {
  return loadSave() !== null;
}
