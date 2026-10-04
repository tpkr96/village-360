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
    return state && state.version === 1 ? migrateState(state) : null; // ignore saves from other versions
  } catch (error) {
    console.warn("Could not load the saved game:", error);
    return null;
  }
}

// MIGRATION: saves made by an older version of the game may be missing
// fields that newer code expects. Instead of throwing old saves away,
// we fill in the missing pieces. Every real app does this when its data
// shape changes (databases call it a "schema migration").
function migrateState(state) {
  if (!state.villageIndexHistory) {
    // Added in Step 4. We can't recover past months, so start from today.
    state.villageIndexHistory = {};
    state.villages.forEach((v) => (state.villageIndexHistory[v.id] = [villageIndex(v)]));
  }
  return state;
}

// Small per-browser preferences (not part of the game itself).
function loadPreference(key) {
  try {
    return localStorage.getItem("village360.pref." + key);
  } catch (error) {
    return null;
  }
}

function savePreference(key, value) {
  try {
    localStorage.setItem("village360.pref." + key, value);
  } catch (error) {
    // preferences are optional
  }
}

function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (error) {
    // nothing to do
  }
}
