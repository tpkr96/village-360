// =====================================================================
// events.js — RANDOM EVENTS and the choices the player can make
// ---------------------------------------------------------------------
// Each event is an object with:
//   condition(state)  can this event happen right now?
//   weight(state)     how likely it is compared to other events
//   setup(state)      picks the target (which village / project)
//                     and returns a small "context" object (ctx)
//   describe(state, ctx)  the text the player reads
//   choices           the player's options. Each choice has a cost,
//                     where the money comes from ("reserve" = the
//                     contingency fund, "main" = the normal budget),
//                     and an apply(state, ctx) function that changes
//                     the state and returns a sentence describing what
//                     happened.
//
// gameLogic.js decides WHEN an event fires; this file only describes
// WHAT each event does. Functions stored inside objects like this are
// a normal JavaScript pattern.
// =====================================================================

// Pick a village with a bias: villages with a higher weight are more likely.
function pickWeightedVillage(state, weightFn) {
  const weights = state.villages.map((v) => Math.max(1, weightFn(v)));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = random() * total;
  for (let i = 0; i < state.villages.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return state.villages[i];
  }
  return state.villages[state.villages.length - 1];
}

const EVENTS = [
  // ------------------------------------------------------------------
  {
    id: "heavy_rain",
    title: "Heavy Rainfall",
    kind: "Disaster",
    condition: (state) => state.month >= 3, // monsoon: June onwards
    weight: (state) => (state.month <= 5 ? 3 : 1),
    setup: (state) => {
      // Villages with weak infrastructure flood more easily.
      const village = pickWeightedVillage(state, (v) => 100 - v.stats.infrastructure);
      return { villageId: village.id };
    },
    describe: (state, ctx) => {
      const v = getVillage(state, ctx.villageId);
      return `Two days of torrential rain have flooded low-lying lanes in ${v.name}. Drains are overflowing, a culvert has collapsed and open wells may be contaminated.`;
    },
    choices: [
      {
        label: "Emergency response (contingency fund)",
        detail: "Clear drains, chlorinate wells, repair the culvert. Limits the damage.",
        cost: 60000,
        from: "reserve",
        apply: (state, ctx) => {
          const v = getVillage(state, ctx.villageId);
          changeStat(v, "infrastructure", -3);
          changeStat(v, "water", -2);
          changeStat(v, "satisfaction", 3);
          return `Relief teams reached ${v.name} within a day. Damage was limited and residents appreciated the quick response.`;
        },
      },
      {
        label: "Divert money from the project budget",
        detail: "Same response, paid from your main budget. Leaves less for new projects.",
        cost: 60000,
        from: "main",
        apply: (state, ctx) => {
          const v = getVillage(state, ctx.villageId);
          changeStat(v, "infrastructure", -3);
          changeStat(v, "water", -2);
          changeStat(v, "satisfaction", 2);
          return `Project funds were re-allocated to flood repairs in ${v.name}. Damage was contained.`;
        },
      },
      {
        label: "Wait for the water to recede",
        detail: "Spend nothing. Expect serious damage and delays to projects in the village.",
        cost: 0,
        ignore: true,
        apply: (state, ctx) => {
          const v = getVillage(state, ctx.villageId);
          changeStat(v, "infrastructure", -8);
          changeStat(v, "water", -10);
          changeStat(v, "health", -5);
          changeStat(v, "satisfaction", -8);
          const delayed = activeProjects(state, v.id);
          delayed.forEach((p) => delayProject(state, p));
          const extra = delayed.length ? ` ${delayed.length} active project(s) were delayed by a month.` : "";
          return `Contaminated water caused a spike in illness in ${v.name}, and residents feel abandoned.${extra}`;
        },
      },
    ],
  },

  // ------------------------------------------------------------------
  {
    id: "heat_wave",
    title: "Heat Wave",
    kind: "Disaster",
    condition: (state) => state.month <= 3, // April – June
    weight: () => 3,
    setup: (state) => {
      // The village with the worst water access suffers most.
      const village = [...state.villages].sort((a, b) => a.stats.water - b.stats.water)[0];
      return { villageId: village.id };
    },
    describe: (state, ctx) => {
      const v = getVillage(state, ctx.villageId);
      return `Temperatures have crossed 46°C for a week. In ${v.name}, elderly residents and children are showing signs of heatstroke and dehydration.`;
    },
    choices: [
      {
        label: "Set up water & ORS stations (contingency fund)",
        detail: "Shaded drinking-water points and ORS distribution at the school and market.",
        cost: 40000,
        from: "reserve",
        apply: (state, ctx) => {
          const v = getVillage(state, ctx.villageId);
          changeStat(v, "health", -2);
          changeStat(v, "satisfaction", 3);
          return `Water and ORS stations in ${v.name} prevented serious cases. A visible, popular response.`;
        },
      },
      {
        label: "Run an awareness drive only",
        detail: "Cheap posters and ASHA worker visits. Helps a little.",
        cost: 10000,
        from: "main",
        apply: (state, ctx) => {
          const v = getVillage(state, ctx.villageId);
          changeStat(v, "health", -5);
          changeStat(v, "satisfaction", -1);
          return `The awareness drive reached most homes in ${v.name}, but several people were still hospitalised.`;
        },
      },
      {
        label: "Do nothing",
        detail: "Hope it passes quickly.",
        cost: 0,
        ignore: true,
        apply: (state, ctx) => {
          const v = getVillage(state, ctx.villageId);
          const extra = v.stats.water < 45 ? 4 : 0; // worse where water is already scarce
          changeStat(v, "health", -10 - extra);
          changeStat(v, "satisfaction", -6);
          return `The heat wave hit ${v.name} hard${extra ? ", made worse by poor water access" : ""}. Health indicators fell sharply.`;
        },
      },
    ],
  },

  // ------------------------------------------------------------------
  {
    id: "market_shock",
    title: "Market Price Shock",
    kind: "Economic",
    condition: (state) => state.month >= 2,
    weight: (state) => {
      const exposed = state.projects.filter(
        (p) => p.status !== "cancelled" && getIntervention(p.interventionId).marketSensitive
      ).length;
      return 1 + exposed * 2; // more livelihood projects = more exposure
    },
    setup: (state) => {
      // Villages with market-sensitive projects (active or completed) are hit.
      const ids = state.villages
        .filter((v) =>
          state.projects.some(
            (p) =>
              p.villageId === v.id && p.status !== "cancelled" && getIntervention(p.interventionId).marketSensitive
          )
        )
        .map((v) => v.id);
      return { villageIds: ids.length ? ids : state.villages.map((v) => v.id), mild: ids.length === 0 };
    },
    describe: (state, ctx) => {
      const names = ctx.villageIds.map((id) => getVillage(state, id).name).join(", ");
      return ctx.mild
        ? `Wholesale prices for vegetables and cloth have crashed by 30%. Local traders in ${names} are feeling the squeeze.`
        : `Wholesale prices for vegetables and cloth have crashed by 30%. Livelihood units you funded in ${names} are suddenly losing money.`;
    },
    choices: [
      {
        label: "Fund market linkages (contingency fund)",
        detail: "Connect producers to a city buyer and a farmer-producer organisation.",
        cost: 50000,
        from: "reserve",
        apply: (state, ctx) => {
          ctx.villageIds.forEach((id) => changeStat(getVillage(state, id), "livelihood", ctx.mild ? -1 : -2));
          return "New buyers were found quickly. Incomes dipped only slightly.";
        },
      },
      {
        label: "Give working-capital top-ups",
        detail: "Small grants so units can survive the dip. Paid from the main budget.",
        cost: 30000,
        from: "main",
        apply: (state, ctx) => {
          ctx.villageIds.forEach((id) => {
            const v = getVillage(state, id);
            changeStat(v, "livelihood", ctx.mild ? -2 : -3);
            changeStat(v, "satisfaction", 1);
          });
          return "Top-ups kept most units open, though profits fell.";
        },
      },
      {
        label: "Let the market correct itself",
        detail: "No cost. Livelihood gains will take a hit.",
        cost: 0,
        ignore: true,
        apply: (state, ctx) => {
          ctx.villageIds.forEach((id) => {
            const v = getVillage(state, id);
            changeStat(v, "livelihood", ctx.mild ? -3 : -7);
            changeStat(v, "satisfaction", ctx.mild ? -1 : -4);
          });
          return ctx.mild
            ? "Traders absorbed the loss. Incomes fell for a few weeks."
            : "Several livelihood units shut temporarily. Beneficiaries lost income and confidence.";
        },
      },
    ],
  },

  // ------------------------------------------------------------------
  {
    id: "disagreement",
    title: "Community Disagreement",
    kind: "Social",
    condition: (state) => activeProjects(state).length > 0,
    weight: (state) => 2 + activeProjects(state).length * 0.5,
    setup: (state) => {
      // Riskier projects in low-trust villages without a VDC are likelier targets.
      const candidates = activeProjects(state);
      const weights = candidates.map((p) => {
        const v = getVillage(state, p.villageId);
        let w = getIntervention(p.interventionId).risk * 10;
        if (hasCompleted(state, v.id, "vdc")) w *= 0.3;
        if (v.stats.satisfaction < 50) w *= 1.5;
        return Math.max(0.1, w);
      });
      const total = weights.reduce((a, b) => a + b, 0);
      let roll = random() * total;
      let chosen = candidates[candidates.length - 1];
      for (let i = 0; i < candidates.length; i++) {
        roll -= weights[i];
        if (roll <= 0) {
          chosen = candidates[i];
          break;
        }
      }
      return { projectId: chosen.id, villageId: chosen.villageId };
    },
    describe: (state, ctx) => {
      const v = getVillage(state, ctx.villageId);
      const project = getIntervention(getProject(state, ctx.projectId).interventionId);
      const vdcNote = hasCompleted(state, v.id, "vdc") ? " The Village Development Committee has offered to mediate." : "";
      return `A group of families in ${v.name} object to the ${project.name}. They say the site favours one hamlet and they were never consulted.${vdcNote}`;
    },
    choices: [
      {
        label: "Hold community meetings",
        detail: "Listen, adjust the plan. Costs ₹15,000 and delays the project a month (free and no delay if a VDC exists).",
        cost: 15000,
        from: "main",
        costFn: (state, ctx) => (hasCompleted(state, ctx.villageId, "vdc") ? 0 : 15000),
        apply: (state, ctx) => {
          const v = getVillage(state, ctx.villageId);
          const project = getProject(state, ctx.projectId);
          changeStat(v, "satisfaction", 4);
          if (hasCompleted(state, v.id, "vdc")) {
            return `The VDC brokered an agreement in ${v.name} within a week. Trust in the programme grew.`;
          }
          if (project && project.status === "active") delayProject(state, project);
          return `After three meetings, the families in ${v.name} agreed to a revised plan. The project slipped by a month but now has local backing.`;
        },
      },
      {
        label: "Push ahead as planned",
        detail: "No cost, no delay, but resistance may damage trust and the project's quality.",
        cost: 0,
        apply: (state, ctx) => {
          const v = getVillage(state, ctx.villageId);
          const project = getProject(state, ctx.projectId);
          const backlashChance = hasCompleted(state, v.id, "vdc") ? 0.25 : 0.5;
          if (chance(backlashChance)) {
            changeStat(v, "satisfaction", -10);
            if (project) project.qualityPenalty += 0.3;
            state.counters.eventsIgnored += 1;
            return `Protests broke out in ${v.name}. Work continued, but the project will deliver less and trust has dropped sharply.`;
          }
          changeStat(v, "satisfaction", -2);
          return `The grumbling in ${v.name} faded. Work continued, though some families remain unhappy.`;
        },
      },
      {
        label: "Cancel the project",
        detail: "Unpaid money returns to your budget. Money already spent is lost.",
        cost: 0,
        apply: (state, ctx) => {
          const v = getVillage(state, ctx.villageId);
          const project = getProject(state, ctx.projectId);
          if (project && project.status === "active") cancelProject(state, project);
          changeStat(v, "satisfaction", -4);
          return `The project in ${v.name} was cancelled. Unpaid funds were freed up, but the community is disappointed.`;
        },
      },
    ],
  },

  // ------------------------------------------------------------------
  {
    id: "staff_shortage",
    title: "Staff Shortage",
    kind: "Operational",
    condition: () => true, // can happen any month
    weight: (state) => (staffInUse(state) >= 4 ? 3 : 1.5),
    setup: () => ({}),
    describe: () =>
      "Two of your field coordinators have resigned to join a private company, and a third is on medical leave. Your team cannot manage the current workload.",
    choices: [
      {
        label: "Hire temporary staff (contingency fund)",
        detail: "Keep full capacity by bringing in consultants.",
        cost: 45000,
        from: "reserve",
        apply: () => "Temporary coordinators joined within a week. Work continues at full pace.",
      },
      {
        label: "Hire from the main budget",
        detail: "Same result, paid from money meant for projects.",
        cost: 45000,
        from: "main",
        apply: () => "Project funds paid for temporary staff. Capacity is maintained.",
      },
      {
        label: "Manage with a smaller team",
        detail: "No cost. Staff capacity drops by 2 points for the next 2 months.",
        cost: 0,
        ignore: true,
        apply: (state) => {
          state.staff.shortageMonths = 2;
          return "The team is stretched. Expect slower implementation and possible stalled projects.";
        },
      },
    ],
  },
];

function getEvent(id) {
  return EVENTS.find((e) => e.id === id);
}

// Some choices have a cost that depends on the situation (e.g. free with a VDC).
function choiceCost(state, choice, ctx) {
  return choice.costFn ? choice.costFn(state, ctx) : choice.cost;
}
