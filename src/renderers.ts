import type { CrosshairDrawing, Rgba } from './crosshair.js';
import type { GrenadeReticle, ReticleGlyph, ReticleRect } from './grenade-reticle.js';
import { reticleLabelPaths, type ReticleLabelPath } from './reticle-labels.js';

export type Frame = { width: number; height: number };
export type RenderShape =
	| ({ kind: 'rect' } & ReticleRect)
	| ({ kind: 'path' } & ReticleLabelPath)
	| {
			kind: 'arc';
			x: number;
			y: number;
			radius: number;
			width: number;
			start: number;
			end: number;
	  };
export type RenderLayer = { color: Rgba; shapes: RenderShape[] };

/** Outline first, then fill. Each layer is a union: translucent overlaps never get darker. */
export function crosshairLayers(drawing: CrosshairDrawing): RenderLayer[] {
	const [before, after] = drawing.outline;
	const layer = (color: Rgba, extra: number, shift: number): RenderLayer => ({
		color,
		shapes: drawing.shapes.flatMap((shape): RenderShape[] => {
			if (shape.kind === 'rect')
				return [
					{
						kind: 'rect',
						x: shape.x - (extra ? before : 0),
						y: shape.y - (extra ? before : 0),
						width: shape.width + extra,
						height: shape.height + extra
					}
				];
			const radius = shape.outer - shape.width / 2;
			if (radius <= 0 || (shape.kind === 'arcs' && shape.degrees <= 0)) return [];
			const common = {
				kind: 'arc' as const,
				x: shape.x + shift,
				y: shape.y + shift,
				radius,
				width: shape.width + extra
			};
			if (shape.kind === 'ring') return [{ ...common, start: 0, end: Math.PI * 2 }];
			const half = Math.min(Math.PI / 4, (shape.degrees * Math.PI) / 360 + extra / 2 / radius);
			return [45, 135, 225, 315].map((degrees) => {
				const middle = ((degrees - 90) * Math.PI) / 180;
				return { ...common, start: middle - half, end: middle + half };
			});
		})
	});
	const reach = before + after;
	return [
		...(reach > 0 && drawing.outlineColor[3] > 0
			? [layer(drawing.outlineColor, reach, after === 0 ? -0.5 : 0)]
			: []),
		layer(drawing.color, 0, 0)
	];
}

export type ReticleRenderOptions = {
	color?: Rgba;
	/** Replace the default font outlines, or return [] to hide labels. */
	labels?: (glyphs: readonly ReticleGlyph[]) => ReticleRect[];
};

/** Caller-owned image; no texture is bundled. Cells use the geometry's column/row indices. */
export type ReticleAtlas = {
	href: string;
	width: number;
	height: number;
	cellWidth: number;
	cellHeight: number;
	/** Optional SVG filter URL, for example a caller-defined colour tint. */
	filter?: string;
};
const attribute = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(character) =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!
	);

/** SVG children for caller-supplied glyphs, including resized/filtered label boxes. */
export function reticleAtlasToSvgContent(
	glyphs: readonly ReticleGlyph[],
	atlas: ReticleAtlas
): string {
	return glyphs
		.map(
			(glyph) =>
				`<svg x="${n(glyph.x)}" y="${n(glyph.y)}" width="${n(glyph.width)}" height="${n(glyph.height)}" viewBox="${n(glyph.column * atlas.cellWidth)} ${n(glyph.row * atlas.cellHeight)} ${n(atlas.cellWidth)} ${n(atlas.cellHeight)}" preserveAspectRatio="none"><image href="${attribute(atlas.href)}" width="${n(atlas.width)}" height="${n(atlas.height)}"${atlas.filter ? ` filter="${attribute(atlas.filter)}"` : ''}/></svg>`
		)
		.join('');
}
export type ReticleSvgOptions = ReticleRenderOptions & { atlas?: ReticleAtlas };
export function reticleLayers(
	drawing: GrenadeReticle,
	options: ReticleRenderOptions = {}
): RenderLayer[] {
	return [
		{
			color: options.color ?? [0, 255, 0, 255],
			shapes: [
				...[...drawing.rects, ...(options.labels?.(drawing.glyphs) ?? [])].map((rect) => ({ ...rect, kind: 'rect' as const })),
				...(!options.labels ? reticleLabelPaths(drawing.glyphs).map((path) => ({ ...path, kind: 'path' as const })) : [])
			]
		}
	];
}

// All SVG values are numbers from the drawing, never caller-supplied markup.
const n = (value: number) => (Number.isFinite(value) ? value : 0);
const rgb = (color: Rgba) => `rgb(${n(color[0])} ${n(color[1])} ${n(color[2])})`;
const opacity = (color: Rgba) => Math.max(0, Math.min(1, n(color[3]) / 255));

/** SVG children, for an existing SVG whose viewBox uses the drawing's frame pixels. */
export function layersToSvgContent(layers: readonly RenderLayer[]): string {
	return layers
		.map(
			({ color, shapes }) =>
				`<g fill="${rgb(color)}" stroke="${rgb(color)}" opacity="${opacity(color)}">${shapes
					.map((shape) => {
						if (shape.kind === 'rect')
							return `<rect stroke="none" x="${n(shape.x)}" y="${n(shape.y)}" width="${n(shape.width)}" height="${n(shape.height)}" style="shape-rendering:var(--crosshair-edges,crispEdges)"/>`;
						if (shape.kind === 'path')
							return `<path stroke-width="${n(shape.weight)}" stroke-linejoin="round" d="${shape.commands.map(([op, ...values]) => op + values.map(n).join(' ')).join('')}"/>`;
						if (shape.end - shape.start >= Math.PI * 2)
							return `<circle fill="none" cx="${n(shape.x)}" cy="${n(shape.y)}" r="${n(shape.radius)}" stroke-width="${n(shape.width)}"/>`;
						const at = (angle: number) =>
							`${n(shape.x + shape.radius * Math.cos(angle))} ${n(shape.y + shape.radius * Math.sin(angle))}`;
						return `<path fill="none" d="M${at(shape.start)}A${n(shape.radius)} ${n(shape.radius)} 0 0 1 ${at(shape.end)}" stroke-width="${n(shape.width)}"/>`;
					})
					.join('')}</g>`
		)
		.join('');
}

export function layersToSvg(layers: readonly RenderLayer[], frame: Frame): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(frame.width)}" height="${n(frame.height)}" viewBox="0 0 ${n(frame.width)} ${n(frame.height)}">${layersToSvgContent(layers)}</svg>`;
}
export const crosshairToSvgContent = (drawing: CrosshairDrawing) =>
	layersToSvgContent(crosshairLayers(drawing));
export const crosshairToSvg = (drawing: CrosshairDrawing, frame: Frame) =>
	layersToSvg(crosshairLayers(drawing), frame);
export const reticleToSvg = (
	drawing: GrenadeReticle,
	frame: Frame,
	options: ReticleSvgOptions = {}
) => {
	if (!options.atlas) return layersToSvg(reticleLayers(drawing, options), frame);
	const color = options.color ?? [0, 255, 0, 255];
	const content = layersToSvgContent(reticleLayers(drawing, { ...options, labels: () => [] }));
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(frame.width)}" height="${n(frame.height)}" viewBox="0 0 ${n(frame.width)} ${n(frame.height)}">${content}<g opacity="${opacity(color)}">${reticleAtlasToSvgContent(drawing.glyphs, options.atlas)}</g></svg>`;
};

/** Only the standard path/fill API is needed; browser, OffscreenCanvas and server canvases work. */
export type CanvasContext = Pick<
	CanvasRenderingContext2D,
	| 'save'
	| 'restore'
	| 'beginPath'
	| 'rect'
	| 'moveTo'
	| 'lineTo'
	| 'quadraticCurveTo'
	| 'arc'
	| 'closePath'
	| 'fill'
	| 'fillStyle'
	| 'globalAlpha'
	| 'stroke'
	| 'strokeStyle'
	| 'lineWidth'
	| 'lineJoin'
>;

/** Draw in the caller's current transform, preserving its state and multiplying its opacity.
 * Uses one nonzero path per layer, so overlapping bars retain the layer's opacity. */
export function layersToCanvas(context: CanvasContext, layers: readonly RenderLayer[]): void {
	for (const { color, shapes } of layers) {
		context.save();
		try {
			context.fillStyle = rgb(color);
			context.globalAlpha *= opacity(color);
			context.beginPath();
			for (const shape of shapes) {
				if (shape.kind === 'rect') {
					context.rect(shape.x, shape.y, shape.width, shape.height);
					continue;
				}
				if (shape.kind === 'path') {
					for (const c of shape.commands) {
						if (c[0] === 'M') context.moveTo(c[1], c[2]);
						else if (c[0] === 'L') context.lineTo(c[1], c[2]);
						else if (c[0] === 'Q') context.quadraticCurveTo(c[1], c[2], c[3], c[4]);
						else context.closePath();
					}
					continue;
				}
				// A round stroke expanded into a filled annulus or annular sector, with butt ends.
				const outer = shape.radius + shape.width / 2;
				const inner = Math.max(0, shape.radius - shape.width / 2);
				const point = (radius: number, angle: number) =>
					[shape.x + radius * Math.cos(angle), shape.y + radius * Math.sin(angle)] as const;
				context.moveTo(...point(outer, shape.start));
				context.arc(shape.x, shape.y, outer, shape.start, shape.end);
				context.lineTo(...point(inner, shape.end));
				if (inner > 0) context.arc(shape.x, shape.y, inner, shape.end, shape.start, true);
				else context.lineTo(shape.x, shape.y);
				context.closePath();
			}
			context.fill();
			// Label outlines carry a thin stroke in the same colour (their weight), as in SVG.
			for (const shape of shapes) {
				if (shape.kind !== 'path' || !(shape.weight > 0)) continue;
				context.beginPath();
				for (const c of shape.commands) {
					if (c[0] === 'M') context.moveTo(c[1], c[2]);
					else if (c[0] === 'L') context.lineTo(c[1], c[2]);
					else if (c[0] === 'Q') context.quadraticCurveTo(c[1], c[2], c[3], c[4]);
					else context.closePath();
				}
				context.strokeStyle = rgb(color);
				context.lineWidth = shape.weight;
				context.lineJoin = 'round';
				context.stroke();
			}
		} finally {
			context.restore();
		}
	}
}
export const crosshairToCanvas = (context: CanvasContext, drawing: CrosshairDrawing) =>
	layersToCanvas(context, crosshairLayers(drawing));
export const reticleToCanvas = (
	context: CanvasContext,
	drawing: GrenadeReticle,
	options?: ReticleRenderOptions
) => layersToCanvas(context, reticleLayers(drawing, options));
