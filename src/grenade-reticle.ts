/** CS2's grenade line-up reticle, as the game draws it.
 *
 * Ported from the game client (CS2 1.41.8.9, client.dll of 2026-10-05): the routine that reads
 * `cl_grenadecrosshair_tickscaling` and `cl_grenadecrosshair_ticklabels`, and the
 * `csgo_crosshair.vfx` pixel shader that fills what it lists. The game works in whole frame pixels:
 * it lists filled rectangles and label glyphs, each with inclusive pixel bounds, and the shader
 * fills a pixel when its integer position lies inside. Here a rectangle is `x, y, width, height`
 * in the same pixels, so drawn into a frame of the same size it covers the same pixels.
 *
 * A tick is not a fixed distance from the crosshair. The game turns the view direction in ten
 * degree steps about the camera's own up and right axes and projects each direction to the screen,
 * so ticks sit on the scene: at another FOV, or in a 4:3 frame, they land where those directions
 * land. See ../docs/grenade-reticle.md.
 */

export type ReticleRect = { x: number; y: number; width: number; height: number };
/** A label box and its text. Column/row identify the original game atlas cell; no atlas ships. */
export type ReticleGlyph = ReticleRect & { column: number; row: number; text: string };
export type GrenadeReticle = { rects: ReticleRect[]; glyphs: ReticleGlyph[] };

/** The atlas (materials/dev/grenade_crosshair_numerals) is 256 px square; the shader reads cells of
 * 64 by 50 px: four columns (-x, x, -y, y) and five rows, 5 at the top down to 1. */
export const GLYPH_ATLAS = { size: 256, cellWidth: 64, cellHeight: 50, columns: 4, rows: 5 };
/** `cl_crosshaircolor_r/g/b/a` defaults: the reticle takes the player's crosshair colour. */
export const RETICLE_COLOR = '#00ff00';
/** `cl_grenadecrosshair_tickscaling`, a development-only variable: every player has the default. */
const TICK_SCALING = Math.fround(1.1);
const TICK_DEGREES = 10;
/** The game computes in single precision; a floor right at a whole number depends on it. */
const f = Math.fround;
const radians = Math.PI / 180;

/** Pixels per unit tangent. Source's FOV is horizontal for a 4:3 frame and wider frames add to the
 * sides, so the focal length follows the frame's height alone. */
export const reticleFocal = (height: number, fov: number) =>
	((2 / 3) * height) / Math.tan((fov * radians) / 2);

export function grenadeReticle(input: {
	/** The frame the game renders: 1920x1080, or 1440x1080 for a 4:3 picture. */
	width: number;
	height: number;
	/** The player's FOV, 90 unless the view is zoomed. */
	fov?: number;
	labels?: boolean;
}): GrenadeReticle {
	const { width, height, fov = 90, labels = true } = input;
	if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0)
		throw new RangeError('Frame dimensions must be positive safe integers');
	if (!Number.isFinite(fov) || fov <= 0 || fov >= 180)
		throw new RangeError('FOV must be between 0 and 180 degrees');
	const rects: ReticleRect[] = [];
	const glyphs: ReticleGlyph[] = [];
	/** The game's rectangle: x1 and y1 are one past the last pixel. */
	const rect = (x0: number, y0: number, x1: number, y1: number) =>
		rects.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
	const glyph = (x: number, y: number, index: number) => {
		if (index < 0) return;
		const column = index % GLYPH_ATLAS.columns;
		const row = Math.floor(index / GLYPH_ATLAS.columns);
		const value = GLYPH_ATLAS.rows - row;
		glyphs.push({
			x,
			y,
			width: labelWidth,
			height: labelHeight,
			column,
			row,
			text: `${column % 2 ? '' : '-'}${value}${column < 2 ? 'x' : 'y'}`
		});
	};
	/** Row for the tick's number, column for its side and axis; ticks past five have no label. */
	const cell = (tick: number, column: number) =>
		tick <= GLYPH_ATLAS.rows ? (GLYPH_ATLAS.rows - tick) * GLYPH_ATLAS.columns + column : -1;

	const cx = Math.floor(f(width * 0.5));
	const cy = Math.floor(f(height * 0.5));
	// The HUD's scale: sizes are authored for a 1080 px high screen.
	const scale = f(height / 1080);
	const labelHeight = Math.floor(f(scale * 20));
	const labelWidth = Math.floor(f(f(labelHeight) * f(1.28)));
	// Lines are two scaled pixels thick and never thinner than one; cvtss2si rounds half to even.
	const whole = scale >= 1 ? Math.floor(scale) : scale;
	const thickness = Math.max(1, roundHalfEven(f(whole + whole)));
	const before = Math.trunc((thickness + 1) / 2);
	const after = thickness - before;

	rect(0, cy - before, cx + cx, cy + after);
	rect(cx - before, 0, cx + after, cy + cy);

	const focal = reticleFocal(height, fov);
	const aspect = width / height / (4 / 3);
	const horizontalFov = (2 * Math.atan(Math.tan((fov * radians) / 2) * aspect)) / radians;
	/** Where the direction `tick` steps from the view lands, measured from the frame's edge. */
	const projected = (half: number, tick: number) =>
		Math.floor(f(half - focal * Math.tan(tick * TICK_DEGREES * radians)));

	// Ticks along the horizontal line: the view turned left, then mirrored to the right.
	let length = 10;
	const across = Math.floor(f((horizontalFov * 0.5) / TICK_DEGREES));
	for (let tick = 1; tick <= across; tick++) {
		const left = projected(width / 2, tick);
		for (const [x, column] of [
			[left, 0],
			[cx - left + cx, 1]
		]) {
			rect(x - before, cy - length, x + after, cy + length);
			if (labels)
				glyph(
					Math.floor((x - before + (x + after) - labelWidth) * 0.5),
					cy + length + 2,
					cell(tick, column)
				);
		}
		length = Math.floor(f(length * TICK_SCALING));
	}

	// Ticks along the vertical line: the view turned up, then mirrored below. Their count follows
	// the 4:3 FOV, so the outermost ones can lie off the frame.
	length = 10;
	const along = Math.floor(f((fov * 0.5) / TICK_DEGREES));
	for (let tick = 1; tick <= along; tick++) {
		const up = projected(height / 2, tick);
		for (const [y, column] of [
			[up, 2],
			[cy - up + cy, 3]
		]) {
			rect(cx - length, y - before, cx + length, y + after);
			if (labels)
				glyph(
					cx + length + 2,
					Math.floor((y - before + (y + after) - labelHeight) * 0.5),
					cell(tick, column)
				);
		}
		length = Math.floor(f(length * TICK_SCALING));
	}
	return { rects, glyphs };
}

function roundHalfEven(value: number) {
	const floor = Math.floor(value);
	const rest = value - floor;
	if (rest !== 0.5) return Math.round(value);
	return floor % 2 ? floor + 1 : floor;
}
