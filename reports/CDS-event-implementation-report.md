# CDS event addition report

> Update: fourteen families now have playable daily adaptations. See [daily-events.md](daily-events.md) for the current schedule, effects and remaining CDS differences. This report records the earlier staging work.

Source: supplied **Mars_Outpost_Event_CDS.pdf**, revision 2.2, November 14, 2026. Appendix G (pp. 30–40) defines the event families; Appendix F (pp. 18–29) defines their required behavior. The PDF was treated as design input, not as authorization to perform unrelated publication, research, or administrative tasks.

## Result

**20 event families added as staged content; 0 fully implemented playable CDS events.** All 20 are partially added. None was omitted from the catalog, but all 20 remain unavailable in gameplay because the existing engine cannot execute their required contracts. This is a content addition, not completion of the CDS event system.

`data/events.json` now contains the six original events followed by E01–E20. Original records are preserved. The CDS's six demonstration families (E02, E04, E11, E12, E19, E20) are marked `demoFamily: true`; that flag does not enable them. The fourteen other families remain staged expansion content.

Each new record contains:

- Stable CDS ID, localized title/symptom, summary key, document revision and page reference.
- `cds.responseContracts`: structured E/F/H/Q/W costs, D/R/M profiles, ordered easy/moderate/severe outcomes for risky choices, and descriptive requirements/effects.
- Diagnosis, descriptive eligibility, explicit conflict references, progression formula, probability endpoints, science classification and CDS source references.
- The full event-specific Appendix G contract as `cds.sourceContract`, including learning rationale and details that cannot yet be expressed as executable rules. Special F11 abandon contingencies and the E19 low-health fallback are recorded separately.

Costs and profiles are structured authoring data. Effects and predicates are descriptive strings, **not executable operations**. These records are not a complete implementation of the typed schema required by F7/C06. The source contract remains authoritative where a short structured description omits a detail.

All new records have `minSol: 15`, `weight: 0`, empty runtime `choices`, and `cds.enabled: false`. The mission ends on Sol 14, so the existing selector excludes them. Importantly, the engine does not read `cds.enabled`; the Sol boundary and zero weight enforce staging. Do not enable a record by merely changing its weight or date. First implement the runtime contract and populate runtime choices. English and Simplified Chinese title/symptom translations are supplied; staged response contracts are currently English authoring content.

## Successfully added according to the CDS

The **catalog content** for all E01–E20 was added, including the specified response costs and risk outcome triplets. No event can honestly be reported as fully meeting the CDS's playable behavior. Existing `dust` and `sandstorm` cards are not counted as implementations of E20 or E19: their mechanics and scientific meaning differ.

## Partially added events and missing behavior

Every row below is **content added / gameplay blocked**. Shared missing requirements in the next section also apply to every event.

| CDS event | Added specifications | Required behavior not implemented |
| --- | --- | --- |
| E01 Three Knocks (p. 31) | Strap warning/diagnosis; inspection, abandonment, monitoring and 2 E + W recovery; 1 Q reward; three risk outcomes. | Recoverable case state, +1 E recovery surcharge after slipping, one-time Q reward, detachment/closure and external-hazard eligibility. |
| E02 Clicking Solar Panel (p. 31) | Hinge-fatigue diagnosis; standard repair; fixed-angle restriction; generation losses of 0/2/4. | Persistent owned generation modifiers, min(current,4) restriction, Q/toolkit repair and next-morning restoration. |
| E03 The Shorter Night (p. 32) | Battery diagnosis; standard repair; capacity restriction and 20/16/10 damage progression. | Variable capacity, immediate energy clamp and overflow log, no free recovery to 12 after capacity reaches 10. |
| E04 The Thirsty Greenhouse (p. 32) | Sensor-drift diagnosis; toolkit recalibration without Q; manual watering; crop-loss outcomes. | Care cost changing to 4 E, crop-progress eligibility/loss/reset, mutually exclusive greenhouse faults. |
| E05 The Robot Drops Things (p. 33) | Worn-gripper diagnosis; repair, photography restriction and sampling outcomes. | Distinct camera/gripper capability; 2 E + W sampling for 10 D versus photography for 6 D; degraded sampling and next-morning robot release. Existing robot work costs 4 E for 12 D. |
| E06 The Flickering Antenna (p. 33) | Cable diagnosis; standard repair; fixed-position restriction and throughput outcomes. | D>=12 eligibility, owned transmission limits of 15/20/0, complete antenna outage and repair restoration. |
| E07 The Longer Warm Up (p. 34) | Insulation diagnosis; standard repair; room closure; +1/+2 support demand. | Per-event recurring heating demand, laboratory availability, closing the room removing only its own heating load. |
| E08 The Whistling Vent (p. 34) | Filter diagnosis; 2 E + W + Q replacement without toolkit; independent standby ventilation. | Ventilation state, Q spending, next-morning recurring demand and independent standby replacing the faulty unit's load. |
| E09 The Sluggish Watering System (p. 35) | Blocked-line diagnosis; toolkit repair without Q; tray isolation; crop-loss outcomes. | Persistent 6 F harvest modifier, progress loss/reset, greenhouse ownership and conflict enforcement. |
| E10 One Spare Two Failures (p. 35) | Two-connector diagnosis; one-system/both-system repairs; later salvage/Q alternatives; restriction and outcomes. | Dedicated connector accounting, independent component locks, robot cannibalization, partial restoration and later repair eligibility. |
| E11 Your Experiment Is Dinner (p. 36) | Harvest/research/split branches with exact costs and yields; abandon contingency. | Progress=2 eligibility, batch consumption/reset, 8 F/16–12–8 D/4 F plus 8–6–4 D alternatives, day-end rewards without duplicate harvest. |
| E12 Outdated Advice (p. 36) | Restore/test/ask branches; risk durations; guidance context. | Pending guidance state, laboratory locks for the specified days, automatic morning Sol+2 restoration. |
| E13 The Robot Is Stuck (p. 37) | Recovery/drop/postpone branches; 10 D payload; damaged-robot repair and abandon contingency. | Pending robot lock, 4 H recovery cost, payload loss once, damaged/stranded states, due responses and mission-end abandonment. |
| E14 An Empty Chair (p. 37) | Rest/full/short choices; 8 H, 12 D with 4/8/12 H loss, or 6 D + 3 H; abandon contingency. | H=20–92/lab eligibility, combined rewards, random condition costs and opportunity expiry. Existing rest alone resembles one branch but does not implement the event. |
| E15 The Unlabelled Samples (p. 38) | Replacement/reconstruction/composition branches; 12/6/0 D provenance outcomes; abandon contingency. | Event-local uncounted research opportunity, 2 H cost, provenance tracking, partial research rewards and permanent forfeiture. |
| E16 The Last Day Shortcut (p. 38) | Borrow/preserve/temporary branches; 30/15/0 transfer limits; inherited-equipment trade-off. | Sol-14 scenario selection and slot substitution, entry antenna fault after eligibility checks, permanent greenhouse sacrifice, combined repair/transmit and facility-readiness ending. |
| E17 A Spill in the Wrong Place (p. 39) | Shutdown/isolation/backup branches; 6/3/0 D outcomes; abandon contingency. | Lab shutdown/reopening, partial rewards, robot-controller reassignment until morning Sol+2 and working-robot prerequisite. |
| E18 The Backup Fails Too (p. 39) | Combined inspect/repair, emergency battery and persistent-shelter responses. | Sol 6–10 eligibility, generation zero on entry from next morning, Q repair restoring 4, due response after battery use, independent shelter supply and activity restrictions. |
| E19 The Shelter Decision (p. 40) | Three shelter choices; 10/6/2 D outcomes; shielding/monitor benefits; low-H fallback; dated RAD observation. | Mandatory Sol-11 priority, outdoor-work prohibition, robot lock, prepared-workspace discount, monitor research bonus, 3 H fatigue cost or 2 D contingency, source-card UI. Turning lights off does not implement shelter. |
| E20 The Fading Panels (p. 40) | Dust warning/diagnosis; inspection, cleaning, restricted output and 0/2/3 generation-loss outcomes; InSight observation. | Warning/diagnosis gate, persistent min(current,4) restriction, owned damage, E19 cleaning prohibition and next-morning restoration. Existing dust handling is binary 6/3 generation and cannot represent these contracts. |

## Shared CDS requirements that JSON alone could not implement

1. **F01/F3/F9, C05:** Unknown/known/restricted/repaired/lost lifecycle; persistent issue menu; diagnosis separated from repair; one action per instance per Sol; component ownership and exclusions. Current events have one immediate choice and no follow-up lifecycle.
2. **F02/F3/F12:** At-most-once event families, technical slots on Sols 3/7, at most two technical starts, Sol-9 situational slot or Sol-14 E16 substitution, mandatory E19 on Sol 11, affordable-choice filtering, work-budget reservation and response ordering. Current selection uses tutorial/weather priority and weighted cooldown cards.
3. **F04/F5:** Event-keyed SHA-256 draws, independent warning-age/mission-age progression, persisted counters, bounded R/M distributions and non-improving damage. Current selection uses a shared linear-congruential RNG; event outcomes have no stochastic implementation. Stored endpoints do not implement sampling.
4. **F03/F4/F7/F9, C01/C06:** Whitelisted typed effects and conditions, Q inventory, direct H/F/Q costs, tool prerequisites, atomic transaction IDs, immediate versus next-morning versus day-end timing, and delayed response/automatic-effect separation. Current choice handling only charges energy, optionally consumes work, then invokes one predefined action; it ignores the staged CDS contracts. The save validator rejects any nonempty queue.
5. **F2/F8/F10:** Preflight battery opportunity before support payment, variable support/capacity/throughput, persistent independently supplied shelter, and four endings with inherited facility readiness. The current engine pays support immediately, has fixed limits and three outcomes. Existing tool actions differ from the CDS's specialized benefits.
6. **F05/F06/F7, C02:** Full causal outcome log and dated NASA source-card UI. Source observations here are transcribed from the supplied CDS; they were not independently verified or fetched. No live forecast, measured component-failure probability or radiation-to-health conversion is claimed. Separate executable `nasa_sources.json`/`balance.json` integration remains unimplemented.
7. **Appendix H:** CDS-specific runtime verification V01–V10, browser/accessibility checks, 1,000-seed policy balance runs and supervised learning validation remain outstanding. The CDS's reference-calculation results are not results for this repository.

## Events unable to be added completely

**E01–E20: all twenty.** They are present as staged content but none is enabled or fully playable. **Events absent from the content catalog: none.** Completing any event requires engine and UI work beyond editing event data; the recommended first implementation slice is E02/E04/E11/E12/E19/E20, following the CDS rather than enabling all twenty simultaneously.

## Validation

- JSON parsing, unique IDs, E01–E20 coverage, six demo flags, profile normalization, three outcomes per risky response, complete typed costs, and translation-reference parity checked.
- Existing six event records compared against the committed originals; unchanged.
- Verified every staged record is outside Sols 1–14, has zero selection weight and no tutorial/weather/fallback override. Existing gameplay selection remains unchanged.
- `git diff --check` passed.
- `npm test` could not run: this environment has neither `npm` nor `node` available. No JavaScript test-suite pass or playable CDS validation is claimed.
