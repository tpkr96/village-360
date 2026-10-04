// =====================================================================
// app.js — STARTS the game and connects clicks to game logic
// ---------------------------------------------------------------------
// The loop that drives the whole app:
//
//   player clicks  →  handler calls a gameLogic function (changes state)
//                  →  update(): save to localStorage + render() the screen
//
// `state` is the game (saved). `ui` is screen-only stuff that does not
// need saving: which village is selected, which tab/modal is open.
// =====================================================================

let state = null;

const ui = {
  selectedVillageId: "rampur",
  tab: "overview",
  modal: null, // { type: "intro" | "help" | "picker" | "report" | "outcome" | "confirm", ...extra }
  pickerCategory: "all",
  finalDismissed: false,
};

function update() {
  saveGame(state);
  render(state, ui);
}

// Each key is a data-action name used in the HTML. `id` is the element's data-id.
const actions = {
  "new-game": () => {
    state = newGame();
    Object.assign(ui, { selectedVillageId: "rampur", tab: "overview", modal: null, pickerCategory: "all", finalDismissed: false });
    showToast("New game started. Welcome to Kothapet District.", "good");
  },
  "new-game-confirm": () => {
    ui.modal = { type: "confirm", title: "Start a new game?", text: "Your current progress will be lost.", confirmLabel: "Start new game", confirmAction: "new-game" };
  },
  "continue-game": () => {
    ui.modal = null;
  },
  help: () => {
    ui.modal = { type: "help" };
  },
  "close-modal": () => {
    if (!ui.modal && state.phase === "ended") ui.finalDismissed = true;
    ui.modal = null;
  },
  "select-village": (id) => {
    ui.selectedVillageId = id;
  },
  tab: (id) => {
    ui.tab = id;
  },
  "open-picker": () => {
    ui.modal = { type: "picker" };
  },
  "picker-category": (id) => {
    ui.pickerCategory = id;
  },
  "start-project": (id) => {
    const result = startProject(state, ui.selectedVillageId, id);
    showToast(result.message, result.ok ? "good" : "bad");
  },
  advance: () => {
    const report = advanceMonth(state);
    if (report) ui.modal = { type: "report", report };
  },
  "show-event": () => {
    ui.modal = null; // with no modal open, render() shows the pending event
  },
  "resolve-event": (id) => {
    const title = getEvent(state.pendingEvent.id).title;
    const result = resolveEvent(state, Number(id));
    if (result.ok) ui.modal = { type: "outcome", title, text: result.message };
    else showToast(result.message, "bad");
  },
  "release-reserve-confirm": () => {
    ui.modal = {
      type: "confirm",
      title: "Release the emergency reserve?",
      text: `${rupees(reserveRemaining(state))} will move into your main budget for projects. You will have no contingency fund left for disasters.`,
      confirmLabel: "Release reserve",
      confirmAction: "release-reserve",
    };
  },
  "release-reserve": () => {
    const amount = releaseReserve(state);
    ui.modal = null;
    showToast(`${rupees(amount)} added to your available budget.`, "good");
  },
  "view-final": () => {
    ui.modal = null;
    ui.finalDismissed = false;
  },
};

// One click listener for the whole page ("event delegation").
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action], [data-stop]");
  if (!el || !el.dataset.action) return; // clicked inside a modal, not on a button
  if (el.disabled) return;
  const handler = actions[el.dataset.action];
  if (!handler) return;
  handler(el.dataset.id);
  update();
});

// Keyboard: Enter/Space on map villages, Escape closes dialogs.
document.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".vnode")) {
    e.preventDefault();
    actions["select-village"](e.target.dataset.id);
    update();
  }
  if (e.key === "Escape" && ui.modal && ui.modal.type !== "intro") {
    actions["close-modal"]();
    update();
  }
});

// ---------- start ----------
(function init() {
  const saved = loadGame();
  state = saved || newGame();
  ui.modal = { type: "intro", canContinue: !!saved && saved.phase === "playing" };
  render(state, ui);
})();
