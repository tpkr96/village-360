// =====================================================================
// gameState.js — the GAME STATE object and small helpers to read it
// ---------------------------------------------------------------------
// The whole game lives in ONE object called `state`. Everything you see
// on screen is drawn from it, and every action the player takes changes
// it. This idea — "a single source of truth" — is how most apps work,
// including React apps and games. It also makes saving trivial: we just
// store this one object (see storage.js).
//
// Rule of thumb used in this project:
//   - gameState.js : create the state + tiny "read" helpers
//   - gameLogic.js : the rules that CHANGE the state
//   - ui.js        : turns the state into HTML (never changes it)
// =====================================================================

const MONTH_NAMES = ["April", "May", "June", "July", "August", "September"];

function createNewGame() {
  return {
    version: 1,
    month: 1, // current month, 1..maxMonths
    maxMonths: 6,
    phase: "playing", // "playing" or "ended"

    budget: {
      total: 1000000, // ₹10,00,000
      spent: 0, // money actually paid out
      committed: 0, // promised to active projects but not yet paid
      reserve: 100000, // emergency/contingency fund, ring-fenced for events
      reserveUsed: 0,
      reserveReleased: false, // player can release the reserve into the main budget
      monthlySpend: [], // rupees paid at the end of each month (for charts)
    },

    staff: {
      base: 6, // staff points available each month
      shortageMonths: 0, // months left of the Staff Shortage penalty
    },

    // Copy each village from the data file. `baseline` remembers the
    // starting numbers so we can measure improvement at the end.
    villages: VILLAGE_DATA.map((v) => ({
      id: v.id,
      name: v.name,
      mandal: v.mandal,
      population: v.population,
      households: v.households,
      position: { ...v.position },
      description: v.description,
      baseline: { ...v.stats },
      stats: { ...v.stats },
      beneficiaries: { women: 0, youth: 0, students: 0, farmers: 0, households: 0, community: 0 },
      history: [], // [{ month, text, tone }]
    })),

    projects: [], // every project the player has started (see gameLogic.startProject)
    fading: [], // temporary gains that wear off over time (e.g. Health Camp)
    nextProjectId: 1,

    pendingEvent: null, // an event waiting for the player's decision
    eventsSeen: [], // ids of events that already happened (each happens at most once)
    eventLog: [], // [{ month, title, villageName, choice, outcome }]

    reports: [], // monthly field updates, newest first: [{ month, lines: [] }]
    indexHistory: [], // district index at the start of each month (for the trend chart)

    counters: { eventsHandled: 0, eventsIgnored: 0, projectsCancelled: 0, delays: 0, maintenanceMissed: 0 },

    finalScore: null, // filled in by scoring.js when the game ends
  };
}

// ---------------------------------------------------------------------
// Read helpers. They never change the state, they only calculate.
// ---------------------------------------------------------------------

function getVillage(state, villageId) {
  return state.villages.find((v) => v.id === villageId);
}

function getProject(state, projectId) {
  return state.projects.find((p) => p.id === projectId);
}

function monthName(month) {
  return MONTH_NAMES[month - 1] || "";
}

// How much of the contingency reserve is still ring-fenced.
function reserveRemaining(state) {
  if (state.budget.reserveReleased) return 0;
  return state.budget.reserve - state.budget.reserveUsed;
}

// Money not yet paid out (includes committed money and the reserve).
function budgetRemaining(state) {
  return state.budget.total - state.budget.spent;
}

// Money the player can still put into NEW projects.
function budgetAvailable(state) {
  const b = state.budget;
  return b.total - b.spent - b.committed - reserveRemaining(state);
}

function staffCapacity(state) {
  return state.staff.base - (state.staff.shortageMonths > 0 ? 2 : 0);
}

function staffInUse(state) {
  return activeProjects(state).reduce((sum, p) => sum + getIntervention(p.interventionId).staff, 0);
}

function activeProjects(state, villageId) {
  return state.projects.filter((p) => p.status === "active" && (!villageId || p.villageId === villageId));
}

function completedProjects(state, villageId) {
  return state.projects.filter((p) => p.status === "completed" && (!villageId || p.villageId === villageId));
}

function hasCompleted(state, villageId, interventionId) {
  return state.projects.some(
    (p) => p.status === "completed" && p.villageId === villageId && p.interventionId === interventionId
  );
}

// A single 0–100 number summarising a village: the average of its five
// indicators plus community satisfaction.
function villageIndex(village) {
  const keys = [...STAT_KEYS, "satisfaction"];
  const total = keys.reduce((sum, k) => sum + village.stats[k], 0);
  return Math.round(total / keys.length);
}

function districtIndex(state) {
  const total = state.villages.reduce((sum, v) => sum + villageIndex(v), 0);
  return Math.round(total / state.villages.length);
}

function averageSatisfaction(state) {
  const total = state.villages.reduce((sum, v) => sum + v.stats.satisfaction, 0);
  return Math.round(total / state.villages.length);
}

function totalBeneficiaries(state) {
  const totals = { women: 0, youth: 0, students: 0, farmers: 0, households: 0, community: 0 };
  state.villages.forEach((v) => BENEFICIARY_KEYS.forEach((k) => (totals[k] += v.beneficiaries[k])));
  return totals;
}

function totalPopulation(state) {
  return state.villages.reduce((sum, v) => sum + v.population, 0);
}

// Village status label from its index — used for the "Village Health" visual.
function healthLabel(index) {
  if (index >= 70) return { label: "Thriving", tone: "good" };
  if (index >= 58) return { label: "Stable", tone: "ok" };
  if (index >= 46) return { label: "Struggling", tone: "warn" };
  return { label: "Critical", tone: "bad" };
}

// Problems are DERIVED from the numbers each time, never stored.
function villageProblems(state, village) {
  const problems = [];
  STAT_KEYS.forEach((k) => {
    const value = village.stats[k];
    if (value < 40) problems.push({ text: `${STAT_LABELS[k]} is critical (${value})`, tone: "bad" });
    else if (value < 50) problems.push({ text: `${STAT_LABELS[k]} is weak (${value})`, tone: "warn" });
  });
  if (village.stats.satisfaction < 45) {
    problems.push({ text: "Community trust is low: projects may face resistance", tone: "bad" });
  }
  if (village.stats.water < 45) {
    problems.push({ text: "Water shortage reduces the effect of livelihood projects", tone: "warn" });
  }
  return problems;
}

// ---------------------------------------------------------------------
// Tiny "write" helpers used by gameLogic.js and events.js so that every
// change goes through one place (and values always stay within 0–100).
// ---------------------------------------------------------------------

// All randomness goes through `random()`. Normally it is Math.random,
// but the tests swap in a predictable version with setRandom() so the
// same "random" game can be replayed exactly.
let random = Math.random;
function setRandom(fn) {
  random = fn || Math.random;
}

function chance(probability) {
  return random() < probability;
}

function pickRandom(list) {
  return list[Math.floor(random() * list.length)];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function changeStat(village, key, delta) {
  village.stats[key] = clamp(Math.round(village.stats[key] + delta), 0, 100);
}

function addHistory(village, month, text, tone) {
  village.history.unshift({ month, text, tone: tone || "info" });
}

// Pay money. `from` is "main" (normal budget) or "reserve" (contingency).
function spend(state, amount, from) {
  if (amount <= 0) return;
  state.budget.spent += amount;
  if (from === "reserve") state.budget.reserveUsed += amount;
  const i = state.month - 1; // also record it against this month for the chart
  state.budget.monthlySpend[i] = (state.budget.monthlySpend[i] || 0) + amount;
}

// Can the player pay `amount` from this source right now?
function canAfford(state, amount, from) {
  if (amount <= 0) return true;
  if (from === "reserve") return reserveRemaining(state) >= amount;
  return budgetAvailable(state) >= amount;
}
