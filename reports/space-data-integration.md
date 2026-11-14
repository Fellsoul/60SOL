# Space-data integration — CDS revision 1.0

## Included behavior

A mission now freezes a validated, checksummed snapshot at creation. New-game loadout offers Current snapshot (with fallback) and two historical teaching cases. Fetching starts before the menu is shown and has a three-second total deadline. A failed/invalid/stale response uses a recent valid current cache, then a bundled historical replay. Existing missions keep their original snapshot, source timestamps, rule version and seed through reloads and animation changes. Old saves without data snapshots retain their original rules.

The terminal and clipboard expose keyboard-accessible evidence details before and after a decision. Each card separates source analysis/calculation/reported measurement from the explicitly labelled simulation and deterministic outcomes. It shows organization, dataset, source time, target, units, retrieval time, source record IDs, raw SHA-256 checksums and the mission checksum. Unknown equipment causes are not used to build evidence cards. The current daily-event prototype remains deterministic; this change does not claim to implement the event CDS's deferred independent stochastic fault progression.

Data changes gameplay:

- **Space-weather analysis:** the impact case pauses crew EVA on authored Sols 3 and 8; the glancing-blow comparison adds 1 E to crew EVA instead. Indoor work remains independent. Emergency cleaning cannot bypass a snapshot radiation restriction. These dates, tiers and costs are fictional mapping rules, not source forecasts for a habitat.
- **Earth–Mars light time:** the retained JPL calculation supplies a one-way value of 15.84235931 minutes. The simulation compresses guidance turnaround using `ceil(2 × one-way minutes / 30)`, bounded to 1–2 Sols. E12's wait option actually locks the lab until that due Sol; unrelated work remains usable. This includes scheduling and is not a claim that radio signals need days.
- **Environment:** the reported daily maximum of −30 °C selects the authored cold band. On Sols 4 and 9 it adds 1 E to morning support when the lab is open. Closing the laboratory avoids its future heating load. Existing morning-payment and deficit rules stay authoritative; closing it later does not refund a paid morning.

Decisions retain snapshot ID, rule version, bands, response, actual E cost and deterministic result in `spaceTrace`. The existing resource log records actual numerical changes. Final reports offer the second historical case as a separate mission with the same initial resources, tools and seed, preserving the original save.

## Verified source contracts and historical records

### NASA CCMC DONKI

- Official documentation: https://ccmc.gsfc.nasa.gov/tools/DONKI/ and https://ccmc.gsfc.nasa.gov/news/major-updates/
- Verified public endpoint: `https://ccmc.gsfc.nasa.gov/DONKI-API/get/notifications?startDate=2024-05-17&endDate=2024-05-18&type=all`.
- Retained fields: `messageType`, `messageID`, `messageURL`, `messageIssueTime`, `messageBody`. Only the retained subset is checksummed. Inputs are research-quality CME notifications, not measured radiation dose.
- Historical impact analysis: `20240517-AL-004`, issued 2024-05-17 18:22 UTC, https://ccmc.gsfc.nasa.gov/DONKI/view/Alert/30984/1 . Its text explicitly identifies possible Mars impact; the analysis discusses a possible arrival on May 20.
- Historical glancing analysis: `20240518-AL-003`, issued 2024-05-18 20:45 UTC, https://ccmc.gsfc.nasa.gov/DONKI/view/Alert/31016/1 . It explicitly describes a possible glancing blow at Mars.
- Adapter requires a Mars impact/reach statement, not merely the phrase “Moon to Mars” in an office name. It rejects generic solar records and wrong targets. Current/cached admission requires a source age no greater than 72 hours.

### JPL Horizons

- Official API contract: https://ssd-api.jpl.nasa.gov/doc/horizons.html ; quantity/unit reference: https://ssd.jpl.nasa.gov/horizons/manual.html .
- Verified request: observer ephemeris, target `499`, centre `500@399`, date 2024-05-20 UTC, quantity `21`, CSV output. The exact API result and signature are retained in the replay pack.
- Parser verifies Mars target, Earth geocentre, the `1-way_down_LT` column and its MINUTES definition before using the first ephemeris row. Value: 15.84235931 minutes at 2024-05-20 00:00 UTC. It is a computed down-leg light time, not network availability or a separate measured uplink time.
- Accepted prototype range: 2–30 minutes. Current/cached admission requires the computation epoch within 36 hours; the source epoch is never replaced by the retrieval date.

### REMS reported environmental measurement

- Verified source: NASA mission blog “Sol 2477: Records measured in degrees,” published July 25, 2019: https://science.nasa.gov/blog/sol-2477-records-measured-in-degrees/ .
- It reports a REMS daily maximum air temperature of −30 °C. A minimal curated JSON receipt retains the value, °C unit, mission Sol, target, source URL, report date and a short excerpt. This is transparently labelled a **mission report of a measurement**, not direct ingestion of raw REMS archive telemetry.
- The exact observation UTC is not supplied. The receipt uses a day-precision report-date proxy, explicitly flagged in metadata and displayed as “report date; observation UTC unspecified,” not an invented second-precision observation time.
- Adapter range: −150 to +50 °C; strict °C and Gale-crater target. It cannot forecast the fictional outpost. Current/cached admission requires a report within 30 days. The retained 2019 case therefore always remains historical.

## Historical case boundaries

The teaching collections combine separately dated source cases: May 2024 space-weather analysis and geometry, plus a July 2019 reported environmental value. They are expressly labelled a curated collection, **not one contemporaneous mission-day forecast**. Every source date remains visible. The two cases differ in the actual Mars analysis; their initial outpost resources, tools and seed match. Neither case is labelled live or current.

The legacy REMS weather URL tested during implementation returned an HTML page rather than the expected JSON. It was not treated as zero temperature or silently relabelled current. This release has working historical environmental input; a current environmental upstream sample still needs validation before a real current-condition demonstration can be claimed.

## Acquisition and deployment

The browser only requests `/api/space-data` on its own origin; it accepts JSON with at most 128 KiB and no redirects, under a three-second deadline. Source links are restricted to the verified HTTPS source hosts. Source text is escaped. No keys, player identity or location are sent to public APIs by the client.

`python3 tools/serve_space_data.py` serves the game locally and returns a clean 503 for unavailable current input. To provide reviewed current input, use `--current-file /path/to/approved-raw-pack.json`. The exact pack schema is `{donki, horizons, rems}` using the three adapter contracts above; the historical cases in `data/space_data.json` show its structure. Historical files will fail current freshness checks and correctly fall back. This local gateway is not an automatic live-data harvester or production deployment. Source refresh and any service credentials belong behind a controlled service; no unverified API field guesses were added to the browser.

Checksums identify retained content and detect accidental alteration; they are not a cryptographic signature proving NASA authorship. The controlled service and source review establish provenance. Changing an upstream payload or cache cannot update an already active mission.

## Verification and remaining acceptance

All 32 JavaScript modules passed parsing and all 83 regression checks passed through a JavaScriptCore harness. Node and a browser runner were unavailable in this environment, so this is not a claim of an executed browser test pass. Python server/browser-test syntax, JSON files and `git diff --check` also passed.

Tests exercise known SHA-256 vectors, source parsing, units/ranges/UTC, generic-solar rejection, frozen snapshots and tampering, actual EVA/heating/guidance effects, timeout/cache/history fallback, response type/size limits and comparable historical starts. Current-transport tests use explicitly synthetic recent timestamps, not purported new NASA observations. Browser-test syntax and source JSON are checked separately.

The CDS's full current-source G1 sample approval, end-to-end live deployment, visual/browser accessibility testing, independent scientific review and user-comprehension tests remain outstanding. Terrain and image-target integrations are deferred as the CDS requests. No NASA sponsorship, medical exposure model or prediction of an exact randomized game consequence is claimed.
