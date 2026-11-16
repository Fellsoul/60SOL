# Ending backgrounds

Place the supplied full-scene images here. The current images are 2752 × 1536 and are scaled to the ending viewport:

| File | Ending |
| --- | --- |
| `TGE.png` | Crew survives and at least 60 research data have reached Earth. |
| `GE.png` | Crew survives, but fewer than 60 data have reached Earth. |
| `GEQ.jpg` | Crew fails after at least 60 data have reached Earth, including early failure. |
| `BE.jpg` | All crew are unconscious or shared health reaches zero before 60 data reach Earth. |

These images replace the entire outpost scene; crew, weather, furniture, tools and clipboard layers are hidden. Missing images leave a black background. No placeholder illustration is generated.

`GE` and `TGE` use lossless PNG after local NASA-logo removal, preserving decoded pixels outside the repair masks. Paths are configured in `data/scene_layout.json`.

The localized “THE END / 完结” title remains until the player clicks or presses Enter/Space. The terminal then shows the saved journal from the first Sol to the last. Closing the terminal reveals the ending image again; the terminal can be reopened.
