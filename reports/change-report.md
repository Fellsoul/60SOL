# Mars Outpost change report

## Scope

This report covers the recent implementation work in `60SOL`, including the CDS event content, task clipboard, character-motion feedback, menu presentation, terminal resource summaries, space-data snapshot work, and the latest daily-event presentation changes.

## Gameplay and interface changes

- Added the table clipboard as the task-focused interface. It shows available and completed tasks, keeps completion state after reopening and reload, and leaves day-ending exclusively on the terminal.
- Added hover and interaction feedback for the clipboard and table switch. The switch controls lighting directly and does not activate from generic table clicks.
- Moved action feedback away from the room overlay. Character activity is represented by room crew motion and safe animation state; the former floating activity card was removed.
- Added seated crew breathing and grounded response motion while preserving the painted foot anchors. EVA work uses a safe off-screen transition and does not show unsuited exterior movement.
- Added the menu background asset through `assets/menu/background.png` and restored its configuration after the menu was updated.
- Changed terminal resource summaries so energy changes show individual battery icons for 1–4 E and one battery icon with `× n` for amounts above 4.

## Daily event presentation

The twenty CDS event records now include short scene cues in English and Simplified Chinese. These cues reduce reading load and make the event observable in the room:

- Hatch events use a sound bubble such as “Knock! Knock! Knock!” near the hatch.
- Equipment events use short sound bubbles near panels, vents, antennas, or the terminal.
- Crew dialogue uses speech bubbles anchored to the crew or relevant station.
- Clicking a scene bubble opens the clipboard. Resolving the event hides the bubble.
- The long event description is omitted from the terminal for cued events. The clipboard keeps the response controls and event title while omitting duplicated prose.

The event model remains authoritative for costs, dependencies, progression, and outcomes. The scene cue is presentation-only and cannot resolve an event by itself.

## Space-data integration

Added frozen, validated mission snapshots with source provenance, checksums, historical fallback cases, cache handling, bounded same-origin acquisition, and deterministic mappings into EVA restrictions, heating demand, and communication delay. The raw technical snapshot JSON was removed from the player-facing evidence panel; internal snapshot validation and save/reload integrity remain active.

The integration report at [space-data-integration.md](space-data-integration.md) records the source contracts, fallback limitations, and remaining acceptance work.

## CDS event content status

E01–E20 were added as structured staged content with localized titles, diagnoses, costs, risk profiles, source references, and response contracts. They remain staged rather than falsely presented as fully playable CDS implementations. The detailed event status is documented in [CDS-event-implementation-report.md](CDS-event-implementation-report.md) and [daily-events.md](daily-events.md).

## Verification

- Latest pull from GitHub completed successfully before the current edits.
- All 33 JavaScript modules parsed in the JavaScriptCore validation harness.
- All 83 merged regression checks passed.
- JSON, localization references, browser-test syntax, and `git diff --check` passed.
- A real browser/Playwright run was not available in this environment, so visual placement of the scene bubbles still requires browser review.

## Remaining work

The current scene bubbles use percentage anchors chosen for the existing room composition. They should be visually reviewed at the supported viewport sizes. The CDS event report also retains the larger gameplay contracts that still require dedicated engine work before E01–E20 can be considered fully playable.
