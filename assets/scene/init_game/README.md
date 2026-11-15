# New-game launch intro

Edit the three strings in `intro.json` → `lines` to customize the introduction.
Text is displayed literally, so it can contain punctuation or any language.
The first two entries wrap normally. The third is a single-row slogan with a
responsive font size, calculated from the full text before typing begins.

The entire launch scene starts after difficulty and equipment selection are
confirmed and the selection panel has closed. The rocket and camera GIFs, the
background scroll, and the text start together. Each line types at a natural,
skilled pace, with small speed variations, brief punctuation pauses, and
occasional pauses between words. The completed line stays fully visible for
3 seconds, then fades before the next line. `SKIP INTRO` is available throughout
the scene. SOL 001 waits for both the text and the background scroll, unless
the player skips.

`scrollMs` controls the bottom-to-top background scroll. At the top, the starfield
continues drifting and the rocket keeps launching until the text finishes.
`typingCharMs` sets the base time per character (100 ms by default); increase it
to slow typing down. `typingVariation` sets the proportional speed variation
(0.35 means ±35%). `typingPauseChance` is the probability of an extra pause
between words; `typingPauseMs` sets the pause duration before random variation.
`lineHoldMs` and `lineFadeMs` control the completed line's hold and fade times.
Typing speed is independent of line length, so longer lines take longer to type.
Reduced motion disables the scroll, drift, bobbing, typing, and fades while
preserving the three-second reading time for each line.
