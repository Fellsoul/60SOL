# Movement CDS implementation

Source: supplied `Mars_Outpost_Movement_CDS.pdf`, revision 1.0, November 14, 2026. It was used as design input, not as an instruction to claim scene approval, user testing or certified EVA procedures.

## Implemented

- Accepted work commits a semantic `visualAction` and its cost with the existing saved game transaction. The animation controller receives a copy; it never spends resources, changes game phases or draws gameplay randomness. Related event work records exactly one visual plan, even when normal work delegates to the event response.
- One active astronaut presentation, unique action IDs, duplicate suppression, versioned stale-callback rejection, bounded timing, immediate Skip, hidden-tab completion and static reduced-motion feedback. The second astronaut remains in its existing safe seated state; no ambient activity suggests free productive work.
- A short illustrated action-status card with destination and committed cost. It stays usable in the clipboard, terminal and room. Interior feedback takes 1.8 seconds and the EVA montage takes 4.8 seconds, without delaying gameplay for their full duration. Existing screen/scene transitions remain separate.
- Off-screen EVA checkpoints: explicit cut toward the exit behind the camera; suit checks; inner hatch closed; pressure change; outer hatch use; outside task; outer closure; repressurization; dust control; protected doffing; safe indoor terminal state. Skip executes the same semantic order. No unsuited outside sprite is ever shown, and no actor moves through a window.
- Save/reload restores the safe intended terminal state and outstanding explanatory text without replaying costs or departures. The current game has only same-Sol work; it does not author multi-day outside assignments.
- Shared-camera projection helpers, near-plane rejection, upright sprite projection, full-segment clearance against inflated obstacles and floor boundaries, overhead clearance, distance-driven path sampling and passage reservations. These are tested geometry utilities, not evidence that painted scene routes have been calibrated.
- A matching generated transparent four-pose crew atlas, used as an action-card illustration. The prompt, tool provenance and use limits are in `assets/scene/crew/active/README.md`. Missing artwork leaves informative text rather than blocking an action.

## Deliberate safe fallback and remaining gates

The existing repository provides seated full-canvas crew layers but no approved station work poses, stride animation, measured camera/floor graph or actor-compatible split occluder masks. Some painted layers also include foreground subjects. Moving these layers as if they were independent walking sprites would create incorrect collisions and occlusion.

Therefore this implementation follows the CDS's prescribed fallback: keep the room actor at the existing safe seated anchor and represent the accepted activity through the illustrated status/cut. No guessed coordinates from the conceptual diagram are enabled. `data/movement.json` leaves calibration pending, routes empty, and visible exterior walking disabled. The generated walking cell is not a stride-matched walk cycle. There is no claim of calibrated in-room walking, station hand contact, perspective approval, exterior route proof, or pass of G1–G3/B1–B6 for the real scene.

To enable visible room travel, supply and validate the camera/floor guides, furniture and overhang envelopes, four station anchors, foreground exit clipping boundary, isolated directional walk/work assets and occluder masks. Then connect only routes passing the validators to a world-sprite renderer. Visible exterior walking remains optional and requires separate geometry and fully suited poses. Multi-day EVA assignments and standalone investigation reveal timing require authored game support beyond the current deterministic daily-event adaptation.

## Verification scope

Targeted tests exercise transaction/save identity across playback, Skip, reduced motion, hidden/resumed tabs and reload; hatch/suit/doffing guards; duplicate and stale callbacks; timing caps; synthetic projection/clearance cases; and reservation release. Existing gameplay, event dependencies and localization regressions are retained. These do not constitute artistic scene calibration, device timing measurements, browser acceptance or child/user comprehension testing. The normal Node/Playwright runners are unavailable in this environment; JavaScriptCore runs are recorded separately when completed.


### Completed checks

All 79 merged regression cases passed in JavaScriptCore, including the incoming resource-change-log and emergency-cleaning tests. All 27 JavaScript modules parsed; JSON, bilingual catalog parity, browser-test syntax and diff whitespace checks passed. The generated atlas is a 1254 × 1254 image with an alpha channel. Full browser tests, real-device timing, and artistic calibration remain unexecuted. GitHub changes were merged rather than replaced; loader, model and catalog conflicts were resolved to retain both features. Browser back/forward recovery retains the committed visual explanation without replaying the work.


## Room-crew correction

The actual existing crew layers now animate in the room: asynchronous breathing/weight shifts for both seated actors and a grounded lean in response to accepted work. Their painted foot anchors remain fixed; no walking route is implied. The table layer is clipped to its foreground footprint so its baked-in crew artwork cannot cover the independently animated crew sprites. The generated character illustration has been removed from all feedback cards. When a panel is open, task motion is queued until it closes; choosing Skip completes feedback without replaying resources. Reduced motion disables the room transforms. This replaces the earlier clipboard-illustration behavior, while preserving the game transaction and EVA safety sequence.
