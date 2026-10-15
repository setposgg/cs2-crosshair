// Original pictures generated entirely from the package's geometry and SVG renderer.
// Run npm run examples. No game screenshots, textures or installed fonts are needed.
import { mkdir, writeFile } from 'node:fs/promises';
import {
	DEFAULT_CROSSHAIR,
	SITE_CROSSHAIR,
	crosshairDrawing,
	grenadeReticle
} from '../dist/index.js';
import { crosshairToSvgContent, reticleToSvg } from '../dist/renderers.js';

const output = new URL('../docs/images/', import.meta.url);
await mkdir(output, { recursive: true });
const presets = [
	['Static cross', SITE_CROSSHAIR],
	[
		'Circle + dot',
		{ ...DEFAULT_CROSSHAIR, style: 3, gap: 7, thickness: 3, dot: true, color: [0, 229, 255, 255] }
	],
	[
		'Static quad',
		{
			...DEFAULT_CROSSHAIR,
			style: 9,
			gap: 9,
			thickness: 3,
			splitRatio: 0.55,
			color: [255, 214, 64, 255]
		}
	]
];
const crosshairs = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="240" viewBox="0 0 720 240"><rect width="720" height="240" fill="#182125"/>${presets.map(([name, preset], i) => `<svg x="${i * 240}" y="24" width="240" height="170" viewBox="912 492 96 96">${crosshairToSvgContent(crosshairDrawing(preset, { width: 1920, height: 1080 }))}</svg><text x="${i * 240 + 120}" y="218" fill="#d5dddd" font-family="sans-serif" font-size="16" text-anchor="middle">${name}</text>`).join('')}</svg>\n`;
await writeFile(new URL('crosshairs.svg', output), crosshairs);
const frame = { width: 1920, height: 1080 };
const reticle = reticleToSvg(grenadeReticle(frame), frame);
const picture = (width, height, viewBox) => reticle
 .replace('width="1920" height="1080" viewBox="0 0 1920 1080"', `width="${width}" height="${height}" viewBox="${viewBox}"`)
 .replace('<g ', '<rect width="1920" height="1080" fill="#182125"/><g ');
await writeFile(new URL('grenade-reticle.svg', output), picture(720, 405, '0 0 1920 1080') + '\n');
await writeFile(new URL('grenade-reticle-detail.svg', output), picture(720, 200, '780 530 360 100') + '\n');
console.log('Wrote docs/images/{crosshairs,grenade-reticle,grenade-reticle-detail}.svg');
