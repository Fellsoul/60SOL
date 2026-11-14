# Crew injury artwork

Reserved full-canvas transparent PNGs:

- `astronaut_a/injured.png` — right seated astronaut.
- `astronaut_b/injured.png` — left seated astronaut.

Match each existing `seated.png` canvas (1672 × 940), origin, scale and seated position. These files replace the seated character image rather than adding an extra character.

While shared crew health is below 100, both present crew use the `injured` image state. An away astronaut stays hidden. At health 100, normal or fatigued appearance resumes. Until injury artwork is supplied, the existing seated image is used as a fallback.
