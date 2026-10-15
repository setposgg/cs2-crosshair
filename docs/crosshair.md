# CS2 crosshair

An exact port of the game client’s share-code and drawing routines.

## What the game does

Taken from CS2 1.41.9.0 (`client.dll` of 2026-10-08), its `csgo_crosshair.vfx` shader and its
`weapons.vdata`. [`crosshair.ts`](../src/crosshair.ts) follows it step by step and its test
pins the pixels.

Counter-Strike rebuilt its crosshair on 2026-09-23 ("Crosshair / Scopes" in the settings) and
changed the share code on 2026-10-01. Everything below is that system; nothing of the old one
(`cl_crosshairsize`, sizes as fractions of a 480 px high screen) is left in it.

### Sizes are pixels at a screen height

`cl_crosshair_thickness`, `_length`, `_gap`, `_dynamic_spread_limit` and `_dynamic_splitdist` are
whole pixels, and `cl_crosshair_screen_height` records the screen height they were set at. On a
screen of another height the game scales each by the ratio of the heights and rounds it; a size
that was set never rounds away (at least 1, a negative gap at most -1). The screen's width plays
no part.

So a crosshair is the same share of the picture's height everywhere, and in whole pixels
everywhere. Played 4:3 stretched, it is the same crosshair in a 1440×1080 frame shown 4/3 wider:
wider than tall, its upright bars thicker than its level ones.

### The share code

`CS` and 44 characters, no dashes, in the alphabet of the old codes (no `0`, `1`, `I`, `O`, `g`,
`l`). The 44 characters are one 32-byte number in base 57, lowest digit first; its bytes, highest
first:

| Byte  | Holds                                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0     | Sum of bytes 1 to 31                                                                                                                                               |
| 1     | Version, 1                                                                                                                                                         |
| 2–3   | `cl_crosshair_screen_height`, low byte first                                                                                                                       |
| 4     | Style in the low five bits, then `cl_crosshair_recoil`, `cl_crosshairdot`, `cl_crosshair_t`                                                                        |
| 5–8   | `cl_crosshaircolor_r`, `_g`, `_b`, `_a`                                                                                                                            |
| 9–12  | `cl_crosshairoutline_r`, `_g`, `_b`, `_a`                                                                                                                          |
| 13    | Thickness in the low six bits, `cl_crosshair_drawoutline` in the high two                                                                                          |
| 14–15 | Gap, signed, low byte first                                                                                                                                        |
| 16    | Length                                                                                                                                                             |
| 17    | Dynamic spread limit                                                                                                                                               |
| 18–21 | Low byte first, seven bits each: split distance, inner split alpha ×100, outer split alpha ×100 − 30, split ratio ×100; bit 28 is `cl_ironsight_usecrosshaircolor` |
| 22    | `cl_ironsight_dot_scale` ×100 − 10                                                                                                                                 |
| 23–31 | Nothing                                                                                                                                                            |

There is no colour number any more: a colour is its red, green and blue. The game refuses a code
whose sum or version is wrong, and every old `CSGO-XXXXX-…` code with "Invalid or old crosshair
code". (It converts the codes of its own eight days between the two updates; this package treats
those as old.)

### What is drawn

The client lists shapes for the shader, at most 64: rectangles with whole-pixel bounds, rings, and
rings cut into four arcs. With `(cx, cy)` half the frame, rounded down:

- **A line `t` pixels thick about the centre** covers `ceil(t/2)` pixels before it and
  `floor(t/2)` after: two pixels are the one before the centre and the one after; an odd
  thickness has its middle on the pixel before the centre, and the bars close in by one pixel on
  the far side to stay level with it.
- **Cross** (bars of `length` at `gap` from the centre): the styles Static Cross (4), Dynamic
  Quadrant (7), Dynamic Cross Classic (2) and the legacy style (5). `cl_crosshair_t` leaves the
  top bar out.
- **Ring**: outer radius `gap + thickness` (a gap under 1 counts as 1), `thickness − 1` wide and
  never under 1, its edges softened over a pixel. Static Circle (3).
- **Square**: four bars round a square hole of `2 × gap`. Static Square (8).
- **Arcs**: a ring of `thickness` whose four quarters are each filled over
  `cl_crosshair_dynamic_maxdist_splitratio` of their 90°, about the diagonals. Static Quadrant (9).
- **Dot**: a square of `thickness`, drawn with any style when `cl_crosshairdot` is on, and alone
  as Dot Only (6).
- **Outline**: one pixel all round, or only above and to the left ("Half Outline"), in its own
  colour. All outlines lie under all fills, so one bar's outline never crosses another bar.

### Dynamic styles with a grenade in hand

The new dynamic styles (Dynamic Cross 0, Dynamic Circle 1, Dynamic Quadrant 7) show the held
weapon's real inaccuracy and spread. Every grenade has zero for all of them in `weapons.vdata`,
standing, running or in the air. So with a grenade a Dynamic Cross is closed up (its own gap is
not used at all; with the dot on it leaves room for the dot), a Dynamic Circle is its line at
the centre, and a Dynamic Quadrant is its plain cross with nothing round it. The game's settings
preview shows the same. Only the classic dynamic style still moves with a grenade: it opens when
the player jumps or runs and closes when they duck. This package draws it standing still.

### The grenade reticle

The line-up reticle (see [the grenade reticle](grenade-reticle.md)) takes the crosshair's colour
and opacity and nothing else of it. While it shows, the crosshair stays beside it unless
`cl_grenadecrosshair_keepusercrosshair` ("Keep Regular Crosshair") is off, which is not in the
share code; on by default.

## After a game update

The share code reader is the function behind the `apply_crosshair_code` command in `client.dll`;
the function it calls holds the byte layout above. The shapes are listed by the function that
reads `cl_crosshairstyle` into a `switch` of ten cases, next to the one that writes
`CrosshairParamBuffer_t`; each case is a few lines. The shader is
`shaders/vfx/csgo_crosshair_*_ps.vcs` in `shaders_vulkan_dir.vpk`. A code copied from the game
after the update must still read ([the tests](../test/crosshair.test.ts) hold seven), and a 1920×1080 screenshot
of a static cross must match the pixels pinned in that test.
