import type { ReticleGlyph, ReticleRect } from './grenade-reticle.js';

// Original 3×5 pixel lettering, drawn here by hand. No font or Valve texture is used.
const letters: Record<string, string[]> = {
	'-': ['000', '000', '111', '000', '000'],
	'1': ['010', '110', '010', '010', '111'],
	'2': ['110', '001', '010', '100', '111'],
	'3': ['110', '001', '010', '001', '110'],
	'4': ['101', '101', '111', '001', '001'],
	'5': ['111', '100', '110', '001', '110'],
	x: ['000', '101', '010', '101', '000'],
	y: ['000', '101', '011', '001', '110']
};

/** Original pixel lettering inside the game's label boxes. Unlike the ticks, these shapes are
 * not a port of Valve's glyphs. Supply your own rectangles to replace them, or omit labels. */
export function reticleLabelRects(glyphs: readonly ReticleGlyph[]): ReticleRect[] {
	const rects: ReticleRect[] = [];
	for (const glyph of glyphs) {
		const text = glyph.text.padStart(3, ' ');
		for (let i = 0; i < text.length; i++) {
			const rows = letters[text[i]];
			if (!rows) continue;
			for (let row = 0; row < 5; row++) {
				for (let column = 0; column < 3; column++) {
					if (rows[row][column] !== '1') continue;
					const x = glyph.x + Math.floor(((i * 4 + column) * glyph.width) / 11);
					const y = glyph.y + Math.floor((row * glyph.height) / 5);
					const right = glyph.x + Math.floor(((i * 4 + column + 1) * glyph.width) / 11);
					const bottom = glyph.y + Math.floor(((row + 1) * glyph.height) / 5);
					if (right > x && bottom > y) rects.push({ x, y, width: right - x, height: bottom - y });
				}
			}
		}
	}
	return rects;
}
