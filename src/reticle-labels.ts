import type { ReticleGlyph, ReticleRect } from './grenade-reticle.js';
import { RETICLE_OUTLINES, type OutlineCommand } from './reticle-outlines.js';

/** `weight` is the stroke width (frame pixels) drawn around the outline in the label's colour. */
export type ReticleLabelPath = { commands: OutlineCommand[]; weight: number };

/** Open-font outlines in the game's 64×50 cells, projected into its unchanged label boxes.
 * The game's texture is Arial at 40 px (best fit 0.89 soft IoU against its cells, Arial Regular with
 * 0.25 px of extra weight). Arial can't ship, so Liberation Sans Regular stands in, thickened by a
 * one-source-pixel stroke (0.5 px each side), its best fit (0.78; Liberation Sans Bold scores 0.71).
 * Native SVG/Canvas antialiasing approximates the game's filtered texture; it is not its shader. */
export function reticleLabelPaths(glyphs: readonly ReticleGlyph[]): ReticleLabelPath[] {
	return glyphs.flatMap((glyph) => {
		// Measured atlas ink: 29px numeral cap, 21px x-height, 8px y descender.
		// Positive y labels sit two source pixels farther right than positive x labels.
		let advance = glyph.text.startsWith('-') ? 4 : glyph.text.endsWith('y') ? 13 : 11;
		const baseline = glyph.row === 0 || glyph.row === 4 ? 37 : 36;
		const sx = glyph.width / 64;
		const sy = glyph.height / 50;
		const em = 40 / 2048;
		// Liberation has a lower cap/em than Arial: 42 vertically restores the measured 29px cap.
		const verticalEm = 42 / 2048;
		const commands: OutlineCommand[] = [];
		for (const char of glyph.text) {
			const outline = RETICLE_OUTLINES[char];
			if (!outline) continue;
			for (const command of outline.commands) {
				if (command[0] === 'Z') { commands.push(['Z']); continue; }
				const x = (v: number) => glyph.x + (advance + v * em) * sx;
				const y = (v: number) => glyph.y + (baseline - v * verticalEm) * sy;
				commands.push(command[0] === 'Q'
					? ['Q', x(command[1]), y(command[2]), x(command[3]), y(command[4])]
					: [command[0], x(command[1]), y(command[2])]);
			}
			advance += outline.advance * em;
		}
		return commands.length ? [{ commands, weight: sx }] : [];
	});
}

/** Whole-pixel, monochrome fallback for rectangle-only clients. SVG/Canvas use smooth outlines. */
export function reticleLabelRects(glyphs: readonly ReticleGlyph[]): ReticleRect[] {
	const rects: ReticleRect[] = [];
	for (const glyph of glyphs) {
		const edges: number[][] = [];
		let current = [0, 0], start = current;
		const line = (next: number[]) => { edges.push([...current, ...next]); current = next; };
		for (const { commands } of reticleLabelPaths([glyph])) for (const c of commands) {
			if (c[0] === 'M') { current = [c[1], c[2]]; start = current; }
			else if (c[0] === 'L') line([c[1], c[2]]);
			else if (c[0] === 'Z') line(start);
			else {
				const from = current;
				for (let i = 1; i <= 12; i++) {
					const t = i / 12, u = 1 - t;
					line([u*u*from[0]+2*u*t*c[1]+t*t*c[3], u*u*from[1]+2*u*t*c[2]+t*t*c[4]]);
				}
			}
		}
		for (let y = Math.ceil(glyph.y); y < glyph.y + glyph.height; y++) {
			let run: number | undefined;
			for (let x = Math.ceil(glyph.x); x <= glyph.x + glyph.width; x++) {
				let winding = 0;
				if (x < glyph.x + glyph.width) for (const [x1,y1,x2,y2] of edges) {
					const side = (x2-x1)*(y+.5-y1)-(x+.5-x1)*(y2-y1);
					if (y1 <= y+.5 && y2 > y+.5 && side > 0) winding++;
					if (y1 > y+.5 && y2 <= y+.5 && side < 0) winding--;
				}
				if (winding && run === undefined) run = x;
				if (!winding && run !== undefined) { rects.push({ x: run, y, width: x-run, height: 1 }); run = undefined; }
			}
		}
	}
	return rects;
}
