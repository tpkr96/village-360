// =====================================================================
// scoring.js — the END-OF-GAME performance report
// ---------------------------------------------------------------------
// Six sub-scores (each 0–100) are combined with fixed weights:
//   40% Impact · 20% Budget Efficiency · 15% Community Satisfaction
//   10% Sustainability · 10% Risk Management · 5% Timeliness
// Then we explain WHY, using facts pulled from the state.
// =====================================================================

const SCORE_WEIGHTS = {
  impact: { weight: 0.4, label: "Impact" },
  efficiency: { weight: 0.2, label: "Budget Efficiency" },
  satisfaction: { weight: 0.15, label: "Community Satisfaction" },
  sustainability: { weight: 0.1, label: "Sustainability" },
  risk: { weight: 0.1, label: "Risk Management" },
  timeliness: { weight: 0.05, label: "Timeliness" },
};

const RATINGS = [
  { min: 90, title: "Exceptional Development Officer" },
  { min: 80, title: "Strong Performance" },
  { min: 70, title: "Effective but Needs Improvement" },
  { min: 60, title: "Mixed Performance" },
  { min: 0, title: "Major Improvement Required" },
];

// Average change of the five indicators since the start, for one village.
function villageGain(village) {
  const total = STAT_KEYS.reduce((sum, k) => sum + (village.stats[k] - village.baseline[k]), 0);
  return total / STAT_KEYS.length;
}

function calculateFinalScore(state) {
  const b = state.budget;
  const reasons = [];

  // ---- 1. IMPACT: average gain, with extra weight on the weakest village (equity)
  const gains = state.villages.map((v) => ({ name: v.name, gain: villageGain(v) }));
  const avgGain = gains.reduce((s, g) => s + g.gain, 0) / gains.length;
  const sorted = [...gains].sort((a, b) => b.gain - a.gain);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const impact = clamp(Math.round(((0.7 * avgGain + 0.3 * worst.gain) / 9) * 100), 0, 100);
  reasons.push({
    key: "impact",
    text: `Indicators rose by an average of ${signed(avgGain)} points per village. ${best.name} gained most (${signed(best.gain)}), ${worst.name} least (${signed(worst.gain)}).`,
  });
  if (worst.gain < 2) reasons.push({ key: "impact", text: `${worst.name} was left behind: an unequal district drags the impact score down.` });

  // ---- 2. BUDGET EFFICIENCY: did you use the money, and was any wasted?
  const unusedReserve = b.reserveReleased ? 0 : b.reserve - b.reserveUsed; // an untouched reserve is fine
  const usable = b.total - unusedReserve;
  const utilization = b.spent / usable;
  const wasted = state.projects
    .filter((p) => p.status === "unfinished" || p.status === "cancelled")
    .reduce((s, p) => s + p.paid, 0);
  const efficiency = clamp(Math.round((utilization / 0.9) * 100 - (wasted / Math.max(b.spent, 1)) * 150), 0, 100);
  reasons.push({ key: "efficiency", text: `You used ${Math.round(utilization * 100)}% of the usable budget (₹${formatNumber(b.spent)} spent).` });
  if (wasted > 0) reasons.push({ key: "efficiency", text: `₹${formatNumber(wasted)} went into projects that were cancelled or never finished.` });

  // ---- 3. COMMUNITY SATISFACTION
  const avgSat = averageSatisfaction(state);
  const satisfaction = clamp(Math.round((avgSat - 30) * 2.5), 0, 100);
  const unhappiest = [...state.villages].sort((a, b) => a.stats.satisfaction - b.stats.satisfaction)[0];
  reasons.push({ key: "satisfaction", text: `Average community satisfaction ended at ${avgSat}/100. Lowest: ${unhappiest.name} (${unhappiest.stats.satisfaction}).` });

  // ---- 4. SUSTAINABILITY: cost-weighted durability of completed projects
  const done = completedProjects(state);
  const doneCost = done.reduce((s, p) => s + p.cost, 0);
  const avgSust = doneCost ? done.reduce((s, p) => s + getIntervention(p.interventionId).sustainability * p.cost, 0) / doneCost : 0;
  const sustainability = clamp(Math.round(avgSust * 10 - state.counters.maintenanceMissed * 10), 0, 100);
  reasons.push({
    key: "sustainability",
    text: done.length
      ? `Your completed projects have an average sustainability of ${avgSust.toFixed(1)}/10${state.counters.maintenanceMissed ? `, but upkeep was missed ${state.counters.maintenanceMissed} time(s)` : ""}.`
      : "No projects were completed, so nothing lasting was built.",
  });

  // ---- 5. RISK MANAGEMENT: how you handled shocks and critical problems
  const criticalLeft = state.villages.reduce((s, v) => s + STAT_KEYS.filter((k) => v.stats[k] < 35).length, 0);
  const c = state.counters;
  const risk = clamp(100 - c.eventsIgnored * 15 - c.projectsCancelled * 10 - criticalLeft * 5 - c.maintenanceMissed * 5, 0, 100);
  reasons.push({
    key: "risk",
    text: `You responded to ${c.eventsHandled} event(s) and ignored or mishandled ${c.eventsIgnored}. ${criticalLeft} indicator(s) are still in the critical zone (below 35).`,
  });

  // ---- 6. TIMELINESS: share of started projects that finished
  const unfinished = state.projects.filter((p) => p.status === "unfinished");
  const started = done.length + unfinished.length;
  const timeliness = started ? clamp(Math.round((done.length / started) * 100 - c.delays * 4), 0, 100) : 0;
  reasons.push({
    key: "timeliness",
    text: started
      ? `${done.length} of ${started} projects finished on time, with ${c.delays} month(s) of delays in total.`
      : "No projects were started.",
  });
  if (unfinished.length) {
    const names = unfinished.map((p) => `${getIntervention(p.interventionId).name} (${getVillage(state, p.villageId).name})`).join(", ");
    reasons.push({ key: "timeliness", text: `Unfinished: ${names}. Long projects need to start early.` });
  }

  // ---- Combine
  const parts = { impact, efficiency, satisfaction, sustainability, risk, timeliness };
  const overall = Math.round(Object.keys(parts).reduce((s, k) => s + parts[k] * SCORE_WEIGHTS[k].weight, 0));
  const rating = RATINGS.find((r) => overall >= r.min).title;

  // Strongest and weakest areas, for the headline explanation.
  const ranked = Object.keys(parts).sort((a, b) => parts[b] - parts[a]);
  const summary = `Your strongest area was ${SCORE_WEIGHTS[ranked[0]].label.toLowerCase()} (${parts[ranked[0]]}); your weakest was ${SCORE_WEIGHTS[ranked[ranked.length - 1]].label.toLowerCase()} (${parts[ranked[ranked.length - 1]]}).`;

  return { overall, parts, rating, summary, reasons, avgGain: Math.round(avgGain * 10) / 10 };
}

function signed(n) {
  const r = Math.round(n * 10) / 10;
  return (r > 0 ? "+" : "") + r;
}
