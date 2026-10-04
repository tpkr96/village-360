// =====================================================================
// interventions.js — the CATALOGUE of projects the player can fund
// ---------------------------------------------------------------------
// Each intervention is a plain JavaScript object. The game logic reads
// these fields; it never hard-codes a project's numbers anywhere else.
// To add a new project, copy one block, give it a new `id`, and change
// the numbers — the UI and logic pick it up automatically.
//
// Field guide
//   cost            total rupees, paid in equal parts over `duration`
//   duration        months until the project completes
//   staff           staff points it occupies while being implemented
//   beneficiaries   fictional aggregate counts reached on completion
//   impact          BASE change to village indicators on completion
//                   (the real change depends on village need — see
//                   gameLogic.js > calculateImpact)
//   risk            chance (0–1) each month of a delay / local problem
//   sustainability  1–10: how long the benefit lasts after the project
//   sideEffects     plain-language trade-offs shown to the player
//
// Optional "special rule" fields (handled in gameLogic.js):
//   startEffects        indicator changes the moment work begins
//   maintenance         rupees per month AFTER completion, forever
//   needsInfrastructure impact drops to 60% if village infrastructure
//                       is below this value
//   waterSensitive      impact drops to 70% if village water < 45
//   boostedBy           { id, multiplier } — stronger if that project
//                       is already completed in the same village
//   fades               fraction of the health gain lost over 2 months
//   marketSensitive     hurt more by the Market Price Shock event
//   migrationRisk       chance that trained youth leave on completion
//   reducesRisk         halves project risk in the village afterwards
// =====================================================================

const CATEGORIES = {
  education:  { label: "Education",  color: "#5b9cf5" },
  livelihood: { label: "Livelihood", color: "#e3a83b" },
  health:     { label: "Health",     color: "#e2677a" },
  water:      { label: "Water",      color: "#3cc4d6" },
  community:  { label: "Community",  color: "#9b7cf0" },
};

const INTERVENTIONS = [
  // ---------------- EDUCATION ----------------
  {
    id: "school_repair",
    name: "School Repair",
    category: "education",
    cost: 120000,
    duration: 2,
    staff: 2,
    beneficiaries: { students: 180, community: 40 },
    impact: { education: 8, infrastructure: 12, satisfaction: 4 },
    risk: 0.12,
    sustainability: 8,
    description: "Fix roofs, toilets and classrooms in the government school.",
    sideEffects: ["Classes are disrupted while work happens (−2 satisfaction at start)."],
    startEffects: { satisfaction: -2 },
  },
  {
    id: "digital_lab",
    name: "Digital Learning Lab",
    category: "education",
    cost: 180000,
    duration: 1,
    staff: 1,
    beneficiaries: { students: 220, youth: 40 },
    impact: { education: 14, satisfaction: 3 },
    risk: 0.15,
    sustainability: 4,
    description: "Tablets, a projector and solar backup for the high school.",
    sideEffects: [
      "Needs reliable power: only 60% effective if Infrastructure is below 45.",
      "Ongoing upkeep of ₹3,000 per month after completion.",
    ],
    needsInfrastructure: 45,
    maintenance: 3000,
  },
  {
    id: "clc",
    name: "Community Learning Centre",
    category: "education",
    cost: 70000,
    duration: 2,
    staff: 2,
    beneficiaries: { students: 90, youth: 50, women: 20 },
    impact: { education: 9, satisfaction: 5 },
    risk: 0.1,
    sustainability: 7,
    description: "Evening classes in computers, English and maths for students and youth.",
    sideEffects: ["Staff-heavy for its cost: uses 2 staff points for 2 months."],
  },

  // ---------------- LIVELIHOOD ----------------
  {
    id: "sewing_unit",
    name: "Sewing Unit",
    category: "livelihood",
    cost: 90000,
    duration: 1,
    staff: 1,
    beneficiaries: { women: 25, households: 25 },
    impact: { livelihood: 10, satisfaction: 4 },
    risk: 0.15,
    sustainability: 6,
    description: "Machines and training for a women-run tailoring unit.",
    sideEffects: [
      "30% stronger if SHG Training is already completed in the village.",
      "Only 70% effective if Water is below 45: families are busy fetching water.",
    ],
    boostedBy: { id: "shg_training", multiplier: 1.3 },
    waterSensitive: true,
    marketSensitive: true,
  },
  {
    id: "agri_support",
    name: "Agriculture Support Package",
    category: "livelihood",
    cost: 150000,
    duration: 2,
    staff: 2,
    beneficiaries: { farmers: 120, households: 100 },
    impact: { livelihood: 14, health: 2, satisfaction: 5 },
    risk: 0.2,
    sustainability: 5,
    description: "Seeds, drip kits and farm advisory for small farmers.",
    sideEffects: [
      "Only 70% effective if Water is below 45.",
      "Hit hard by market price shocks.",
    ],
    waterSensitive: true,
    marketSensitive: true,
  },
  {
    id: "youth_vocational",
    name: "Youth Vocational Training",
    category: "livelihood",
    cost: 110000,
    duration: 2,
    staff: 2,
    beneficiaries: { youth: 60 },
    impact: { livelihood: 8, education: 4, satisfaction: 3 },
    risk: 0.15,
    sustainability: 6,
    description: "Electrician, mobile repair and retail skills courses for youth.",
    sideEffects: ["30% chance some trained youth migrate to the city, weakening local gains."],
    migrationRisk: 0.3,
  },

  // ---------------- HEALTH ----------------
  {
    id: "health_camp",
    name: "Health Camp",
    category: "health",
    cost: 40000,
    duration: 1,
    staff: 1,
    beneficiaries: { community: 400, women: 120 },
    impact: { health: 10, satisfaction: 6 },
    risk: 0.05,
    sustainability: 2,
    description: "A one-day screening and treatment camp with visiting doctors.",
    sideEffects: ["Cheap and quick, but 60% of the health gain fades over the next 2 months."],
    fades: 0.6,
  },
  {
    id: "nutrition",
    name: "Nutrition Programme",
    category: "health",
    cost: 100000,
    duration: 3,
    staff: 2,
    beneficiaries: { students: 150, women: 80 },
    impact: { health: 12, education: 3, satisfaction: 3 },
    risk: 0.1,
    sustainability: 7,
    description: "Take-home rations and growth monitoring for children and mothers.",
    sideEffects: ["Takes 3 months: start early or it won't finish in time."],
  },

  // ---------------- WATER ----------------
  {
    id: "ro_plant",
    name: "RO Water Plant",
    category: "water",
    cost: 150000,
    duration: 1,
    staff: 1,
    beneficiaries: { households: 300, community: 500 },
    impact: { water: 18, health: 6, satisfaction: 7 },
    risk: 0.1,
    sustainability: 6,
    description: "A reverse-osmosis plant giving safe drinking water at low cost.",
    sideEffects: ["Ongoing operation cost of ₹5,000 per month after completion."],
    maintenance: 5000,
  },
  {
    id: "pipeline",
    name: "Drinking-Water Pipeline",
    category: "water",
    cost: 250000,
    duration: 3,
    staff: 3,
    beneficiaries: { households: 350 },
    impact: { water: 22, infrastructure: 10, health: 4, satisfaction: 6 },
    risk: 0.2,
    sustainability: 9,
    description: "Household tap connections from the overhead tank.",
    sideEffects: [
      "Expensive, slow, and uses 3 staff points.",
      "Roads are dug up during work (−3 satisfaction at start).",
    ],
    startEffects: { satisfaction: -3 },
  },

  // ---------------- COMMUNITY ----------------
  {
    id: "shg_training",
    name: "SHG Training",
    category: "community",
    cost: 50000,
    duration: 1,
    staff: 1,
    beneficiaries: { women: 60 },
    impact: { livelihood: 4, satisfaction: 5 },
    risk: 0.05,
    sustainability: 8,
    description: "Bookkeeping, savings and leadership training for women's Self-Help Groups.",
    sideEffects: ["Small direct impact, but boosts a later Sewing Unit by 30%."],
  },
  {
    id: "vdc",
    name: "VDC Formation",
    category: "community",
    cost: 30000,
    duration: 1,
    staff: 1,
    beneficiaries: { community: 100 },
    impact: { satisfaction: 6, infrastructure: 2 },
    risk: 0.05,
    sustainability: 9,
    description: "Set up a Village Development Committee to plan and oversee projects.",
    sideEffects: ["Barely moves the indicators, but halves project risks in the village afterwards."],
    reducesRisk: true,
  },
];

// Small helper: find an intervention by its id.
function getIntervention(id) {
  return INTERVENTIONS.find((item) => item.id === id);
}
