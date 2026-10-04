# VILLAGE 360: District Development Simulator

A browser strategy game. You are the Development Officer of a fictional Telangana district,
with **6 months** and **₹10,00,000** to improve life in three villages. Every rupee, staff member
and month counts, and there is no perfect strategy.

▶ **[Play it in your browser](https://tpkr96.github.io/village-360/)**

## How to play

1. **Inspect** a village on the district map: education, health, livelihood, water,
   infrastructure and community satisfaction.
2. **Plan interventions.** Choose from 12 projects (RO plants, school repairs, sewing units,
   health camps, VDCs…). Each shows its cost, duration, staff need, risk, sustainability and the
   expected effect *in that village*.
3. **Advance the month.** Projects progress, instalments are paid, benefits fade, neglected
   villages get frustrated, and random events strike: floods, heat waves, market crashes,
   community disagreements and staff shortages.
4. **Decide under pressure.** Respond using the emergency reserve or the main budget, or
   ignore the problem and live with the consequences.
5. **Get your score** after September: Impact 40% · Budget efficiency 20% · Community
   satisfaction 15% · Sustainability 10% · Risk management 10% · Timeliness 5%, with an
   explanation of why.

### Trade-offs built into the rules
- Weak indicators improve faster than strong ones (diminishing returns).
- Livelihood projects are only 70% effective where water is scarce.
- A Digital Learning Lab needs decent infrastructure (power) to work.
- SHG Training makes a later Sewing Unit 30% stronger; a VDC halves project risk.
- Health Camps are cheap but most of the benefit fades within 2 months.
- RO plants and labs cost money to run every month after completion.
- Projects that don't finish by September deliver nothing.

## Run it locally

No installation needed. Download or clone the repo and **double-click `index.html`**.
The game saves automatically in your browser (`localStorage`).

## Tests

Open **`tests/test.html`** in a browser. It runs 25 checks on the game rules, including
a balance simulation of 900 automatic games:

| Strategy | Average score |
|---|---|
| Do nothing | ~7 |
| Random spending | ~59 |
| Careful planning | ~83 |

## Project structure

```
village-360/
├── index.html            page layout
├── css/style.css         visual design
├── js/
│   ├── villages.js       village data (fictional, replaceable with real data)
│   ├── interventions.js  the 12 projects
│   ├── events.js         the 5 random events and their choices
│   ├── gameState.js      the single state object + read helpers
│   ├── gameLogic.js      the rules (advanceMonth, startProject, resolveEvent…)
│   ├── scoring.js        final score and explanation
│   ├── storage.js        save / load with localStorage
│   ├── ui.js             draws the screen from the state
│   └── app.js            starts the game, connects clicks to rules
├── tests/                automatic tests (open test.html)
└── docs/ARCHITECTURE.md  how the code works: a guide for learning
```

New to the code? Read **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Roadmap

- [x] **v1: Playable MVP:** 3 villages, 6 months, 12 interventions, 5 events, scoring, save/load
- [ ] Better UI/UX: tutorial, animations, richer charts
- [ ] More mechanics: more villages, donor reviews, staff hiring, difficulty levels
- [ ] v2: JavaScript modules, chart library, cleaner state management
- [ ] v3: Python + Flask backend
- [ ] v4: Database
- [ ] v5: AI features: Field Officer reports, Village Resident chat, Donor review, Analyst

All villages, people and numbers are fictional. No real personal data is used.
