# Tests

Run the automated suite with `npm test` (Node's built-in test runner; no extra packages).

| File | Coverage |
| --- | --- |
| `game.test.mjs` | Resource costs, daily settlement, light controls, saves, and migration |
| `daily-events.test.mjs` | Daily event progression, fallback responses, and a complete successful mission |
| `dependencies.test.mjs` | Event-specific restrictions, independent work, and avoiding blocked missions |
| `emergency-clean.test.mjs` | Trigger conditions, health/work costs, declining, and reload protection |
| `expeditions.test.mjs` | Sample capacity and study uses, robot collection, crew trips, lighting-based fatigue, and save migration |
| `resources.test.mjs` | Drumstick multipliers, research icons, bilingual prompts, daily rations, and legacy food migration |
| `resource-log.test.mjs` | Actual resource deltas, caps, and persisted summaries |
| `battery.test.mjs` | Battery capacity, lamp states, and legacy energy limits |
| `clipboard.test.mjs` | Available and completed tasks across turns and reloads |
| `controller.test.mjs` | Light switching saves progress and keeps the terminal open |
| `i18n.test.mjs` | Catalog consistency, content references, fallbacks, and old narrative text |

Optional browser checks require Python Playwright and Microsoft Edge:

- `python tests/browser_smoke.py`: gameplay interactions, panel behavior, animation lifecycle, missing assets, and responsive layouts.
- `python tests/battery_browser.py`: checks actual green/grayscale battery artwork pixels; additionally requires Pillow.

Keep new tests focused on observable behavior or a distinct regression. Avoid checks that only assert an internal method-call sequence, and reuse the full-mission tests instead of adding another equivalent playthrough.
