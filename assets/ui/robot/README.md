# Robot toolbar icons

- `ready.png`: operational robot icon.
- `damaged.png`: damaged robot icon (standard state spelling: `damaged`).

Supply transparent PNG icons here. They fit the existing tool indicator; these are cropped icons, not full-screen scene images. Until supplied, the existing robot SVG is used, with a red damaged-state border and background.

The full-screen robot layer uses separate images at `assets/scene/tools/robot/ready.png` and `assets/scene/tools/robot/damaged.png`. Keep those the same full canvas and origin as the outpost, transparent elsewhere.

Every successful collection immediately sets the robot to `damaged`. Repair on the clipboard costs one spare and one daily work assignment, zero energy, and no toolkit. The existing one-trip-per-Sol limit remains after repair.
