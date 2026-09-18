import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import Brain from "../src/chess420/Brain";
import settings from "../src/chess420/Settings";
import StorageW from "../src/chess420/StorageW";

const prefix = settings.STORAGE_VERSION;

function installStorage(t: TestContext, initial: Record<string, string> = {}) {
  const storage = { ...initial } as unknown as Storage;
  let capacity = Infinity;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const size = () => Object.entries(storage).reduce(
    (total, [key, value]) => total + key.length + value.length, 0,
  );
  Object.defineProperties(storage, {
    getItem: { value: (key: string) => Object.hasOwn(storage, key) ? storage[key] : null },
    removeItem: { value: (key: string) => { delete storage[key]; } },
    setItem: { configurable: true, value: (key: string, value: string) => {
      const existing = storage.getItem(key);
      const oldSize = existing === null ? 0 : key.length + existing.length;
      if (size() - oldSize + key.length + value.length > capacity) {
        throw new DOMException("Storage full", "QuotaExceededError");
      }
      storage[key] = value;
    } },
  });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });
  return { storage, fill: () => { capacity = size(); } };
}

function cache(timestamp: number) {
  return JSON.stringify({ timestamp, content: "x".repeat(200) });
}

test("novelty saves evict the oldest cache under quota pressure and preserve other data", (t) => {
  const oldest = `${prefix}/lichess:old`;
  const newest = `${prefix}/lichess:new`;
  const saved = `${prefix}/novelty:saved`;
  const { storage, fill } = installStorage(t, {
    [newest]: cache(2),
    [oldest]: cache(1),
    [saved]: '"d4"',
    preference: "not JSON",
  });
  fill();
  StorageW.setNovelty("position", "e4");
  assert.equal(StorageW.getNovelty("position"), "e4");
  assert.equal(storage.getItem(oldest), null);
  assert.equal(storage.getItem(newest), cache(2));
  assert.equal(storage.getItem(saved), '"d4"');
  assert.equal(storage.getItem("preference"), "not JSON");
});

test("cache cleanup preserves novelties and unrelated data even with malformed JSON", (t) => {
  const { storage } = installStorage(t, {
    [`${prefix}/lichess:broken`]: "invalid JSON",
    [`${prefix}/lichess:valid`]: cache(2),
    [`${prefix}/novelty:saved`]: '"e4"',
    [`${prefix}/novelty:broken`]: "invalid JSON",
    unrelated: "not JSON",
    unrelatedJson: '{"timestamp":1}',
  });
  StorageW.clear(0);
  assert.deepEqual({ ...storage }, {
    [`${prefix}/novelty:saved`]: '"e4"',
    [`${prefix}/novelty:broken`]: "invalid JSON",
    unrelated: "not JSON",
    unrelatedJson: '{"timestamp":1}',
  });
});

test("cache cleanup keeps the requested number of newest entries", (t) => {
  const { storage } = installStorage(t, {
    [`${prefix}/lichess:one`]: cache(1),
    [`${prefix}/lichess:three`]: cache(3),
    [`${prefix}/lichess:two`]: cache(2),
  });
  StorageW.clear(1);
  assert.deepEqual(Object.keys(storage), [`${prefix}/lichess:three`]);
});

test("writes without quota pressure keep cached positions", (t) => {
  const { storage } = installStorage(t, { [`${prefix}/lichess:one`]: cache(1) });
  StorageW.setNovelty("position", "e4");
  StorageW.setNovelty("position", "d4");
  assert.equal(StorageW.getNovelty("position"), "d4");
  StorageW.setNovelty("position", null);
  assert.equal(StorageW.getNovelty("position"), null);
  assert.equal(storage.getItem(`${prefix}/lichess:one`), cache(1));
});

test("deferred cache writes recover from full storage", async (t) => {
  const { storage, fill } = installStorage(t, {
    [`${prefix}/lichess:old`]: cache(1),
    [`${prefix}/novelty:saved`]: '"d4"',
  });
  fill();
  StorageW.setLichess("position", [{ san: "e4" }]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(StorageW.getLichess("position"), [{ san: "e4" }]);
  assert.equal(storage.getItem(`${prefix}/novelty:saved`), '"d4"');
});

test("optional cache writes skip unsatisfiable storage without deleting novelties", async (t) => {
  const { storage, fill } = installStorage(t, { [`${prefix}/novelty:saved`]: '"d4"' });
  fill();
  StorageW.setLichess("position", [{ san: "e4" }]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(StorageW.getLichess("position"), null);
  assert.equal(storage.getItem(`${prefix}/novelty:saved`), '"d4"');
});

for (const recoverable of [true, false]) {
  test(`dragged moves update history when storage is full (${recoverable ? "recoverable" : "unrecoverable"})`, (t) => {
    const initial = recoverable ? { [`${prefix}/lichess:old`]: cache(1) } : {};
    const { fill } = installStorage(t, initial);
    fill();
    const fen = Brain.getFen();
    const old = {
      view: Brain.view, history: Brain.history, updateHistory: Brain.updateHistory,
      autoreplyRef: Brain.autoreplyRef,
    };
    const oldAlert = Object.getOwnPropertyDescriptor(globalThis, "alert");
    const alerts: string[] = [];
    Object.defineProperty(globalThis, "alert", {
      configurable: true, value: (message: string) => alerts.push(message),
    });
    t.mock.method(console, "error", () => {});
    t.after(() => {
      Object.assign(Brain, old);
      if (oldAlert) Object.defineProperty(globalThis, "alert", oldAlert);
      else Reflect.deleteProperty(globalThis, "alert");
    });
    Brain.view = undefined;
    Brain.autoreplyRef = { current: { checked: false } } as typeof Brain.autoreplyRef;
    Brain.history = { index: 0, states: [{ fen, orientationIsWhite: true, logs: [] }] };
    Brain.updateHistory = (history) => { Brain.history = history; };

    assert.equal(Brain.moveFromTo("e2", "e4"), true);
    assert.equal(Brain.getState().fen, Brain.getFen(fen, "e4"));
    assert.deepEqual(Brain.getState().logs, [{ fen, san: "e4" }]);
    assert.equal(StorageW.getNovelty(fen), recoverable ? "e4" : null);
    assert.equal(alerts.length, recoverable ? 0 : 1);
  });
}
