// =====================================================================
// storage.js — SAVING and LOADING with localStorage
// ---------------------------------------------------------------------
// localStorage is a small key → value store built into every browser.
// It only stores TEXT, so we convert the state object to text with
// JSON.stringify() when saving, and back to an object with JSON.parse()
// when loading. The data stays in THIS browser on THIS device; clearing
// site data or using a private window means no save.
//
// Everything is wrapped in try/catch because localStorage can be
// blocked (privacy settings) or full, and the game must still work.
//
// Later (Version 3+) these three functions are the ONLY place you need
// to change to save to a Flask server or database instead: the rest of
// the game just calls saveGame() / loadGame().
// =====================================================================

const SAVE_KEY = "village360.save.v1";

function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.warn("Could not save the game:", error);
    return false;
  }
}

function loadGame() {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    if (!text) return null;
    const state = JSON.parse(text);
    return state && state.version === 1 ? state : null; // ignore saves from other versions
  } catch (error) {
    console.warn("Could not load the saved game:", error);
    return null;
  }
}

function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (error) {
    // nothing to do
  }
}
