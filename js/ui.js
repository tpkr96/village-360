// =====================================================================
// ui.js — DRAWING the game from the state
// ---------------------------------------------------------------------
// Every function here READS `state` (and the small `ui` object that
// remembers screen-only things like which tab is open) and writes HTML.
// None of them change the game state. After any action, app.js simply
// calls render() and the whole screen is redrawn from the state.
//
// This "state → render" loop is the same idea React uses, just done by
// hand with template strings so you can see exactly what happens.
//
// Buttons don't get individual click handlers. Instead each one has a
// data-action="..." attribute, and app.js listens for clicks on the
// whole page and looks at that attribute ("event delegation").
// =====================================================================

const VILLAGE_COLORS = { rampur: "#f5b942", chintalapally: "#60a5fa", mallapur: "#c084fc" };
const TONE_COLORS = { good: "#34d399", ok: "#60a5fa", warn: "#f59e0b", bad: "#f43f5e" };

// ---------- small helpers ----------
const $ = (id) => document.getElementById(id);
const rupees = (n) => "₹" + formatNumber(n);

// Escape text before putting it into HTML (good habit, prevents broken markup).
function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function statTone(value) {
  if (value >= 65) return "good";
  if (value >= 50) return "ok";
  if (value >= 40) return "warn";
  return "bad";
}

function deltaChip(delta) {
  if (!delta) return `<span class="delta zero">±0</span>`;
  return `<span class="delta ${delta > 0 ? "up" : "down"}">${delta > 0 ? "+" : ""}${delta}</span>`;
}

function categoryChip(categoryId) {
  const c = CATEGORIES[categoryId];
  return `<span class="chip" style="--c:${c.color}">${c.label}</span>`;
}

function riskBadge(risk) {
  if (risk <= 0.08) return `<span class="badge good">Low risk</span>`;
  if (risk <= 0.15) return `<span class="badge warn">Medium risk</span>`;
  return `<span class="badge bad">High risk</span>`;
}

function beneficiaryText(beneficiaries) {
  return Object.keys(beneficiaries)
    .map((k) => `${formatNumber(beneficiaries[k])} ${BENEFICIARY_LABELS[k].toLowerCase()}`)
    .join(" · ");
}

// ---------------------------------------------------------------------
// ANIMATION HELPERS
// Because the screen is rebuilt from scratch on every render, the
// browser can't animate "from the old value to the new one" on its own.
// So we remember what we showed last time in `previousValues`, and:
//   - bars:    draw them at the OLD width, then switch to the NEW width
//              a moment later; the CSS `transition` animates the change.
//   - numbers: add a "flash" class when the value went up or down.
// ---------------------------------------------------------------------
const previousValues = {};

function animatedFill(key, value, color) {
  const from = key in previousValues ? previousValues[key] : 0; // first time: grow from 0
  previousValues[key] = value;
  return `<div class="fill" style="width:${from}%;${color ? `background:${color};` : ""}" data-to="${value}"></div>`;
}

function flash(key, value) {
  const before = previousValues[key];
  previousValues[key] = value;
  if (before === undefined || before === value) return "";
  return value > before ? "flash-up" : "flash-down";
}

// Forget remembered values (used when a new game starts, so nothing "flashes").
function resetAnimations() {
  Object.keys(previousValues).forEach((k) => delete previousValues[k]);
}

function runAnimations() {
  const fills = document.querySelectorAll(".fill[data-to]");
  // Wait two animation frames so the browser has painted the OLD width first.
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      fills.forEach((el) => {
        el.style.width = el.dataset.to + "%";
        el.removeAttribute("data-to");
      })
    )
  );
}

// =====================================================================
// MAIN RENDER
// =====================================================================

function render(state, ui) {
  renderTopbar(state);
  renderMap(state, ui);
  renderVillagePanel(state, ui);
  renderTabs(state, ui);
  renderFeed(state);
  renderModal(state, ui);
  runAnimations();
  renderTutorial(state, ui);
}

// ---------------------------------------------------------------------
// TOP BAR
// ---------------------------------------------------------------------
function renderTopbar(state) {
  const pips = MONTH_NAMES.map((name, i) => {
    const m = i + 1;
    let cls = "future";
    if (state.phase === "ended" || m < state.month) cls = "done";
    else if (m === state.month) cls = "current";
    return `<div class="pip ${cls}"><span>${name.slice(0, 3)}</span></div>`;
  }).join("");
  const label = state.phase === "ended" ? "Programme complete" : `Month ${state.month} of ${state.maxMonths}`;
  $("timeline").innerHTML = `<div class="timeline-label">${label}</div><div class="pips">${pips}</div>`;

  const index = districtIndex(state);
  const stats = [
    { key: "left", label: "Budget left", raw: budgetRemaining(state), value: rupees(budgetRemaining(state)), hint: "Money not yet paid out" },
    { key: "avail", label: "Available", raw: budgetAvailable(state), value: rupees(budgetAvailable(state)), hint: "Free for new projects" },
    { key: "index", label: "District index", raw: index, value: `${index} ${deltaChip(index - state.indexHistory[0])}`, hint: "Average of all village indicators" },
    { key: "sat", label: "Satisfaction", raw: averageSatisfaction(state), value: averageSatisfaction(state), hint: "Average community satisfaction" },
    { key: "proj", label: "Projects", raw: activeProjects(state).length, value: activeProjects(state).length, hint: "Active projects" },
    { key: "staff", label: "Staff", raw: staffInUse(state), value: `${staffInUse(state)}/${staffCapacity(state)}`, hint: "Staff points in use / available", warn: state.staff.shortageMonths > 0 },
  ];
  $("topstats").innerHTML = stats
    .map(
      (s) => `<div class="stat ${s.warn ? "warn" : ""}" title="${s.hint}">
        <div class="stat-label">${s.label}</div><div class="stat-value ${flash("top." + s.key, s.raw)}">${s.value}</div></div>`
    )
    .join("");

  const btn = $("advance-btn");
  btn.disabled = state.phase !== "playing" || !!state.pendingEvent;
  btn.textContent = state.phase === "ended" ? "Programme complete" : state.month === state.maxMonths ? "Finish Programme →" : "Advance Month →";
}

// ---------------------------------------------------------------------
// DISTRICT MAP (SVG)
// The map is drawn in a 600 x 400 coordinate box and scales to fit.
// Later, this function is the only thing to replace for Leaflet/Mapbox.
// ---------------------------------------------------------------------
function renderMap(state, ui) {
  const hq = { x: 300, y: 195 };
  const roads = state.villages
    .map((v) => `<path class="road" d="M${hq.x},${hq.y} Q${(hq.x + v.position.x) / 2 + 30},${(hq.y + v.position.y) / 2 - 20} ${v.position.x},${v.position.y}" />`)
    .join("");

  const eventVillage = state.pendingEvent && state.pendingEvent.ctx.villageId;

  const nodes = state.villages
    .map((v) => {
      const index = villageIndex(v);
      const tone = healthLabel(index).tone;
      const color = TONE_COLORS[tone];
      const circumference = 2 * Math.PI * 34;
      const filled = (index / 100) * circumference;
      const active = activeProjects(state, v.id).length;
      const selected = ui.selectedVillageId === v.id;
      const dots = Array.from({ length: active }, (_, i) => `<circle cx="${-((active - 1) * 7) / 2 + i * 7}" cy="-48" r="3" class="proj-dot" />`).join("");
      // After a month ends, a "+3" / "−2" floats up from each village.
      const d = ui.mapDeltas ? ui.mapDeltas[v.id] : 0;
      const floatDelta = d ? `<text class="float-delta ${d > 0 ? "up" : "down"}" y="-36">${d > 0 ? "+" : "−"}${Math.abs(d)}</text>` : "";
      return `
      <g class="vnode ${selected ? "selected" : ""}" transform="translate(${v.position.x},${v.position.y})" data-action="select-village" data-id="${v.id}" tabindex="0" role="button" aria-label="${esc(v.name)}, index ${index}, ${healthLabel(index).label}">
        ${selected ? `<circle r="46" class="halo" />` : ""}
        <circle r="34" class="ring-bg" />
        <circle r="34" class="ring" stroke="${color}" stroke-dasharray="${filled} ${circumference}" transform="rotate(-90)" />
        <circle r="27" class="core" style="--vc:${VILLAGE_COLORS[v.id]}" />
        <text class="vindex" y="6">${index}</text>
        <text class="vname" y="56">${esc(v.name)}</text>
        <text class="vpop" y="71">${formatNumber(v.population)} people</text>
        ${dots}
        ${floatDelta}
        ${eventVillage === v.id ? `<g class="alert" transform="translate(26,-26)"><circle r="10"/><text y="4">!</text></g>` : ""}
      </g>`;
    })
    .join("");

  $("map").innerHTML = `
  <svg viewBox="0 0 600 400" class="map-svg" role="img" aria-label="District map">
    <defs>
      <radialGradient id="land" cx="50%" cy="45%" r="70%">
        <stop offset="0%" stop-color="#1b2c45" /><stop offset="100%" stop-color="#0e1829" />
      </radialGradient>
      <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
        <path d="M30 0H0V30" fill="none" stroke="#ffffff" stroke-opacity="0.035" />
      </pattern>
    </defs>
    <rect width="600" height="400" fill="url(#land)" />
    <rect width="600" height="400" fill="url(#grid)" />
    <path class="field" d="M40,250 L130,225 L170,290 L80,330 Z" />
    <path class="field" d="M470,230 L560,210 L575,300 L490,320 Z" />
    <path class="field" d="M200,40 L290,30 L300,80 L215,95 Z" />
    <path class="hill" d="M380,40 Q440,0 520,35 Q560,55 590,40 L590,0 L370,0 Z" />
    <path class="river" d="M-10,60 C90,90 120,180 210,210 S360,250 420,330 S520,390 610,380" />
    <text class="map-label" x="520" y="372">Musi tributary</text>
    ${roads}
    <g transform="translate(${hq.x},${hq.y})" class="hq">
      <rect x="-9" y="-9" width="18" height="18" rx="3" transform="rotate(45)" />
      <text y="28">District HQ</text>
    </g>
    ${nodes}
  </svg>`;

  $("map-legend").innerHTML = ["Thriving", "Stable", "Struggling", "Critical"]
    .map((l, i) => `<span><i style="background:${Object.values(TONE_COLORS)[i]}"></i>${l}</span>`)
    .join("") + `<span class="muted">Ring = village index · dots = active projects</span>`;
}

// ---------------------------------------------------------------------
// VILLAGE PROFILE
// ---------------------------------------------------------------------
function renderVillagePanel(state, ui) {
  const v = getVillage(state, ui.selectedVillageId);
  const index = villageIndex(v);
  const health = healthLabel(index);
  const active = activeProjects(state, v.id);
  const done = completedProjects(state, v.id);
  const problems = villageProblems(state, v);
  const reached = BENEFICIARY_KEYS.reduce((s, k) => s + v.beneficiaries[k], 0);

  const switcher = state.villages
    .map((x) => `<button class="vpill ${x.id === v.id ? "active" : ""}" style="--vc:${VILLAGE_COLORS[x.id]}" data-action="select-village" data-id="${x.id}">${esc(x.name)}<b>${villageIndex(x)}</b></button>`)
    .join("");

  const indicatorRows = [...STAT_KEYS, "satisfaction"]
    .map((k) => {
      const value = v.stats[k];
      const tone = statTone(value);
      return `<div class="indicator" title="${esc(STAT_HELP[k])}">
        <div class="ind-label">${STAT_LABELS[k]} <span class="info">i</span></div>
        <div class="bar">${animatedFill(`v.${v.id}.${k}`, value, TONE_COLORS[tone])}
          <div class="baseline" style="left:${v.baseline[k]}%" title="Starting value: ${v.baseline[k]}"></div></div>
        <div class="ind-value ${flash(`n.${v.id}.${k}`, value)}">${value}</div>${deltaChip(value - v.baseline[k])}
      </div>`;
    })
    .join("");

  const activeHtml = active.length
    ? active
        .map((p) => {
          const item = getIntervention(p.interventionId);
          const progress = Math.round(((p.duration - p.monthsLeft) / (p.duration + p.delays)) * 100);
          const finish = state.month + p.monthsLeft - 1;
          return `<div class="proj">
            <div class="proj-top"><strong>${item.name}</strong>${categoryChip(item.category)}</div>
            <div class="bar thin">${animatedFill(`p.${p.id}`, progress, CATEGORIES[item.category].color)}</div>
            <div class="muted small">${p.monthsLeft} month(s) left · due end of ${monthName(finish) || "after the programme"}${p.delays ? ` · <span class="warn-text">${p.delays} delay(s)</span>` : ""}${finish > state.maxMonths ? ` · <span class="bad-text">won't finish in time</span>` : ""}</div>
          </div>`;
        })
        .join("")
    : `<p class="muted small">No active projects. Villages without projects lose satisfaction each month.</p>`;

  const doneHtml = done.length
    ? done
        .map((p) => {
          const item = getIntervention(p.interventionId);
          const result = Object.keys(p.result)
            .filter((k) => p.result[k])
            .map((k) => `${STAT_SHORT[k]} ${p.result[k] > 0 ? "+" : ""}${p.result[k]}`)
            .join(", ");
          return `<div class="proj done"><div class="proj-top"><strong>✔ ${item.name}</strong><span class="muted small">${monthName(p.completedMonth)}</span></div><div class="muted small">${result}</div></div>`;
        })
        .join("")
    : `<p class="muted small">None yet.</p>`;

  const trend = state.villageIndexHistory[v.id] || [index];

  $("village-panel").innerHTML = `
    <div class="vswitch" role="tablist" aria-label="Choose village">${switcher}</div>
    <div class="vp-head">
      <div>
        <div class="eyebrow" style="color:${VILLAGE_COLORS[v.id]}">${esc(v.mandal)}</div>
        <h2 class="vp-title">${esc(v.name)}</h2>
        <p class="muted small vp-desc">${esc(v.description)}</p>
      </div>
      <button class="btn primary" data-action="open-picker" ${state.phase !== "playing" ? "disabled" : ""}>+ Plan intervention</button>
    </div>

    <div class="vp-summary">
      <div class="gauge">
        ${gaugeSvg(index, TONE_COLORS[health.tone])}
        <div><div class="gauge-label" style="color:${TONE_COLORS[health.tone]}">${health.label}</div><div class="muted small">Village health</div>
        ${trend.length > 1 ? `<div class="spark-wrap" title="Village index each month">${sparkline(trend, VILLAGE_COLORS[v.id])}</div>` : ""}</div>
      </div>
      <div class="facts">
        <div><span>${formatNumber(v.population)}</span>Population</div>
        <div><span>${formatNumber(v.households)}</span>Households</div>
        <div><span class="${flash(`r.${v.id}`, reached)}">${formatNumber(reached)}</span>Beneficiaries reached</div>
        <div><span>${active.length} / ${done.length}</span>Active / done</div>
      </div>
    </div>

    <div class="vp-grid">
      <div>
        <h3>Indicators <span class="muted small">(white line = starting value)</span></h3>
        ${indicatorRows}
        <h3>Problems</h3>
        ${problems.length ? `<ul class="problems">${problems.map((p) => `<li class="${p.tone}">${esc(p.text)}</li>`).join("")}</ul>` : `<p class="muted small">No major problems right now.</p>`}
      </div>
      <div>
        <h3>Active projects</h3>${activeHtml}
        <h3>Completed</h3>${doneHtml}
        <h3>Beneficiaries</h3>
        <div class="benef">${BENEFICIARY_KEYS.map((k) => `<div><span>${formatNumber(v.beneficiaries[k])}</span>${BENEFICIARY_LABELS[k]}</div>`).join("")}</div>
        <h3>Recent history</h3>
        ${v.history.length ? `<ul class="history">${v.history.slice(0, 5).map((h) => `<li class="${h.tone}"><b>${monthName(h.month).slice(0, 3)}</b> ${esc(h.text)}</li>`).join("")}</ul>` : `<p class="muted small">Nothing yet.</p>`}
      </div>
    </div>`;
}

function gaugeSvg(value, color) {
  const c = 2 * Math.PI * 30;
  return `<svg viewBox="0 0 76 76" class="gauge-svg">
    <circle cx="38" cy="38" r="30" class="ring-bg" />
    <circle cx="38" cy="38" r="30" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"
      stroke-dasharray="${(value / 100) * c} ${c}" transform="rotate(-90 38 38)" class="gauge-arc" />
    <text x="38" y="44" text-anchor="middle" class="gauge-num">${value}</text>
  </svg>`;
}

function sparkline(values, color) {
  const w = 96, h = 26;
  const min = Math.min(...values) - 2, max = Math.max(...values) + 2;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 4) + 2},${h - 2 - ((v - min) / (max - min)) * (h - 4)}`).join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" class="spark"><polyline points="${pts}" stroke="${color}" /></svg>`;
}

// ---------------------------------------------------------------------
// DASHBOARD TABS
// ---------------------------------------------------------------------
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "villages", label: "Compare villages" },
  { id: "budget", label: "Budget" },
  { id: "impact", label: "Impact" },
  { id: "projects", label: "All projects" },
];

function renderTabs(state, ui) {
  $("tabs").innerHTML = TABS.map(
    (t) => `<button class="tab ${ui.tab === t.id ? "active" : ""}" data-action="tab" data-id="${t.id}">${t.label}</button>`
  ).join("");

  const renderers = { overview: tabOverview, villages: tabVillages, budget: tabBudget, impact: tabImpact, projects: tabProjects };
  $("tab-content").innerHTML = renderers[ui.tab](state);
}

function tabOverview(state) {
  const totals = totalBeneficiaries(state);
  const reach = BENEFICIARY_KEYS.reduce((s, k) => s + totals[k], 0);
  const utilization = Math.round((state.budget.spent / state.budget.total) * 100);
  const gain = state.villages.reduce((s, v) => s + villageGain(v), 0) / state.villages.length;
  const maxBenef = Math.max(1, ...BENEFICIARY_KEYS.map((k) => totals[k]));

  return `
  <div class="cards4">
    <div class="card"><div class="card-label">Total population</div><div class="card-value">${formatNumber(totalPopulation(state))}</div></div>
    <div class="card"><div class="card-label">Beneficiary reach</div><div class="card-value">${formatNumber(reach)}</div><div class="muted small">sum across categories</div></div>
    <div class="card"><div class="card-label">Budget utilised</div><div class="card-value">${utilization}%</div><div class="bar thin">${animatedFill("o.util", utilization)}</div></div>
    <div class="card"><div class="card-label">Avg indicator change</div><div class="card-value">${signed(gain)}</div><div class="muted small">per village, since April</div></div>
  </div>
  <div class="two-col">
    <div><h3>Index trend</h3>${trendChart(state)}</div>
    <div><h3>Beneficiaries by category</h3>
      ${BENEFICIARY_KEYS.map((k) => `<div class="hbar"><span>${BENEFICIARY_LABELS[k]}</span><div class="bar">${animatedFill("b." + k, (totals[k] / maxBenef) * 100)}</div><b>${formatNumber(totals[k])}</b></div>`).join("")}
    </div>
  </div>`;
}

// Hand-made SVG line chart: one line per village plus the district.
function trendChart(state) {
  const w = 460, h = 180, padL = 26, padR = 34, padY = 22;
  const labels = [...MONTH_NAMES.map((m) => m.slice(0, 3)), "End"];
  const series = [
    ...state.villages.map((v) => ({ label: v.name, color: VILLAGE_COLORS[v.id], values: state.villageIndexHistory[v.id] || [] })),
    { label: "District", color: "#e6edf7", values: state.indexHistory, bold: true },
  ];
  const all = series.flatMap((s) => s.values);
  const min = Math.min(...all) - 4, max = Math.max(...all) + 4;
  const x = (i) => padL + (i * (w - padL - padR)) / (labels.length - 1);
  const y = (v) => h - padY - ((v - min) / (max - min || 1)) * (h - padY * 2);

  const grid = [min + 4, Math.round((min + max) / 2), max - 4]
    .map((g) => `<line x1="${padL}" x2="${w - padR}" y1="${y(g)}" y2="${y(g)}" class="grid" /><text x="${padL - 6}" y="${y(g) + 3}" text-anchor="end">${Math.round(g)}</text>`)
    .join("");
  const xLabels = labels.map((l, i) => `<text x="${x(i)}" y="${h - 4}" text-anchor="middle">${l}</text>`).join("");
  const drawn = series.filter((s) => s.values.length);
  const lines = drawn
    .map((s) => {
      const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
      const last = s.values.length - 1;
      return `<polyline points="${pts}" stroke="${s.color}" class="${s.bold ? "bold" : ""}" />
        <circle cx="${x(last)}" cy="${y(s.values[last])}" r="3.5" fill="${s.color}" />`;
    })
    .join("");

  // End-of-line value labels: sort top to bottom, then push apart so they don't overlap.
  const tags = drawn
    .map((s) => ({ s, last: s.values.length - 1, ty: y(s.values[s.values.length - 1]) + 4 }))
    .sort((a, b) => a.ty - b.ty);
  for (let i = 1; i < tags.length; i++) tags[i].ty = Math.max(tags[i].ty, tags[i - 1].ty + 11);
  const labelsSvg = tags
    .map((t) => `<text x="${x(t.last) + 7}" y="${t.ty}" class="val" fill="${t.s.color}">${t.s.values[t.last]}</text>`)
    .join("");
  const legend = series.map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join("");
  return `<svg viewBox="0 0 ${w} ${h}" class="chart">${grid}${xLabels}${lines}${labelsSvg}</svg><div class="legend inline">${legend}</div>`;
}

function tabVillages(state) {
  const keys = [...STAT_KEYS, "satisfaction"];
  const legend = state.villages.map((v) => `<span><i style="background:${VILLAGE_COLORS[v.id]}"></i>${v.name}</span>`).join("");
  const rows = keys
    .map(
      (k) => `<div class="cmp-row"><div class="cmp-label" title="${esc(STAT_HELP[k])}">${STAT_LABELS[k]}</div><div class="cmp-bars">
      ${state.villages.map((v) => `<div class="cmp-bar"><div class="cmp-track">${animatedFill(`c.${v.id}.${k}`, v.stats[k], VILLAGE_COLORS[v.id])}</div><b>${v.stats[k]}</b></div>`).join("")}
      </div></div>`
    )
    .join("");
  const table = state.villages
    .map((v) => {
      const idx = villageIndex(v);
      const h = healthLabel(idx);
      const reach = BENEFICIARY_KEYS.reduce((s, k) => s + v.beneficiaries[k], 0);
      return `<tr><td><i class="dot" style="background:${VILLAGE_COLORS[v.id]}"></i>${v.name}</td><td>${idx} ${deltaChip(idx - villageIndexFrom(v.baseline))}</td>
        <td><span class="badge ${h.tone}">${h.label}</span></td><td>${activeProjects(state, v.id).length}</td><td>${completedProjects(state, v.id).length}</td><td>${formatNumber(reach)}</td></tr>`;
    })
    .join("");
  return `<div class="legend inline">${legend}</div>${rows}
    <div class="table-wrap"><table class="table"><thead><tr><th>Village</th><th>Index</th><th>Status</th><th>Active</th><th>Done</th><th>Reach</th></tr></thead><tbody>${table}</tbody></table></div>`;
}

function villageIndexFrom(stats) {
  return villageIndex({ stats });
}

function tabBudget(state) {
  const b = state.budget;
  const reserveLeft = reserveRemaining(state);
  const available = budgetAvailable(state);
  const pct = (n) => (n / b.total) * 100;
  const upkeep = completedProjects(state).reduce((s, p) => s + (getIntervention(p.interventionId).maintenance || 0), 0);
  const maxSpend = Math.max(1, ...b.monthlySpend.map((n) => n || 0));

  const canRelease = state.phase === "playing" && !b.reserveReleased && reserveLeft > 0;
  return `
  <div class="stack">
    <div style="width:${pct(b.spent)}%;background:#2dd4bf" title="Spent"></div>
    <div style="width:${pct(b.committed)}%;background:#60a5fa" title="Committed"></div>
    <div style="width:${pct(Math.max(0, available))}%;background:#334866" title="Available"></div>
    <div style="width:${pct(reserveLeft)}%;background:#f5b942" title="Emergency reserve"></div>
  </div>
  <div class="cards5">
    <div class="card"><div class="card-label">Allocated</div><div class="card-value">${rupees(b.total)}</div></div>
    <div class="card"><div class="card-label"><i class="dot" style="background:#2dd4bf"></i>Spent</div><div class="card-value">${rupees(b.spent)}</div></div>
    <div class="card"><div class="card-label"><i class="dot" style="background:#60a5fa"></i>Committed</div><div class="card-value">${rupees(b.committed)}</div><div class="muted small">owed to active projects</div></div>
    <div class="card"><div class="card-label"><i class="dot" style="background:#334866"></i>Available</div><div class="card-value">${rupees(available)}</div><div class="muted small">for new projects</div></div>
    <div class="card"><div class="card-label"><i class="dot" style="background:#f5b942"></i>Emergency reserve</div><div class="card-value">${b.reserveReleased ? "Released" : rupees(reserveLeft)}</div><div class="muted small">used ${rupees(b.reserveUsed)}</div></div>
  </div>
  <div class="two-col">
    <div><h3>Spending by month</h3>
      <div class="vbars">${MONTH_NAMES.map((m, i) => `<div><div class="vbar-track"><div class="vbar" style="height:${((b.monthlySpend[i] || 0) / maxSpend) * 100}%"></div></div><b>${b.monthlySpend[i] ? (b.monthlySpend[i] / 100000).toFixed(1) + "L" : "–"}</b><span>${m.slice(0, 3)}</span></div>`).join("")}</div>
    </div>
    <div><h3>Notes</h3>
      <p class="small">Project costs are paid in equal parts each month while work progresses. Delayed projects keep their money committed.</p>
      <p class="small">Monthly upkeep of completed assets: <b>${rupees(upkeep)}</b>. If you can't pay it, assets break down.</p>
      <p class="small">The reserve can only be used for events, unless you release it into the main budget. Releasing it means you'll have no safety net.</p>
      ${canRelease ? `<button class="btn ghost" data-action="release-reserve-confirm">Release ${rupees(reserveLeft)} reserve</button>` : ""}
    </div>
  </div>`;
}

function tabImpact(state) {
  const keys = [...STAT_KEYS, "satisfaction"];
  const avg = (fn) => Math.round(state.villages.reduce((s, v) => s + fn(v), 0) / state.villages.length);
  return `<p class="muted small">District averages: starting value (faint) vs now (solid).</p>
  ${keys
    .map((k) => {
      const base = avg((v) => v.baseline[k]);
      const now = avg((v) => v.stats[k]);
      return `<div class="impact-row" title="${esc(STAT_HELP[k])}"><div class="cmp-label">${STAT_LABELS[k]}</div>
        <div class="bar double"><div class="fill ghost" style="width:${base}%"></div>${animatedFill("i." + k, now, TONE_COLORS[statTone(now)])}</div>
        <b>${now}</b>${deltaChip(now - base)}</div>`;
    })
    .join("")}
  <p class="small muted">Indicators are connected: unsafe water lowers health every month, water shortages weaken livelihood projects, and weak infrastructure undermines digital learning.</p>`;
}

function tabProjects(state) {
  if (!state.projects.length) return `<p class="muted">No projects yet. Select a village and choose “Plan intervention”.</p>`;
  const statusTone = { active: "ok", completed: "good", cancelled: "bad", unfinished: "bad" };
  const rows = state.projects
    .map((p) => {
      const item = getIntervention(p.interventionId);
      const v = getVillage(state, p.villageId);
      return `<tr><td>${item.name}</td><td>${v.name}</td><td><span class="badge ${statusTone[p.status]}">${p.status}</span></td>
        <td>${monthName(p.startMonth).slice(0, 3)}</td><td>${rupees(p.paid)} / ${rupees(p.cost)}</td><td>${p.delays || "–"}</td></tr>`;
    })
    .join("");
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Project</th><th>Village</th><th>Status</th><th>Start</th><th>Paid / cost</th><th>Delays</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ---------------------------------------------------------------------
// FIELD UPDATES FEED
// ---------------------------------------------------------------------
function renderFeed(state) {
  let html = "";
  if (state.pendingEvent) {
    html += `<div class="feed-alert"><b>Decision required:</b> ${getEvent(state.pendingEvent.id).title}<button class="btn small primary" data-action="show-event">Respond</button></div>`;
  }
  if (state.phase === "ended") {
    html += `<div class="feed-alert good"><b>Programme complete.</b> Final score ${state.finalScore.overall}/100<button class="btn small primary" data-action="view-final">View report</button></div>`;
  }
  if (!state.reports.length && !state.eventLog.length) {
    html += `<p class="muted small">Your first month is <b>April</b>. Inspect each village, start a few projects, then press <b>Advance Month</b>. Reports from the field will appear here.</p>`;
  }

  // Merge monthly reports and event outcomes into one timeline, newest first.
  const items = [];
  state.reports.forEach((r) =>
    items.push({ month: r.month, order: 0, html: `<div class="feed-month">End of ${monthName(r.month)}</div>${r.lines.length ? r.lines.map((l) => `<div class="feed-line ${l.tone}">${esc(l.text)}</div>`).join("") : `<div class="feed-line">A quiet month.</div>`}` })
  );
  state.eventLog.forEach((e) =>
    items.push({ month: e.month, order: 1, html: `<div class="feed-event"><div><b>${esc(e.title)}</b> · ${esc(e.villageName)} · ${monthName(e.month)}</div><div class="small">Decision: ${esc(e.choice)}${e.cost ? ` (${rupees(e.cost)})` : ""}</div><div class="small muted">${esc(e.outcome)}</div></div>` })
  );
  items.sort((a, b) => b.month - a.month || b.order - a.order);
  html += items.map((i) => i.html).join("");
  $("feed").innerHTML = html;
}

// =====================================================================
// MODALS (pop-up dialogs)
// =====================================================================
function renderModal(state, ui) {
  let content = "";
  let dismissable = true;
  let type = "";

  if (ui.modal) {
    const builders = {
      intro: modalIntro,
      help: modalHelp,
      picker: modalPicker,
      report: modalReport,
      outcome: modalOutcome,
      confirm: modalConfirm,
      "advance-check": modalAdvanceCheck,
    };
    content = builders[ui.modal.type](state, ui);
    dismissable = ui.modal.type !== "intro";
    type = ui.modal.type;
  } else if (state.pendingEvent) {
    content = modalEvent(state);
    dismissable = false; // you must make a decision
    type = "event";
  } else if (state.phase === "ended" && !ui.finalDismissed) {
    content = modalFinal(state);
    type = "final";
  }

  $("modal-root").innerHTML = content
    ? `<div class="overlay" ${dismissable ? 'data-action="close-modal"' : ""}><div class="modal ${type}" role="dialog" aria-modal="true" data-stop>${content}</div></div>`
    : "";
}

function closeButton() {
  return `<button class="icon-btn" data-action="close-modal" aria-label="Close">✕</button>`;
}

function modalIntro(state, ui) {
  return `
  <div class="intro">
    <div class="eyebrow">Kothapet District · Telangana · April</div>
    <h1>VILLAGE 360</h1>
    <p class="lead">You are the new <b>District Development Officer</b>. You have <b>6 months</b> and <b>₹10,00,000</b> to improve life in three villages: Rampur, Chintalapally and Mallapur.</p>
    <div class="intro-grid">
      <div><b>Inspect</b><span>Click a village on the map to see its problems.</span></div>
      <div><b>Invest</b><span>Choose from 12 interventions. Each has costs, risks and trade-offs.</span></div>
      <div><b>Advance</b><span>Each month, projects progress, money is spent and events strike.</span></div>
      <div><b>Deliver</b><span>After September you get a performance score out of 100.</span></div>
    </div>
    <p class="muted small">There is no perfect strategy. Balance impact, cost, risk, time and sustainability.</p>
    <div class="modal-actions">
      ${ui.modal.canContinue ? `<button class="btn ghost" data-action="continue-game">Continue saved game</button>` : ""}
      <button class="btn primary big" data-action="new-game">Start new game</button>
    </div>
  </div>`;
}

function modalHelp() {
  return `${closeButton()}<h2>How to play</h2>
  <ol class="help">
    <li><b>Pick a village</b> on the map. Weak indicators (red/orange) show where help is needed. Hover an indicator to see what affects it.</li>
    <li><b>Plan interventions.</b> The preview shows the expected effect <i>for that village</i>. The same project works differently in different places.</li>
    <li><b>Watch your limits:</b> available budget, and staff points (each active project uses some).</li>
    <li><b>Advance the month.</b> Projects progress, payments go out, temporary gains fade, and neglected villages lose satisfaction.</li>
    <li><b>Respond to events</b> using the emergency reserve, your main budget, or by ignoring them, each with consequences.</li>
    <li><b>Finish September.</b> Projects that aren't done by then deliver nothing.</li>
  </ol>
  <h3>Final score</h3>
  <p class="small">40% Impact (with extra weight on your weakest village) · 20% Budget efficiency · 15% Community satisfaction · 10% Sustainability · 10% Risk management · 5% Timeliness</p>
  <h3>Tips</h3>
  <ul class="help"><li>A VDC makes later projects in that village safer.</li><li>SHG Training before a Sewing Unit makes the unit 30% stronger.</li><li>Fix water before investing in livelihoods where water is scarce.</li><li>Long projects (3 months) must start by July.</li></ul>
  <p class="muted small">Your game saves automatically in this browser.</p>
  <div class="modal-actions"><button class="btn ghost" data-action="tutorial-start">Replay the tutorial</button><button class="btn primary" data-action="close-modal">Got it</button></div>`;
}

const SORTS = [
  { id: "recommended", label: "Recommended" },
  { id: "value", label: "Best value" },
  { id: "cost", label: "Cheapest" },
];

function modalPicker(state, ui) {
  const v = getVillage(state, ui.selectedVillageId);
  const cats = ["all", ...Object.keys(CATEGORIES)];
  const filters = cats
    .map((c) => `<button class="chip-btn ${ui.pickerCategory === c ? "active" : ""}" data-action="picker-category" data-id="${c}" ${c !== "all" ? `style="--c:${CATEGORIES[c].color}"` : ""}>${c === "all" ? "All" : CATEGORIES[c].label}</button>`)
    .join("");
  const sorts = SORTS.map((s) => `<button class="seg ${ui.pickerSort === s.id ? "active" : ""}" data-action="picker-sort" data-id="${s.id}">${s.label}</button>`).join("");

  // Work out every project's value once, then sort and pick the top 3 to recommend.
  const rows = INTERVENTIONS.map((item) => {
    const check = checkCanStart(state, v.id, item.id);
    const finishes = state.month + item.duration - 1 <= state.maxMonths;
    return { item, check, finishes, value: projectValue(state, v.id, item.id) };
  });
  const recommended = new Set(
    rows.filter((r) => r.check.ok && r.finishes).sort((a, b) => b.value.score - a.value.score).slice(0, 3).map((r) => r.item.id)
  );
  const sorters = {
    recommended: (a, b) => (b.check.ok && b.finishes) - (a.check.ok && a.finishes) || b.value.score - a.value.score,
    value: (a, b) => b.value.gainPerLakh - a.value.gainPerLakh,
    cost: (a, b) => a.item.cost - b.item.cost,
  };
  const list = rows
    .filter((r) => ui.pickerCategory === "all" || r.item.category === ui.pickerCategory)
    .sort(sorters[ui.pickerSort])
    .map((r) => interventionCard(state, v, r, recommended.has(r.item.id)))
    .join("");

  const priority = villagePriority(v);
  return `${closeButton()}
  <div class="picker-head">
    <div><div class="eyebrow" style="color:${VILLAGE_COLORS[v.id]}">Plan an intervention</div><h2>${esc(v.name)}</h2>
      <div class="small muted">Biggest need: <b class="warn-text">${STAT_LABELS[priority]} (${v.stats[priority]})</b></div></div>
    <div class="picker-res">
      <div><span>Available</span><b>${rupees(budgetAvailable(state))}</b></div>
      <div><span>Staff free</span><b>${staffCapacity(state) - staffInUse(state)} / ${staffCapacity(state)}</b></div>
      <div><span>Month</span><b>${monthName(state.month)}</b></div>
    </div>
  </div>
  <div class="picker-tools"><div class="filters">${filters}</div><div class="segs" aria-label="Sort">${sorts}</div></div>
  <div class="cards-grid">${list}</div>`;
}

function interventionCard(state, village, row, isRecommended) {
  const { item, check, value } = row;
  const preview = calculateImpact(state, village.id, item.id, 1);
  const finish = state.month + item.duration - 1;
  const impacts = Object.keys(preview.deltas)
    .map((k) => `<span class="impact ${preview.deltas[k] >= 0 ? "up" : "down"}">${preview.deltas[k] > 0 ? "+" : ""}${preview.deltas[k]} ${STAT_LABELS[k].replace("Community ", "")}</span>`)
    .join("");
  const notes = [...preview.notes, ...check.warnings];
  const sustDots = Array.from({ length: 10 }, (_, i) => `<i class="${i < item.sustainability ? "on" : ""}"></i>`).join("");

  return `<article class="icard ${check.ok ? "" : "disabled"} ${isRecommended ? "recommended" : ""}" style="--c:${CATEGORIES[item.category].color}">
    ${isRecommended ? `<div class="rec-flag">★ Recommended</div>` : ""}
    <div class="icard-top"><h4>${item.name}</h4>${categoryChip(item.category)}</div>
    <p class="small muted">${item.description}</p>
    <div class="meta">
      <span><b>${rupees(item.cost)}</b></span>
      <span>${item.duration} mo</span>
      <span>${item.staff} staff</span>
      ${riskBadge(item.risk)}
    </div>
    <div class="sust" title="Sustainability ${item.sustainability}/10"><span>Sustainability</span><div class="dots">${sustDots}</div></div>
    <div class="impacts">${impacts}</div>
    <div class="small muted">${value.addressesPriority ? `<span class="good-text">Tackles the biggest need</span> · ` : ""}${value.gainPerLakh.toFixed(0)} pts per ₹1 lakh</div>
    <div class="small muted">Reaches ${beneficiaryText(item.beneficiaries)}</div>
    ${notes.length ? `<ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    <details class="side"><summary>Trade-offs</summary><ul>${item.sideEffects.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></details>
    <div class="icard-foot">
      <span class="small muted">${finish <= state.maxMonths ? `Completes end of ${monthName(finish)}` : "Too late to finish"}</span>
      <button class="btn small ${check.ok ? "primary" : ""}" data-action="start-project" data-id="${item.id}" ${check.ok ? "" : "disabled"}>${check.ok ? "Start" : esc(check.reason)}</button>
    </div>
  </article>`;
}

function modalAdvanceCheck(state, ui) {
  const warnings = ui.modal.warnings;
  return `${closeButton()}<div class="eyebrow">Before you advance</div><h2>End ${monthName(state.month)}?</h2>
  <p class="muted small">A few things to consider. You can still go back and change your plans.</p>
  <ul class="report">${warnings.map((w) => `<li class="${w.tone}">${esc(w.text)}</li>`).join("")}</ul>
  <label class="check"><input type="checkbox" data-action="toggle-skip-check" ${ui.skipAdvanceCheck ? "checked" : ""} /> Don't check again this game</label>
  <div class="modal-actions"><button class="btn ghost" data-action="close-modal">Go back</button><button class="btn primary" data-action="advance-confirmed">Advance anyway</button></div>`;
}

// Before/after table so the player sees exactly what the month did.
function changesTable(state, before) {
  const keys = [...STAT_KEYS, "satisfaction"];
  const cell = (now, was) => {
    const d = now - was;
    return `<td><span class="tnum">${now}</span>${d ? `<span class="mini ${d > 0 ? "up" : "down"}">${d > 0 ? "+" : ""}${d}</span>` : ""}</td>`;
  };
  const head = keys.map((k) => `<th title="${STAT_LABELS[k]}">${STAT_SHORT[k]}</th>`).join("");
  const rows = state.villages
    .map((v) => {
      const was = before.villages[v.id];
      return `<tr><td><i class="dot" style="background:${VILLAGE_COLORS[v.id]}"></i>${esc(v.name)}</td>${cell(villageIndex(v), was.index)}${keys.map((k) => cell(v.stats[k], was[k])).join("")}</tr>`;
    })
    .join("");
  return `<div class="table-wrap"><table class="table changes"><thead><tr><th>Village</th><th>Index</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function modalReport(state, ui) {
  const r = ui.modal.report;
  const before = ui.modal.before;
  const next = state.phase === "ended" ? "See final results" : state.pendingEvent ? "Continue: something has happened…" : `Begin ${monthName(state.month)}`;
  const indexNow = districtIndex(state);
  return `<div class="eyebrow">Field report</div><h2>End of ${monthName(r.month)}</h2>
  ${r.lines.length ? `<ul class="report">${r.lines.map((l) => `<li class="${l.tone}">${esc(l.text)}</li>`).join("")}</ul>` : `<p class="muted">A quiet month: no progress to report. Did you start any projects?</p>`}
  ${before ? `<h3>What changed</h3>${changesTable(state, before)}` : ""}
  <div class="report-stats">
    <div><span>District index</span><b>${indexNow} ${before ? deltaChip(indexNow - before.index) : ""}</b></div>
    <div><span>Spent this month</span><b>${rupees(before ? state.budget.spent - before.spent : 0)}</b></div>
    <div><span>Budget left</span><b>${rupees(budgetRemaining(state))}</b></div>
    <div><span>Satisfaction</span><b>${averageSatisfaction(state)}</b></div>
  </div>
  <div class="modal-actions"><button class="btn primary" data-action="close-modal">${next}</button></div>`;
}

function modalEvent(state) {
  const pending = state.pendingEvent;
  const event = getEvent(pending.id);
  const choices = event.choices
    .map((choice, i) => {
      const cost = choiceCost(state, choice, pending.ctx);
      const from = choice.from || "main";
      const ok = canAfford(state, cost, from);
      const costText = cost ? `${rupees(cost)} from ${from === "reserve" ? "emergency reserve" : "main budget"}` : "No cost";
      return `<button class="choice ${choice.ignore ? "risky" : ""}" data-action="resolve-event" data-id="${i}" ${ok ? "" : "disabled"}>
        <b>${esc(choice.label)}</b><span>${esc(choice.detail)}</span><em>${ok ? costText : `Can't afford: ${costText}`}</em></button>`;
    })
    .join("");
  return `<div class="event-head"><span class="badge bad">${event.kind}</span><span class="muted small">${monthName(pending.month)}</span></div>
    <h2>${event.title}</h2><p class="lead">${esc(event.describe(state, pending.ctx))}</p>
    <div class="event-res"><span>Emergency reserve: <b>${rupees(reserveRemaining(state))}</b></span><span>Available budget: <b>${rupees(budgetAvailable(state))}</b></span></div>
    <div class="choices">${choices}</div>`;
}

function modalOutcome(state, ui) {
  return `<div class="eyebrow">Outcome</div><h2>${esc(ui.modal.title)}</h2><p class="lead">${esc(ui.modal.text)}</p>
  <div class="modal-actions"><button class="btn primary" data-action="close-modal">Continue</button></div>`;
}

function modalConfirm(state, ui) {
  return `<h2>${esc(ui.modal.title)}</h2><p>${esc(ui.modal.text)}</p>
  <div class="modal-actions"><button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary" data-action="${ui.modal.confirmAction}">${esc(ui.modal.confirmLabel)}</button></div>`;
}

function modalFinal(state) {
  const s = state.finalScore;
  const tone = s.overall >= 80 ? "good" : s.overall >= 60 ? "warn" : "bad";
  const parts = Object.keys(SCORE_WEIGHTS)
    .map((k) => `<div class="score-row"><span>${SCORE_WEIGHTS[k].label} <i class="muted">${SCORE_WEIGHTS[k].weight * 100}%</i></span>
      <div class="bar">${animatedFill("f." + k, s.parts[k], TONE_COLORS[statTone(s.parts[k])])}</div><b>${s.parts[k]}</b></div>`)
    .join("");
  return `${closeButton()}
  <div class="final">
    <div class="eyebrow">District performance · April – September</div>
    <div class="final-top">
      <div class="final-score" style="--c:${TONE_COLORS[tone]}">${s.overall}<span>/100</span></div>
      <div><h2>${s.rating}</h2><p class="muted">${esc(s.summary)}</p></div>
    </div>
    ${parts}
    <h3>Why you got this score</h3>
    <ul class="reasons">${s.reasons.map((r) => `<li><b>${SCORE_WEIGHTS[r.key].label}:</b> ${esc(r.text)}</li>`).join("")}</ul>
    <h3>Your district over six months</h3>
    ${trendChart(state)}
    <div class="modal-actions"><button class="btn ghost" data-action="close-modal">Review the district</button><button class="btn primary" data-action="new-game">Play again</button></div>
  </div>`;
}

// ---------------------------------------------------------------------
// TUTORIAL (first game only — can be replayed from the "?" help)
// A dark overlay with a "spotlight" hole over one part of the screen,
// plus a card explaining it. The hole is a box with a giant shadow.
// ---------------------------------------------------------------------
const TUTORIAL_STEPS = [
  { target: ".map-panel", title: "Your district", text: "These are your three villages. The coloured ring shows each village's overall health (its index). Click a village to inspect it." },
  { target: ".vp-grid", title: "Indicators and problems", text: "Each bar is an indicator from 0 to 100. The white line marks where it started, so you can see your progress. Hover an indicator to learn what affects it." },
  { target: '[data-action="open-picker"]', title: "Plan interventions", text: "Start projects here. Every project shows its cost, risk and expected effect in this village. The same project works differently in different villages." },
  { target: "#topstats", title: "Your resources", text: "Available is the money free for new projects. Staff is how many projects your team can run at once. You'll run out of both, so choose carefully." },
  { target: "#advance-btn", title: "Advance the month", text: "When you're done planning, advance. Projects progress, money is spent and random events may strike. You have six months: April to September." },
  { target: ".feed-panel", title: "Field updates", text: "Reports from the field appear here after each month. Good luck, Officer!" },
];

function renderTutorial(state, ui) {
  const root = $("tutorial-root");
  const step = TUTORIAL_STEPS[ui.tutorialStep];
  if (ui.tutorialStep === null || !step || ui.modal || state.pendingEvent) {
    root.innerHTML = "";
    delete root.dataset.target;
    return;
  }
  const last = ui.tutorialStep === TUTORIAL_STEPS.length - 1;
  root.dataset.target = step.target;
  root.innerHTML = `
    <div class="tut-block"></div>
    <div class="tut-spot"></div>
    <div class="tut-card" role="dialog" aria-label="Tutorial">
      <div class="eyebrow">Tutorial · ${ui.tutorialStep + 1} of ${TUTORIAL_STEPS.length}</div>
      <h3>${step.title}</h3>
      <p>${step.text}</p>
      <div class="tut-actions">
        <button class="btn ghost small" data-action="tutorial-skip">Skip tutorial</button>
        <span>${ui.tutorialStep > 0 ? `<button class="btn small" data-action="tutorial-prev">Back</button>` : ""}
        <button class="btn primary small" data-action="tutorial-next">${last ? "Start playing" : "Next"}</button></span>
      </div>
    </div>`;

  const target = document.querySelector(step.target);
  if (target) {
    const r = target.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight - 20) target.scrollIntoView({ block: "center" });
  }
  positionTutorial();
}

// Called after rendering and whenever the window scrolls or resizes.
function positionTutorial() {
  const root = $("tutorial-root");
  const spot = root.querySelector(".tut-spot");
  const card = root.querySelector(".tut-card");
  const target = root.dataset.target && document.querySelector(root.dataset.target);
  if (!spot || !card || !target) return;

  const vw = window.innerWidth, vh = window.innerHeight, pad = 6;
  const r = target.getBoundingClientRect();
  const top = Math.max(4, r.top - pad), left = Math.max(4, r.left - pad);
  const bottom = Math.min(vh - 4, r.bottom + pad), right = Math.min(vw - 4, r.right + pad);
  Object.assign(spot.style, { top: top + "px", left: left + "px", width: right - left + "px", height: Math.max(0, bottom - top) + "px" });

  const cw = card.offsetWidth, ch = card.offsetHeight;
  let cardTop = bottom + 12;
  if (cardTop + ch > vh - 12) cardTop = top - 12 - ch; // no room below → above
  if (cardTop < 12) cardTop = vh - ch - 16; // target fills the screen → pin to bottom
  const cardLeft = clamp(left, 16, vw - cw - 16);
  Object.assign(card.style, { top: cardTop + "px", left: cardLeft + "px" });
}

window.addEventListener("resize", positionTutorial);
window.addEventListener("scroll", positionTutorial, { passive: true });

// ---------------------------------------------------------------------
// TOASTS (small temporary messages)
// ---------------------------------------------------------------------
function showToast(text, tone) {
  const el = document.createElement("div");
  el.className = `toast ${tone || ""}`;
  el.textContent = text;
  el.setAttribute("role", "status");
  $("toast-root").appendChild(el);
  setTimeout(() => el.classList.add("hide"), 2600);
  setTimeout(() => el.remove(), 3100);
}
