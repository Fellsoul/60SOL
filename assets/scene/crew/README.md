# Crew injury artwork

Reserved full-canvas transparent PNGs:

- `astronaut_a/injured.png` — right seated astronaut.
- `astronaut_b/injured.png` — left seated astronaut.

Match each existing `seated.png` canvas (1672 × 940), origin, scale and seated position. These files replace the seated character image rather than adding an extra character.

Appearance priority: away (hidden) → unconscious (`sleep.png`) → fatigued (`tired.png`) → injured (`injured.png`, health below 100) → normal (`seated.png`). Each astronaut uses the file in their own folder. All files share the full 1672 × 940 transparent canvas. Fatigue uses the supplied artwork without a darkening/desaturation filter; unconscious characters do not play idle or reaction animations. Until injury artwork is supplied, the existing seated image is used as a fallback for injury only.
