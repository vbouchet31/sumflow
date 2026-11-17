import { describe, expect, it } from 'vitest';
import { CAMERA, TILE_PX } from '../../src/config/keymap';
import { COORD_MAX } from '../../src/core/grid';
import { Camera } from '../../src/render/camera';

function makeCamera(): Camera {
  const cam = new Camera();
  cam.setViewport(800, 600);
  return cam;
}

describe('Camera', () => {
  it('maps world origin to the viewport centre', () => {
    const cam = makeCamera();
    expect(cam.worldToScreen(0, 0)).toEqual({ x: 400, y: 300 });
    expect(cam.worldToScreen(1, 0)).toEqual({ x: 400 + TILE_PX, y: 300 });
  });

  it('round-trips screen ↔ world', () => {
    const cam = makeCamera();
    cam.zoom = 1.7;
    cam.x = 12.3;
    cam.y = -4.5;
    const w = cam.screenToWorld(123, 456);
    const s = cam.worldToScreen(w.x, w.y);
    expect(s.x).toBeCloseTo(123);
    expect(s.y).toBeCloseTo(456);
  });

  it('keeps the point under the cursor fixed when zooming', () => {
    const cam = makeCamera();
    const before = cam.screenToWorld(650, 120);
    cam.zoomAt(650, 120, 2.5);
    const after = cam.screenToWorld(650, 120);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(cam.zoom).toBeCloseTo(2.5);
  });

  it('clamps zoom to [0.05, 4]', () => {
    const cam = makeCamera();
    cam.zoomAt(0, 0, 1000);
    expect(cam.zoom).toBe(CAMERA.maxZoom);
    cam.zoomAt(0, 0, 1e-6);
    expect(cam.zoom).toBe(CAMERA.minZoom);
    expect(CAMERA.minZoom).toBe(0.05);
    expect(CAMERA.maxZoom).toBe(4);
  });

  it('pans with the drag and clamps to the world bounds', () => {
    const cam = makeCamera();
    cam.panScreen(TILE_PX * 2, -TILE_PX);
    expect(cam.x).toBeCloseTo(-2);
    expect(cam.y).toBeCloseTo(1);
    cam.panScreen(-1e12, 0);
    expect(cam.x).toBe(COORD_MAX);
  });

  it('pinch keeps the world point under the fingers and follows their midpoint', () => {
    const cam = makeCamera();
    cam.x = 3;
    cam.y = -2;
    const grabbed = cam.screenToWorld(300, 200);
    cam.pinch(300, 200, 340, 260, 1.8);
    expect(cam.zoom).toBeCloseTo(1.8);
    const now = cam.worldToScreen(grabbed.x, grabbed.y);
    expect(now.x).toBeCloseTo(340);
    expect(now.y).toBeCloseTo(260);
  });

  it('pinch with a constant finger distance only pans, and zoom stays clamped', () => {
    const cam = makeCamera();
    cam.pinch(100, 100, 100 + TILE_PX, 100, 1);
    expect(cam.zoom).toBe(1);
    expect(cam.x).toBeCloseTo(-1);
    cam.pinch(100, 100, 100, 100, 1000);
    expect(cam.zoom).toBe(CAMERA.maxZoom);
  });

  it('returns the visible tile range', () => {
    const cam = makeCamera();
    const v = cam.visibleTiles();
    expect(v.x0).toBe(Math.floor(-400 / TILE_PX));
    expect(v.x1).toBe(Math.ceil(400 / TILE_PX));
    expect(cam.visibleTiles(1).x0).toBe(v.x0 - 1);
  });
});

describe('camera flight', () => {
  it('glides to the target, and a pan by the player cancels it', () => {
    const cam = new Camera();
    cam.setViewport(800, 600);
    cam.flyTo(100, 50);
    cam.step(0.05);
    expect(cam.x).toBeGreaterThan(0);
    expect(cam.x).toBeLessThan(100);
    for (let i = 0; i < 120; i++) cam.step(1 / 60);
    expect(cam.flying).toBe(false);
    expect(cam.x).toBe(100);
    expect(cam.y).toBe(50);
    cam.flyTo(0, 0);
    cam.panScreen(10, 0);
    expect(cam.flying).toBe(false);
  });
});
