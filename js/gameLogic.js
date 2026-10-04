// =====================================================================
// gameLogic.js — the RULES of the game
// ---------------------------------------------------------------------
// Every function here takes the `state` object and changes it. None of
// them touch the HTML — that is ui.js's job. Because the rules don't
// depend on the screen, we can test them on their own (tests/test.html)
// and later move them to a Python/Flask server without rewriting the UI.
//
// The most important function is advanceMonth(). Read it first: it is
// a short list of steps, and each step is its own small function below.
// =====================================================================

function newGame() {
  const state = createNewGame();
  recordHistory(state);
  return state;
}

// ---------------------------------------------------------------------
// IMPACT CALCULATION
// The same project does NOT have the same effect everywhere. This is
// what creates trade-offs and stops "spend everywhere" from working.
// ---------------------------------------------------------------------

// Diminishing returns: improving a weak indicator is easier than
// improving a strong one. At 30 → x1.2, at 50 → x1.0, at 80 → x0.4.
function needFactor(current) {
  return clamp((100 - current) / 50, 0.4, 1.2);
}

// Which indicator does the village care about most? (its weakest one)
function villagePriority(village) {
  return STAT_KEYS.reduce((worst, k) => (village.stats[k] < village.stats[worst] ? k : worst), STAT_KEYS[0]);
}

// Returns { deltas: { education: 6, ... }, notes: ["why it changed"] }.
// Used both for the PREVIEW in the project picker and for the real result.
function calculateImpact(state, villageId, interventionId, quality) {
  const village = getVillage(state, villageId);
  const item = getIntervention(interventionId);
  const q = quality === undefined ? 1 : quality;
  const notes = [];

  // One multiplier for the whole project, built from the special rules.
  let multiplier = q;
  if (item.needsInfrastructure && village.stats.infrastructure < item.needsInfrastructure) {
    multiplier *= 0.6;
    notes.push(`Weak infrastructure (${village.stats.infrastructure}): only 60% effective`);
  }
  if (item.waterSensitive && village.stats.water < 45) {
    multiplier *= 0.7;
    notes.push(`Water shortage (${village.stats.water}): only 70% effective`);
  }
  if (item.boostedBy && hasCompleted(state, villageId, item.boostedBy.id)) {
    multiplier *= item.boostedBy.multiplier;
    notes.push(`Boosted by completed ${getIntervention(item.boostedBy.id).name} (+30%)`);
  }

  // Does this project address what the village needs most?
  const priority = villagePriority(village);
  const addressesPriority = (item.impact[priority] || 0) > 0;
  const urgent = village.stats[priority] < 45;

  const deltas = {};
  Object.keys(item.impact).forEach((key) => {
    const base = item.impact[key];
    let value;
    if (key === "satisfaction") {
      value = base * Math.min(q, 1.1);
      if (urgent && !addressesPriority && base > 0) {
        value *= 0.5;
        notes.push(`Residents wanted ${STAT_LABELS[priority]} fixed first: satisfaction gain halved`);
      }
    } else {
      const factor = base > 0 ? needFactor(village.stats[key]) : 1;
      if (base > 0 && factor < 0.7) notes.push(`${STAT_LABELS[key]} is already high: smaller gain`);
      value = base * factor * multiplier;
    }
    deltas[key] = Math.round(value);
  });

  return { deltas, notes };
}

// How good a deal is this project for this village? Used by the picker to
// sort and recommend. Counts expected gains per ₹1 lakh, with a bonus for
// tackling the village's weakest indicator and for sustainability.
function projectValue(state, villageId, interventionId) {
  const item = getIntervention(interventionId);
  const { deltas } = calculateImpact(state, villageId, interventionId, 1);
  const gain = Object.values(deltas).reduce((sum, d) => sum + Math.max(0, d), 0);
  const priority = villagePriority(getVillage(state, villageId));
  const addressesPriority = (item.impact[priority] || 0) >= 5; // a token +2 doesn't count
  const lakhs = item.cost / 100000;
  return {
    gainPerLakh: gain / lakhs,
    score: (gain * (addressesPriority ? 1.4 : 1) * (0.6 + item.sustainability / 25)) / lakhs,
    addressesPriority,
    priority,
  };
}

// ---------------------------------------------------------------------
// STARTING PROJECTS
// ---------------------------------------------------------------------

// Checks every rule BEFORE a project starts. The UI uses the result to
// disable the button and explain why.
function checkCanStart(state, villageId, interventionId) {
  const item = getIntervention(interventionId);
  const warnings = [];
  const finishMonth = state.month + item.duration - 1;

  if (state.phase !== "playing") return { ok: false, reason: "The game is over.", warnings };
  if (state.pendingEvent) return { ok: false, reason: "Deal with the current event first.", warnings };

  const already = state.projects.find(
    (p) => p.villageId === villageId && p.interventionId === interventionId && (p.status === "active" || p.status === "completed")
  );
  if (already) {
    return { ok: false, reason: already.status === "active" ? "Already running here." : "Already completed here.", warnings };
  }
  if (item.cost > budgetAvailable(state)) return { ok: false, reason: "Not enough available budget.", warnings };
  if (staffInUse(state) + item.staff > staffCapacity(state)) {
    return { ok: false, reason: "Not enough staff capacity this month.", warnings };
  }

  if (finishMonth > state.maxMonths) {
    warnings.push(`Won't finish before the end of ${monthName(state.maxMonths)}: money spent will be wasted.`);
  } else if (finishMonth === state.maxMonths && item.duration > 1) {
    warnings.push("Finishes in the final month: any delay means it won't complete.");
  }
  return { ok: true, reason: "", warnings };
}

function startProject(state, villageId, interventionId) {
  const check = checkCanStart(state, villageId, interventionId);
  if (!check.ok) return { ok: false, message: check.reason };

  const item = getIntervention(interventionId);
  const village = getVillage(state, villageId);
  const project = {
    id: state.nextProjectId++,
    interventionId,
    villageId,
    startMonth: state.month,
    duration: item.duration,
    monthsLeft: item.duration,
    cost: item.cost,
    paid: 0,
    status: "active", // active → completed | cancelled | unfinished
    delays: 0,
    qualityPenalty: 0,
    completedMonth: null,
    result: null,
  };
  state.projects.push(project);
  state.budget.committed += item.cost; // promised now, paid month by month

  if (item.startEffects) {
    Object.keys(item.startEffects).forEach((k) => changeStat(village, k, item.startEffects[k]));
  }
  addHistory(village, state.month, `Started ${item.name} (₹${formatNumber(item.cost)})`, "info");
  return { ok: true, message: `${item.name} started in ${village.name}.`, project };
}

// A delay adds a month to a project (used by events).
function delayProject(state, project) {
  project.monthsLeft += 1;
  project.delays += 1;
  state.counters.delays += 1;
}

function cancelProject(state, project) {
  const unpaid = project.cost - project.paid;
  state.budget.committed -= unpaid; // unpaid money becomes available again
  project.status = "cancelled";
  state.counters.projectsCancelled += 1;
  addHistory(getVillage(state, project.villageId), state.month, `${getIntervention(project.interventionId).name} cancelled`, "bad");
}

function releaseReserve(state) {
  if (state.budget.reserveReleased) return 0;
  const amount = reserveRemaining(state);
  state.budget.reserveReleased = true;
  return amount;
}

// ---------------------------------------------------------------------
// ADVANCE MONTH: the heart of the simulation
// ---------------------------------------------------------------------

function advanceMonth(state) {
  if (state.phase !== "playing" || state.pendingEvent) return null;

  const report = { month: state.month, lines: [] };

  processProjects(state, report); // 1. progress, payments, completions
  payMaintenance(state, report); // 2. running costs of finished projects
  applyFading(state, report); // 3. temporary gains wear off
  applyMonthlyDrift(state, report); // 4. neglect, water-borne illness, unrest
  if (state.staff.shortageMonths > 0) state.staff.shortageMonths -= 1; // 5. staff recover

  state.reports.unshift(report);

  if (state.month >= state.maxMonths) {
    endGame(state, report); // 6a. last month done → final score
    return report;
  }

  state.month += 1; // 6b. move to next month
  recordHistory(state);
  rollRandomEvent(state); // 7. maybe something happens
  return report;
}

const DELAY_REASONS = [
  "materials arrived late",
  "the contractor missed deadlines",
  "approval is stuck at the mandal office",
  "the trainer was unavailable",
  "local elections paused work",
];

function processProjects(state, report) {
  const active = activeProjects(state);

  // Too few staff? The most recently started projects stall this month.
  let overload = staffInUse(state) - staffCapacity(state);
  const stalled = new Set();
  [...active].reverse().forEach((p) => {
    if (overload > 0) {
      stalled.add(p.id);
      overload -= getIntervention(p.interventionId).staff;
    }
  });

  active.forEach((project) => {
    const item = getIntervention(project.interventionId);
    const village = getVillage(state, project.villageId);

    if (stalled.has(project.id)) {
      project.delays += 1;
      state.counters.delays += 1;
      report.lines.push({ text: `${item.name} in ${village.name} stalled: not enough staff.`, tone: "warn" });
      return;
    }

    // Risk check: a VDC in the village halves the chance of problems.
    const risk = item.risk * (hasCompleted(state, village.id, "vdc") ? 0.5 : 1);
    if (chance(risk)) {
      project.delays += 1;
      state.counters.delays += 1;
      report.lines.push({ text: `${item.name} in ${village.name} delayed: ${pickRandom(DELAY_REASONS)}.`, tone: "warn" });
      return;
    }

    // Normal progress: pay this month's share and count down.
    project.monthsLeft -= 1;
    // Never pay more than what is still owed (delays can stretch a project).
    const owed = project.cost - project.paid;
    const payment = project.monthsLeft === 0 ? owed : Math.min(owed, Math.round(project.cost / project.duration));
    project.paid += payment;
    state.budget.committed -= payment;
    spend(state, payment, "main");

    if (project.monthsLeft === 0) completeProject(state, project, report);
  });
}

function completeProject(state, project, report) {
  const item = getIntervention(project.interventionId);
  const village = getVillage(state, project.villageId);

  // Quality varies: luck, delays and local resistance all matter.
  let quality = clamp(0.85 + random() * 0.3 - project.qualityPenalty - project.delays * 0.05, 0.4, 1.2);
  let migrated = false;
  if (item.migrationRisk && chance(item.migrationRisk)) {
    quality *= 0.6;
    migrated = true;
  }

  const { deltas } = calculateImpact(state, village.id, item.id, quality);
  Object.keys(deltas).forEach((k) => changeStat(village, k, deltas[k]));

  // Beneficiaries reached (fictional aggregate numbers).
  Object.keys(item.beneficiaries).forEach((k) => (village.beneficiaries[k] += item.beneficiaries[k]));

  // Short-lived gains (e.g. Health Camp) fade over the next 2 months.
  if (item.fades && deltas.health > 0) {
    const total = Math.round(deltas.health * item.fades);
    state.fading.push({ villageId: village.id, key: "health", perMonth: total / 2, monthsLeft: 2, source: item.name });
  }

  project.status = "completed";
  project.completedMonth = state.month;
  project.quality = Math.round(quality * 100) / 100;
  project.result = deltas;

  const summary = Object.keys(deltas)
    .filter((k) => deltas[k] !== 0)
    .map((k) => `${STAT_LABELS[k]} ${deltas[k] > 0 ? "+" : ""}${deltas[k]}`)
    .join(", ");
  const extra = migrated ? " Several trained youth left for city jobs, weakening the result." : "";
  report.lines.push({ text: `✔ ${item.name} completed in ${village.name}: ${summary}.${extra}`, tone: "good" });
  addHistory(village, state.month, `Completed ${item.name}: ${summary}`, "good");
}

function payMaintenance(state, report) {
  completedProjects(state).forEach((project) => {
    const item = getIntervention(project.interventionId);
    if (!item.maintenance || project.completedMonth >= state.month) return; // starts the month after completion

    const village = getVillage(state, project.villageId);
    if (canAfford(state, item.maintenance, "main")) {
      spend(state, item.maintenance, "main");
    } else if (canAfford(state, item.maintenance, "reserve")) {
      spend(state, item.maintenance, "reserve");
      report.lines.push({ text: `${item.name} upkeep in ${village.name} was paid from the reserve.`, tone: "warn" });
    } else {
      // Nobody pays for upkeep → the asset starts to break down.
      const key = item.category === "water" ? "water" : "education";
      changeStat(village, key, -3);
      changeStat(village, "satisfaction", -2);
      state.counters.maintenanceMissed += 1;
      report.lines.push({ text: `No money for ${item.name} upkeep in ${village.name}: it is breaking down.`, tone: "bad" });
    }
  });
}

function applyFading(state, report) {
  state.fading.forEach((f) => {
    const village = getVillage(state, f.villageId);
    changeStat(village, f.key, -f.perMonth);
    f.monthsLeft -= 1;
    report.lines.push({ text: `${f.source} effect wearing off in ${village.name} (${STAT_LABELS[f.key]} −${Math.round(f.perMonth)}).`, tone: "warn" });
  });
  state.fading = state.fading.filter((f) => f.monthsLeft > 0);
}

// Villages change even if you do nothing. This is what makes ignoring
// a village (or a critical problem) costly.
function applyMonthlyDrift(state, report) {
  state.villages.forEach((village) => {
    const busy = state.projects.some(
      (p) => p.villageId === village.id && (p.status === "active" || (p.status === "completed" && p.completedMonth === state.month))
    );
    if (!busy) {
      changeStat(village, "satisfaction", -2);
      report.lines.push({ text: `${village.name} feels neglected: no active projects (satisfaction −2).`, tone: "warn" });
    }
    if (village.stats.water < 40) {
      changeStat(village, "health", -1);
      report.lines.push({ text: `Unsafe water in ${village.name} is causing illness (health −1).`, tone: "bad" });
    }
    const critical = STAT_KEYS.filter((k) => village.stats[k] < 35).length;
    if (critical > 0) changeStat(village, "satisfaction", -Math.min(2, critical));
  });
}

// ---------------------------------------------------------------------
// RANDOM EVENTS
// ---------------------------------------------------------------------

function rollRandomEvent(state) {
  const seen = state.eventsSeen.length;
  if (seen >= EVENTS.length) return;

  // Guarantee at least 3 events per game, otherwise 60% chance each month.
  const chancesLeft = state.maxMonths - state.month + 1;
  const mustFire = seen + chancesLeft <= 3;
  if (!mustFire && !chance(0.6)) return;

  const eligible = EVENTS.filter((e) => !state.eventsSeen.includes(e.id) && e.condition(state));
  if (!eligible.length) return;

  const weights = eligible.map((e) => e.weight(state));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = random() * total;
  let event = eligible[eligible.length - 1];
  for (let i = 0; i < eligible.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      event = eligible[i];
      break;
    }
  }

  state.pendingEvent = { id: event.id, month: state.month, ctx: event.setup(state) };
  state.eventsSeen.push(event.id);
}

function resolveEvent(state, choiceIndex) {
  const pending = state.pendingEvent;
  if (!pending) return { ok: false, message: "No event to resolve." };

  const event = getEvent(pending.id);
  const choice = event.choices[choiceIndex];
  const cost = choiceCost(state, choice, pending.ctx);
  const from = choice.from || "main";
  if (!canAfford(state, cost, from)) return { ok: false, message: "You can't afford that option." };

  spend(state, cost, from);
  const outcome = choice.apply(state, pending.ctx);
  if (choice.ignore) state.counters.eventsIgnored += 1;
  else state.counters.eventsHandled += 1;

  const village = pending.ctx.villageId ? getVillage(state, pending.ctx.villageId) : null;
  state.eventLog.unshift({
    month: pending.month,
    title: event.title,
    villageName: village ? village.name : "District-wide",
    choice: choice.label,
    cost,
    outcome,
  });
  if (village) addHistory(village, pending.month, `${event.title}: ${choice.label.toLowerCase()}`, choice.ignore ? "bad" : "warn");

  state.pendingEvent = null;
  return { ok: true, message: outcome };
}

// ---------------------------------------------------------------------
// END OF GAME
// ---------------------------------------------------------------------

function endGame(state, report) {
  activeProjects(state).forEach((project) => {
    state.budget.committed -= project.cost - project.paid; // never paid
    project.status = "unfinished";
    report.lines.push({
      text: `${getIntervention(project.interventionId).name} in ${getVillage(state, project.villageId).name} did not finish in time.`,
      tone: "bad",
    });
  });
  state.phase = "ended";
  recordHistory(state); // the "End" point on the trend charts
  state.finalScore = calculateFinalScore(state);
}

// ---------------------------------------------------------------------
// PLANNING WARNINGS — checked before the player advances a month.
// Nothing here changes the state; it only looks for likely mistakes so
// the UI can say "are you sure?" with concrete reasons.
// ---------------------------------------------------------------------
function planningWarnings(state) {
  const warnings = [];
  const monthsLeft = state.maxMonths - state.month + 1;

  state.villages.forEach((v) => {
    if (activeProjects(state, v.id).length === 0) {
      warnings.push({ tone: "warn", text: `${v.name} has no active projects: its satisfaction will drop by 2.` });
    }
    // Skip the water warning if a water project finishes this month (completions happen before illness).
    const waterFixDue = activeProjects(state, v.id).some((p) => p.monthsLeft === 1 && (getIntervention(p.interventionId).impact.water || 0) > 0);
    if (v.stats.water < 40 && !waterFixDue) {
      warnings.push({ tone: "bad", text: `Unsafe water in ${v.name} will lower its health by 1 this month.` });
    }
  });

  activeProjects(state).forEach((p) => {
    if (state.month + p.monthsLeft - 1 > state.maxMonths) {
      warnings.push({
        tone: "bad",
        text: `${getIntervention(p.interventionId).name} in ${getVillage(state, p.villageId).name} can't finish before ${monthName(state.maxMonths)}.`,
      });
    }
  });

  // Could anything still be started this month?
  const startable = state.villages.some((v) => INTERVENTIONS.some((i) => checkCanStart(state, v.id, i.id).ok));
  const available = budgetAvailable(state);
  if (startable && state.month >= 4) {
    const when = monthsLeft === 1 ? "and this is the final month" : `with ${monthsLeft} months left`;
    warnings.push({ tone: "warn", text: `₹${formatNumber(available)} is still unallocated ${when}. Unspent money lowers your efficiency score.` });
  }
  const idleStaff = staffCapacity(state) - staffInUse(state);
  if (startable && idleStaff >= 2) {
    warnings.push({ tone: "info", text: `${idleStaff} staff points are idle this month.` });
  }
  return warnings;
}

// ₹ formatting in the Indian system: 1000000 → "10,00,000"
function formatNumber(n) {
  return Math.round(n).toLocaleString("en-IN");
}
