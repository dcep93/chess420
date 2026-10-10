import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import Brain, { View } from "../src/chess420/Brain";
import settings from "../src/chess420/Settings";
import StorageW from "../src/chess420/StorageW";

let fixtureId = 0;

function setup(t: TestContext, options: {
  rareAt?: number;
  rareTotal?: number;
  mistakeAt?: number;
  orientationIsWhite?: boolean;
} = {}) {
  const originalView = Brain.view;
  const originalHistory = Brain.history;
  const originalUpdateHistory = Brain.updateHistory;
  const originalVersion = Brain.latestGameFastForwardVersion;
  const originalParams = settings.LICHESS_PARAMS;
  t.after(() => {
    Brain.view = originalView;
    Brain.history = originalHistory;
    Brain.updateHistory = originalUpdateHistory;
    Brain.latestGameFastForwardVersion = originalVersion;
    settings.LICHESS_PARAMS = originalParams;
  });
  // Each test gets independent entries in the explorer promise cache.
  settings.LICHESS_PARAMS = `test=${++fixtureId}`;
  Brain.view = View.lichess_latest;
  const game = {
    sans: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"],
    orientationIsWhite: options.orientationIsWhite ?? true,
  };
  const chess = Brain.getChess();
  const fens: string[] = [];
  const positions = new Map<string, { san: string; white: number; black: number; draws: number }[]>();
  for (let i = 0; i <= game.sans.length; i++) {
    const fen = chess.fen();
    fens.push(fen);
    const played = game.sans[i] ?? chess.moves()[0];
    const alternative = chess.moves().find((san) => san !== played)!;
    const best = i === options.mistakeAt ? alternative : played;
    const other = i === options.mistakeAt ? played : alternative;
    const total = i === options.rareAt ? (options.rareTotal ?? 25) : 200;
    positions.set(fen, total === 0 ? [] : [
      { san: best, white: Math.ceil(total / 2), black: 0, draws: 0 },
      { san: other, white: 0, black: Math.floor(total / 2), draws: 0 },
    ]);
    if (i < game.sans.length) chess.move(played);
  }
  const visited: string[] = [];
  t.mock.method(StorageW, "getLichess", (url: string) => {
    const fen = new URL(url).searchParams.get("fen")!;
    visited.push(fen);
    assert.ok(positions.has(fen), `Unexpected position: ${fen}`);
    return positions.get(fen);
  });
  t.mock.method(StorageW, "setLichess", () => {});
  t.mock.method(StorageW, "getNovelty", () => null);
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Latest-game tests must not use the network");
  });
  Brain.history = {
    index: 0,
    states: [{
      fen: fens[0], startingFen: undefined,
      orientationIsWhite: game.orientationIsWhite, logs: [],
    }],
  };
  const updates = t.mock.fn((history: typeof Brain.history) => {
    Brain.history = history;
  });
  Brain.updateHistory = updates;
  return { game, fens, visited, updates };
}

test("a White mistake stops before a later rare line, even in a Black import", async (t) => {
  const { game, fens, visited, updates } = setup(t, {
    mistakeAt: 2, rareAt: 4, orientationIsWhite: false,
  });
  await Brain.loadLatestGame(game);
  assert.equal(Brain.getState().fen, fens[2]);
  assert.equal(Brain.getState().orientationIsWhite, false);
  assert.deepEqual(Brain.getState().logs.map((log) => log.san), ["e4", "e5"]);
  assert.deepEqual(visited, fens.slice(0, 3));
  assert.equal(updates.mock.callCount(), 1);
  assert.equal(Brain.history.states.length, game.sans.length + 1);
});

for (const rareAt of [1, 2]) {
  test(`a rare line after ${rareAt === 1 ? "White" : "Black"} moves stops before a later mistake`, async (t) => {
    const { game, fens, visited } = setup(t, { rareAt, mistakeAt: 4 });
    await Brain.loadLatestGame(game);
    assert.equal(Brain.getState().fen, fens[rareAt]);
    assert.deepEqual(visited, fens.slice(0, rareAt + 1));
  });
}

test("26 recorded games is above the rarity threshold and Black mistakes are skipped", async (t) => {
  const { game, fens, visited } = setup(t, {
    rareAt: 1, rareTotal: 26, mistakeAt: 1, orientationIsWhite: false,
  });
  assert.equal(await Brain.getLatestGameFastForwardMoveCount(game), game.sans.length);
  assert.deepEqual(visited, fens);
});

test("an empty explorer result stops on the zero-game position", async (t) => {
  const { game, fens, visited } = setup(t, { rareAt: 3, rareTotal: 0 });
  assert.equal(await Brain.getLatestGameFastForwardMoveCount(game), 3);
  assert.deepEqual(visited, fens.slice(0, 4));
});

test("a saved White novelty takes precedence over the statistical best move", async (t) => {
  const { game, fens } = setup(t, { mistakeAt: 2, rareAt: 3, orientationIsWhite: false });
  t.mock.method(StorageW, "getNovelty", (fen: string) => fen === fens[2] ? "Nf3" : null);
  assert.equal(await Brain.getLatestGameFastForwardMoveCount(game), 3);
});

test("a rare final position is checked and the full game is loaded", async (t) => {
  const { game, fens, visited } = setup(t, { rareAt: 6 });
  await Brain.loadLatestGame(game);
  assert.equal(Brain.getState().fen, fens.at(-1));
  assert.deepEqual(visited, fens);
});

test("an empty import keeps the initial position", async (t) => {
  const { game, fens } = setup(t);
  game.sans = [];
  await Brain.loadLatestGame(game);
  assert.equal(Brain.getState().fen, fens[0]);
  assert.equal(Brain.getState().logs.length, 0);
});

for (const reason of ["new import", "view changed"] as const) {
  test(`cancellation during the rarity lookup prevents a history update: ${reason}`, async (t) => {
    const { game, updates } = setup(t);
    t.mock.method(StorageW, "getLichess", () => {
      if (reason === "new import") Brain.latestGameFastForwardVersion++;
      else Brain.view = View.endgame;
      return [];
    });
    await Brain.loadLatestGame(game);
    assert.equal(updates.mock.callCount(), 0);
  });
}

test("cancellation during the White recommendation lookup prevents a history update", async (t) => {
  const { game, updates } = setup(t);
  t.mock.method(Brain, "getBestByNoveltyElseScore", async () => {
    Brain.latestGameFastForwardVersion++;
    return "e4";
  });
  await Brain.loadLatestGame(game);
  assert.equal(updates.mock.callCount(), 0);
});
