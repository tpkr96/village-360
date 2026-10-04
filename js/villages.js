// =====================================================================
// villages.js — STARTING DATA for the three villages
// ---------------------------------------------------------------------
// This file only holds DATA, no game rules. Keeping data separate from
// logic means you can later swap these fictional numbers for a real
// dataset (a JSON file, a spreadsheet export, or an API response)
// without touching the rest of the game.
//
// Every indicator is a score from 0 (very poor) to 100 (excellent).
// `position` is where the village sits on the SVG district map
// (x/y in a 600 x 400 box) — not real GPS coordinates.
// =====================================================================

const VILLAGE_DATA = [
  {
    id: "rampur",
    name: "Rampur",
    mandal: "Kothapet Mandal",
    population: 1450,
    households: 330,
    position: { x: 150, y: 120 },
    description: "A farming village on the canal road. Strong community ties, but young people are leaving for city jobs.",
    stats: { education: 48, health: 55, livelihood: 42, water: 61, infrastructure: 50, satisfaction: 58 },
  },
  {
    id: "chintalapally",
    name: "Chintalapally",
    mandal: "Kothapet Mandal",
    population: 1100,
    households: 250,
    position: { x: 440, y: 105 },
    description: "A hillside village with a good school, but the borewells run dry every summer.",
    stats: { education: 62, health: 49, livelihood: 57, water: 38, infrastructure: 46, satisfaction: 54 },
  },
  {
    id: "mallapur",
    name: "Mallapur",
    mandal: "Nallagutta Mandal",
    population: 1850,
    households: 420,
    position: { x: 300, y: 300 },
    description: "The largest village, with a busy weekly market. Roads, schools and the health sub-centre are badly stretched.",
    stats: { education: 41, health: 44, livelihood: 63, water: 52, infrastructure: 39, satisfaction: 51 },
  },
];

// The five development indicators (satisfaction is tracked separately).
// Used everywhere we loop over "all stats", so the list lives in one place.
const STAT_KEYS = ["education", "health", "livelihood", "water", "infrastructure"];

const STAT_LABELS = {
  education: "Education",
  health: "Health",
  livelihood: "Livelihood",
  water: "Water",
  infrastructure: "Infrastructure",
  satisfaction: "Community Satisfaction",
};

// Beneficiary categories — fictional aggregate counts only, never real people.
const BENEFICIARY_KEYS = ["women", "youth", "students", "farmers", "households", "community"];

const BENEFICIARY_LABELS = {
  women: "Women",
  youth: "Youth",
  students: "Students",
  farmers: "Farmers",
  households: "Households",
  community: "Community members",
};
