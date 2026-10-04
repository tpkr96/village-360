// =====================================================================
// tests.js — automatic checks for the game rules
// ---------------------------------------------------------------------
// A "test" sets up a situation, runs a game function, and checks the
// result with expect(). If a rule change breaks something, the test
// turns red and tells you what went wrong.
// =====================================================================

const results = [];

function test(name, fn) {
  try {
    setRandom(() => 0.99); // default: no risks fire, no random events
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, message: error.message });
  } finally {
    setRandom(Math.random);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

// A seeded random generator: the same seed always gives the same sequence.
function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------
// RULE TESTS
// ---------------------------------------------------------------------

test("New game starts with the right budget and villages", () => {
  const s = newGame();
  expect(s.villages.length === 3, "should have 3 villages");
  expect(s.budget.total === 1000000, "budget should be ₹10,00,000");
  expect(budgetAvailable(s) === 900000, "₹1,00,000 should be held in reserve");
  expect(s.month === 1 && s.phase === "playing", "should start in month 1");
});

test("Starting a project commits money and uses staff", () => {
  const s = newGame();
  const r = startProject(s, "rampur", "school_repair");
  expect(r.ok, "project should start");
  expect(s.budget.committed === 120000, "cost should be committed");
  expect(budgetAvailable(s) === 780000, "available budget should drop");
  expect(staffInUse(s) === 2, "school repair uses 2 staff");
});

test("The same project can't run twice in one village", () => {
  const s = newGame();
  startProject(s, "rampur", "vdc");
  expect(!startProject(s, "rampur", "vdc").ok, "duplicate should be blocked");
  expect(startProject(s, "mallapur", "vdc").ok, "other villages are fine");
});

test("Staff capacity blocks extra projects", () => {
  const s = newGame();
  startProject(s, "rampur", "pipeline"); // 3 staff
  startProject(s, "mallapur", "pipeline"); // 3 staff → 6/6
  const r = startProject(s, "chintalapally", "vdc");
  expect(!r.ok && r.message.includes("staff"), "should be blocked by staff");
});

test("Budget blocks projects you can't afford", () => {
  const s = newGame();
  s.budget.spent = 850000;
  const r = startProject(s, "rampur", "pipeline");
  expect(!r.ok && r.message.includes("budget"), "should be blocked by budget");
});

test("A 1-month project completes, is paid and changes the village", () => {
  const s = newGame();
  const before = getVillage(s, "chintalapally").stats.water;
  startProject(s, "chintalapally", "ro_plant");
  advanceMonth(s);
  const p = s.projects[0];
  expect(p.status === "completed", "should be completed");
  expect(p.paid === 150000 && s.budget.committed === 0, "should be fully paid");
  expect(getVillage(s, "chintalapally").stats.water > before, "water should improve");
  expect(getVillage(s, "chintalapally").beneficiaries.households === 300, "beneficiaries should be counted");
});

test("Multi-month projects are paid month by month", () => {
  const s = newGame();
  startProject(s, "mallapur", "pipeline"); // ₹2,50,000 over 3 months
  advanceMonth(s);
  expect(s.projects[0].paid === Math.round(250000 / 3), "first instalment paid");
  expect(s.projects[0].status === "active", "still active");
  advanceMonth(s);
  advanceMonth(s);
  expect(s.projects[0].status === "completed" && s.projects[0].paid === 250000, "fully paid at completion");
});

test("A project delayed several times is never overpaid", () => {
  const s = newGame();
  startProject(s, "mallapur", "pipeline");
  const p = s.projects[0];
  delayProject(s, p);
  delayProject(s, p);
  for (let i = 0; i < 5; i++) {
    advanceMonth(s);
    s.pendingEvent = null;
  }
  expect(p.status === "completed", "should complete after the delays");
  expect(p.paid === p.cost, `paid ${p.paid}, cost ${p.cost}`);
  expect(s.budget.spent === p.cost, "total spending equals project cost");
});

test("Diminishing returns: weak indicators improve more", () => {
  const s = newGame();
  const weak = calculateImpact(s, "chintalapally", "ro_plant").deltas.water; // water 38
  const strong = calculateImpact(s, "rampur", "ro_plant").deltas.water; // water 61
  expect(weak > strong, `expected ${weak} > ${strong}`);
});

test("Water shortage weakens livelihood projects", () => {
  const s = newGame();
  const preview = calculateImpact(s, "chintalapally", "sewing_unit");
  expect(preview.notes.some((n) => n.includes("Water shortage")), "should warn about water");
});

test("SHG Training boosts a later Sewing Unit", () => {
  const s = newGame();
  const before = calculateImpact(s, "rampur", "sewing_unit").deltas.livelihood;
  startProject(s, "rampur", "shg_training");
  advanceMonth(s);
  const after = calculateImpact(s, "rampur", "sewing_unit").deltas.livelihood;
  expect(after > before, `expected boost: ${after} > ${before}`);
});

test("Weak infrastructure weakens the Digital Learning Lab", () => {
  const s = newGame();
  const mallapur = calculateImpact(s, "mallapur", "digital_lab"); // infrastructure 39
  expect(mallapur.notes.some((n) => n.includes("infrastructure")), "should warn about infrastructure");
});

test("Neglected villages lose satisfaction", () => {
  const s = newGame();
  const before = getVillage(s, "mallapur").stats.satisfaction;
  advanceMonth(s);
  expect(getVillage(s, "mallapur").stats.satisfaction < before, "satisfaction should fall");
});

test("Health Camp gains fade over two months", () => {
  const s = newGame();
  startProject(s, "mallapur", "health_camp");
  advanceMonth(s);
  const peak = getVillage(s, "mallapur").stats.health;
  advanceMonth(s);
  advanceMonth(s);
  expect(getVillage(s, "mallapur").stats.health < peak, "health should drop back");
  expect(s.fading.length === 0, "fading should be finished");
});

test("Paying an event from the reserve doesn't touch project money", () => {
  const s = newGame();
  s.pendingEvent = { id: "heavy_rain", month: 1, ctx: { villageId: "mallapur" } };
  const available = budgetAvailable(s);
  const r = resolveEvent(s, 0); // emergency response from reserve
  expect(r.ok, "should resolve");
  expect(reserveRemaining(s) === 40000, "reserve should drop by ₹60,000");
  expect(budgetAvailable(s) === available, "available budget unchanged");
  expect(s.pendingEvent === null, "event cleared");
});

test("Ignoring an event is counted and hurts the village", () => {
  const s = newGame();
  const before = getVillage(s, "mallapur").stats.water;
  s.pendingEvent = { id: "heavy_rain", month: 1, ctx: { villageId: "mallapur" } };
  resolveEvent(s, 2);
  expect(s.counters.eventsIgnored === 1, "should count as ignored");
  expect(getVillage(s, "mallapur").stats.water < before, "water should fall");
});

test("You can't advance while an event is waiting", () => {
  const s = newGame();
  s.pendingEvent = { id: "staff_shortage", month: 1, ctx: {} };
  expect(advanceMonth(s) === null, "advance should be refused");
});

test("Cancelling a project frees its unpaid money", () => {
  const s = newGame();
  startProject(s, "mallapur", "pipeline");
  advanceMonth(s); // one instalment paid
  const p = s.projects[0];
  cancelProject(s, p);
  expect(s.budget.committed === 0, "nothing should stay committed");
  expect(p.status === "cancelled", "status cancelled");
});

test("Releasing the reserve adds it to the available budget", () => {
  const s = newGame();
  const amount = releaseReserve(s);
  expect(amount === 100000 && budgetAvailable(s) === 1000000, "all money available");
});

test("The game ends after month 6 with a score; late projects are unfinished", () => {
  const s = newGame();
  const advanceAndIgnore = () => {
    advanceMonth(s);
    if (s.pendingEvent) resolveEvent(s, getEvent(s.pendingEvent.id).choices.length - 1);
  };
  for (let i = 0; i < 5; i++) advanceAndIgnore();
  expect(s.month === 6, "should reach September");
  startProject(s, "mallapur", "pipeline"); // 3 months, started in September
  advanceAndIgnore();
  expect(s.phase === "ended", "game should be over");
  expect(s.projects[0].status === "unfinished", "pipeline should be unfinished");
  expect(s.budget.committed === 0, "no money left committed");
  const f = s.finalScore;
  expect(f.overall >= 0 && f.overall <= 100, "score within 0–100");
  expect(typeof f.rating === "string" && f.reasons.length >= 6, "rating and reasons present");
});

// ---------------------------------------------------------------------
// BALANCE SIMULATION
// Three automatic "players" play full games. We also check that the
// rules never break (no negative money, indicators stay 0–100).
// ---------------------------------------------------------------------

const STRATEGIES = {
  "Do nothing": {
    plan: () => {},
    respond: (s, event) => event.choices.length - 1, // always ignore
  },
  "Random spender": {
    plan: (s) => {
      for (let tries = 0; tries < 6; tries++) {
        if (random() < 0.5) continue;
        startProject(s, pickRandom(s.villages).id, pickRandom(INTERVENTIONS).id);
      }
    },
    respond: (s, event) => {
      const options = event.choices.map((c, i) => i).filter((i) => canAfford(s, choiceCost(s, event.choices[i], s.pendingEvent.ctx), event.choices[i].from || "main"));
      return pickRandom(options);
    },
  },
  "Careful planner": {
    plan: (s) => {
      // Fund the weakest villages first with the best value project that finishes in time.
      let started = true;
      while (started) {
        started = false;
        const villages = [...s.villages].sort((a, b) => villageIndex(a) - villageIndex(b));
        for (const v of villages) {
          const options = INTERVENTIONS.filter((i) => checkCanStart(s, v.id, i.id).ok && s.month + i.duration - 1 <= s.maxMonths)
            .map((i) => {
              const d = calculateImpact(s, v.id, i.id).deltas;
              const value = Object.values(d).reduce((a, b) => a + Math.max(0, b), 0) * (0.6 + i.sustainability / 25);
              return { i, score: value / (i.cost / 100000) };
            })
            .sort((a, b) => b.score - a.score);
          if (options.length) {
            startProject(s, v.id, options[0].i.id);
            started = true;
            break;
          }
        }
      }
    },
    respond: (s, event) => {
      const ctx = s.pendingEvent.ctx;
      const ok = (i) => canAfford(s, choiceCost(s, event.choices[i], ctx), event.choices[i].from || "main");
      if (event.id === "disagreement") return ok(0) ? 0 : 1; // meet if affordable, else push ahead
      for (let i = 0; i < event.choices.length; i++) if (ok(i)) return i;
      return event.choices.length - 1;
    },
  },
};

function playGame(strategy, seed) {
  setRandom(seededRandom(seed));
  const s = newGame();
  const problems = [];
  let guard = 0;
  while (s.phase === "playing" && guard++ < 20) {
    strategy.plan(s);
    advanceMonth(s);
    if (s.pendingEvent) {
      const result = resolveEvent(s, strategy.respond(s, getEvent(s.pendingEvent.id)));
      if (!result.ok) problems.push(`strategy picked an unaffordable option in month ${s.month}`);
      if (s.pendingEvent) resolveEvent(s, getEvent(s.pendingEvent.id).choices.length - 1); // free fallback
    }
    // invariants
    if (budgetAvailable(s) < 0) problems.push(`available budget negative in month ${s.month}`);
    if (s.budget.spent > s.budget.total) problems.push("overspent total budget");
    s.villages.forEach((v) => [...STAT_KEYS, "satisfaction"].forEach((k) => {
      if (v.stats[k] < 0 || v.stats[k] > 100) problems.push(`${v.name} ${k} out of range`);
    }));
  }
  setRandom(Math.random);
  return { state: s, problems };
}

function runSimulation() {
  const GAMES = 300;
  const rows = [];
  let allProblems = [];
  const averages = {};
  let minEvents = Infinity;
  let maxEvents = 0;
  Object.keys(STRATEGIES).forEach((name, si) => {
    const scores = [];
    const events = [];
    const parts = { impact: 0, efficiency: 0, satisfaction: 0, sustainability: 0, risk: 0, timeliness: 0 };
    for (let g = 0; g < GAMES; g++) {
      const { state, problems } = playGame(STRATEGIES[name], 1000 * (si + 1) + g);
      allProblems = allProblems.concat(problems);
      scores.push(state.finalScore.overall);
      events.push(state.eventsSeen.length);
      Object.keys(parts).forEach((k) => (parts[k] += state.finalScore.parts[k] / GAMES));
    }
    const avg = scores.reduce((a, b) => a + b, 0) / GAMES;
    averages[name] = avg;
    minEvents = Math.min(minEvents, ...events);
    maxEvents = Math.max(maxEvents, ...events);
    rows.push(`<tr><td>${name}</td><td>${avg.toFixed(1)}</td><td>${Math.min(...scores)}–${Math.max(...scores)}</td>
      <td>${Math.min(...events)}–${Math.max(...events)}</td>
      <td>${Object.keys(parts).map((k) => `${k.slice(0, 4)} ${Math.round(parts[k])}`).join(" · ")}</td></tr>`);
  });

  document.getElementById("sim").innerHTML = `<table><tr><th>Strategy (${GAMES} games)</th><th>Avg score</th><th>Range</th><th>Events/game</th><th>Average sub-scores</th></tr>${rows.join("")}</table>`;

  // Balance checks become tests too.
  results.push({ name: "Simulation: rules never break (money, 0–100 limits)", ok: allProblems.length === 0, message: allProblems.slice(0, 3).join("; ") });
  results.push({ name: "Simulation: every game has 3–5 random events", ok: minEvents >= 3 && maxEvents <= 5, message: `got ${minEvents}–${maxEvents}` });
  results.push({ name: "Simulation: doing nothing scores below 45", ok: averages["Do nothing"] < 45, message: `got ${averages["Do nothing"].toFixed(1)}` });
  results.push({ name: "Simulation: careful planning beats random spending", ok: averages["Careful planner"] > averages["Random spender"] + 5, message: `planner ${averages["Careful planner"].toFixed(1)} vs random ${averages["Random spender"].toFixed(1)}` });
  results.push({ name: "Simulation: even good automatic play is not near-perfect (< 90)", ok: averages["Careful planner"] < 90, message: `got ${averages["Careful planner"].toFixed(1)}` });
}

runSimulation();

// ---------------------------------------------------------------------
// Show the results
// ---------------------------------------------------------------------
const failed = results.filter((r) => !r.ok);
document.getElementById("summary").innerHTML = failed.length
  ? `<span class="fail">${failed.length} of ${results.length} tests failed</span>`
  : `<span class="pass">All ${results.length} tests passed ✔</span>`;
document.getElementById("results").innerHTML = results
  .map((r) => `<li class="${r.ok ? "pass" : "fail"}">${r.ok ? "✔" : "✘"} ${r.name}${r.ok ? "" : ` — ${r.message}`}</li>`)
  .join("");
console.log(failed.length ? `${failed.length} tests failed` : "All tests passed", results);
