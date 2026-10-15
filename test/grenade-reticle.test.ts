import assert from 'node:assert/strict';
import test from 'node:test';
import { grenadeReticle, reticleFocal } from '../dist/index.js';

const box = (r: { x: number; y: number; width: number; height: number }) =>
	[r.x, r.y, r.width, r.height].join(',');

// Expected pixels follow the game client's routine step by step (see the module's header): a
// 1080 px high frame has a 720 px focal length at FOV 90, and tick n lies tan(10n°) of that away.
test('lays the reticle out in the pixels of a 1920x1080 frame', () => {
	const { rects, glyphs } = grenadeReticle({ width: 1920, height: 1080 });
	assert.equal(reticleFocal(1080, 90), 720.0000000000001);
	// Both lines cross the whole frame, two pixels thick, on the pixels before and after centre.
	assert.deepEqual(rects.slice(0, 2).map(box), ['0,539,1920,2', '959,0,2,1080']);
	// Five ticks to each side: left of centre first, then its mirror. Each is longer than the last.
	assert.deepEqual(rects.slice(2, 12).map(box), [
		'832,530,2,20',
		'1086,530,2,20',
		'696,529,2,22',
		'1222,529,2,22',
		'543,528,2,24',
		'1375,528,2,24',
		'354,527,2,26',
		'1564,527,2,26',
		'100,526,2,28',
		'1818,526,2,28'
	]);
	// Four up and down, by the 4:3 FOV; the fourth pair lies off a 16:9 frame.
	assert.deepEqual(rects.slice(12).map(box), [
		'950,412,20,2',
		'950,666,20,2',
		'949,276,22,2',
		'949,802,22,2',
		'948,123,24,2',
		'948,955,24,2',
		'947,-66,26,2',
		'947,1144,26,2'
	]);
	assert.deepEqual(
		glyphs.slice(0, 4).map((g) => `${g.text} ${box(g)} ${g.column},${g.row}`),
		[
			'-1x 820,552,25,20 0,4',
			'1x 1074,552,25,20 1,4',
			'-2x 684,553,25,20 0,3',
			'2x 1210,553,25,20 1,3'
		]
	);
	assert.deepEqual(
		glyphs.slice(10, 14).map((g) => `${g.text} ${box(g)} ${g.column},${g.row}`),
		[
			'-1y 972,403,25,20 2,4',
			'1y 972,657,25,20 3,4',
			'-2y 973,267,25,20 2,3',
			'2y 973,793,25,20 3,3'
		]
	);
});

test('keeps ticks on the same directions in a 4:3 frame', () => {
	const wide = grenadeReticle({ width: 1920, height: 1080 });
	const narrow = grenadeReticle({ width: 1440, height: 1080 });
	// The fifth tick is fifty degrees out, past the edge of a 4:3 view.
	assert.equal(narrow.rects.length, wide.rects.length - 2);
	const fromCentre = (r: { x: number }, width: number) => r.x - width / 2;
	for (let i = 2; i < 10; i++)
		assert.equal(fromCentre(narrow.rects[i], 1440), fromCentre(wide.rects[i], 1920));
	assert.deepEqual(
		narrow.rects
			.slice(10)
			.map(box)
			.map((b) => b.split(',').slice(1).join(',')),
		wide.rects
			.slice(12)
			.map(box)
			.map((b) => b.split(',').slice(1).join(','))
	);
});

test('scales lines and labels with the screen, not the ticks', () => {
	const { rects, glyphs } = grenadeReticle({ width: 1280, height: 960 });
	assert.deepEqual(rects.slice(0, 4).map(box), [
		'0,479,1280,2',
		'639,0,2,960',
		'526,470,2,20',
		'752,470,2,20'
	]);
	assert.equal(box(glyphs[0]), '516,492,21,17');
});

test('moves ticks with the FOV', () => {
	// The close-up FOV of a pause shows only the first ticks, far out.
	const { rects, glyphs } = grenadeReticle({ width: 1920, height: 1080, fov: 30 });
	assert.deepEqual(rects.map(box), [
		'0,539,1920,2',
		'959,0,2,1080',
		'485,530,2,20',
		'1433,530,2,20',
		'950,65,20,2',
		'950,1013,20,2'
	]);
	assert.deepEqual(
		glyphs.map((g) => g.text),
		['-1x', '1x', '-1y', '1y']
	);
});
