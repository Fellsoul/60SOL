# New-game launch intro

Edit the three strings in `intro.json` → `lines` to customize the introduction.
Text is displayed literally, so it can contain punctuation or any language.
The first two entries wrap normally. The third is a single-row slogan with a
responsive font size, calculated from the full text before typing begins.

The entire launch scene starts after difficulty and equipment selection are
confirmed and the selection panel has closed. The rocket and camera GIFs,
background scroll, and text start together. The first two text lines type,
hold, and fade. The third line stays visible for its reading time, then enlarges
into a white frame, fades to black, and hands off to the `SOL 1` title.

`SKIP INTRO` bypasses the remaining introduction and slogan enlargement.

`scrollMs` controls the bottom-to-top background scroll. At the top, the starfield
continues drifting and the rocket keeps launching until the text finishes.
`typingCharMs` sets the base time per character (100 ms by default); increase it
to slow typing down. `typingVariation` sets the proportional speed variation
(0.35 means ±35%). `typingPauseChance` is the probability of an extra pause
between words; `typingPauseMs` sets the pause duration before random variation.
`lineHoldMs` and `lineFadeMs` control the first two completed lines' hold and fade
times. The third line holds until its reading time and the background scroll
finish. `sloganZoomMs` and `whiteToBlackMs` control the ending zoom and
white-to-black transition.
Typing speed is independent of line length, so longer lines take longer to type.
Reduced motion disables scrolling, drifting, bobbing, typing, fades, and the
slogan zoom, preserving each line's configured reading time.
