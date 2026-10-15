# The grenade reticle

The game’s line-up reticle, projected in frame pixels for a caller-supplied FOV.

## What the game draws

Taken from CS2 1.41.8.9 (`client.dll` of 2026-10-05) and its `csgo_crosshair.vfx` shader.
[`grenade-reticle.ts`](../src/grenade-reticle.ts) follows it step by step, and its test
pins the resulting pixels.

The client lists filled rectangles and label glyphs in whole frame pixels; the shader fills a
pixel when its integer position lies inside a rectangle's inclusive bounds. With `S` the screen
height over 1080, centre `(cx, cy)` half the frame rounded down, and every rounding a floor
unless named:

- **Lines.** One across the whole width and one down the whole height. Thickness is
  `max(1, round(2·S))` pixels, `S` floored first when it is 1 or more: two pixels at 1080, on the
  pixel before the centre and the pixel after.
- **Ticks.** The view direction is turned in 10° steps about the camera's own up axis (ticks along
  the horizontal line) and its own right axis (ticks along the vertical line), each direction is
  projected to the screen, and the tick is drawn at the floored pixel. The far side is the mirror
  about the centre. Ticks therefore sit on the scene: tick `n` lies `tan(10n°)` focal lengths out,
  and the focal length is `(2/3)·height / tan(fov/2)`, 720 px at 1080 and FOV 90.
- **How many.** Along the horizontal line as many as the view holds: five each way in 16:9, four in
  4:3. Along the vertical line `floor(half the 4:3 FOV / 10)`, four, of which the outer pair is off
  a 16:9 frame. Only ticks one to five have a label.
- **Tick length.** Ten pixels each way for the first, then `floor(previous × 1.1)`: 10, 11, 12,
  13, 14. This does not scale with the screen. 1.1 is `cl_grenadecrosshair_tickscaling`, a
  development-only variable.
- **Labels.** `floor(20·S)` high and `floor(height × 1.28)` wide, 25 by 20 at 1080. Under a
  horizontal tick: centred on it, two pixels below its end. Beside a vertical tick: two pixels
  right of its end, centred on it. Left and up are negative (`-1x`, `-1y`). The game samples one 64 by
  50 px cell of its numeral texture, averaged over 3×3 taps per pixel. This package keeps the
  same boxes and cell indices but replaces that Valve asset with original 3×5 pixel lettering
  (`reticleLabelRects`). Letter shapes therefore differ. No texture or font ships. Callers can
  supply their own lettering or omit labels.
- **Colour.** The player's crosshair colour, `cl_crosshaircolor_r/g/b/a`; the defaults are pure
  green, opaque. Renderers accept a colour and opacity.

In the game the reticle fades in over 0.2 s once the pin has been pulled for the grenade's
`cl_grenadecrosshairdelay_*`, and the plain crosshair stays beside it unless
`cl_grenadecrosshair_keepusercrosshair` is off. This package only computes the drawing; timing and compositing are up to the caller.

## After a game update

The reticle is part of the game client, and Valve can change it. To check: find the function in
`client.dll` that reads the `cl_grenadecrosshair_tickscaling` and `cl_grenadecrosshair_ticklabels`
variables; it holds the constants above (10°, tick length 10, 20, 1.28, the label offsets of 2).
The shader is `shaders/vfx/csgo_crosshair_*_ps.vcs` in `shaders_vulkan_dir.vpk`; its SPIR-V is
zstd-compressed with a dictionary that ships in `materialsystem2.dll`. A screenshot of the game at
1920×1080 with a grenade's pin pulled must match the tick pixels in
[`grenade-reticle.test.ts`](../test/grenade-reticle.test.ts).
