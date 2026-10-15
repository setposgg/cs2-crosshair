/** A player's own CS2 crosshair, read from its share code and laid out as the game draws it.
 *
 * Ported from the game client (CS2 1.41.9.0, client.dll of 2026-10-08): the share code reader and
 * writer, the routine that fits a crosshair to the screen's height, and the routines that list
 * what each style draws for the `csgo_crosshair.vfx` pixel shader. Counter-Strike rebuilt its
 * crosshair on 2026-09-23 and changed the code's format on 2026-10-01; codes from before that are
 * refused by the game and here. See ../docs/crosshair.md.
 *
 * The game works in whole frame pixels. A rectangle here is `x, y, width, height` in those pixels,
 * so drawn into a frame of the same size it covers the same pixels as in the game.
 */

export type Rgba = [red: number, green: number, blue: number, alpha: number];

/** `cl_crosshairstyle`, in the game's numbering. */
export const CROSSHAIR_STYLES = [
	'dynamic-cross',
	'dynamic-circle',
	'classic-dynamic',
	'static-circle',
	'static-cross',
	'legacy',
	'dot',
	'dynamic-quad',
	'static-square',
	'static-quad'
] as const;

export type Crosshair = {
	/** `cl_crosshair_screen_height`: the screen height the sizes below were set at. */
	screenHeight: number;
	/** `cl_crosshairstyle`, 0 to 9. */
	style: number;
	/** `cl_crosshair_recoil`. Carried by the code; a grenade has no recoil to follow. */
	followRecoil: boolean;
	/** `cl_crosshairdot`. */
	dot: boolean;
	/** `cl_crosshair_t`: no top bar. */
	tStyle: boolean;
	/** `cl_crosshair_drawoutline`: 0 none, 1 all round, 2 top and left only. */
	outline: 0 | 1 | 2;
	/** `cl_crosshair_gap`, `_thickness`, `_length`, `_dynamic_spread_limit`: pixels at `screenHeight`. */
	gap: number;
	thickness: number;
	length: number;
	spreadLimit: number;
	/** `cl_crosshaircolor_r/g/b/a` and `cl_crosshairoutline_r/g/b/a`, 0 to 255. */
	color: Rgba;
	outlineColor: Rgba;
	/** `cl_crosshair_dynamic_splitdist`, `_splitalpha_innermod`, `_splitalpha_outermod`. */
	splitDistance: number;
	innerSplitAlpha: number;
	outerSplitAlpha: number;
	/** `cl_crosshair_dynamic_maxdist_splitratio`; the share of each quarter a Static Quad fills. */
	splitRatio: number;
	/** `cl_ironsight_usecrosshaircolor` and `cl_ironsight_dot_scale`: the scope dot, kept for the code. */
	scopeUsesColor: boolean;
	scopeDotScale: number;
};

/** The game's defaults: Dynamic Quad in green, outlined. */
export const DEFAULT_CROSSHAIR: Crosshair = {
	screenHeight: 1080,
	style: 7,
	followRecoil: true,
	dot: false,
	tStyle: false,
	outline: 1,
	gap: 4,
	thickness: 2,
	length: 8,
	spreadLimit: 255,
	color: [0, 255, 0, 255],
	outlineColor: [0, 0, 0, 255],
	splitDistance: 0,
	innerSplitAlpha: 1,
	outerSplitAlpha: 1,
	splitRatio: 1,
	scopeUsesColor: false,
	scopeDotScale: 1
};

/** The site's own crosshair, on every lineup video without a visitor's: a Classic Static cross in
 * white with a black outline. Drawn by the same rules as a visitor's, it takes the picture's
 * pixels and grows with its zoom the same way. */
export const SITE_CROSSHAIR: Crosshair = {
	...DEFAULT_CROSSHAIR,
	style: 4,
	followRecoil: false,
	gap: 3,
	thickness: 2,
	length: 14,
	color: [255, 255, 255, 255]
};

/** The share code alphabet: no 0, 1, I, O, g or l. */
const ALPHABET = 'ABCDEFGHJKLMNOPQRSTUVWXYZabcdefhijkmnopqrstuvwxyz23456789';
const PREFIX = 'CS';
const DIGITS = 44;
const BYTES = 32;
const VERSION = 1;

/** The game computes in single precision. */
const f = Math.fround;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
/** The engine's `V_roundf`: halves away from zero. */
const round = (value: number) => Math.sign(value) * Math.floor(Math.abs(value) + 0.5);

const checksum = (bytes: Uint8Array) => {
	let sum = 0;
	for (let index = 1; index < BYTES; index++) sum = (sum + bytes[index]) & 0xff;
	return sum;
};

/** What a pasted text is: a code the game takes, one from before the 2026 rebuild, or neither. */
export function crosshairCodeKind(text: string): 'current' | 'old' | 'invalid' {
	const code = text.trim();
	if (decodeCrosshair(code)) return 'current';
	return /^CSGO(-[A-Za-z0-9]{5}){5}$/.test(code) ? 'old' : 'invalid';
}

/** The crosshair a share code holds, or null when the game would refuse the code. */
export function decodeCrosshair(text: string): Crosshair | null {
	const code = text.trim();
	if (code.length !== PREFIX.length + DIGITS || !code.startsWith(PREFIX)) return null;
	// A 32-byte number in base 57, its lowest digit first.
	let value = 0n;
	for (let index = code.length - 1; index >= PREFIX.length; index--) {
		const digit = ALPHABET.indexOf(code[index]);
		if (digit < 0) return null;
		value = value * 57n + BigInt(digit);
	}
	if (value >> BigInt(BYTES * 8)) return null;
	const bytes = new Uint8Array(BYTES);
	for (let index = BYTES - 1; index >= 0; index--) {
		bytes[index] = Number(value & 0xffn);
		value >>= 8n;
	}
	const authored = bytes[2] | (bytes[3] << 8);
	if (bytes[1] !== VERSION || authored === 0 || checksum(bytes) !== bytes[0]) return null;

	const packed = (bytes[18] | (bytes[19] << 8) | (bytes[20] << 16) | (bytes[21] << 24)) >>> 0;
	const gap = ((bytes[14] | (bytes[15] << 8)) << 16) >> 16;
	// The game clamps every field to its setting's range after reading it.
	return {
		screenHeight: Math.max(240, authored),
		style: Math.min(9, bytes[4] & 0x1f),
		followRecoil: (bytes[4] & 0x20) !== 0,
		dot: (bytes[4] & 0x40) !== 0,
		tStyle: (bytes[4] & 0x80) !== 0,
		outline: Math.min(2, bytes[13] >> 6) as 0 | 1 | 2,
		gap: clamp(gap, -3840, 3840),
		thickness: Math.min(32, bytes[13] & 0x3f),
		length: bytes[16],
		spreadLimit: bytes[17],
		color: [bytes[5], bytes[6], bytes[7], bytes[8]],
		outlineColor: [bytes[9], bytes[10], bytes[11], bytes[12]],
		splitDistance: packed & 0x7f,
		innerSplitAlpha: Math.min(100, (packed >>> 7) & 0x7f) / 100,
		outerSplitAlpha: Math.min(70, (packed >>> 14) & 0x7f) / 100 + 0.3,
		splitRatio: Math.min(100, (packed >>> 21) & 0x7f) / 100,
		scopeUsesColor: ((packed >>> 28) & 1) !== 0,
		scopeDotScale: Math.min(190, bytes[22]) / 100 + 0.1
	};
}

/** The share code the game writes for a crosshair. */
export function encodeCrosshair(crosshair: Crosshair): string {
	const bytes = new Uint8Array(BYTES);
	const byte = (value: number) => clamp(Math.round(value), 0, 255);
	const hundredths = (value: number, high: number) => clamp(Math.round(value * 100), 0, high);
	bytes[1] = VERSION;
	const height = clamp(Math.round(crosshair.screenHeight), 240, 0xffff);
	bytes[2] = height & 0xff;
	bytes[3] = height >> 8;
	bytes[4] =
		clamp(crosshair.style, 0, 9) |
		(crosshair.followRecoil ? 0x20 : 0) |
		(crosshair.dot ? 0x40 : 0) |
		(crosshair.tStyle ? 0x80 : 0);
	crosshair.color.forEach((channel, index) => (bytes[5 + index] = byte(channel)));
	crosshair.outlineColor.forEach((channel, index) => (bytes[9 + index] = byte(channel)));
	bytes[13] = clamp(Math.round(crosshair.thickness), 0, 32) | (crosshair.outline << 6);
	const gap = clamp(Math.round(crosshair.gap), -3840, 3840) & 0xffff;
	bytes[14] = gap & 0xff;
	bytes[15] = gap >> 8;
	bytes[16] = byte(crosshair.length);
	bytes[17] = byte(crosshair.spreadLimit);
	const packed =
		(clamp(Math.round(crosshair.splitDistance), 0, 127) |
			(hundredths(crosshair.innerSplitAlpha, 100) << 7) |
			(hundredths(crosshair.outerSplitAlpha - 0.3, 70) << 14) |
			(hundredths(crosshair.splitRatio, 100) << 21) |
			((crosshair.scopeUsesColor ? 1 : 0) << 28)) >>>
		0;
	for (let index = 0; index < 4; index++) bytes[18 + index] = (packed >>> (8 * index)) & 0xff;
	bytes[22] = hundredths(crosshair.scopeDotScale - 0.1, 190);
	bytes[0] = checksum(bytes);

	let value = 0n;
	for (const part of bytes) value = (value << 8n) | BigInt(part);
	let code = PREFIX;
	for (let index = 0; index < DIGITS; index++) {
		code += ALPHABET[Number(value % 57n)];
		value /= 57n;
	}
	return code;
}

/** The crosshair on a screen of another height. The game keeps a crosshair the same share of the
 * screen: every size is scaled by the heights' ratio and rounded, and none that was set shrinks
 * to nothing. Width plays no part, so a 4:3 picture has the same crosshair as a 16:9 one. */
export function fitCrosshair(crosshair: Crosshair, height: number): Crosshair {
	if (crosshair.screenHeight === height || crosshair.screenHeight <= 0)
		return { ...crosshair, screenHeight: height };
	const scale = f(height / crosshair.screenHeight);
	const size = (value: number) => (value > 0 ? Math.max(1, round(f(value * scale))) : value);
	const gap = round(f(scale * crosshair.gap));
	return {
		...crosshair,
		screenHeight: height,
		gap: crosshair.gap > 0 ? Math.max(1, gap) : crosshair.gap < 0 ? Math.min(-1, gap) : 0,
		thickness: size(crosshair.thickness),
		length: size(crosshair.length),
		spreadLimit: size(crosshair.spreadLimit),
		splitDistance: size(crosshair.splitDistance)
	};
}

/** How far a shape's outline reaches past it: before (left and above) and after (right and
 * below). A full outline is one pixel all round, a half outline one pixel before only. */
export type OutlineReach = [before: number, after: number];
export type CrosshairShape =
	| { kind: 'rect'; x: number; y: number; width: number; height: number }
	/** A ring between `outer - width` and `outer` from its centre. */
	| { kind: 'ring'; x: number; y: number; outer: number; width: number }
	/** Four pieces of such a ring, each `degrees` wide and centred on a diagonal. */
	| { kind: 'arcs'; x: number; y: number; outer: number; width: number; degrees: number };
export type CrosshairDrawing = {
	shapes: CrosshairShape[];
	color: Rgba;
	/** Fully transparent when the crosshair has no outline. */
	outlineColor: Rgba;
	outline: OutlineReach;
};

/** What the game draws for a crosshair in a frame of this size, with a grenade in hand and the
 * player standing still.
 *
 * Grenades have no inaccuracy and no spread in the game's weapon data, so the parts of a dynamic
 * style that show them are at zero: a Dynamic Cross closes up, a Dynamic Circle shrinks to its
 * line, a Dynamic Quad is its plain cross. That is also what the game's settings preview shows.
 * Only the classic dynamic style still moves with a grenade, when the player jumps, ducks or runs.
 */
export function crosshairDrawing(
	source: Crosshair,
	frame: { width: number; height: number }
): CrosshairDrawing {
	const crosshair = fitCrosshair(source, frame.height);
	const { thickness, length, style } = crosshair;
	const cx = Math.floor(f(frame.width * 0.5));
	const cy = Math.floor(f(frame.height * 0.5));
	const shapes: CrosshairShape[] = [];

	/** A line `size` pixels thick about the centre: the pixels before it and after it. An odd
	 * thickness has its middle on the pixel before the centre. */
	const halves = (size: number) => {
		const whole = Math.max(1, roundHalfEven(size));
		const before = Math.trunc((whole + 1) / 2);
		return { before, after: whole - before, even: before === whole - before };
	};
	/** The game's rectangle: x1 and y1 are one past the last pixel. */
	const rect = (x0: number, y0: number, x1: number, y1: number) => {
		if (x1 > x0 && y1 > y0)
			shapes.push({ kind: 'rect', x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
	};
	const dot = (size: number) => {
		if (size <= 0) return;
		const { before, after } = halves(size);
		rect(cx - before, cy - before, cx + after, cy + after);
	};
	const cross = (gap: number, barLength: number) => {
		if (barLength <= 0 || thickness <= 0) return;
		const open = Math.max(0, gap);
		const { before, after, even } = halves(thickness);
		// With an odd thickness the bars keep their distance from the middle pixel.
		const shift = even ? 0 : -1;
		const left = Math.floor(cx - open);
		const right = Math.ceil(cx + open) + shift;
		rect(left - barLength, cy - before, left, cy + after);
		rect(right, cy - before, right + barLength, cy + after);
		const top = Math.floor(cy - open - barLength);
		const bottom = Math.ceil(cy + open) + shift;
		if (!crosshair.tStyle) rect(cx - before, top, cx + after, top + barLength);
		rect(cx - before, bottom, cx + after, bottom + barLength);
	};
	/** Where a round shape is centred: between the two middle pixels, or on the one before. */
	const middle = () => (thickness >= 1 && !halves(thickness).even ? 0.5 : 0);
	const ring = (radius: number) => {
		if (radius < 0 || thickness <= 0) return;
		const offset = halves(thickness).even ? 0 : 0.5;
		shapes.push({
			kind: 'ring',
			x: cx - offset,
			y: cy - offset,
			outer: radius + thickness,
			width: Math.max(1, thickness - 1)
		});
	};

	if (crosshair.dot) dot(thickness);
	// What a dynamic style adds to its gap at rest: nothing, or room for the dot.
	const rest = round(Math.max(0, crosshair.dot ? thickness : 0));
	switch (style) {
		case 0:
			cross(rest, length);
			break;
		case 1:
			ring(rest);
			break;
		case 2:
			cross(round(crosshair.gap), length);
			break;
		case 3:
			ring(Math.max(1, crosshair.gap));
			break;
		case 4:
		case 7:
			cross(crosshair.gap, length);
			break;
		case 5:
			cross(round(Math.max(0, crosshair.gap)), length);
			break;
		case 6:
			if (!crosshair.dot) dot(thickness);
			break;
		case 8: {
			if (thickness <= 0) break;
			const open = Math.max(0, crosshair.gap);
			const shift = crosshair.dot && !halves(thickness).even ? -1 : 0;
			const x0 = Math.floor(cx - open - thickness + shift);
			const x1 = Math.floor(cx + open);
			const y0 = Math.floor(cy - open - thickness + shift);
			const y1 = Math.floor(cy + open);
			rect(x0, y0, x1, y0 + thickness);
			rect(x0, y1, x1, y1 + thickness);
			rect(x0, y0, x0 + thickness, y1 + thickness);
			rect(x1, y0, x1 + thickness, y1 + thickness);
			break;
		}
		case 9: {
			if (thickness <= 0) break;
			const offset = middle();
			shapes.push({
				kind: 'arcs',
				x: cx - offset,
				y: cy - offset,
				outer: Math.max(1, crosshair.gap) + thickness,
				width: thickness,
				degrees: clamp(crosshair.splitRatio, 0, 1) * 90
			});
			break;
		}
	}
	return {
		shapes,
		color: crosshair.color,
		outlineColor: crosshair.outline ? crosshair.outlineColor : [0, 0, 0, 0],
		outline: crosshair.outline === 1 ? [1, 1] : crosshair.outline === 2 ? [1, 0] : [0, 0]
	};
}

/** The box the drawing fills, outline included, in frame pixels. */
export function crosshairBounds(drawing: CrosshairDrawing) {
	const [before, after] = drawing.outline;
	let left = Infinity;
	let top = Infinity;
	let right = -Infinity;
	let bottom = -Infinity;
	for (const shape of drawing.shapes) {
		const box =
			shape.kind === 'rect'
				? [shape.x, shape.y, shape.x + shape.width, shape.y + shape.height]
				: [
						shape.x - shape.outer,
						shape.y - shape.outer,
						shape.x + shape.outer,
						shape.y + shape.outer
					];
		left = Math.min(left, box[0] - before);
		top = Math.min(top, box[1] - before);
		right = Math.max(right, box[2] + after);
		bottom = Math.max(bottom, box[3] + after);
	}
	return shapes(drawing) ? { left, top, right, bottom } : null;
}
const shapes = (drawing: CrosshairDrawing) => drawing.shapes.length > 0;

/** The game turns a size into whole pixels with `cvtss2si`, which rounds a half to even. */
function roundHalfEven(value: number) {
	const floor = Math.floor(value);
	const rest = value - floor;
	if (rest !== 0.5) return Math.round(value);
	return floor % 2 ? floor + 1 : floor;
}
