import assert from "node:assert/strict";
import test from "node:test";

import Brain, { View } from "../src/chess420/Brain";
import { ENDGAMES, getEndgame } from "../src/chess420/Endgames";

function setEndgame(id: typeof Brain.endgameId) {
  Brain.view = View.endgame;
  Brain.endgameId = id;
}

function assertFiniteScore(fen: string) {
  const score = Brain.getEndgamePositionScore(fen);
  const vector = Brain.getEndgameScoreVector(score);
  assert.ok(vector.length > 0);
  assert.equal(Brain.compareEndgamePositionScores(score, score), 0);
  vector.forEach((value) => assert.equal(Number.isFinite(value), true));
}

function assertWhiteMaximizesScore(fen: string) {
  const moves = Brain.getChess(fen).moves();
  const idealMoves = Brain.getIdealEndgameWhiteMoves(fen);
  const scoredMoves = Brain.getEndgameMoveScores(fen, moves);
  const bestScore = scoredMoves
    .map((move) => move.score)
    .sort((a, b) => Brain.compareEndgamePositionScores(b, a))[0];

  assert.ok(idealMoves.length > 0);
  scoredMoves.forEach((move) => {
    const comparison = Brain.compareEndgamePositionScores(move.score, bestScore);
    assert.ok(comparison <= 0);
    assert.equal(idealMoves.includes(move.san), comparison === 0);
  });
}

function assertBlackMinimizesScore(fen: string) {
  const chess = Brain.getChess(fen);
  const candidates = Brain.getEndgameOpponentCandidates(chess);
  const scoredMoves = Brain.getEndgameMoveScores(fen, candidates.moves);
  const bestScore = scoredMoves
    .map((move) => move.score)
    .sort((a, b) => Brain.compareEndgamePositionScores(a, b))[0];

  assert.ok(candidates.idealMoves.length > 0);
  scoredMoves.forEach((move) => {
    const comparison = Brain.compareEndgamePositionScores(move.score, bestScore);
    assert.ok(comparison >= 0);
    assert.equal(candidates.idealMoves.includes(move.san), comparison === 0);
  });
}

test("endgame registry uses expected training starts", () => {
  assert.equal(
    getEndgame("knightAndBishop").fen,
    "8/8/8/3k4/8/8/8/4KBN1 w - - 0 1",
  );
  assert.equal(getEndgame("rook").fen, "8/8/8/8/4k3/8/8/R3K3 w - - 0 1");
  assert.equal(getEndgame("queen").fen, "8/8/8/8/4k3/8/8/3QK3 w - - 0 1");
});

test("piece-count guard detects impossible endgame positions", () => {
  setEndgame("rook");

  assert.equal(
    Brain.endgamePieceCountMatchesStart(getEndgame("rook").fen),
    true,
  );
  assert.equal(
    Brain.endgamePieceCountMatchesStart("8/8/8/8/4k3/8/8/4K3 w - - 0 1"),
    false,
  );
});

test("random endgame starts keep the same material in legal positions", () => {
  for (const id of [
    "knightAndBishop",
    "twoBishops",
    "twoKnightsVsPawn",
    "rook",
    "queen",
  ] as const) {
    const fen = Brain.getRandomEndgameFen(id);
    const expectedPieces = Brain.getEndgamePieces(getEndgame(id).fen)
      .map((piece) => `${piece.color}${piece.type}`)
      .sort();
    const actualPieces = Brain.getEndgamePieces(fen)
      .map((piece) => `${piece.color}${piece.type}`)
      .sort();

    assert.deepEqual(actualPieces, expectedPieces);
    assert.equal(Brain.isLegalEndgameStart(fen), true);
  }
});

test("every endgame has a comparable position score", () => {
  for (const endgame of ENDGAMES) {
    setEndgame(endgame.id);
    assertFiniteScore(endgame.fen);
  }
});

test("white ideal endgame moves maximize the resulting position score", () => {
  for (const endgame of ENDGAMES) {
    setEndgame(endgame.id);
    assertWhiteMaximizesScore(endgame.fen);
  }
});

test("black opponent replies minimize the resulting position score", () => {
  for (const endgame of ENDGAMES) {
    setEndgame(endgame.id);
    const chess = Brain.getChess(endgame.fen);
    chess.move(Brain.getIdealEndgameWhiteMoves(endgame.fen)[0]);
    assertBlackMinimizesScore(chess.fen());
  }
});

test("endgame start over resets to a fresh random legal position", () => {
  setEndgame("queen");
  Brain.history = {
    index: 0,
    states: [
      {
        fen: "8/8/8/8/7k/8/6Q1/4K3 w - - 6 4",
        startingFen: undefined,
        orientationIsWhite: true,
        logs: [{ fen: getEndgame("queen").fen, san: "Qb3" }],
      },
    ],
  };
  Brain.updateHistory = (history) => {
    Brain.history = history;
  };

  Brain.startOver();

  assert.equal(Brain.history.index, 0);
  assert.equal(Brain.history.states.length, 1);
  assert.deepEqual(Brain.history.states[0].logs, []);
  assert.equal(Brain.isLegalEndgameStart(Brain.history.states[0].fen), true);
  assert.deepEqual(
    Brain.getEndgamePieces(Brain.history.states[0].fen)
      .map((piece) => `${piece.color}${piece.type}`)
      .sort(),
    Brain.getEndgamePieces(getEndgame("queen").fen)
      .map((piece) => `${piece.color}${piece.type}`)
      .sort(),
  );
});

test("rook phase is calculated from the row or file cut", () => {
  setEndgame("rook");

  assert.equal(
    Brain.getEndgamePhase("8/8/8/8/2k5/R7/3K4/8 w - - 4 3"),
    "2/2",
  );
  assert.equal(
    Brain.getEndgamePhase("8/8/8/8/K2k4/8/8/2R5 w - - 0 1"),
    "2/2",
  );
  assert.equal(
    Brain.getEndgamePhase("8/8/8/8/2k5/8/3K4/8 w - - 4 3"),
    "0/2",
  );
});

test("rook opposite-color waiting moves are correct when they preserve the cut", () => {
  setEndgame("rook");
  const fen = "8/8/8/8/2k5/R7/3K4/8 w - - 4 3";
  const ideal = Brain.getIdealEndgameWhiteMoves(fen);

  assert.equal(ideal.includes("Rd3"), false);
  assert.ok(ideal.includes("Re3"));
  assert.ok(ideal.includes("Rf3"));
  assert.ok(ideal.includes("Rg3"));
  assert.ok(ideal.includes("Rh3"));
  assert.equal(ideal.includes("Rb3"), false);
});

test("rook king walk approaches the cut axis before waiting", () => {
  setEndgame("rook");

  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/8/8/3k4/R7/8/6K1/8 w - - 2 2"),
    ["Kg3"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/1K6/8/7R/4k3/8/8/8 w - - 2 2"),
    ["Kb6"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("3R4/8/8/4k3/8/8/1K6/8 w - - 2 2"),
    ["Kc2"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/6K1/8/8/3k4/8/8/4R3 w - - 2 2"),
    ["Kf7"],
  );
});

test("rook box reduction beats king walking when it removes a full row or file", () => {
  setEndgame("rook");

  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/8/8/2k5/8/R7/3K4/8 w - - 0 1"),
    ["Ra4"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("2R5/8/4k3/1K6/8/8/8/8 w - - 0 1"),
    ["Rd8"],
  );
});

test("rook phase 2 rejects rook moves onto the white king line", () => {
  setEndgame("rook");
  const fen = "8/8/8/3k4/7R/2K5/8/8 w - - 14 8";
  const ideal = Brain.getIdealEndgameWhiteMoves(fen);

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.ok(Brain.getChess(fen).moves().includes("Rc4"));
  assert.equal(ideal.includes("Rc4"), false);
});

test("rook waiting moves cannot leave black between the rook and king", () => {
  setEndgame("rook");
  const fen = "8/8/8/3k4/7R/2K5/8/8 w - - 14 8";
  const ideal = Brain.getIdealEndgameWhiteMoves(fen);

  assert.ok(Brain.getChess(fen).moves().includes("Rg4"));
  assert.equal(ideal.includes("Rg4"), false);
});

test("rook checks cannot move the rook next to the black king", () => {
  setEndgame("rook");
  const fen = "8/3k4/6R1/2K5/8/8/8/8 w - - 42 22";
  const ideal = Brain.getIdealEndgameWhiteMoves(fen);

  assert.ok(Brain.getChess(fen).moves().includes("Rd6+"));
  assert.equal(ideal.includes("Rd6+"), false);
});

test("rook defense captures a hanging rook", () => {
  setEndgame("rook");
  const fen = "8/8/8/8/3kR3/8/8/4K3 b - - 0 1";

  assert.deepEqual(Brain.getEndgameOpponentCandidates(Brain.getChess(fen)).idealMoves, [
    "Kxe4",
  ]);
});

test("rook defense stays close to the rook to resist box reduction", () => {
  setEndgame("rook");
  const chess = Brain.getChess("1R6/5k2/8/8/8/4K3/8/8 w - - 0 1");
  chess.move("Rb6");

  assert.deepEqual(Brain.getEndgameOpponentCandidates(chess).idealMoves, [
    "Ke7",
  ]);
});

test("rook defense proximity to the rook works when rotated or mirrored", () => {
  setEndgame("rook");
  const fileCut = Brain.getChess("8/7R/8/8/2K5/6k1/8/8 w - - 0 1");
  fileCut.move("Rf7");
  const mirrored = Brain.getChess("6R1/2k5/8/8/8/3K4/8/8 w - - 0 1");
  mirrored.move("Rg6");

  assert.deepEqual(Brain.getEndgameOpponentCandidates(fileCut).idealMoves, [
    "Kg4",
  ]);
  assert.deepEqual(Brain.getEndgameOpponentCandidates(mirrored).idealMoves, [
    "Kd7",
  ]);
});

test("queen correctness avoids checking loops and prefers progress", () => {
  setEndgame("queen");
  const fen = "8/8/8/8/7k/8/6Q1/4K3 w - - 6 4";
  const ideal = Brain.getIdealEndgameWhiteMoves(fen);

  assert.ok(ideal.includes("Kf2"));
  assert.equal(ideal.includes("Qh2+"), false);
  assert.equal(ideal.includes("Qg2+"), false);
});

test("queen starts by cutting off the black king", () => {
  setEndgame("queen");

  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(getEndgame("queen").fen), [
    "Qb3",
  ]);
});

test("queen moves onto the adjacent edge-cage line before walking the king", () => {
  setEndgame("queen");
  const fen = "8/8/8/8/7k/4Q3/8/4K3 w - - 6 4";

  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Qg1"]);
});

test("queen corner cage walks the king diagonally toward the corner", () => {
  setEndgame("queen");
  const fen = "7k/8/8/6Q1/8/5K2/8/8 w - - 18 10";

  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Kf4"]);
});

test("queen corner cage prefers quiet squeeze over checking", () => {
  setEndgame("queen");
  const fen = "7k/8/8/6Q1/7K/8/8/8 w - - 4 3";

  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Qe7"]);
});

test("queen near edge cuts off escape squares", () => {
  setEndgame("queen");
  const fen = "4Q3/8/8/6k1/8/8/8/5K2 w - - 0 1";

  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Qf7"]);
});

test("queen defense escapes toward the center when possible", () => {
  setEndgame("queen");
  const chess = Brain.getChess("4Q3/8/8/6k1/8/8/8/5K2 w - - 0 1");
  chess.move("Qe4");

  assert.deepEqual(Brain.getEndgameOpponentCandidates(chess).idealMoves, [
    "Kf6",
  ]);
});

test("queen defense captures a hanging queen", () => {
  setEndgame("queen");
  const fen = "8/8/8/8/3kQ3/8/8/4K3 b - - 0 1";

  assert.deepEqual(Brain.getEndgameOpponentCandidates(Brain.getChess(fen)).idealMoves, [
    "Kxe4",
  ]);
});

test("queen cage hands off to the king walk after the edge line is set", () => {
  setEndgame("queen");
  const fen = "8/8/8/7k/8/8/5KQ1/8 w - - 6 4";

  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Kf3"]);
});

test("queen edge lock must land on the adjacent cage line", () => {
  setEndgame("queen");
  const fen = "8/3K4/8/8/8/3Q4/k7/8 w - - 2 2";

  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Qb5"]);
});

test("queen corner cage allows equivalent king approach moves", () => {
  setEndgame("queen");
  const fen = "7k/3K4/8/8/6Q1/8/8/8 w - - 4 3";
  const ideal = Brain.getIdealEndgameWhiteMoves(fen);

  assert.ok(ideal.includes("Ke7"));
  assert.ok(ideal.includes("Ke6"));
});

test("queen king walk keeps the queen cage between the kings", () => {
  setEndgame("queen");
  const fen = "2k5/5Q2/K7/8/8/8/8/8 w - - 2 2";

  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Kb6"]);
});

test("knight and bishop phase and first study move are recognized", () => {
  setEndgame("knightAndBishop");
  const fen = getEndgame("knightAndBishop").fen;

  assert.equal(Brain.getEndgamePhase(fen), "1/3");
  assert.ok(Brain.getIdealEndgameWhiteMoves(fen).includes("Kd2"));
});

test("unfinished endgames use basic scores instead of all legal moves", () => {
  setEndgame("twoBishops");
  const fen = getEndgame("twoBishops").fen;
  const idealMoves = Brain.getIdealEndgameWhiteMoves(fen);

  assert.equal(Brain.getEndgamePhase(fen), "1/2");
  assert.deepEqual(idealMoves, ["Ba3", "Bg5"]);
  assertWhiteMaximizesScore(fen);
});
