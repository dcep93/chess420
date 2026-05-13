import assert from "node:assert/strict";
import test from "node:test";

import Brain, { View } from "../src/chess420/Brain";
import { Header } from "../src/chess420/Controls";
import { ENDGAMES, getEndgame, type EndgameId } from "../src/chess420/Endgames";
import { assignBrainRoute } from "../src/chess420/Routing";
import settings from "../src/chess420/Settings";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setEndgame(id: typeof Brain.endgameId) {
  Brain.view = View.endgame;
  Brain.endgameId = id;
}

type TestElement = {
  type?: unknown;
  props?: {
    children?: unknown;
  };
};

function isTestElement(node: unknown): node is TestElement {
  return typeof node === "object" && node !== null;
}

function getChildren(node: unknown): unknown[] {
  if (!isTestElement(node) || !node.props) return [];
  const children = node.props.children;
  if (children === undefined || children === null) return [];
  return Array.isArray(children) ? children.flatMap(getChildrenValue) : [children];
}

function getChildrenValue(node: unknown): unknown[] {
  return Array.isArray(node) ? node.flatMap(getChildrenValue) : [node];
}

function hasElementType(node: unknown, type: string): boolean {
  if (!isTestElement(node)) return false;
  return node.type === type || getChildren(node).some((child) => hasElementType(child, type));
}

function textContent(node: unknown): string {
  if (node === undefined || node === null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isTestElement(node)) return "";
  return getChildren(node).map(textContent).join("");
}

function setTestHash(hash = "") {
  (
    globalThis as typeof globalThis & {
      window: { location: { hash: string } };
    }
  ).window = { location: { hash } };
}

function assertFiniteScore(fen: string) {
  const score = Brain.getEndgamePositionScore(fen);
  const vector = Brain.getEndgameScoreVector(score);
  assert.ok(vector.length > 0);
  assert.equal(Brain.compareEndgamePositionScores(score, score), 0);
  vector.forEach((value) => assert.equal(Number.isFinite(value), true));
}

function assertLegalSans(fen: string, sans: string[]) {
  const legalMoves = Brain.getChess(fen).moves();
  assert.ok(sans.length > 0);
  sans.forEach((san) => assert.ok(legalMoves.includes(san), san));
}

type ExpectedEndgameBestMoves = string | string[];

function expectedMovesArray(expected: ExpectedEndgameBestMoves): string[] {
  return Array.isArray(expected) ? expected : [expected];
}

function assertBestEndgameLineToMate(
  id: EndgameId,
  startingFen: string,
  expectedLine: ExpectedEndgameBestMoves[],
) {
  setEndgame(id);
  const chess = Brain.getChess(startingFen);

  expectedLine.forEach((expectedBestMoves, index) => {
    assert.equal(chess.isCheckmate(), false);
    const actualBestMoves =
      chess.turn() === "w"
        ? Brain.getIdealEndgameWhiteMoves(chess.fen())
        : Brain.getEndgameOpponentCandidates(chess).idealMoves;
    const expectedMoves = expectedMovesArray(expectedBestMoves);
    const moveNumber = Math.floor(index / 2) + 1;
    const side = chess.turn() === "w" ? "white" : "black";

    assert.deepEqual(
      actualBestMoves,
      expectedMoves,
      `${id} ${side} move ${moveNumber} from ${chess.fen()}`,
    );
    chess.move(expectedMoves[0]);
  });

  assert.equal(chess.isCheckmate(), true);
  assert.equal(Brain.getEndgameTerminalOutcome(chess.fen()), "checkmate");
}

test("endgame registry uses expected training starts", () => {
  assert.equal(
    getEndgame("knightAndBishop").fen,
    "8/8/8/3k4/8/8/8/4KBN1 w - - 0 1",
  );
  assert.deepEqual(getEndgame("knightAndBishop").study, {
    id: "Swsb2uYm",
    name: "Knight +  Bishop mate - Easy Guide",
    source: "./studies/knight-and-bishop-mate-easy-guide.json",
    initialFen: "8/8/8/3k4/8/8/8/4KBN1 w - - 0 1",
  });
  assert.equal(getEndgame("rook").fen, "8/8/8/8/4k3/8/8/R3K3 w - - 0 1");
  assert.equal(getEndgame("queen").fen, "8/8/8/8/4k3/8/8/3QK3 w - - 0 1");
});

test("raw endgames route opens the endgame picker", () => {
  setTestHash();
  Brain.endgameId = "rook";

  assert.equal(assignBrainRoute("/endgames"), true);
  assert.equal(Brain.view, View.endgame);
  assert.equal(Brain.endgameId, undefined);

  const state = Brain.getInitialState();
  assert.equal(state.fen, Brain.ENDGAME_PICKER_FEN);
  assert.equal(Brain.hasSelectedEndgame(), false);
});

test("selected and invalid endgame routes are handled", () => {
  setTestHash();
  assert.equal(assignBrainRoute("/endgames/rook"), true);
  assert.equal(Brain.view, View.endgame);
  assert.equal(Brain.endgameId, "rook");
  assert.equal(Brain.isLegalEndgameStart(Brain.getInitialState().fen), true);

  assert.equal(assignBrainRoute("/endgames/nope"), false);
});

test("endgame dropdown is only shown in endgame mode", () => {
  Brain.view = View.speedrun;
  Brain.endgameId = undefined;
  assert.equal(hasElementType(Header(), "select"), false);

  Brain.view = View.endgame;
  let header = Header();
  assert.equal(hasElementType(header, "select"), true);
  assert.match(textContent(header), /select endgame/);
  assert.doesNotMatch(textContent(header), /home/);

  Brain.endgameId = "rook";
  header = Header();
  assert.equal(hasElementType(header, "select"), true);
  assert.match(textContent(header), /select endgame/);
  assert.doesNotMatch(textContent(header), /home/);
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

test("non-rook and non-queen endgames use generic legal deterministic moves", () => {
  for (const endgame of ENDGAMES.filter(
    (endgame) => endgame.id !== "rook" && endgame.id !== "queen",
  )) {
    setEndgame(endgame.id);
    const whiteMoves = Brain.getIdealEndgameWhiteMoves(endgame.fen);
    assertLegalSans(endgame.fen, whiteMoves);

    const chess = Brain.getChess(endgame.fen);
    chess.move(whiteMoves[0]);
    const candidates = Brain.getEndgameOpponentCandidates(chess);
    assertLegalSans(chess.fen(), candidates.idealMoves);
    assert.deepEqual(
      candidates.idealMoves,
      Brain.getEndgameOpponentCandidates(Brain.getChess(chess.fen())).idealMoves,
    );
  }
});

test("queen white rules choose explicit best moves", () => {
  setEndgame("queen");

  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("7k/5K2/8/8/8/8/8/1Q6 w - - 0 1"),
    ["Qh1#"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/8/8/8/4k3/8/8/3QK3 w - - 0 1"),
    ["Qd2"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("7k/8/8/6Q1/8/5K2/8/8 w - - 0 1"),
    ["Kf4"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/8/4K3/2Q5/8/1k6/8/8 w - - 2 2"),
    ["Kd5"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("7k/4Q3/4K3/8/8/8/8/8 w - - 18 10"),
    ["Kf6"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/8/K7/8/3k4/Q7/8/8 w - - 0 1"),
    ["Qb3"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/8/3K4/8/8/4k3/7Q/8 w - - 0 1"),
    ["Qg2"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/8/5k2/3Q4/6K1/8/8/8 w - - 6 4"),
    ["Kf4"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/7k/5Q2/5K2/8/8/8/8 w - - 20 11"),
    ["Qg5"],
  );
});

test("queen white rules avoid queen loss and stalemate", () => {
  setEndgame("queen");

  const unsafeFen = "8/8/8/8/4k3/8/8/3QK3 w - - 0 1";
  Brain.getIdealEndgameWhiteMoves(unsafeFen).forEach((san) => {
    const chess = Brain.getChess(unsafeFen);
    chess.move(san);
    assert.equal(Brain.blackCanTakeWhiteMajorPiece(chess.fen(), "q"), false);
  });

  const stalemateFen = "8/8/8/8/8/K7/2Q5/k7 w - - 0 1";
  Brain.getIdealEndgameWhiteMoves(stalemateFen).forEach((san) => {
    const chess = Brain.getChess(stalemateFen);
    chess.move(san);
    assert.equal(chess.isStalemate(), false);
  });
});

test("queen white rules hand off to king approach in an existing cage", () => {
  setEndgame("queen");
  const fen = "6k1/4Q3/8/8/8/5K2/8/8 w - - 0 1";
  const ideal = Brain.getIdealEndgameWhiteMoves(fen);

  assert.ok(ideal.length > 0);
  ideal.forEach((san) => {
    const chess = Brain.getChess(fen);
    const move = chess.move(san);
    assert.equal(move?.piece, "k");
    const whiteQueen = Brain.findPiece(chess.fen(), "w", "q");
    const whiteKing = Brain.findPiece(chess.fen(), "w", "k");
    assert.ok(whiteQueen && whiteKing);
    assert.equal(
      Brain.getQueenCageKingApproachDistance(
        whiteKing!.square,
        whiteQueen!.square,
        "h8",
      ),
      2,
    );
  });
});

test("queen white rules keep walking the king once a two-square cage exists", () => {
  setEndgame("queen");

  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("k7/8/8/1Q6/2K5/8/8/8 w - - 6 4"),
    ["Kc5"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("7k/8/8/6Q1/5K2/8/8/8 w - - 6 4"),
    ["Kf5"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("4K2k/4Q3/8/8/8/8/8/8 w - - 10 6"),
    ["Kd7"],
  );
});

test("queen cage detection requires both cage squares to be stable", () => {
  setEndgame("queen");
  const chess = Brain.getChess("1k6/3K4/8/2Q5/8/8/8/8 w - - 2 2");
  chess.move("Qc7+");

  assert.equal(Brain.getQueenTwoSquareCage(chess.fen()), null);
});

test("queen black rules choose explicit defensive moves", () => {
  setEndgame("queen");

  assert.deepEqual(
    Brain.getEndgameOpponentCandidates(
      Brain.getChess("8/8/8/8/3kQ3/8/8/4K3 b - - 0 1"),
    ).idealMoves,
    ["Kxe4"],
  );
  assert.deepEqual(
    Brain.getEndgameOpponentCandidates(
      Brain.getChess("8/8/8/8/3k4/8/8/3QK3 b - - 0 1"),
    ).idealMoves,
    ["Ke5", "Ke4"],
  );
});

test("queen best-move line from two-square cage walks to mate", () => {
  assertBestEndgameLineToMate(
    "queen",
    "8/8/8/8/8/3K4/3Q4/1k6 w - - 34 18",
    ["Kc3", "Ka1", "Qb2#"],
  );
});

test("rook white rules choose explicit best moves", () => {
  setEndgame("rook");

  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("7k/5K2/8/8/8/8/8/R7 w - - 0 1"),
    ["Rh1#"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("5K2/3R4/8/8/8/k7/8/8 w - - 0 1"),
    ["Rb7"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/8/8/2k5/8/R7/3K4/8 w - - 0 1"),
    ["Ra4"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("2R5/8/4k3/1K6/8/8/8/8 w - - 0 1"),
    ["Rd8"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/8/2k5/1R6/8/6K1/8/8 w - - 2 2"),
    ["Rh5"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/4k3/R7/8/2K5/8/8/8 w - - 12 7"),
    ["Kd5"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("5R2/8/8/8/8/4K3/8/6k1 w - - 8 5"),
    ["Ke2"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/1k6/7R/1K6/8/8/8/8 w - - 8 5"),
    ["Rh7+"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("5k2/8/3K4/8/8/8/8/4R3 w - - 8 5"),
    ["Kd7"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("4k3/8/8/6R1/8/8/6K1/8 w - - 0 1"),
    ["Kf3"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/8/8/k7/1R6/3K4/8/8 w - - 8 5"),
    ["Rb1"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/8/5R2/6k1/8/6K1/8/8 w - - 2 2"),
    ["Rf1"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/8/8/5R2/4K3/6k1/8/8 w - - 4 3"),
    ["Ke3"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("7K/8/8/2R5/8/8/8/7k w - - 0 1"),
    ["Rc2"],
  );
});

test("rook white rules avoid rook loss and stalemate", () => {
  setEndgame("rook");

  const unsafeFen = "8/8/8/8/4R3/3k4/8/4K3 w - - 0 1";
  const unsafeBestMoves = Brain.getIdealEndgameWhiteMoves(unsafeFen);
  unsafeBestMoves.forEach((san) => {
    const chess = Brain.getChess(unsafeFen);
    chess.move(san);
    assert.equal(Brain.blackCanTakeWhiteMajorPiece(chess.fen(), "r"), false);
  });

  const stalemateFen = "8/8/8/8/R7/K7/8/k7 w - - 0 1";
  Brain.getIdealEndgameWhiteMoves(stalemateFen).forEach((san) => {
    const chess = Brain.getChess(stalemateFen);
    chess.move(san);
    assert.equal(chess.isStalemate(), false);
  });
});

test("rook white rules use rank and file box cuts symmetrically", () => {
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

test("rook white rules separate the white king and rook", () => {
  setEndgame("rook");
  const fen = "8/8/8/8/8/k7/8/1KR5 w - - 0 1";
  const ideal = Brain.getIdealEndgameWhiteMoves(fen);

  assert.deepEqual(ideal, ["Rc8"]);
  ideal.forEach((san) => {
    const chess = Brain.getChess(fen);
    chess.move(san);
    const whiteRook = Brain.findPiece(chess.fen(), "w", "r");
    const whiteKing = Brain.findPiece(chess.fen(), "w", "k");
    assert.ok(whiteRook && whiteKing);
    assert.equal(Brain.isDiagonalKingMove(whiteRook!.square, whiteKing!.square), false);
    assert.equal(Brain.sharesRankOrFile(whiteRook!.square, whiteKing!.square), false);
  });
});

test("rook black rules choose explicit defensive moves", () => {
  setEndgame("rook");

  assert.deepEqual(
    Brain.getEndgameOpponentCandidates(
      Brain.getChess("8/8/8/8/3kR3/8/8/4K3 b - - 0 1"),
    ).idealMoves,
    ["Kxe4"],
  );

  const re1 = Brain.getChess("8/8/8/4R3/3k4/8/5K2/8 w - - 4 3");
  re1.move("Re1");
  assert.deepEqual(Brain.getEndgameOpponentCandidates(re1).idealMoves, ["Kd3"]);

  const kc4 = Brain.getChess("3k4/8/4R3/1K6/8/8/8/8 w - - 10 6");
  kc4.move("Kc4");
  assert.deepEqual(Brain.getEndgameOpponentCandidates(kc4).idealMoves, ["Kd7"]);

  const kc5 = Brain.getChess("8/4k3/R7/8/2K5/8/8/8 w - - 12 7");
  kc5.move("Kc5");
  assert.deepEqual(
    Brain.getEndgameOpponentCandidates(kc5).idealMoves.slice().sort(),
    ["Kd7"],
  );

  assert.deepEqual(
    Brain.getEndgameOpponentCandidates(
      Brain.getChess("8/8/4k3/8/3R4/4K3/8/8 b - - 0 1"),
    ).idealMoves,
    ["Ke5"],
  );
  assert.deepEqual(
    Brain.getEndgameOpponentCandidates(
      Brain.getChess("8/8/4k3/8/2R5/4K3/8/8 b - - 0 1"),
    ).idealMoves,
    ["Kd5"],
  );
});

test("rook black rules approach the rook before the center", () => {
  setEndgame("rook");
  const chess = Brain.getChess("8/8/8/8/8/3k4/5R2/4K3 b - - 0 1");
  const candidates = Brain.getEndgameOpponentCandidates(chess);

  assert.deepEqual(candidates.idealMoves, ["Ke3"]);
});

test("rook phase 2 uses post-box rook distance priorities", () => {
  setEndgame("rook");

  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/8/8/8/4K3/7R/3k4/8 w - - 14 8"),
    ["Kd4"],
  );
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

test("endgame autoreply waits until after the white move is committed", async () => {
  setEndgame("rook");
  Brain.autoreplyRef = { current: { checked: true } } as typeof Brain.autoreplyRef;
  const startedAt = Date.now() - 1000;
  Brain.history = {
    index: 0,
    states: [
      {
        fen: "1R6/5k2/8/8/8/4K3/8/8 w - - 0 1",
        startingFen: undefined,
        orientationIsWhite: true,
        logs: [],
        endgame_started_at_ms: startedAt,
      },
    ],
  };
  Brain.updateHistory = (history) => {
    Brain.history = history;
  };

  Brain.playEndgameMove("Rb6");

  assert.equal(
    Brain.getState().fen,
    "8/5k2/1R6/8/8/4K3/8/8 b - - 1 1",
  );
  assert.equal(Brain.getState().logs[0].san, "Rb6");
  assert.equal(Brain.getState().logs[0].opponent_san, undefined);
  assert.equal(typeof Brain.getState().logs[0].duration_ms, "number");
  assert.ok(Brain.getState().logs[0].duration_ms! >= 1000);
  const firstMoveAt = Brain.getState().logs[0].created_at_ms!;
  assert.equal(Brain.getEndgameElapsedMs(Brain.getState(), firstMoveAt), 0);
  assert.equal(Brain.getEndgameElapsedMs(Brain.getState(), firstMoveAt + 500), 500);

  await wait(settings.REPLY_DELAY_MS + 25);

  assert.ok(
    [
      "8/4k3/1R6/8/8/4K3/8/8 w - - 2 2",
      "8/6k1/1R6/8/8/4K3/8/8 w - - 2 2",
    ].includes(Brain.getState().fen),
  );
  assert.ok(["Ke7", "Kg7"].includes(Brain.getState().logs[0].opponent_san ?? ""));

  Brain.autoreplyRef = { current: { checked: false } } as typeof Brain.autoreplyRef;
  Brain.playEndgameMove("Rb7");
  assert.equal(Brain.getState().logs[1].san, "Rb7+");
  assert.equal(typeof Brain.getState().logs[1].duration_ms, "number");
});
