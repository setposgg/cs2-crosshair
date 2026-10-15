import assert from 'node:assert/strict';
import test from 'node:test';
import {
	DEFAULT_CROSSHAIR,
	SITE_CROSSHAIR,
	crosshairCodeKind,
	crosshairDrawing,
	decodeCrosshair,
	encodeCrosshair,
	fitCrosshair,
	type Crosshair,
	type CrosshairShape
} from '../dist/index.js';

const box = (shape: CrosshairShape) =>
	shape.kind === 'rect' ? [shape.x, shape.y, shape.width, shape.height].join(',') : shape.kind;
const frame = { width: 1920, height: 1080 };
const at1080 = (changes: Partial<Crosshair>): Crosshair => ({ ...DEFAULT_CROSSHAIR, ...changes });

// Codes copied from players' public crosshair lists after the game changed the format on
// 2026-10-01. Each carries a checksum, so a wrong byte order or alphabet fails here.
test('reads share codes the game wrote', () => {
	const read = decodeCrosshair('CSyAqUtN69wWNvDFi89hfa9qHCnj5JURoPsvD99oC8V6wL');
	assert.deepEqual(read && { ...read, outerSplitAlpha: +read.outerSplitAlpha.toFixed(2) }, {
		screenHeight: 1080,
		style: 4,
		followRecoil: false,
		dot: false,
		tStyle: false,
		outline: 0,
		gap: 3,
		thickness: 3,
		length: 8,
		spreadLimit: 255,
		color: [0, 255, 135, 255],
		outlineColor: [0, 0, 0, 255],
		splitDistance: 3,
		innerSplitAlpha: 0,
		outerSplitAlpha: 1,
		splitRatio: 1,
		scopeUsesColor: false,
		scopeDotScale: 1
	});
	const stretched = decodeCrosshair('CSCTWJSVydL9ecJ292AFNuNd7tj4qfJTDzV34iQqryCjhj');
	assert.equal(stretched?.screenHeight, 960);
	assert.equal(stretched?.style, 5);
	assert.equal(stretched?.dot, true);
	assert.deepEqual(stretched?.color, [0, 229, 255, 255]);
	for (const code of [
		'CSqvLJtn4UrvzStpGJP9PjwVCYhsA44tkbwDWbeiLZKGhF',
		'CSbTEaGDR5GhNAifhXfx8dnavVdRCvsLSCeTDvSS8ndJQE',
		'CSGnKXo8CobQEM34B5ZELVTK6tX3vx3S2EoiPFK5QhC3ze',
		'CSEWBHkDuZHeCScfVw355DMHiW2aryNDJcouthPzFQCZQD',
		'CS5PWqQSbXN9fnThjTKffcss2wz9krMny2DkaULJsj6GpK'
	])
		assert.ok(decodeCrosshair(code), code);
});

test('writes the code it read', () => {
	for (const code of [
		'CSyAqUtN69wWNvDFi89hfa9qHCnj5JURoPsvD99oC8V6wL',
		'CSCTWJSVydL9ecJ292AFNuNd7tj4qfJTDzV34iQqryCjhj',
		'CS5PWqQSbXN9fnThjTKffcss2wz9krMny2DkaULJsj6GpK'
	])
		assert.equal(encodeCrosshair(decodeCrosshair(code)!), code);
	assert.deepEqual(decodeCrosshair(encodeCrosshair(DEFAULT_CROSSHAIR)), DEFAULT_CROSSHAIR);
	const negative = at1080({ style: 2, gap: -4, tStyle: true, outline: 2 });
	assert.deepEqual(decodeCrosshair(encodeCrosshair(negative)), negative);
});

test('refuses what the game refuses', () => {
	const code = 'CSyAqUtN69wWNvDFi89hfa9qHCnj5JURoPsvD99oC8V6wL';
	assert.equal(crosshairCodeKind(` ${code}\n`), 'current');
	// One wrong character breaks the checksum.
	assert.equal(decodeCrosshair(code.replace('q', 'r')), null);
	assert.equal(decodeCrosshair(code.slice(0, -1)), null);
	assert.equal(decodeCrosshair(code.replace('A', '0')), null);
	assert.equal(crosshairCodeKind('CSGO-bBh8m-rGCb9-tRfHy-mdV6Q-uJFvP'), 'old');
	assert.equal(crosshairCodeKind('my crosshair'), 'invalid');
	assert.equal(crosshairCodeKind(''), 'invalid');
});

test('keeps a crosshair the same share of the screen', () => {
	const authored = at1080({ screenHeight: 720, gap: 4, thickness: 2, length: 8 });
	const doubled = fitCrosshair(authored, 1440);
	assert.deepEqual([doubled.gap, doubled.thickness, doubled.length], [8, 4, 16]);
	// Nothing that was set rounds away to nothing, and a negative gap stays negative.
	const small = fitCrosshair(at1080({ gap: 1, thickness: 1, length: 2 }), 270);
	assert.deepEqual([small.gap, small.thickness, small.length], [1, 1, 1]);
	assert.equal(fitCrosshair(at1080({ gap: -1 }), 270).gap, -1);
	assert.equal(fitCrosshair(at1080({ gap: 0, thickness: 0 }), 2160).thickness, 0);
	assert.equal(fitCrosshair(at1080({ gap: 0 }), 2160).gap, 0);
});

// Expected pixels follow the game client's routines step by step (see the module's header).
test('lays a static cross out in the pixels of a 1920x1080 frame', () => {
	const even = crosshairDrawing(at1080({ style: 4, gap: 4, thickness: 2, length: 8 }), frame);
	// Left, right, top, bottom: two pixels thick on the pixels before and after the centre.
	assert.deepEqual(even.shapes.map(box), [
		'948,539,8,2',
		'964,539,8,2',
		'959,528,2,8',
		'959,544,2,8'
	]);
	assert.deepEqual(even.outline, [1, 1]);
	// An odd thickness sits on the pixel before the centre, and the bars close in to stay level.
	const odd = crosshairDrawing(at1080({ style: 4, gap: 4, thickness: 1, length: 8 }), frame);
	assert.deepEqual(odd.shapes.map(box), [
		'948,539,8,1',
		'963,539,8,1',
		'959,528,1,8',
		'959,543,1,8'
	]);
	const t = crosshairDrawing(at1080({ style: 4, tStyle: true, dot: true, outline: 2 }), frame);
	assert.deepEqual(t.shapes.map(box), ['959,539,2,2', '948,539,8,2', '964,539,8,2', '959,544,2,8']);
	assert.deepEqual(t.outline, [1, 0]);
	const none = crosshairDrawing(at1080({ style: 4, outline: 0 }), frame);
	assert.deepEqual([none.outline, none.outlineColor[3]], [[0, 0], 0]);
});

test('draws each dynamic style as it rests with a grenade in hand', () => {
	const shapes = (changes: Partial<Crosshair>) =>
		crosshairDrawing(at1080(changes), frame).shapes.map(box);
	// A Dynamic Cross closes up, leaving room for the dot when there is one.
	assert.deepEqual(shapes({ style: 0 }), [
		'952,539,8,2',
		'960,539,8,2',
		'959,532,2,8',
		'959,540,2,8'
	]);
	assert.deepEqual(shapes({ style: 0, dot: true })[1], '950,539,8,2');
	// A Dynamic Quad and the legacy style are their plain cross, the classic one too.
	const cross = shapes({ style: 4 });
	for (const style of [2, 5, 7]) assert.deepEqual(shapes({ style }), cross);
	// A negative gap is only for the classic style, where it closes the cross.
	assert.deepEqual(shapes({ style: 2, gap: -3 })[0], '952,539,8,2');
	assert.deepEqual(shapes({ style: 6, thickness: 3 }), ['958,538,3,3']);
	assert.deepEqual(shapes({ style: 6, thickness: 3, dot: true }), ['958,538,3,3']);
});

test('lays the round and square styles out', () => {
	const drawing = (changes: Partial<Crosshair>) => crosshairDrawing(at1080(changes), frame).shapes;
	assert.deepEqual(drawing({ style: 3, gap: 6, thickness: 2 }), [
		{ kind: 'ring', x: 960, y: 540, outer: 8, width: 1 }
	]);
	// An odd thickness is centred on the pixel before the middle.
	assert.deepEqual(drawing({ style: 3, gap: 0, thickness: 3 }), [
		{ kind: 'ring', x: 959.5, y: 539.5, outer: 4, width: 2 }
	]);
	assert.deepEqual(drawing({ style: 1, thickness: 2 }), [
		{ kind: 'ring', x: 960, y: 540, outer: 2, width: 1 }
	]);
	assert.deepEqual(drawing({ style: 9, gap: 5, thickness: 2, splitRatio: 0.5 }), [
		{ kind: 'arcs', x: 960, y: 540, outer: 7, width: 2, degrees: 45 }
	]);
	assert.deepEqual(drawing({ style: 8, gap: 4, thickness: 2 }).map(box), [
		'954,534,10,2',
		'954,544,10,2',
		'954,534,2,12',
		'964,534,2,12'
	]);
});

test('fits the crosshair to the frame it is drawn into', () => {
	// A code made on a 960 px high screen, shown in a 1080 px high picture.
	const read = decodeCrosshair('CSqvLJtn4UrvzStpGJP9PjwVCYhsA44tkbwDWbeiLZKGhF')!;
	assert.deepEqual([read.gap, read.thickness, read.length], [1, 2, 2]);
	assert.deepEqual(crosshairDrawing(read, frame).shapes.map(box), [
		'957,539,2,2',
		'961,539,2,2',
		'959,537,2,2',
		'959,541,2,2'
	]);
	// In a 2160 px high picture every size is 2.25 times its own: gap 2, bars 5 by 5.
	assert.deepEqual(crosshairDrawing(read, { width: 3840, height: 2160 }).shapes.map(box), [
		'1913,1077,5,5',
		'1921,1077,5,5',
		'1917,1073,5,5',
		'1917,1081,5,5'
	]);
});

test("the site's own crosshair is the one it drew by hand before, at 1080 px", () => {
	const drawing = crosshairDrawing(SITE_CROSSHAIR, frame);
	assert.deepEqual(drawing.shapes.map(box), [
		'943,539,14,2',
		'963,539,14,2',
		'959,523,2,14',
		'959,543,2,14'
	]);
	assert.deepEqual(
		[drawing.outline, drawing.color, drawing.outlineColor],
		[
			[1, 1],
			[255, 255, 255, 255],
			[0, 0, 0, 255]
		]
	);
});
