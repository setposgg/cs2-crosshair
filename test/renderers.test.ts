import assert from 'node:assert/strict';
import test from 'node:test';
import {
	DEFAULT_CROSSHAIR,
	crosshairBounds,
	crosshairDrawing,
	grenadeReticle,
	reticleLabelRects
} from '../dist/index.js';
import {
	crosshairLayers,
	crosshairToCanvas,
	crosshairToSvg,
	reticleLayers,
	reticleToSvg
} from '../dist/renderers.js';
import type { CanvasContext } from '../dist/renderers.js';

const frame = { width: 1920, height: 1080 };
test('bounds include full and half outlines, and empty drawings have no bounds', () => {
	const cross = (outline: 0 | 1 | 2) =>
		crosshairDrawing({ ...DEFAULT_CROSSHAIR, style: 4, outline }, frame);
	assert.deepEqual(crosshairBounds(cross(0)), { left: 948, top: 528, right: 972, bottom: 552 });
	assert.deepEqual(crosshairBounds(cross(1)), { left: 947, top: 527, right: 973, bottom: 553 });
	assert.deepEqual(crosshairBounds(cross(2)), { left: 947, top: 527, right: 972, bottom: 552 });
	assert.equal(
		crosshairBounds(crosshairDrawing({ ...DEFAULT_CROSSHAIR, thickness: 0 }, frame)),
		null
	);
});

test('serializes the shared static pixels with a separate outline layer', () => {
	const drawing = crosshairDrawing(
		{ ...DEFAULT_CROSSHAIR, style: 4, color: [0, 255, 0, 128] },
		frame
	);
	const svg = crosshairToSvg(drawing, frame);
	assert.match(svg, /viewBox="0 0 1920 1080"/);
	assert.match(svg, /x="947" y="538" width="10" height="4"/);
	assert.match(svg, /x="948" y="539" width="8" height="2"/);
	assert.equal((svg.match(/<g /g) ?? []).length, 2);
	assert.match(svg, /opacity="0.5019607843137255"/);
});

test('uses the same round outline geometry for SVG and Canvas', () => {
	const drawing = crosshairDrawing(
		{ ...DEFAULT_CROSSHAIR, style: 9, gap: 5, splitRatio: 0.5, outline: 2 },
		frame
	);
	const [outline, fill] = crosshairLayers(drawing);
	assert.equal(fill.shapes.length, 4);
	const arc = fill.shapes[0];
	assert.equal(arc.kind, 'arc');
	if (arc.kind !== 'arc') throw new Error('Expected arc');
	assert.deepEqual(arc, {
		kind: 'arc',
		x: 960,
		y: 540,
		radius: 6,
		width: 2,
		start: (-3 * Math.PI) / 8,
		end: -Math.PI / 8
	});
	assert.equal(outline.shapes[0].x, 959.5);
	assert.match(crosshairToSvg(drawing, frame), /stroke-width="3"/);
});

test('Canvas fills each translucent layer once, with a union of bars, and restores state', () => {
	const fills: number[] = [];
	const rects: number[][] = [];
	let saved = 0;
	const context: CanvasContext = {
		globalAlpha: 0.5,
		fillStyle: '',
		save() {
			saved = this.globalAlpha;
		},
		restore() {
			this.globalAlpha = saved;
		},
		beginPath() {},
		rect(...args) {
			rects.push(args);
		},
		moveTo() {},
		lineTo() {},
		arc() {},
		closePath() {},
		fill() {
			fills.push(this.globalAlpha);
		}
	};
	const drawing = crosshairDrawing(
		{ ...DEFAULT_CROSSHAIR, style: 8, color: [1, 2, 3, 128] },
		frame
	);
	crosshairToCanvas(context, drawing);
	assert.deepEqual(fills, [0.5, (0.5 * 128) / 255]);
	assert.equal(rects.length, 8);
	assert.equal(context.globalAlpha, 0.5);
});

test('original label lettering stays in the pinned whole-pixel label boxes', () => {
	const drawing = grenadeReticle(frame);
	for (const glyph of drawing.glyphs) {
		const pixels = reticleLabelRects([glyph]);
		assert.ok(pixels.length > 0);
		for (const rect of pixels) {
			assert.ok(Object.values(rect).every(Number.isInteger));
			assert.ok(rect.x >= glyph.x && rect.y >= glyph.y);
			assert.ok(rect.x + rect.width <= glyph.x + glyph.width);
			assert.ok(rect.y + rect.height <= glyph.y + glyph.height);
		}
	}
	const first = drawing.glyphs[0];
	assert.deepEqual(reticleLabelRects([first]).slice(0, 3), [
		{ x: 820, y: 560, width: 2, height: 4 },
		{ x: 822, y: 560, width: 2, height: 4 },
		{ x: 824, y: 560, width: 2, height: 4 }
	]);
	assert.equal(reticleLayers(drawing, { labels: () => [] })[0].shapes.length, drawing.rects.length);
	const svg = reticleToSvg(drawing, frame);
	assert.doesNotMatch(svg, /<image|<text|href=/);
	assert.ok(reticleLayers(drawing)[0].shapes.length > drawing.rects.length);
});

test('refuses unbounded reticle frames and FOVs instead of looping', () => {
	for (const fov of [0, 180, Infinity, NaN])
		assert.throws(() => grenadeReticle({ ...frame, fov }), RangeError);
	assert.throws(() => grenadeReticle({ width: Infinity, height: 1080 }), RangeError);
});
