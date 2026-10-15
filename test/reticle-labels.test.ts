import assert from 'node:assert/strict';
import test from 'node:test';
import { RETICLE_OUTLINES } from '../dist/reticle-outlines.js';
import { grenadeReticle, reticleLabelPaths, reticleLabelRects } from '../dist/index.js';
import { reticleLayers, reticleToCanvas, reticleToSvg } from '../dist/renderers.js';
import type { CanvasContext } from '../dist/renderers.js';

test('open-font subset contains only the required characters, complete closed contours and Arial advances', () => {
	assert.equal(Object.keys(RETICLE_OUTLINES).sort().join(''), '-0123456789xy');
	for (const [char, outline] of Object.entries(RETICLE_OUTLINES)) {
		assert.equal(outline.advance, char === '-' ? 682 : /[xy]/.test(char) ? 1024 : 1139);
		assert.equal(outline.commands[0][0], 'M');
		assert.equal(outline.commands.at(-1)![0], 'Z');
		assert.equal(outline.commands.filter(c => c[0] === 'M').length,
			outline.commands.filter(c => c[0] === 'Z').length);
		assert.ok(outline.commands.every(c => c.slice(1).every(Number.isFinite)));
	}
	assert.ok(RETICLE_OUTLINES['0'].commands.filter(c => c[0] === 'M').length > 1, 'zero has a counter');
	assert.ok(RETICLE_OUTLINES['3'].commands.some(c => c[0] === 'Q'), 'curves stay curves');
});

test('cell origins, baselines and independent x/y scales survive projection', () => {
	const glyph = { text: '-1x', x: 100, y: 200, width: 25, height: 20, row: 4, column: 0 };
	const first = reticleLabelPaths([glyph])[0].commands[0];
	assert.deepEqual(first, ['M', 102.25677490234375, 210.99375]);
	const enlarged = reticleLabelPaths([{ ...glyph, x: 0, y: 0, width: 50, height: 60 }])[0];
	assert.ok(Math.abs(enlarged.commands[0][1]! - (first[1]! - 100) * 2) < 1e-10);
	assert.ok(Math.abs(enlarged.commands[0][2]! - (first[2]! - 200) * 3) < 1e-10);
	const raised = reticleLabelPaths([{ ...glyph, row: 2 }])[0].commands[0];
	assert.ok(Math.abs(raised[2]! - first[2]! + 0.4) < 1e-10);
	assert.deepEqual(reticleLabelPaths([]), []);
	assert.deepEqual(reticleLabelPaths([{ ...glyph, text: '?' }]), []);
});

test('all twenty labels have bounded outlines and rectangle fallbacks at several frame scales', () => {
	for (const height of [405, 720, 1080, 2160]) {
		const drawing = grenadeReticle({ width: Math.floor(height * 16 / 9), height });
		for (const glyph of drawing.glyphs) for (const { commands } of reticleLabelPaths([glyph])) {
			for (const c of commands) for (let i = 1; i < c.length; i += 2) {
				assert.ok(c[i]! >= glyph.x && c[i]! <= glyph.x + glyph.width);
				assert.ok(c[i+1]! >= glyph.y && c[i+1]! <= glyph.y + glyph.height);
			}
			assert.ok(reticleLabelRects([glyph]).length);
		}
		assert.equal(reticleLayers(drawing)[0].shapes.filter(s => s.kind === 'path').length, drawing.glyphs.length);
	}
});

test('Canvas fills and then strokes the same path commands as SVG, including curves and holes, without changing state', () => {
	const frame = { width: 1920, height: 1080 };
	const drawing = grenadeReticle(frame);
	const calls: unknown[][] = [];
	let saved = { alpha: 0, fill: '' as CanvasContext['fillStyle'] };
	const context: CanvasContext = {
		globalAlpha: 0.5, fillStyle: 'red',
		save() { saved = { alpha: this.globalAlpha, fill: this.fillStyle }; },
		restore() { this.globalAlpha = saved.alpha; this.fillStyle = saved.fill; },
		beginPath() {}, rect() {}, arc() {},
		moveTo(...p) { calls.push(['M', ...p]); }, lineTo(...p) { calls.push(['L', ...p]); },
		quadraticCurveTo(...p) { calls.push(['Q', ...p]); }, closePath() { calls.push(['Z']); },
		fill() { assert.equal(this.globalAlpha, 0.5 * 128 / 255); },
		strokeStyle: '', lineWidth: 0, lineJoin: 'miter',
		stroke() { assert.ok(this.lineWidth > 0); assert.equal(this.lineJoin, 'round'); strokes++; }
	};
	let strokes = 0;
	reticleToCanvas(context, drawing, { color: [1,2,3,128] });
	const paths = reticleLabelPaths(drawing.glyphs);
	const commands = paths.flatMap(p => p.commands);
	assert.deepEqual(calls, [...commands, ...commands]);
	assert.equal(strokes, paths.length);
	const svg = reticleToSvg(drawing, frame);
	for (const { commands } of paths)
		assert.ok(svg.includes(`stroke-linejoin="round" d="${commands.map(([op,...v]) => op + v.join(' ')).join('')}"`));
	assert.equal(context.globalAlpha, 0.5);
	assert.equal(context.fillStyle, 'red');
	assert.equal(reticleLayers(drawing, { labels: () => [] })[0].shapes.length, drawing.rects.length);
});
