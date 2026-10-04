# How Village 360 works: a guide for learning

This guide explains the code using the game itself. Read it with the code open beside it.
You don't need to understand everything at once; start with sections 1–3.

---

## 1. The big picture

```
 ┌────────────┐   click    ┌──────────────┐  changes   ┌─────────────┐
 │  Browser   │ ─────────▶ │   app.js     │ ─────────▶ │   state     │
 │  (HTML)    │            │ (handlers)   │            │ (one object)│
 └────────────┘            └──────────────┘            └─────────────┘
       ▲                          │ saveGame()                │
       │        render()          ▼                           │
       └──────────────────── ui.js ◀───────────────────────────┘
                              reads state, writes HTML
```

Every interaction follows the same loop:

1. The player clicks a button (for example **Advance Month**).
2. `app.js` calls a rule in `gameLogic.js` (for example `advanceMonth(state)`).
3. That rule **changes the `state` object**.
4. `app.js` calls `update()`, which saves the state and **redraws the whole screen** from it.

The screen is never edited piece by piece. It is always rebuilt from the state. That is
the most important idea in this project, and it is how React and most game engines work too.

---

## 2. Why each file exists

| File | Job | Changes the state? |
|---|---|---|
| `index.html` | The page skeleton: empty boxes that JavaScript fills | – |
| `css/style.css` | All visual design: colours, layout, responsive rules | – |
| `js/villages.js` | **Data**: the 3 villages' starting numbers | No |
| `js/interventions.js` | **Data**: the 12 projects and their costs, impacts, risks | No |
| `js/events.js` | **Data + small rules**: the 5 random events and their choices | Yes (choices) |
| `js/gameState.js` | Creates a new `state`, plus small helpers to read it | Only via helpers |
| `js/gameLogic.js` | **The rules**: start projects, advance a month, resolve events | **Yes** |
| `js/scoring.js` | Calculates the final 0–100 score and the explanation | No |
| `js/storage.js` | Saves/loads the state with `localStorage` | No |
| `js/ui.js` | Turns the state into HTML | **Never** |
| `js/app.js` | Starts the game; connects clicks to rules | Through rules |
| `tests/` | Automatic checks of the rules (open `tests/test.html`) | – |

**Why separate data from rules?** To change the game's numbers you only edit `villages.js`
or `interventions.js`. Later you can load real village data from a spreadsheet or an API,
and nothing else needs to change.

**Why are the scripts loaded in a specific order?** In `index.html` each `<script>` can only
use things defined by the scripts *above* it. Data comes first, then state, then rules, then
UI, and `app.js` comes last because it starts everything. (Version 2 will switch to
JavaScript *modules* with `import`/`export`, which handle this automatically.)

---

## 3. The game state

The whole game is one JavaScript object. You can inspect it yourself: open the game,
press **F12**, go to the **Console** tab, and type `state`.

```js
state = {
  month: 3,                 // April = 1 … September = 6
  phase: "playing",         // or "ended"
  budget: {
    total: 1000000,         // ₹10,00,000
    spent: 258000,          // actually paid
    committed: 160000,      // promised to running projects
    reserve: 100000,        // emergency fund for events
    reserveUsed: 40000,
  },
  staff: { base: 6, shortageMonths: 0 },
  villages: [
    { id: "rampur", name: "Rampur", population: 1450,
      baseline: { education: 48, ... },   // starting values, for scoring
      stats:    { education: 53, ... },   // current values
      beneficiaries: { women: 60, ... },
      history: [ { month: 2, text: "Completed SHG Training…" } ] },
    // …
  ],
  projects: [
    { id: 1, interventionId: "ro_plant", villageId: "chintalapally",
      monthsLeft: 0, cost: 150000, paid: 150000, status: "completed" },
  ],
  pendingEvent: { id: "heat_wave", ctx: { villageId: "mallapur" } },  // or null
  eventLog: [...], reports: [...], counters: {...}, finalScore: null,
}
```

Notice what is **not** stored: "available budget", "village problems", "district index".
These are **calculated** from the state whenever they're needed (see the helpers in
`gameState.js`, like `budgetAvailable(state)`). Storing only the raw facts means numbers
can never get out of sync.

### Money, step by step
- **Start a project:** its full cost moves into `committed`.
- **Each month it progresses:** one instalment moves from `committed` to `spent`.
- **Available to spend** = total − spent − committed − remaining reserve.
- **Events** are paid from the reserve or from the main budget, depending on the choice.

---

## 4. What happens when you click "Advance Month"

Open `js/gameLogic.js` and find `advanceMonth`. It is a short list of steps:

```js
processProjects(state, report);   // 1. risks, payments, progress, completions
payMaintenance(state, report);    // 2. RO plants and labs cost money to run
applyFading(state, report);       // 3. Health Camp benefits wear off
applyMonthlyDrift(state, report); // 4. neglected villages lose satisfaction,
                                  //    unsafe water lowers health
// 5. staff recover from a shortage
// 6. if it was September → endGame() and calculate the score
// 7. otherwise month + 1, and maybe a random event
```

Each step is its own small function, so you can read and change one rule at a time.
The `report` object collects sentences ("RO Water Plant completed…") that appear in the
**Field report** pop-up and the **Field Updates** feed.

### Where the trade-offs come from
`calculateImpact()` decides what a project *really* does in a specific village:

- **Diminishing returns:** improving a weak indicator (30) is easier than a strong one (80).
- **Village priorities:** if a village's worst indicator is below 45 and your project
  ignores it, residents are only half as pleased.
- **Special rules:** low water weakens livelihood projects, weak infrastructure weakens the
  Digital Lab, and SHG Training boosts a later Sewing Unit.
- **Quality:** a random factor, reduced by delays and community resistance.

That is why the same ₹1,50,000 RO plant is great in Chintalapally (water 38) and much less
useful in Rampur (water 61).

---

## 5. How events change the state

Each event in `js/events.js` is an object holding **functions**:

```js
{
  id: "heat_wave",
  condition: (state) => state.month <= 3,       // can it happen now?
  setup: (state) => ({ villageId: "mallapur" }), // who is affected?
  choices: [
    { label: "Set up water & ORS stations", cost: 40000, from: "reserve",
      apply: (state, ctx) => {                   // what happens if chosen
        changeStat(getVillage(state, ctx.villageId), "health", -2);
        return "Water and ORS stations prevented serious cases.";
      } },
    ...
  ],
}
```

The flow:
1. `advanceMonth` → `rollRandomEvent` picks an event and stores it in `state.pendingEvent`.
2. Because `pendingEvent` is not `null`, `ui.js` shows the event pop-up and the
   Advance button is disabled. You *must* decide.
3. Clicking a choice calls `resolveEvent(state, index)`: it pays the cost, runs that
   choice's `apply` function, logs the result, and sets `pendingEvent` back to `null`.

To add a new event, copy an existing one and change it. Nothing else needs editing.

---

## 6. How the screen is drawn

`ui.js` uses **template strings** (text in back-ticks with `${...}` placeholders) to build HTML:

```js
`<div class="ind-value">${village.stats.water}</div>`
```

Buttons don't get their own click handlers. Each has a `data-action` attribute:

```html
<button data-action="start-project" data-id="ro_plant">Start</button>
```

`app.js` has **one** click listener for the whole page. It finds the nearest element
with `data-action` and runs the matching function from the `actions` object. This is called
**event delegation**, and it keeps working after the HTML is redrawn.

---

## 7. How saving works (localStorage)

`localStorage` is a small text store built into the browser:

```js
localStorage.setItem("village360.save.v1", JSON.stringify(state)); // save
const state = JSON.parse(localStorage.getItem("village360.save.v1")); // load
```

- `JSON.stringify` turns the object into text; `JSON.parse` turns it back.
- The save lives only in **this browser on this device**. It's gone after clearing site
  data, and it isn't available in private windows.
- The game saves after every click (`update()` in `app.js`).
- All of this is in `storage.js`. In Version 3 you'll replace those three functions to save
  to a Flask server instead, and the rest of the game won't notice.

---

## 8. How the tests work

Open `tests/test.html` in a browser. It loads the data and rules **without** the UI and runs:

- **Rule tests:** for example, "a project delayed twice is never overpaid".
- **A balance simulation:** 900 complete games played by three automatic players. It
  checks that doing nothing scores badly, careful planning beats random spending, and no rule
  ever breaks (negative money, indicators outside 0–100).

The tests already caught two real bugs during development. Run them after every rule change.

---

## 9. How AI will plug in later (Step 6 / Version 5)

The game already keeps everything in a structured `state`. That is exactly what an AI
feature needs. The plan:

```
state ──▶ buildAIContext(state, villageId) ──▶ Flask /api/ask ──▶ LLM API
                (pick only relevant facts)      (keeps the API key secret)
```

1. **Build a small context object** from the state. Don't send everything:
   ```js
   function buildVillageContext(state, villageId) {
     const v = getVillage(state, villageId);
     return {
       month: monthName(state.month),
       village: v.name,
       indicators: v.stats,
       changeSinceStart: Object.fromEntries(STAT_KEYS.map(k => [k, v.stats[k] - v.baseline[k]])),
       activeProjects: activeProjects(state, v.id).map(p => getIntervention(p.interventionId).name),
       recentEvents: state.eventLog.filter(e => e.villageName === v.name).slice(0, 3),
       beneficiaries: v.beneficiaries,
     };
   }
   ```
2. **Send it to your own server** (never put an API key in browser code):
   ```js
   const reply = await fetch("/api/ask", {
     method: "POST",
     headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ role: "field_officer", question, context: buildVillageContext(state, "rampur") }),
   }).then(r => r.json());
   ```
3. **The server** adds instructions ("You are a field officer… answer only from this data")
   and calls the LLM.

Because the AI only sees the facts you choose, its answers stay grounded in the game. The
Village Resident, Field Officer, Donor and Analyst features are all variations of this one pattern.

---

## 10. What comes next

| Step | What we'll add |
|---|---|
| 4. UI/UX | Tutorial hints, animations when numbers change, sound toggle, better charts |
| 5. Mechanics | More villages, quarterly donor reviews, staff hiring, multi-year mode, difficulty levels |
| 6. AI | Field Officer reports, Village Resident chat, Donor review, Analyst (needs a small Flask backend) |
