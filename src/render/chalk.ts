/**
 * Draft "tableau noir" theme: strokes the current path like a stick of chalk. Two passes with
 * broken dash patterns leave small gaps where the board shows through.
 */
export function chalkStroke(ctx: CanvasRenderingContext2D, color: string, w: number): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = w;
  ctx.globalAlpha *= 0.9;
  ctx.setLineDash([w * 7, w * 0.8, w * 3, w * 0.6]);
  ctx.stroke();
  ctx.lineWidth = w * 0.55;
  ctx.globalAlpha *= 0.6;
  ctx.setLineDash([w * 4, w * 1.4, w * 9, w * 1.1]);
  ctx.lineDashOffset = w * 2.5;
  ctx.stroke();
  ctx.restore();
}
