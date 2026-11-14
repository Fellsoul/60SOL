# Daily CDS events

The game now presents one playable CDS-derived event every Sol. Daily cases take priority over the original tutorial, weighted filler and weather cards; weather still changes the room and constrains outside work. Old cards remain to support existing saves and the legacy regression scenarios.

| Sol | Preferred family |
| --- | --- |
| 1 | E01 Three Knocks |
| 2 | E20 The Fading Panels |
| 3 | E04 The Thirsty Greenhouse |
| 4 | E07 The Longer Warm Up |
| 5 | E14 An Empty Chair |
| 6 | E15 The Unlabelled Samples |
| 7 | E12 Outdated Advice |
| 8 | E02 Clicking Solar Panel |
| 9 | E08 The Whistling Vent |
| 10 | E17 A Spill in the Wrong Place |
| 11 | E19 The Shelter Decision |
| 12 | E11 Your Experiment Is Dinner, if a batch has progress 2 |
| 13 | E09 The Sluggish Watering System |
| 14 | E16 The Last Day Shortcut, if at least 12 local data exist |

If prerequisites fail, use another affordable eligible daily case, preferring an unused case. E14 is reusable planning/observation fallback; the game never inserts an empty staged card. Every enabled case has a no-energy response, with an explicit lost opportunity or operating restriction. E19's no-energy shelter response uses the day's work. Declining an opportunity or accepting a restriction resolves that day's decision; it does not imply repairing the underlying equipment.

Every morning resets `eventDone` to false. Confirming a valid, affordable response applies costs and effects once, saves the choice and sets `eventDone` true. A response that uses work is completed from the clipboard. Other responses remain in the terminal. The selected result is visible in the terminal. Independent work may be completed before the event response; it leaves the event pending and consumes the same one daily work slot. The chosen event response cannot grant a second slot. Every response, including no-tool/no-work alternatives, is offered on the clipboard. Only concrete dependencies block affected work: greenhouse sensor/line/batch decisions block crop care, laboratory faults/guidance/spills block experiments, the failed final-day antenna blocks transmission, and the radiation emergency requires shelter before all work. Other facilities remain usable. Related panel cleaning/repair resolves its matching event response at that response’s real cost. Work still consumes at most one work slot per Sol. The terminal is the only place to end the day, and both its button and `GameModel.nextSol()` reject unresolved events. Closing either dialog, switching lights or using a battery does not resolve an event. Saved pending events remain pending; old saves without the new flag infer completion from their valid recorded choice.

Implemented effects include repair-spare inventory, crew condition costs/recovery, food/research rewards, crop reset, manual-care cost, reduced harvest, panel generation limits, extra ventilation demand, dated laboratory availability, greenhouse sacrifice and final-day transmission. Existing work obeys these facility and cost restrictions. Effects affecting morning generation/support apply at the next morning calculation. Food/research rewards settle on confirmation and remain available for that day's settlement, rather than using a delayed queue. Reopening or reloading does not charge them again.

## Deliberate differences from CDS revision 2.2

This is a deterministic daily adaptation, not a claim to implement the entire CDS. The user's daily-event request replaces F3's sparse incident slots and technical-start budget. The engine's current 12-E capacity is retained. Combined inspection/response uses one work slot and the listed 3-E cost; the CDS's separate diagnosis/repair days are not implemented. R/M outcome sampling, independent keyed escalation, facility ownership by fault and the full delayed transaction queue remain unimplemented. Split-batch research uses the fixed 6-D outcome; unsupported risky branches are omitted rather than silently simulated. Restrictions are implemented as shared facility settings, so a later authored restoration can restore that facility. E19's low-condition fallback loses up to 2 existing local data; it does not accrue a future research debt. NASA context remains in the preserved source metadata; no radiation-to-health conversion is applied.

Fourteen families have executable daily choices; E03, E05, E06, E10, E13 and E18 remain staged. Original Appendix G contracts remain under `cds` for comparison. This report supersedes the earlier content-only report for these fourteen families only. Broader CDS conformance and balance/playtesting remain separate work.

## Verification

Logic checks cover all fourteen Sols, pending/resolved saves, one-time costs, low-resource fallbacks, facility restrictions, scheduled storms, final-day research settlement and a complete route reaching 60 transmitted data with positive crew condition. These and the legacy gameplay, localization, clipboard and controller regressions were exercised in JavaScriptCore (53 cases); JavaScript modules, JSON/localization references and Python smoke-test syntax were checked. Node/npm and Playwright are unavailable here, so the normal Node runner and full browser smoke test have not run. The browser suite includes a separate daily-event playthrough; this is not a claim of browser or balance validation.
