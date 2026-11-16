import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyArea } from '../../src/build/clipboard';
import { selectionRect } from '../../src/build/area';
import { E, S, W } from '../../src/core/grid';
import { type Migration, MIGRATIONS, migrate } from '../../src/save/migrations';
import {
  decodeSave,
  encodeSave,
  encodeSaveSync,
  exportFileName,
  importSave,
  readStorage,
  SAVE_KEY,
  writeStorage,
} from '../../src/save/persist';
import { SAVE_VERSION, type SaveData, SaveError } from '../../src/save/schema';
import { deserialize, serialize, stateHash } from '../../src/save/serialize';
import { defaultSettings, parseSettings } from '../../src/save/settings';
import { dirMask } from '../../src/sim/entities';
import { deliver } from '../../src/sim/progression';
import { runTicks } from '../../src/sim/tick';
import { World } from '../../src/sim/world';
import { DepositMap } from '../../src/world/chunks';
import { beltLine, makeWorld } from './helpers/scenario';

const CAM = { x: 3.5, y: -2.25, zoom: 0.75 };

/** A busy little world: extractor, belts with items, operators, bridge, storage, marker. */
function busyWorld(): World {
  const world = makeWorld(42);
  const s = world.state;
  s.unlockedBuildings.push('adder', 'subtractor', 'storage', 'bridge');
  s.unlockedFeatures.push('upgrades', 'priorities');
  for (let i = 0; i < 10; i++) deliver(s, 1, world.emit); // level 2
  const d = world.deposits.findNearest(1);
  if (!d) throw new Error();
  world.addBuilding('extractor', d.x - 1, d.y - 1, 0, { extractValue: 1 });
  beltLine(world, 20, 0, W, 18); // into the hub
  world.addBuilding('adder', 21, -1, 1);
  world.addBuilding('subtractor', 30, 5, 2, { mirror: true });
  const st = world.addBuilding('storage', 40, 0, 0);
  st.storeValue = 7;
  st.storeCount = 1234;
  world.setBelt(25, 5, dirMask(S) | dirMask(E));
  world.setBridge(10, 0, W, S);
  world.setMarker(12, 3, 'Usine « 7 »');
  const clip = copyArea(world, selectionRect({ x: 20, y: -1 }, { x: 25, y: 5 }));
  if (clip) s.clipboard.push(clip);
  s.helpSeen.push('start');
  runTicks(world, 600);
  const adder = [...s.buildings.values()].find((b) => b.type === 'adder');
  adder?.inA?.push(2, 3);
  adder?.inB?.push(4);
  return world;
}

function reload(data: SaveData): World {
  const { state } = deserialize(data);
  return new World(state, new DepositMap(state.seed));
}

describe('save round trip', () => {
  it('save → load gives an identical state hash, compressed or not', async () => {
    const world = busyWorld();
    const data = serialize(world, CAM, '2026-11-16T10:00:00Z');
    expect(data.version).toBe(SAVE_VERSION);
    const hash = stateHash(world, CAM);
    for (const text of [await encodeSave(data), encodeSaveSync(data)]) {
      const back = await decodeSave(text);
      const loaded = deserialize(back);
      const w2 = new World(loaded.state, new DepositMap(loaded.state.seed));
      expect(loaded.camera).toEqual(CAM);
      expect(stateHash(w2, loaded.camera)).toBe(hash);
    }
    // The compressed form is smaller.
    expect((await encodeSave(data)).length).toBeLessThan(encodeSaveSync(data).length);
  });

  it('a loaded game keeps running like the original', () => {
    const world = busyWorld();
    const copy = reload(serialize(world, CAM));
    runTicks(world, 1200);
    runTicks(copy, 1200);
    expect(copy.state.totalDelivered).toBeGreaterThan(0);
    expect(Math.abs(copy.state.totalDelivered - world.state.totalDelivered)).toBeLessThanOrEqual(1);
    expect(copy.state.level).toBe(world.state.level);
  });

  it('keeps the mirror, the storage, the bridge lanes, the marker and the clipboard', () => {
    const w2 = reload(serialize(busyWorld(), CAM));
    const sub = [...w2.state.buildings.values()].find((b) => b.type === 'subtractor');
    expect(sub?.mirror).toBe(true);
    const st = [...w2.state.buildings.values()].find((b) => b.type === 'storage');
    expect(st).toMatchObject({ storeValue: 7, storeCount: 1234 });
    expect(w2.bridgeAt(10, 0)?.h?.outputs).toBe(dirMask(W));
    expect(w2.bridgeAt(10, 0)?.v?.outputs).toBe(dirMask(S));
    expect([...w2.state.markers.values()][0]?.text).toBe('Usine « 7 »');
    expect(w2.state.clipboard).toHaveLength(1);
    expect(w2.state.helpSeen).toEqual(['start']);
    expect(w2.buildingAt(2, 2)?.type).toBe('hub');
  });
});

describe('invalid saves', () => {
  const base = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(serialize(busyWorld(), CAM))) as Record<string, unknown>;

  it('rejects garbage, wrong types and inconsistent data', async () => {
    await expect(decodeSave('not a save')).rejects.toBeInstanceOf(SaveError);
    await expect(decodeSave('Z1:@@@@')).rejects.toBeInstanceOf(SaveError);
    await expect(decodeSave('[]')).rejects.toBeInstanceOf(SaveError);
    const cases: ((d: Record<string, unknown>) => void)[] = [
      (d) => (d['seed'] = 'abc'),
      (d) => (d['version'] = 99),
      (d) => delete d['belts'],
      (d) => (d['buildings'] = []), // no hub
      (d) =>
        (d['belts'] as unknown[]).push({
          x: 0,
          y: 0,
          outputs: 2,
          rr: 0,
          rrIn: 0,
          priority: null,
          item: null,
        }), // on the hub
      (d) => Object.assign((d['belts'] as object[])[0] ?? {}, { outputs: 0 }),
      (d) => Object.assign((d['buildings'] as object[])[1] ?? {}, { type: 'teleporter' }),
      (d) => Object.assign((d['belts'] as object[])[0] ?? {}, { item: [1, 2, null] }), // progress > 1
    ];
    for (const mutate of cases) {
      const d = base();
      mutate(d);
      await expect(decodeSave(JSON.stringify(d))).rejects.toBeInstanceOf(SaveError);
    }
  });
});

describe('storage', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('an invalid import changes nothing; a valid one replaces the save', async () => {
    writeStorage(SAVE_KEY, 'previous');
    await expect(importSave('{"version":1}')).rejects.toBeInstanceOf(SaveError);
    expect(readStorage(SAVE_KEY)).toBe('previous');
    const data = serialize(busyWorld(), CAM);
    await importSave(JSON.stringify(data, null, 1));
    const stored = readStorage(SAVE_KEY);
    expect(stored).not.toBe('previous');
    expect((await decodeSave(stored ?? '')).tick).toBe(data.tick);
  });

  it('reports a full quota instead of throwing', () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    };
    expect(writeStorage(SAVE_KEY, 'x')).toBe('quota');
  });
});

describe('migrations', () => {
  it('the current list brings every known version to the current one', () => {
    expect(MIGRATIONS).toHaveLength(SAVE_VERSION - 1);
    expect(migrate({ version: SAVE_VERSION, a: 1 })).toEqual({ version: SAVE_VERSION, a: 1 });
    expect(migrate({ version: SAVE_VERSION + 1 })).toBeNull();
    expect(migrate({})).toBeNull();
  });

  it('applies migrations in order', () => {
    const steps: Migration[] = [
      (d) => ({ ...d, renamed: d['old'] }),
      (d) => ({ ...d, extra: [d['renamed']] }),
    ];
    expect(migrate({ version: 1, old: 5 }, steps, 3)).toEqual({
      version: 3,
      old: 5,
      renamed: 5,
      extra: [5],
    });
    expect(migrate({ version: 2, renamed: 1 }, steps, 3)).toEqual({
      version: 3,
      renamed: 1,
      extra: [1],
    });
  });
});

describe('settings and export', () => {
  it('parses settings and ignores invalid values', () => {
    const d = defaultSettings('fr', false);
    expect(parseSettings(null, d)).toEqual(d);
    expect(parseSettings('nope', d)).toEqual(d);
    const s = parseSettings(
      JSON.stringify({
        locale: 'en',
        volume: 140,
        showGrid: false,
        autosave: 45,
        itemValues: 'always',
      }),
      d,
    );
    expect(s).toMatchObject({
      locale: 'en',
      volume: 100,
      showGrid: false,
      autosave: 60,
      itemValues: 'always',
    });
  });

  it('names export files sumflow-AAAAMMJJ-HHMM.json', () => {
    expect(exportFileName(new Date(2026, 10, 6, 9, 5))).toBe('sumflow-20261106-0905.json');
  });
});
