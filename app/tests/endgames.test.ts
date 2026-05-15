import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { type Square } from "chess.js";

import Brain, { View } from "../src/chess420/Brain";
import { Header } from "../src/chess420/Controls";
import {
  ENDGAME_OPTIONS,
  ENDGAMES,
  getBaseEndgame,
  getEndgame,
  type EndgameId,
} from "../src/chess420/Endgames";
import { type LogType } from "../src/chess420/Log";
import { assignBrainRoute } from "../src/chess420/Routing";
import settings from "../src/chess420/Settings";

type StudyTreePart = {
  ply: number;
  fen: string;
  san?: string;
};

const KNIGHT_AND_BISHOP_EASY_GUIDE = JSON.parse(
  readFileSync(
    "src/chess420/studies/knight-and-bishop-mate-easy-guide.json",
    "utf8",
  ),
) as { data: { treeParts: StudyTreePart[] } };

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setEndgame(id: typeof Brain.endgameId) {
  Brain.view = View.endgame;
  Brain.endgameId = id;
}

function assertPhaseTwoOnlyOnWhiteTurn(fen: string) {
  assert.equal(
    Brain.getEndgamePhase(fen),
    Brain.getChess(fen).turn() === "w" ? "2/2" : "1/2",
    fen,
  );
}

type TestElement = {
  type?: unknown;
  props?: {
    children?: unknown;
    disabled?: boolean;
    value?: string;
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

function findElementsByType(node: unknown, type: string): TestElement[] {
  if (!isTestElement(node)) return [];
  const matches = node.type === type ? [node] : [];
  return matches.concat(
    getChildren(node).flatMap((child) => findElementsByType(child, type)),
  );
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

function fullSortBestMoves<T>(
  moves: string[],
  scoreMove: (san: string, index: number) => T,
  compareScores: (a: T, b: T) => number,
): string[] {
  const scoredMoves = moves
    .map((san, index) => ({ san, index, score: scoreMove(san, index) }))
    .sort((a, b) => compareScores(a.score, b.score));
  const best = scoredMoves[0].score;
  return scoredMoves
    .filter((move) => compareScores(move.score, best) === 0)
    .map((move) => move.san);
}

function fullSortBestPositionMoves(
  fen: string,
  moves: string[],
  maximize: boolean,
): string[] {
  const scoredMoves = Brain.getEndgameMoveScores(fen, moves);
  scoredMoves.sort((a, b) => {
    return maximize
      ? Brain.compareEndgamePositionScores(b.score, a.score)
      : Brain.compareEndgamePositionScores(a.score, b.score);
  });
  const best = scoredMoves[0];
  return scoredMoves
    .filter(
      (move) => Brain.compareEndgamePositionScores(move.score, best.score) === 0,
    )
    .map((move) => move.san);
}

function lookupEntryFen(key: string): string {
  return `${key.split(" ")[0]} w - - 0 1`;
}

function transformLookupEntryFen(
  key: string,
  transformName: string,
): string {
  const transform = Brain.getSquareTransform(transformName);
  const boardFen = Brain.boardFenFromPlacements(
    Brain.getEndgamePiecePlacements(lookupEntryFen(key)).map((piece) => ({
      ...piece,
      square: Brain.transformSquare(piece.square, transform),
    })),
  );
  return `${boardFen} w - - 0 1`;
}

function getMoveSan(fen: string, from: Square, to: Square): string {
  const chess = Brain.getChess(fen);
  const move = chess.move({ from, to });
  assert.ok(move, `${from}-${to} should be legal in ${fen}`);
  return move.san;
}

function transformedFenSet(fen: string): Set<string> {
  return new Set(
    Brain.SQUARE_TRANSFORMS.map((transform) =>
      Brain.getRandomTransformedEndgameFenWithTransform(fen, transform),
    ),
  );
}

function transformedFenSets(fens: string[]): Set<string> {
  return new Set(fens.flatMap((fen) => [...transformedFenSet(fen)]));
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function boardTurnKey(fen: string): string {
  const [board, turn] = fen.split(" ");
  return `${board} ${turn}`;
}

function playKnightAndBishopSelfPlay(
  fen: string,
  limit = 100,
  seed = 1,
): {
  result: "mate" | "loop-before-phase2" | "limit" | "no-move";
  plies: number;
  phaseTwoReached: boolean;
  finalFen: string;
  moves: string[];
} {
  setEndgame("knightAndBishop");
  const random = seededRandom(seed);
  const chess = Brain.getChess(fen);
  const seen = new Set<string>();
  const moves: string[] = [];
  let phaseTwoReached = false;
  let lastWhiteTurnFen: string | undefined;
  let blackReturnTargetFen: string | undefined;

  for (let ply = 0; ply < limit; ply += 1) {
    phaseTwoReached ||= Brain.getEndgamePhase(chess.fen()) === "2/2";
    if (chess.isCheckmate()) {
      return {
        result: "mate",
        plies: ply,
        phaseTwoReached,
        finalFen: chess.fen(),
        moves,
      };
    }

    const key = boardTurnKey(chess.fen());
    if (!phaseTwoReached && seen.has(key)) {
      return {
        result: "loop-before-phase2",
        plies: ply,
        phaseTwoReached,
        finalFen: chess.fen(),
        moves,
      };
    }
    seen.add(key);

    const choices =
      chess.turn() === "w"
        ? Brain.getIdealEndgameWhiteMoves(chess.fen())
        : Brain.getEndgameOpponentCandidates(chess, blackReturnTargetFen)
            .idealMoves;
    const move = choices[Math.floor(random() * choices.length)];
    if (!move) {
      return {
        result: "no-move",
        plies: ply,
        phaseTwoReached,
        finalFen: chess.fen(),
        moves,
      };
    }
    if (chess.turn() === "w") {
      blackReturnTargetFen = lastWhiteTurnFen;
      lastWhiteTurnFen = chess.fen();
    } else {
      blackReturnTargetFen = undefined;
    }
    moves.push(move);
    chess.move(move);
  }

  return {
    result: "limit",
    plies: limit,
    phaseTwoReached,
    finalFen: chess.fen(),
    moves,
  };
}

type ExpectedEndgameBestMoves = string | string[];

function expectedMovesArray(expected: ExpectedEndgameBestMoves): string[] {
  return Array.isArray(expected) ? expected : [expected];
}

function firstLegalExpectedMove(chess: ReturnType<typeof Brain.getChess>, expectedMoves: string[]): string {
  const legalMoves = chess.moves();
  const match = expectedMoves.find((move) => legalMoves.includes(move));
  assert.ok(match, `No legal expected move from ${chess.fen()} in [${expectedMoves.join(", ")}]`);
  return match;
}

function assertBestEndgameLineToMate(
  id: EndgameId,
  startingFen: string,
  expectedLine: ExpectedEndgameBestMoves[],
) {
  setEndgame(id);
  const chess = Brain.getChess(startingFen);
  let lastWhiteTurnFen: string | undefined;
  let blackReturnTargetFen: string | undefined;

  expectedLine.forEach((expectedBestMoves, index) => {
    assert.equal(chess.isCheckmate(), false);
    const actualBestMoves =
      chess.turn() === "w"
        ? Brain.getIdealEndgameWhiteMoves(chess.fen())
        : Brain.getEndgameOpponentCandidates(chess, blackReturnTargetFen)
            .idealMoves;
    const expectedMoves = expectedMovesArray(expectedBestMoves);
    const moveNumber = Math.floor(index / 2) + 1;
    const side = chess.turn() === "w" ? "white" : "black";

    assert.deepEqual(
      actualBestMoves,
      expectedMoves,
      `${id} ${side} move ${moveNumber} from ${chess.fen()}`,
    );
    if (chess.turn() === "w") {
      blackReturnTargetFen = lastWhiteTurnFen;
      lastWhiteTurnFen = chess.fen();
    } else {
      blackReturnTargetFen = undefined;
    }
    chess.move(expectedMoves[0]);
  });

  assert.equal(chess.isCheckmate(), true);
  assert.equal(Brain.getEndgameTerminalOutcome(chess.fen()), "checkmate");
}

type HardcodedEndgameLineFixture = {
  id: EndgameId;
  startingFen: string;
  seed: number;
  expectedLine: string[][];
};

function assertSeededBestEndgameFixture(fixture: HardcodedEndgameLineFixture) {
  setEndgame(fixture.id);
  const random = seededRandom(fixture.seed);
  const chess = Brain.getChess(fixture.startingFen);

  fixture.expectedLine.forEach((expectedMoves, index) => {
    assert.equal(chess.isCheckmate(), false);
    const actualBestMoves =
      chess.turn() === "w"
        ? Brain.getIdealEndgameWhiteMoves(chess.fen())
        : Brain.getEndgameOpponentCandidates(chess).idealMoves;
    const moveNumber = Math.floor(index / 2) + 1;
    const side = chess.turn() === "w" ? "white" : "black";

    assert.deepEqual(
      actualBestMoves,
      expectedMoves,
      `${fixture.id} fixture from ${fixture.startingFen}: ${side} move ${moveNumber} at ${chess.fen()}`,
    );
    assertLegalSans(chess.fen(), expectedMoves);
    chess.move(expectedMoves[Math.floor(random() * expectedMoves.length)]);
  });

  assert.equal(chess.isCheckmate(), true, fixture.startingFen);
  assert.equal(Brain.getEndgameTerminalOutcome(chess.fen()), "checkmate");
}

const HARDCODED_ENDGAME_LINE_FIXTURES = JSON.parse(`[{"id":"knightAndBishop","startingFen":"8/8/8/2N1k3/8/3B4/K7/8 w - - 0 1","seed":73000,"expectedLine":[["Nb3"],["Kd5"],["Ka3"],["Ke5"],["Kb4"],["Kd5"],["Nc5"],["Ke5"],["Kc4"],["Kf4"],["Kd4"],["Kg5"],["Ke5"],["Kg4"],["Ke4"],["Kg5"],["Nd7"],["Kg6"],["Kf4+"],["Kf7"],["Bf5"],["Ke7"],["Ke5"],["Kd8"],["Kd6"],["Ke8","Kc8"],["Bg6+"],["Kd8"],["Nc5"],["Kc8"],["Bf7"],["Kd8","Kb8"],["Be6"],["Ka7","Ka8"],["Kc7"],["Ka8"],["Kb6"],["Kb8"],["Na6+"],["Ka8"],["Bd5#"]]},{"id":"knightAndBishop","startingFen":"2N5/8/8/8/8/2KB4/7k/8 w - - 0 1","seed":73038,"expectedLine":[["Be4"],["Kg3"],["Kd3"],["Kf4"],["Kd4"],["Kg5"],["Ke5"],["Kh6"],["Kf6"],["Kh5"],["Bf3+"],["Kh4"],["Be2"],["Kg3"],["Bd1"],["Kf2"],["Bh5"],["Kg3"],["Kg5"],["Kf2"],["Kf4"],["Kg2"],["Nd6"],["Kh3"],["Bg4+"],["Kh4"],["Nf5#"]]},{"id":"knightAndBishop","startingFen":"5B1N/8/8/4k3/8/5K2/8/8 w - - 0 1","seed":73076,"expectedLine":[["Ke3"],["Kf6"],["Ke4"],["Ke6"],["Bc5"],["Kd7"],["Kd5"],["Ke8"],["Ke6"],["Kd8"],["Bb6+"],["Ke8"],["Nf7"],["Kf8"],["Bc5+"],["Ke8"],["Nd6+"],["Kd8"],["Bb6#"]]},{"id":"knightAndBishop","startingFen":"1k4B1/8/8/4K3/8/3N4/8/8 w - - 0 1","seed":73114,"expectedLine":[["Kd6"],["Kc8"],["Be6+"],["Kd8"],["Ne5"],["Ke8"],["Nd7"],["Kd8"],["Bf7"],["Kc8"],["Nc5"],["Kd8","Kb8"],["Nb7+"],["Kc8"],["Kc6"],["Kb8"],["Kb6"],["Kc8","Ka8"],["Be6"],["Kb8"],["Nc5"],["Ka8"],["Bd7"],["Kb8"],["Na6+"],["Ka8"],["Bc6#"]]},{"id":"knightAndBishop","startingFen":"8/8/8/8/3N3k/1K6/8/B7 w - - 0 1","seed":73152,"expectedLine":[["Ne6"],["Kg4"],["Nd4"],["Kf4"],["Kc4"],["Ke3"],["Kd5"],["Kd2"],["Ke4"],["Kc1"],["Bc3"],["Kd1"],["Kd3"],["Kc1"],["Ne2+"],["Kd1"],["Bd4"],["Ke1"],["Bc3+"],["Kf2"],["Nd4"],["Kg3"],["Ke3"],["Kg4"],["Ke4"],["Kg3"],["Kf5"],["Kf2"],["Kf4"],["Kf1"],["Kf3"],["Kg1"],["Ne2+"],["Kf1"],["Ng3+"],["Kg1"],["Bd4+"],["Kh2"],["Bf2"],["Kh3"],["Bg1"],["Kh4"],["Ne4"],["Kh5","Kh3"],["Ng5+"],["Kh4"],["Kf4"],["Kh5"],["Kf5"],["Kh6","Kh4"],["Bf2+"],["Kh5"],["Ne6"],["Kh6"],["Bg3"],["Kh7","Kh5"],["Ng7+"],["Kh6"],["Kf6"],["Kh7"],["Kf7"],["Kh8","Kh6"],["Bf4"],["Kh7"],["Ne6"],["Kh8"],["Bg5"],["Kh7"],["Nf8+"],["Kh8"],["Bf6#"]]},{"id":"knightAndBishop","startingFen":"3K4/7k/5B2/8/8/8/4N3/8 w - - 0 1","seed":73190,"expectedLine":[["Nf4"],["Kh6"],["Ke7"],["Kh7"],["Kf8"],["Kh6"],["Kf7"],["Kh7"],["Bg5"],["Kh8"],["Ne6"],["Kh7"],["Nf8+"],["Kh8"],["Bf6#"]]},{"id":"knightAndBishop","startingFen":"2K5/8/4k3/5N2/8/8/8/6B1 w - - 0 1","seed":73228,"expectedLine":[["Ne3"],["Ke5"],["Kd7"],["Kf4"],["Ke6"],["Kg3"],["Kf5"],["Kf3"],["Ke5"],["Kg3"],["Ke4"],["Kh3"],["Bf2"],["Kh2"],["Kf3"],["Kh3"],["Be1"],["Kh2"],["Ng4+"],["Kg1"],["Bf2+"],["Kf1"],["Nh2#","Ne3#"]]},{"id":"knightAndBishop","startingFen":"8/4B3/4k3/8/N7/8/2K5/8 w - - 0 1","seed":73266,"expectedLine":[["Bc5"],["Kd5"],["Kd3"],["Kc6"],["Kc4"],["Kb7"],["Kb5"],["Kc7"],["Nb6"],["Kd8"],["Kc6"],["Ke8"],["Kd6"],["Kf7"],["Nd5"],["Kg6"],["Ba7"],["Kf7","Kg7","Kh7","Kh6","Kh5","Kg5","Kf5"],["Ne7+"],["Kf6","Kg5","Kg4","Kf4","Ke4"],["Ke5"],["Kg5"],["Kd6"],["Kf6","Kh6","Kh5","Kh4","Kg4","Kf4"],["Be3"],["Kf7","Kg7"],["Ke6"],["Kf8","Kh8","Kh7"],["Bd4"],["Ke8"],["Bc5"],["Kf8","Kd8"],["Nf5+"],["Kg8","Ke8"],["Kf6"],["Kh8","Kh7"],["Bd6"],["Kg8","Kh8"],["Kg6"],["Kg8"],["Nh6+"],["Kh8"],["Be5#"]]},{"id":"twoBishops","startingFen":"8/8/B7/8/8/2B2K2/8/7k w - - 0 1","seed":73296,"expectedLine":[["Bd3"],["Kh2","Kg1"],["Kg3"],["Kh1"],["Bd2"],["Kg1"],["Be3+"],["Kh1"],["Be4#"]]},{"id":"twoBishops","startingFen":"4k2B/8/8/3B1K2/8/8/8/8 w - - 0 1","seed":73334,"expectedLine":[["Bc6+"],["Ke7"],["Be5"],["Kd8"],["Bd5"],["Ke8","Ke7","Kd7","Kc8"],["Kg6"],["Kd8","Ke8","Kf8","Kd7"],["Kf7"],["Kc8","Kd8"],["Ke6"],["Ke8","Kc8"],["Kd6"],["Kd8","Kb8"],["Bf7"],["Kc8"],["Kc6"],["Kd8"],["Bf6+"],["Kc8"],["Be6+"],["Kb8"],["Kb6"],["Ka8"],["Be7"],["Kb8"],["Bd6+"],["Ka8"],["Bd5#"]]},{"id":"twoBishops","startingFen":"8/B7/K7/8/8/k7/4B3/8 w - - 0 1","seed":73372,"expectedLine":[["Bc5+"],["Ka4","Kb3"],["Bd1#"]]},{"id":"twoBishops","startingFen":"7k/7B/3B4/8/6K1/8/8/8 w - - 0 1","seed":73410,"expectedLine":[["Be4"],["Kg7"],["Be5+"],["Kf7"],["Bd5+"],["Ke7"],["Kg5"],["Kd7"],["Kf5"],["Kc8","Kd8","Ke8","Ke7"],["Kg6"],["Kd8","Ke8","Kf8","Kd7"],["Kf7"],["Kc8","Kd8"],["Ke6"],["Ke8","Kc8"],["Kd6"],["Kd8","Kb8"],["Bf7"],["Kc8"],["Kc6"],["Kd8"],["Bf6+"],["Kc8"],["Be6+"],["Kb8"],["Kb6"],["Ka8"],["Be7"],["Kb8"],["Bd6+"],["Ka8"],["Bd5#"]]},{"id":"twoBishops","startingFen":"8/8/8/8/1BB1K3/8/8/k7 w - - 0 1","seed":73448,"expectedLine":[["Bc3+"],["Kb1"],["Bd3+"],["Kc1"],["Ke3"],["Kd1"],["Bb2"],["Ke1"],["Bc2"],["Kf1"],["Kf3"],["Kg1","Ke1"],["Bc3+","Ke3"],["Kf1"],["Bd3+"],["Kg1"],["Kg3"],["Kh1"],["Bd2"],["Kg1"],["Be3+"],["Kh1"],["Be4#"]]},{"id":"twoBishops","startingFen":"8/6B1/8/8/4K3/3B4/8/3k4 w - - 0 1","seed":73486,"expectedLine":[["Bc3"],["Kc1"],["Ke3"],["Kd1"],["Bb2"],["Ke1"],["Bc2"],["Kf1"],["Kf3"],["Kg1","Ke1"],["Bd3"],["Kh2","Kh1"],["Kg3"],["Kg1"],["Bd4+"],["Kh1"],["Be4#"]]},{"id":"twoBishops","startingFen":"8/8/6B1/4B3/5K2/8/8/4k3 w - - 0 1","seed":73524,"expectedLine":[["Bc3+"],["Ke2"],["Be4"],["Kd1"],["Bd4"],["Kd2","Ke2","Ke1","Kc1"],["Kg3"],["Kf1","Ke1","Kd1","Kd2"],["Kf2"],["Kd1","Kc1"],["Ke3"],["Ke1","Kc1"],["Kd3"],["Kd1","Kb1"],["Bf2"],["Kc1"],["Kc3"],["Kd1"],["Bf3+"],["Kc1"],["Be3+"],["Kb1"],["Kb3"],["Ka1"],["Be2"],["Kb1"],["Bd3+"],["Ka1"],["Bd4#"]]},{"id":"twoBishops","startingFen":"8/4K3/8/1k6/8/7B/8/6B1 w - - 0 1","seed":73562,"expectedLine":[["Be3"],["Kc4"],["Bf5"],["Kd5"],["Kf6","Bd3","Bf4"],["Kd4"],["Kd6"],["Kc4"],["Be5"],["Kb5","Kb4"],["Be4"],["Kc4"],["Ke6"],["Kb5","Kc5","Kb3","Kb4"],["Bd5"],["Kb6","Kb4","Kb5"],["Bd4"],["Kb5"],["Kd7"],["Kb4"],["Kd6"],["Ka5","Kb5","Ka3","Ka4"],["Kc7"],["Ka6","Kb4","Ka4","Ka5"],["Kb6"],["Ka3","Ka4"],["Kc5"],["Ka5","Ka3"],["Bb3"],["Ka6"],["Kc6"],["Ka5"],["Bc3+"],["Ka6"],["Bc4+"],["Ka7"],["Kc7"],["Ka8"],["Bb4"],["Ka7"],["Bc5+"],["Ka8"],["Bd5#"]]},{"id":"rook","startingFen":"8/5k2/8/5K2/8/8/8/6R1 w - - 0 1","seed":73592,"expectedLine":[["Rh1","Re1","Rd1","Rc1","Rb1","Ra1"],["Ke7"],["Rb6"],["Kd7"],["Ke5"],["Kc7"],["Rh6"],["Kd7"],["Rg6"],["Kc7"],["Kd5"],["Kb7"],["Kc5"],["Ka7"],["Kb5"],["Kb7"],["Rg7+"],["Kc8"],["Kc6"],["Kd8"],["Ra7"],["Ke8"],["Kd6"],["Kf8"],["Ke6"],["Kg8"],["Kf6"],["Kh8"],["Kg6"],["Kg8"],["Ra8#"]]},{"id":"rook","startingFen":"8/2k5/8/6R1/3K4/8/8/8 w - - 0 1","seed":73630,"expectedLine":[["Rg6"],["Kd7"],["Kd5"],["Ke7"],["Ra6"],["Kf7"],["Ke5"],["Kg7"],["Kf5"],["Kh7"],["Kg5"],["Kg7"],["Ra7+"],["Kf8"],["Kf6"],["Ke8"],["Rh7"],["Kd8"],["Ke6"],["Kc8"],["Kd6"],["Kb8"],["Kc6"],["Ka8"],["Kb6"],["Kb8"],["Rh8#"]]},{"id":"rook","startingFen":"8/5k2/K7/7R/8/8/8/8 w - - 0 1","seed":73668,"expectedLine":[["Re5"],["Kf6"],["Re1"],["Kf5"],["Kb5"],["Kf4"],["Kc4"],["Kf3"],["Kd3"],["Kf2"],["Re8"],["Kf1"],["Kd2"],["Kf2"],["Rf8+"],["Kg3"],["Ke3"],["Kg4"],["Rf1"],["Kg5"],["Ke4"],["Kg6"],["Ke5"],["Kg7"],["Ke6"],["Kg8"],["Ke7"],["Kg7"],["Rg1+"],["Kh6"],["Kf6"],["Kh5"],["Rg8"],["Kh4"],["Kf5"],["Kh3"],["Kf4"],["Kh2"],["Kf3"],["Kh1"],["Kf2"],["Kh2"],["Rh8#"]]},{"id":"rook","startingFen":"8/5k2/8/8/8/8/R5K1/8 w - - 0 1","seed":73706,"expectedLine":[["Ra6"],["Ke7"],["Kf3"],["Kd7"],["Ke4"],["Kc7"],["Kd5"],["Kb7"],["Rh6"],["Kc7"],["Rg6"],["Kb7"],["Kc5"],["Ka7"],["Kb5"],["Kb7"],["Rg7+"],["Kc8"],["Kc6"],["Kd8"],["Ra7"],["Ke8"],["Kd6"],["Kf8"],["Ke6"],["Kg8"],["Kf6"],["Kh8"],["Kg6"],["Kg8"],["Ra8#"]]},{"id":"rook","startingFen":"8/5k2/1R6/8/8/8/8/1K6 w - - 0 1","seed":73744,"expectedLine":[["Kc2"],["Ke7"],["Kd3"],["Kd7"],["Kd4"],["Kc7"],["Rh6"],["Kd7"],["Kd5"],["Ke7"],["Ra6"],["Kf7"],["Ke5"],["Kg7"],["Kf5"],["Kh7"],["Kg5"],["Kg7"],["Ra7+"],["Kf8"],["Kf6"],["Ke8"],["Rh7"],["Kd8"],["Ke6"],["Kc8"],["Kd6"],["Kb8"],["Kc6"],["Ka8"],["Kb6"],["Kb8"],["Rh8#"]]},{"id":"rook","startingFen":"8/8/8/8/1K6/4k3/1R6/8 w - - 0 1","seed":73782,"expectedLine":[["Rc2"],["Kd3"],["Rc8"],["Kd2"],["Kb3"],["Kd1"],["Kb2"],["Kd2"],["Rd8+"],["Ke3"],["Kc3"],["Ke4"],["Rd1"],["Ke5"],["Kc4"],["Ke6"],["Kc5"],["Ke7"],["Kc6"],["Ke8"],["Kc7"],["Ke7"],["Re1+"],["Kf6"],["Kd6"],["Kf5"],["Re8"],["Kf4"],["Kd5"],["Kf3"],["Kd4"],["Kf2"],["Kd3"],["Kf1"],["Kd2"],["Kf2"],["Rf8+"],["Kg3"],["Ke3"],["Kg4"],["Rf1"],["Kg5"],["Ke4"],["Kg6"],["Ke5"],["Kg7"],["Ke6"],["Kg8"],["Ke7"],["Kg7"],["Rg1+"],["Kh6"],["Kf6"],["Kh5"],["Rg8"],["Kh4"],["Kf5"],["Kh3"],["Kf4"],["Kh2"],["Kf3"],["Kh1"],["Kf2"],["Kh2"],["Rh8#"]]},{"id":"rook","startingFen":"8/5k2/8/8/8/8/8/3RK3 w - - 0 1","seed":73820,"expectedLine":[["Rd6"],["Ke7"],["Ra6"],["Kd7"],["Kd2"],["Kc7"],["Kc3"],["Kb7"],["Rh6"],["Kc7"],["Kc4"],["Kd7"],["Kd5"],["Ke7"],["Ra6"],["Kf7"],["Ke5"],["Kg7"],["Kf5"],["Kh7"],["Kg5"],["Kg7"],["Ra7+"],["Kf8"],["Kf6"],["Ke8"],["Rh7"],["Kd8"],["Ke6"],["Kc8"],["Kd6"],["Kb8"],["Kc6"],["Ka8"],["Kb6"],["Kb8"],["Rh8#"]]},{"id":"rook","startingFen":"8/8/8/6k1/8/4R3/6K1/8 w - - 0 1","seed":73858,"expectedLine":[["Re4"],["Kf5"],["Ra4"],["Ke5"],["Kf3"],["Kd5"],["Ke3"],["Kc5"],["Kd3"],["Kb5"],["Rh4"],["Kc5"],["Rg4"],["Kb5"],["Kc3"],["Ka5"],["Kb3"],["Kb5"],["Rg5+"],["Kc6"],["Kc4"],["Kd6"],["Ra5"],["Ke6"],["Kd4"],["Kf6"],["Ke4"],["Kg6"],["Kf4"],["Kh6"],["Kg4"],["Kg6"],["Ra6+"],["Kf7"],["Kf5"],["Ke7"],["Rh6"],["Kd7"],["Ke5"],["Kc7"],["Kd5"],["Kb7"],["Kc5"],["Ka7"],["Kb5"],["Kb7"],["Rh7+"],["Kc8"],["Kc6"],["Kd8"],["Ra7"],["Ke8"],["Kd6"],["Kf8"],["Ke6"],["Kg8"],["Kf6"],["Kh8"],["Kg6"],["Kg8"],["Ra8#"]]},{"id":"queen","startingFen":"8/5k2/8/4Q3/8/8/8/7K w - - 0 1","seed":73888,"expectedLine":[["Kg2"],["Kg6"],["Qf4"],["Kg7"],["Qf5"],["Kg8","Kh8","Kh6"],["Qg5"],["Kh7"],["Kf3"],["Kh8"],["Kf4"],["Kh7"],["Kf5"],["Kh8"],["Kf6"],["Kh7"],["Qg7#"]]},{"id":"queen","startingFen":"8/4Q3/8/3K4/8/8/3k4/8 w - - 0 1","seed":73926,"expectedLine":[["Qe4"],["Kc3"],["Kc5"],["Kd2","Kb2","Kb3"],["Qf3"],["Kc2"],["Qe3"],["Kb2"],["Qd3"],["Kc1","Ka1","Ka2"],["Qd2"],["Kb1"],["Kb4"],["Ka1"],["Kb3"],["Kb1"],["Qb2#"]]},{"id":"queen","startingFen":"1K6/5k2/8/8/8/8/8/6Q1 w - - 0 1","seed":73964,"expectedLine":[["Qg5"],["Ke6"],["Kc7"],["Kf7"],["Qe5"],["Kg6"],["Qf4"],["Kg7"],["Qf5"],["Kg8","Kh8","Kh6"],["Qg4"],["Kh7"],["Qg5"],["Kh8"],["Kd7"],["Kh7"],["Ke7"],["Kh8"],["Kf7"],["Kh7"],["Qg7#"]]},{"id":"queen","startingFen":"8/8/1Q6/6K1/4k3/8/8/8 w - - 0 1","seed":74002,"expectedLine":[["Qd6","Qc5"],["Kf3","Kd3"],["Qe5"],["Kc4"],["Qd6"],["Kc3"],["Qd5"],["Kb4","Kc2","Kb2"],["Qd3","Qc4"],["Kc1","Ka1","Ka2"],["Qc3"],["Kb1"],["Qd2"],["Ka1"],["Kf4"],["Kb1"],["Ke3"],["Ka1"],["Kd3"],["Kb1"],["Kc3"],["Ka1"],["Qb2#"]]},{"id":"queen","startingFen":"8/3K4/7Q/4k3/8/8/8/8 w - - 0 1","seed":74040,"expectedLine":[["Qc6"],["Kd4"],["Qe6"],["Kc5","Kd3","Kc3"],["Qe5"],["Kc4"],["Qd6"],["Kc3"],["Qd5"],["Kb4","Kc2","Kb2"],["Qc6"],["Kb3"],["Qc5"],["Kb2"],["Qc4"],["Ka3","Kb1","Ka1"],["Qb5"],["Ka2"],["Qb4"],["Ka1"],["Kc6"],["Ka2"],["Kc5"],["Ka1"],["Kc4"],["Ka2"],["Kc3"],["Ka1"],["Qb2#"]]},{"id":"queen","startingFen":"8/5k2/8/8/2K5/8/Q7/8 w - - 0 1","seed":74078,"expectedLine":[["Qe2"],["Kf6"],["Qe4"],["Kf7","Kg7","Kg5"],["Qf3"],["Kg6"],["Qf4"],["Kg7"],["Qf5"],["Kg8","Kh8","Kh6"],["Qf6"],["Kh7"],["Qg5"],["Kh8"],["Kd5"],["Kh7"],["Ke6"],["Kh8"],["Kf7"],["Kh7"],["Qg7#"]]},{"id":"queen","startingFen":"Q6K/5k2/8/8/8/8/8/8 w - - 0 1","seed":74116,"expectedLine":[["Qc6"],["Ke7"],["Kg7"],["Kd8"],["Qb7"],["Ke8"],["Qf7+"],["Kd8"],["Kf6"],["Kc8"],["Qe7"],["Kb8"],["Qd7"],["Ka8"],["Ke6"],["Kb8"],["Kd6"],["Ka8"],["Kc6"],["Kb8"],["Qb7#"]]},{"id":"queen","startingFen":"8/5k2/1Q6/8/8/5K2/8/8 w - - 0 1","seed":74154,"expectedLine":[["Qd6"],["Kg7"],["Qe6"],["Kf8","Kh8","Kh7"],["Qe7"],["Kg8"],["Kg4"],["Kh8"],["Kg5"],["Kg8"],["Kg6"],["Kh8"],["Qg7#"]]}]`) as HardcodedEndgameLineFixture[];

test("hardcoded endgame priority lines mate from random starts", () => {
  const counts = new Map<EndgameId, number>();

  HARDCODED_ENDGAME_LINE_FIXTURES.forEach((fixture) => {
    if (
      fixture.id === "knightAndBishop" ||
      fixture.id === "twoBishops" ||
      fixture.id === "rook"
    ) {
      return;
    }
    counts.set(fixture.id, (counts.get(fixture.id) ?? 0) + 1);
    assertSeededBestEndgameFixture(fixture);
  });

  assert.equal(counts.get("queen"), 8, "queen");
});

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

  assert.equal(assignBrainRoute("/endgames/rook+"), true);
  assert.equal(Brain.view, View.endgame);
  assert.equal(Brain.endgameId, "rook+");
  assert.equal(Brain.isLegalEndgameStart(Brain.getInitialState().fen), true);

  assert.equal(assignBrainRoute("/endgames/queen+"), true);
  assert.equal(Brain.endgameId, "queen+");

  assert.equal(assignBrainRoute("/endgames/twoBishops+"), true);
  assert.equal(Brain.endgameId, "twoBishops+");

  assert.equal(assignBrainRoute("/endgames/knightAndBishop+"), true);
  assert.equal(Brain.endgameId, "knightAndBishop+");

  assert.equal(assignBrainRoute("/endgames/nope"), false);
  assert.equal(assignBrainRoute("/endgames/twoKnightsVsPawn"), false);
  assert.equal(assignBrainRoute("/endgames/twoKnightsVsPawn+"), false);
});

test("endgame dropdown is only shown in endgame mode", () => {
  Brain.view = View.speedrun;
  Brain.endgameId = undefined;
  assert.equal(hasElementType(Header(), "select"), false);

  Brain.view = View.endgame;
  let header = Header();
  assert.equal(hasElementType(header, "select"), true);
  assert.match(textContent(header), /select endgame/);
  assert.doesNotMatch(textContent(header), /find a loop/);
  assert.doesNotMatch(textContent(header), /home/);

  Brain.endgameId = "rook";
  header = Header();
  assert.equal(hasElementType(header, "select"), true);
  assert.match(textContent(header), /select endgame/);
  assert.doesNotMatch(textContent(header), /find a loop/);
  assert.match(textContent(header), /Rook \+/);
  assert.match(textContent(header), /Queen \+/);
  assert.match(textContent(header), /Two Bishops \+/);
  assert.match(textContent(header), /Knight and Bishop \+/);
  assert.match(textContent(header), /Two Knights vs Pawn \+/);
  assert.doesNotMatch(textContent(header), /home/);

  const options = findElementsByType(header, "option");
  assert.deepEqual(
    options.map((option) => option.props?.value),
    ["", ...ENDGAME_OPTIONS.map((endgame) => endgame.id)],
  );
  assert.equal(
    options.find((option) => option.props?.value === "twoKnightsVsPawn")?.props
      ?.disabled,
    true,
  );
  assert.equal(
    options.find((option) => option.props?.value === "twoKnightsVsPawn+")?.props
      ?.disabled,
    true,
  );

  settings.IS_DEV = true;
  assert.match(textContent(Header()), /find a loop/);
  settings.IS_DEV = false;
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
    "knightAndBishop+",
    "twoBishops",
    "twoBishops+",
    "twoKnightsVsPawn",
    "rook",
    "rook+",
    "queen",
    "queen+",
  ] as const) {
    const fen = Brain.getRandomEndgameFen(id);
    const expectedPieces = Brain.getEndgamePieces(getBaseEndgame(id).fen)
      .map((piece) => `${piece.color}${piece.type}`)
      .sort();
    const actualPieces = Brain.getEndgamePieces(fen)
      .map((piece) => `${piece.color}${piece.type}`)
      .sort();

    assert.deepEqual(actualPieces, expectedPieces);
    assert.equal(Brain.isLegalEndgameStart(fen), true);
  }
});

test("plus endgame generators create phase-two starts with base material", () => {
  const twoBishopsPlusFens = transformedFenSets([
    "4k3/8/4K3/3BB3/8/8/8/8 w - - 38 20",
    "5k2/8/5K2/4BB2/8/8/8/8 w - - 38 20",
  ]);

  for (const id of [
    "knightAndBishop+",
    "twoBishops+",
    "rook+",
    "queen+",
  ] as const) {
    const expectedPieces = Brain.getEndgamePieces(getBaseEndgame(id).fen)
      .map((piece) => `${piece.color}${piece.type}`)
      .sort();

    for (let index = 0; index < 20; index++) {
      setEndgame(id);
      const fen = Brain.getRandomEndgameFen(id);
      const actualPieces = Brain.getEndgamePieces(fen)
        .map((piece) => `${piece.color}${piece.type}`)
        .sort();

      assert.deepEqual(actualPieces, expectedPieces, id);
      assert.equal(Brain.isLegalEndgameStart(fen), true, id);
      assert.equal(Brain.getEndgamePhase(fen), "2/2", `${id}: ${fen}`);
      if (id === "twoBishops+") {
        assert.equal(twoBishopsPlusFens.has(fen), true, fen);
      }
    }
  }
});

test("plus endgames use base move logic", () => {
  for (const [plusId, baseId] of [
    ["knightAndBishop+", "knightAndBishop"],
    ["twoBishops+", "twoBishops"],
    ["rook+", "rook"],
    ["queen+", "queen"],
  ] as const) {
    for (const fen of getEndgame(plusId).plusFens ?? [getEndgame(plusId).plusFen!]) {
      setEndgame(baseId);
      const baseWhiteMoves = Brain.getIdealEndgameWhiteMoves(fen);
      setEndgame(plusId);

      assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), baseWhiteMoves);
      assertLegalSans(fen, Brain.getIdealEndgameWhiteMoves(fen));
    }
  }
});

test("random two-bishop starts use opposite-colored bishops", () => {
  for (let index = 0; index < 50; index++) {
    const fen = Brain.getRandomEndgameFen("twoBishops");
    const bishopColors = Brain.getChess(fen)
      .board()
      .flat()
      .filter((piece) => piece?.color === "w" && piece.type === "b")
      .map((piece) => Brain.squareColor(piece!.square));

    assert.deepEqual(bishopColors.sort(), [0, 1]);
  }
});

test("every endgame has a comparable position score", () => {
  for (const endgame of ENDGAMES) {
    setEndgame(endgame.id);
    assertFiniteScore(endgame.fen);
  }
});

test("non-rook and non-queen endgames choose legal deterministic moves", () => {
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

test("short-circuit endgame selectors match full-sort semantics", () => {
  const whiteCases: Array<{
    id: EndgameId;
    fen: string;
    expected: () => string[];
  }> = [
    {
      id: "rook",
      fen: "8/8/8/2k5/8/R7/3K4/8 w - - 0 1",
      expected: () => {
        const fen = "8/8/8/2k5/8/R7/3K4/8 w - - 0 1";
        return fullSortBestMoves(
          Brain.getChess(fen).moves(),
          (san) => Brain.scoreRookWhiteMove(fen, san),
          Brain.compareRookWhiteScores,
        );
      },
    },
    {
      id: "queen",
      fen: "8/8/8/8/4k3/8/8/3QK3 w - - 0 1",
      expected: () => {
        const fen = "8/8/8/8/4k3/8/8/3QK3 w - - 0 1";
        return fullSortBestMoves(
          Brain.getChess(fen).moves(),
          (san) => Brain.scoreQueenWhiteMove(fen, san),
          Brain.compareQueenWhiteScores,
        );
      },
    },
    {
      id: "twoBishops",
      fen: "8/8/3BB3/8/5K2/3k4/8/8 w - - 10 6",
      expected: () => {
        const fen = "8/8/3BB3/8/5K2/3k4/8/8 w - - 10 6";
        return fullSortBestMoves(
          Brain.getChess(fen).moves(),
          (san) => Brain.scoreTwoBishopsWhiteMove(fen, san),
          Brain.compareTwoBishopsWhiteScores,
        );
      },
    },
    {
      id: "knightAndBishop",
      fen: "8/8/8/3NK3/2k5/2B5/8/8 w - - 72 37",
      expected: () => {
        const fen = "8/8/8/3NK3/2k5/2B5/8/8 w - - 72 37";
        return fullSortBestMoves(
          Brain.getChess(fen).moves(),
          (san, index) => ({
            index,
            ...Brain.scoreKnightAndBishopWhiteMove(fen, san),
          }),
          Brain.compareKnightAndBishopWhiteScores,
        );
      },
    },
    {
      id: "twoKnightsVsPawn",
      fen: getEndgame("twoKnightsVsPawn").fen,
      expected: () => {
        const fen = getEndgame("twoKnightsVsPawn").fen;
        return fullSortBestPositionMoves(fen, Brain.getChess(fen).moves(), true);
      },
    },
  ];

  whiteCases.forEach(({ id, fen, expected }) => {
    setEndgame(id);
    assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), expected(), fen);
  });

  const knightBishopBlackCompare = (
    a: ReturnType<typeof Brain.scoreKnightAndBishopOpponentPosition>,
    b: ReturnType<typeof Brain.scoreKnightAndBishopOpponentPosition>,
  ) =>
    a.captureMinorPenalty - b.captureMinorPenalty ||
    a.unprotectedMinorDistance - b.unprotectedMinorDistance ||
    a.centerDistance - b.centerDistance ||
    a.mobilityScore - b.mobilityScore ||
    a.whiteKingDistanceScore - b.whiteKingDistanceScore ||
    a.matingCornerManhattanScore - b.matingCornerManhattanScore;

  const blackCases: Array<{
    id: EndgameId;
    fen: string;
    expected: () => string[];
  }> = [
    {
      id: "rook",
      fen: "8/8/8/8/3kR3/8/8/4K3 b - - 0 1",
      expected: () => {
        const fen = "8/8/8/8/3kR3/8/8/4K3 b - - 0 1";
        return fullSortBestMoves(
          Brain.getChess(fen).moves(),
          (san) => Brain.scoreRookBlackMove(fen, san),
          Brain.compareRookBlackScores,
        );
      },
    },
    {
      id: "queen",
      fen: "8/8/8/8/3k4/8/8/3QK3 b - - 0 1",
      expected: () => {
        const fen = "8/8/8/8/3k4/8/8/3QK3 b - - 0 1";
        return fullSortBestMoves(
          Brain.getChess(fen).moves(),
          (san) => Brain.scoreQueenBlackMove(fen, san),
          Brain.compareQueenBlackScores,
        );
      },
    },
    {
      id: "twoBishops",
      fen: getEndgame("twoBishops").fen.replace(" w ", " b "),
      expected: () => {
        const fen = getEndgame("twoBishops").fen.replace(" w ", " b ");
        return fullSortBestMoves(
          Brain.getChess(fen).moves(),
          (san) => Brain.scoreTwoBishopsBlackMove(fen, san),
          Brain.compareTwoBishopsBlackScores,
        );
      },
    },
    {
      id: "knightAndBishop",
      fen: "4N3/8/3B4/4K3/8/5k2/8/8 b - - 11 6",
      expected: () => {
        const fen = "4N3/8/3B4/4K3/8/5k2/8/8 b - - 11 6";
        return fullSortBestMoves(
          Brain.getChess(fen).moves(),
          (san) => {
            const chess = Brain.getChess(fen);
            chess.move(san);
            return Brain.scoreKnightAndBishopOpponentPosition(chess.fen());
          },
          knightBishopBlackCompare,
        );
      },
    },
    {
      id: "twoKnightsVsPawn",
      fen: getEndgame("twoKnightsVsPawn").fen.replace(" w ", " b "),
      expected: () => {
        const fen = getEndgame("twoKnightsVsPawn").fen.replace(" w ", " b ");
        return fullSortBestPositionMoves(fen, Brain.getChess(fen).moves(), false);
      },
    },
  ];

  blackCases.forEach(({ id, fen, expected }) => {
    setEndgame(id);
    assert.deepEqual(
      Brain.getEndgameOpponentCandidates(Brain.getChess(fen)).idealMoves,
      expected(),
      fen,
    );
  });
});

test.skip("knight-bishop priorities avoid allowing attacks on unprotected minors", () => {
  setEndgame("knightAndBishop");
  const fen = "8/8/1N6/2k1B3/7K/8/8/8 w - - 2 2";

  assert.equal(
    Brain.scoreKnightAndBishopWhiteMove(fen, "Nc8").unprotectedMinorAttackScore,
    1,
  );
  assert.equal(
    Brain.scoreKnightAndBishopWhiteMove(fen, "Bd4+").unprotectedMinorAttackScore,
    0,
  );
  assert.ok(!Brain.getIdealEndgameWhiteMoves(fen).includes("Nc8"));
});

test("knight-bishop black priorities approach unprotected minors", () => {
  setEndgame("knightAndBishop");
  const chess = Brain.getChess(
    "8/8/5k2/8/3K2B1/8/6N1/8 b - - 0 1",
  );

  assert.deepEqual(
    Brain.getKnightAndBishopOpponentCandidates(chess, ["Kf7", "Kg6"])
      .idealMoves,
    ["Kg6"],
  );
});

test("knight-bishop black prioritizes centralization before mating-corner distance", () => {
  setEndgame("knightAndBishop");
  const chess = Brain.getChess(
    "4N3/8/3B4/4K3/8/5k2/8/8 b - - 11 6",
  );

  assert.deepEqual(Brain.getEndgameOpponentCandidates(chess).idealMoves, [
    "Ke3",
  ]);
});

test.skip("knight-bishop phase-one priorities follow the study plan", () => {
  setEndgame("knightAndBishop");

  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves(
      "8/8/8/3k4/8/8/8/4KBN1 w - - 0 1",
    ),
    ["Kd2"],
  );

  const shutDoorFen = "8/6k1/6N1/5B2/4K3/8/8/8 w - - 0 1";
  assert.equal(
    Brain.scoreKnightAndBishopWhiteMove(shutDoorFen, "Ke5")
      .blackInwardEscapeCount,
    0,
  );
  assert.equal(
    Brain.scoreKnightAndBishopWhiteMove(shutDoorFen, "Kf4")
      .blackInwardEscapeCount,
    1,
  );
  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(shutDoorFen), ["Ke5"]);

  const wManeuverFen = "7k/8/5KB1/6N1/8/8/8/8 w - - 0 1";
  assert.equal(
    Brain.scoreKnightAndBishopWhiteMove(wManeuverFen, "Be4")
      .wManeuverSetupDistance,
    0,
  );
  assert.ok(
    Brain.scoreKnightAndBishopWhiteMove(wManeuverFen, "Nh7")
      .wManeuverSetupDistance > 0,
  );
  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(wManeuverFen), ["Be4"]);
});

test("knight-bishop follows the easy-guide study line when black cooperates", () => {
  setEndgame("knightAndBishop");
  const parts = KNIGHT_AND_BISHOP_EASY_GUIDE.data.treeParts;
  const chess = Brain.getChess(parts[0].fen);

  for (let index = 1; index < parts.length; index += 1) {
    const part = parts[index];
    assert.equal(
      boardTurnKey(chess.fen()),
      boardTurnKey(parts[index - 1].fen),
      `study position before ply ${part.ply}`,
    );
    assert.ok(part.san, `study ply ${part.ply} has a SAN move`);

    if (chess.turn() === "w") {
      assert.deepEqual(
        Brain.getIdealEndgameWhiteMoves(chess.fen()),
        [part.san],
        `white study move at ply ${part.ply} from ${chess.fen()}`,
      );
    }

    chess.move(part.san);
    assert.equal(
      boardTurnKey(chess.fen()),
      boardTurnKey(part.fen),
      `study position after ${part.san} at ply ${part.ply}`,
    );
  }

  assert.equal(chess.isCheckmate(), true);
});

test("knight-bishop phase-one immediately hands off to lookup", () => {
  setEndgame("knightAndBishop");
  const fen = "6k1/8/5KB1/6N1/8/8/8/8 w - - 0 1";

  assert.equal(
    Brain.scoreKnightAndBishopWhiteMove(fen, "Nf7").phaseTwoEntryScore,
    0,
  );
  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Nf7"]);
});

test("knight-bishop phase-one centralizes king and minors", () => {
  setEndgame("knightAndBishop");

  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves(
      "8/8/8/3NK3/2k5/2B5/8/8 w - - 72 37",
    ),
    ["Bd4"],
  );
});

test("knight-bishop phase-one forces black king away before centralizing white king", () => {
  setEndgame("knightAndBishop");
  const fen = "8/8/8/8/8/8/4N3/k1KB4 w - - 0 1";
  const forceBlackAway = Brain.scoreKnightAndBishopWhiteMove(fen, "Kc2");
  const centralizeWhiteKing = Brain.scoreKnightAndBishopWhiteMove(fen, "Kd2");

  assert.ok(
    forceBlackAway.blackKingCenterAccessScore <
      centralizeWhiteKing.blackKingCenterAccessScore,
  );
  assert.ok(
    forceBlackAway.whiteKingCentralDistance >
      centralizeWhiteKing.whiteKingCentralDistance,
  );
  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Kc2"]);
  assert.equal(Brain.getEndgameReason(fen), "black king away from center");
});

test("knight-bishop phase-one connects bishop and knight diagonally", () => {
  setEndgame("knightAndBishop");
  const fen = "k7/8/8/8/8/8/4N3/1B5K w - - 0 1";

  assert.equal(
    Brain.scoreKnightAndBishopWhiteMove(fen, "Bd3")
      .bishopKnightDiagonalAdjacencyScore,
    0,
  );
  assert.equal(
    Brain.scoreKnightAndBishopWhiteMove(fen, "Kg2")
      .bishopKnightDiagonalAdjacencyScore,
    1,
  );
  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Bd3"]);
  assert.equal(Brain.getEndgameReason(fen), "bishop and knight connected");
});

test.skip("knight-bishop phase-one kicks the king from the edge", () => {
  setEndgame("knightAndBishop");
  const fen = "8/8/5K2/5B1k/4N3/8/8/8 w - - 22 12";

  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Ke5"]);
  assert.equal(Brain.getEndgameReason(fen), "compact triangle");
});

test("knight-bishop phase-one centralization reasons are defined", () => {
  setEndgame("knightAndBishop");

  assert.equal(
    Brain.getEndgameReason(
      "8/8/8/3NK3/1B6/3k4/8/8 w - - 70 36",
    ),
    "bishop and knight connected",
  );
  assert.equal(
    Brain.getEndgameReason(
      "8/8/8/3NK3/2k5/2B5/8/8 w - - 72 37",
    ),
    "centralize pieces",
  );
});

test.skip("knight-bishop phase-one reaches the guide handoff from edge cages", () => {
  setEndgame("knightAndBishop");
  const fen = "8/8/8/8/2KN4/k1B5/8/8 w - - 58 30";

  const result = playKnightAndBishopSelfPlay(fen);
  assert.notEqual(result.result, "loop-before-phase2", result.moves.join(" "));
  assert.equal(result.phaseTwoReached, true);
});

test.skip("knight-bishop phase-one keeps the knight posted on edge cages", () => {
  setEndgame("knightAndBishop");
  const fen = "8/8/4K3/4N1k1/8/5B2/8/8 w - - 20 11";
  const result = playKnightAndBishopSelfPlay(fen);

  assert.notEqual(result.result, "loop-before-phase2", result.moves.join(" "));
  assert.equal(result.result, "mate", result.moves.join(" "));
  assert.equal(result.phaseTwoReached, true);
  assert.ok(result.plies <= 40, `${result.plies} plies from ${fen}`);
});

test.skip("knight-bishop phase-one sampled random starts do not loop", () => {
  const samples = [
    {
      fen: "8/8/8/8/5K2/k2N4/2B5/8 w - - 0 1",
      seed: 910000,
    },
    {
      fen: "8/8/8/7B/3N4/k7/8/6K1 w - - 0 1",
      seed: 910001,
    },
    {
      fen: "8/6K1/3N4/8/8/k7/8/5B2 w - - 0 1",
      seed: 910002,
    },
  ];

  for (const sample of samples) {
    const result = playKnightAndBishopSelfPlay(sample.fen, 100, sample.seed);
    assert.equal(result.result, "mate", result.moves.join(" "));
    assert.equal(result.phaseTwoReached, true, sample.fen);
  }
});

test("knight-bishop phase uses the pre-move position and strict w-maneuver handoff", () => {
  setEndgame("knightAndBishop");
  const nonWManeuverNet = "8/8/8/3B4/N7/2K5/8/1k6 w - - 20 11";
  assert.equal(Brain.getEndgamePhase(nonWManeuverNet), "1/2");

  const wManeuver = "7k/8/5K2/4N3/4B3/8/8/8 b - - 27 14";
  assert.equal(Brain.getEndgamePhase(wManeuver), "1/2");

  const preMoveFen = "6k1/8/5KB1/6N1/8/8/8/8 w - - 0 1";
  const chess = Brain.getChess(preMoveFen);
  chess.move("Nf7");
  assert.equal(Brain.getEndgamePhase(preMoveFen), "1/2");
  assert.equal(Brain.getEndgamePhase(chess.fen()), "1/2");
  assert.equal(
    Brain.getEndgameLogFields(preMoveFen, "Nf7", chess.fen()).endgame_phase,
    "1/2",
  );
});

test.skip("knight-bishop phase-one smoke line reaches phase two", () => {
  const fen = "8/8/8/3k4/8/8/8/4KBN1 w - - 0 1";
  const result = playKnightAndBishopSelfPlay(fen);

  assert.equal(result.result, "mate", result.moves.join(" "));
  assert.equal(result.phaseTwoReached, true);
  assert.ok(result.plies <= 100, `${result.plies} plies from ${fen}`);
});

test("knight-bishop lookup chooses mating net moves", () => {
  setEndgame("knightAndBishop");
  const line = [
    "Nf7+",
    "Kg8",
    "Bg6",
    "Kf8",
    "Bh7",
    "Ke8",
    "Ne5",
    "Kf8",
    "Nd7+",
    "Ke8",
    "Ke6",
    "Kd8",
    "Kd6",
    "Ke8",
    "Bg6+",
    "Kd8",
    "Nc5",
    "Kc8",
    "Bf7",
    "Kd8",
    "Nb7+",
    "Kc8",
    "Kc6",
    "Kb8",
    "Kb6",
    "Kc8",
    "Be6+",
    "Kb8",
    "Nc5",
    "Ka8",
    "Bd7",
    "Kb8",
    "Na6+",
    "Ka8",
    "Bc6#",
  ];
  const chess = Brain.getChess(
    "7k/8/5K2/6N1/4B3/8/8/8 w - - 42 22",
  );

  assert.equal(Brain.getEndgamePhase(getEndgame("knightAndBishop").fen), "1/2");
  assertPhaseTwoOnlyOnWhiteTurn(chess.fen());
  assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
  for (const san of line) {
    if (chess.turn() === "w") {
      assert.ok(
        Brain.getIdealEndgameWhiteMoves(chess.fen()).includes(san),
        `${san} should be accepted from ${chess.fen()}`,
      );
      assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
    } else {
      assert.ok(
        Brain.getEndgameOpponentCandidates(chess).idealMoves.includes(san),
        `${san} should be an ideal reply from ${chess.fen()}`,
      );
    }
    chess.move(san);
    assertPhaseTwoOnlyOnWhiteTurn(chess.fen());
  }
  assert.equal(chess.isCheckmate(), true);
});

test("knight-bishop lookup resolves final collision groups", () => {
  setEndgame("knightAndBishop");
  const cases = [
    {
      fen: "k7/1N3B2/1K6/8/8/8/8/8 w - - 0 1",
      whiteMove: "Be6",
      blackMove: "Kb8",
    },
    {
      fen: "3k4/8/3K4/2N2B2/8/8/8/8 w - - 0 1",
      whiteMove: "Bg6",
      blackMove: "Kc8",
    },
  ];

  for (const { fen, whiteMove, blackMove } of cases) {
    const chess = Brain.getChess(fen);
    assert.deepEqual(
      Brain.getKnightAndBishopLookupWhiteMoves(chess.fen()),
      [whiteMove],
      `${whiteMove} should be the only lookup move from ${chess.fen()}`,
    );
    assert.deepEqual(Brain.getIdealEndgameWhiteMoves(chess.fen()), [whiteMove]);
    assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");

    chess.move(whiteMove);
    assert.deepEqual(
      Brain.getEndgameOpponentCandidates(chess).idealMoves,
      [blackMove],
    );
  }
});

test("knight-bishop lookup overrides collision into nc5 net path", () => {
  setEndgame("knightAndBishop");
  const line = [
    "Nc5",
    "Kb8",
    "Kc6",
    "Kc8",
    "Nb7",
    "Kb8",
    "Kb6",
    "Kc8",
    "Bf5+",
    "Kb8",
    "Nc5",
    "Ka8",
    "Be6",
    "Kb8",
    "Na6+",
    "Ka8",
    "Bd5#",
  ];
  const chess = Brain.getChess(
    "2k5/3N3B/3K4/8/8/8/8/8 w - - 0 1",
  );
  let lastWhiteTurnFen: string | undefined;
  let blackReturnTargetFen: string | undefined;

  for (const san of line) {
    if (chess.turn() === "w") {
      assert.deepEqual(
        Brain.getKnightAndBishopLookupWhiteMoves(chess.fen()),
        [san],
        `${san} should be the only lookup move from ${chess.fen()}`,
      );
      assert.deepEqual(Brain.getIdealEndgameWhiteMoves(chess.fen()), [san]);
      assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
      blackReturnTargetFen = lastWhiteTurnFen;
      lastWhiteTurnFen = chess.fen();
    } else {
      assert.ok(
        Brain.getEndgameOpponentCandidates(
          chess,
          blackReturnTargetFen,
        ).idealMoves.includes(san),
        `${san} should be an ideal reply from ${chess.fen()}`,
      );
      blackReturnTargetFen = undefined;
    }
    chess.move(san);
  }
  assert.equal(chess.isCheckmate(), true);
});

test("knight-bishop lookup resolves requested collision groups", () => {
  setEndgame("knightAndBishop");
  const cases = [
    {
      fen: "1k6/8/2K1B3/2N5/8/8/8/8 w - - 0 1",
      whiteMove: "Kb6",
      blackMove: "Ka8",
    },
    {
      fen: "2k5/3N4/4K3/3B4/8/8/8/8 w - - 0 1",
      whiteMove: "Kd6",
      blackMove: "Kd8",
    },
  ];

  for (const { fen, whiteMove, blackMove } of cases) {
    const chess = Brain.getChess(fen);
    assert.deepEqual(
      Brain.getKnightAndBishopLookupWhiteMoves(chess.fen()),
      [whiteMove],
      `${whiteMove} should be the only lookup move from ${chess.fen()}`,
    );
    assert.deepEqual(Brain.getIdealEndgameWhiteMoves(chess.fen()), [whiteMove]);
    assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");

    chess.move(whiteMove);
    assert.deepEqual(
      Brain.getEndgameOpponentCandidates(chess).idealMoves,
      [blackMove],
    );
  }
});

test("knight-bishop lookup exits repeated ka7 net position", () => {
  setEndgame("knightAndBishop");
  const line = [
    "Nf7+",
    "Kg8",
    "Bg6",
    "Kf8",
    "Bh7",
    "Ke8",
    "Ne5",
    "Kf8",
    "Nd7+",
    "Ke8",
    "Ke6",
    "Kd8",
    "Kd6",
    "Kc8",
    "Nc5",
    "Kb8",
    "Kc6",
    "Ka7",
    "Bf5",
    "Kb8",
    "Kb6",
    "Ka8",
    "Be6",
    "Kb8",
    "Na6+",
    "Ka8",
    "Bd5#",
  ];
  const chess = Brain.getChess(
    "7k/8/5K2/6N1/4B3/8/8/8 w - - 42 22",
  );
  let lastWhiteTurnFen: string | undefined;
  let blackReturnTargetFen: string | undefined;

  for (const san of line) {
    if (chess.turn() === "w") {
      assert.deepEqual(
        Brain.getKnightAndBishopLookupWhiteMoves(chess.fen()),
        [san],
        `${san} should be the only lookup move from ${chess.fen()}`,
      );
      assert.deepEqual(Brain.getIdealEndgameWhiteMoves(chess.fen()), [san]);
      assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
      blackReturnTargetFen = lastWhiteTurnFen;
      lastWhiteTurnFen = chess.fen();
    } else {
      assert.ok(
        Brain.getEndgameOpponentCandidates(
          chess,
          blackReturnTargetFen,
        ).idealMoves.includes(san),
        `${san} should be an ideal reply from ${chess.fen()}`,
      );
      blackReturnTargetFen = undefined;
    }
    chess.move(san);
  }
  assert.equal(chess.isCheckmate(), true);
});

test("knight-bishop lookup exits repeated bd3 net position", () => {
  setEndgame("knightAndBishop");
  const line = [
    "Nf7+",
    "Kg8",
    "Bg6",
    "Kf8",
    "Bh7",
    "Ke8",
    "Ne5",
    "Kd8",
    "Ke6",
    "Kc8",
    "Nd7",
    "Kb7",
    "Bd3",
    "Kc8",
    "Be4",
    "Kc7",
    "Bd5",
    "Kc8",
    "Kd6",
    "Kd8",
    "Bf7",
    "Kc8",
  ];
  const chess = Brain.getChess(
    "7k/8/5K2/6N1/4B3/8/8/8 w - - 42 22",
  );
  let lastWhiteTurnFen: string | undefined;
  let blackReturnTargetFen: string | undefined;

  for (const san of line) {
    if (chess.turn() === "w") {
      assert.deepEqual(
        Brain.getKnightAndBishopLookupWhiteMoves(chess.fen()),
        [san],
        `${san} should be the only lookup move from ${chess.fen()}`,
      );
      assert.deepEqual(Brain.getIdealEndgameWhiteMoves(chess.fen()), [san]);
      assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
      blackReturnTargetFen = lastWhiteTurnFen;
      lastWhiteTurnFen = chess.fen();
    } else {
      assert.ok(
        Brain.getEndgameOpponentCandidates(
          chess,
          blackReturnTargetFen,
        ).idealMoves.includes(san),
        `${san} should be an ideal reply from ${chess.fen()}`,
      );
      blackReturnTargetFen = undefined;
    }
    chess.move(san);
  }
});

test("knight-bishop lookup keeps f5 corner branch in net", () => {
  setEndgame("knightAndBishop");
  const line = [
    "Nc7+",
    "Kb8",
    "Bb6",
    "Kc8",
    "Ba7",
    "Kd8",
    "Nd5",
    "Kc8",
    "Ne7+",
    "Kd8",
    "Kd6",
    "Ke8",
    "Ke6",
    "Kf8",
    "Nf5",
    "Kg8",
    "Kf6",
    "Kh8",
    "Kg6",
    "Kg8",
    "Bc5",
    "Kh8",
    "Bd6",
    "Kg8",
    "Nh6+",
    "Kh8",
  ];
  const chess = Brain.getChess(
    "k7/8/2K5/1N6/3B4/8/8/8 w - - 42 22",
  );
  let lastWhiteTurnFen: string | undefined;
  let blackReturnTargetFen: string | undefined;

  for (const san of line) {
    if (chess.turn() === "w") {
      assert.deepEqual(
        Brain.getKnightAndBishopLookupWhiteMoves(chess.fen()),
        [san],
        `${san} should be the only lookup move from ${chess.fen()}`,
      );
      assert.deepEqual(Brain.getIdealEndgameWhiteMoves(chess.fen()), [san]);
      assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
      blackReturnTargetFen = lastWhiteTurnFen;
      lastWhiteTurnFen = chess.fen();
    } else {
      assert.ok(
        Brain.getEndgameOpponentCandidates(
          chess,
          blackReturnTargetFen,
        ).idealMoves.includes(san),
        `${san} should be an ideal reply from ${chess.fen()}`,
      );
      blackReturnTargetFen = undefined;
    }
    chess.move(san);
  }
});

test("knight-bishop lookup keeps ka8 bd3 branch in net", () => {
  setEndgame("knightAndBishop");
  const line = [
    "Nf7+",
    "Kg8",
    "Bg6",
    "Kf8",
    "Bh7",
    "Ke8",
    "Ne5",
    "Kd8",
    "Ke6",
    "Kc8",
    "Nd7",
    "Kb7",
    "Bd3",
    "Ka8",
    "Kd6",
    "Ka7",
    "Kc7",
    "Ka8",
    "Nc5",
    "Ka7",
    "Bf5",
    "Ka8",
    "Kb6",
    "Kb8",
    "Na6+",
    "Ka8",
    "Be4#",
  ];
  const chess = Brain.getChess(
    "7k/8/5K2/6N1/4B3/8/8/8 w - - 42 22",
  );
  let lastWhiteTurnFen: string | undefined;
  let blackReturnTargetFen: string | undefined;

  for (const san of line) {
    if (chess.turn() === "w") {
      assert.deepEqual(
        Brain.getKnightAndBishopLookupWhiteMoves(chess.fen()),
        [san],
        `${san} should be the only lookup move from ${chess.fen()}`,
      );
      assert.deepEqual(Brain.getIdealEndgameWhiteMoves(chess.fen()), [san]);
      assert.equal(
        Brain.getEndgameReason(chess.fen()),
        "mating net",
      );
      blackReturnTargetFen = lastWhiteTurnFen;
      lastWhiteTurnFen = chess.fen();
    } else {
      assert.ok(
        Brain.getEndgameOpponentCandidates(
          chess,
          blackReturnTargetFen,
        ).idealMoves.includes(san),
        `${san} should be an ideal reply from ${chess.fen()}`,
      );
      blackReturnTargetFen = undefined;
    }
    chess.move(san);
  }
  assert.equal(chess.isCheckmate(), true);
});

test("knight-bishop lookup keeps reflected ka8 nd6 branch in net", () => {
  setEndgame("knightAndBishop");
  const line = [
    "Nb3+",
    "Ka2",
    "Bc2",
    "Ka3",
    "Bb1",
    "Ka4",
    "Nd4",
    "Ka3",
    "Nb5+",
    "Ka4",
    "Kc4",
    "Ka5",
    "Kc5",
    "Ka6",
    "Nd6",
    "Ka7",
    "Kc6",
    "Ka6",
    "Nb7",
    "Ka7",
    "Kc7",
    "Ka8",
    "Nd6",
    "Ka7",
    "Bd3",
    "Ka8",
    "Bc4",
    "Ka7",
    "Nc8+",
    "Ka8",
    "Bd5#",
  ];
  const chess = Brain.getChess(
    "8/8/8/8/4B3/2K5/3N4/k7 w - - 42 22",
  );
  let lastWhiteTurnFen: string | undefined;
  let blackReturnTargetFen: string | undefined;

  for (const san of line) {
    if (chess.turn() === "w") {
      assert.deepEqual(
        Brain.getKnightAndBishopLookupWhiteMoves(chess.fen()),
        [san],
        `${san} should be the only lookup move from ${chess.fen()}`,
      );
      assert.deepEqual(Brain.getIdealEndgameWhiteMoves(chess.fen()), [san]);
      assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
      blackReturnTargetFen = lastWhiteTurnFen;
      lastWhiteTurnFen = chess.fen();
    } else {
      assert.ok(
        Brain.getEndgameOpponentCandidates(
          chess,
          blackReturnTargetFen,
        ).idealMoves.includes(san),
        `${san} should be an ideal reply from ${chess.fen()}`,
      );
      blackReturnTargetFen = undefined;
    }
    chess.move(san);
  }
  assert.equal(chess.isCheckmate(), true);
});

test("knight-bishop lookup keeps reflected kb8 nc7 branch in net", () => {
  setEndgame("knightAndBishop");
  const line = [
    "Nb3+",
    "Ka2",
    "Bc2",
    "Ka3",
    "Bb1",
    "Ka4",
    "Nd4",
    "Ka5",
    "Kc4",
    "Ka6",
    "Nb5",
    "Kb7",
    "Bf5",
    "Kb8",
    "Kc5",
    "Kb7",
    "Be6",
    "Kb8",
    "Kb6",
    "Ka8",
    "Nc7+",
    "Kb8",
    "Na6+",
    "Ka8",
    "Bd5#",
  ];
  const chess = Brain.getChess(
    "8/8/8/8/4B3/2K5/3N4/k7 w - - 42 22",
  );
  let lastWhiteTurnFen: string | undefined;
  let blackReturnTargetFen: string | undefined;

  for (const san of line) {
    if (chess.turn() === "w") {
      assert.deepEqual(
        Brain.getKnightAndBishopLookupWhiteMoves(chess.fen()),
        [san],
        `${san} should be the only lookup move from ${chess.fen()}`,
      );
      assert.deepEqual(Brain.getIdealEndgameWhiteMoves(chess.fen()), [san]);
      assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
      blackReturnTargetFen = lastWhiteTurnFen;
      lastWhiteTurnFen = chess.fen();
    } else {
      assert.ok(
        Brain.getEndgameOpponentCandidates(
          chess,
          blackReturnTargetFen,
        ).idealMoves.includes(san),
        `${san} should be an ideal reply from ${chess.fen()}`,
      );
      blackReturnTargetFen = undefined;
    }
    chess.move(san);
  }
  assert.equal(chess.isCheckmate(), true);
});

test("knight-bishop lookup keeps kc7 be4 branch in net", () => {
  setEndgame("knightAndBishop");
  const line = [
    "Nf7+",
    "Kg8",
    "Bg6",
    "Kf8",
    "Bh7",
    "Ke8",
    "Ne5",
    "Kd8",
    "Ke6",
    "Kc8",
    "Nd7",
    "Kb7",
    "Bd3",
    "Kc7",
    "Be4",
    "Kc8",
    "Kd6",
    "Kd8",
    "Bg6",
    "Kc8",
    "Nc5",
    "Kd8",
    "Nb7+",
    "Kc8",
    "Kc6",
    "Kb8",
    "Kb6",
    "Kc8",
    "Bf5+",
    "Kb8",
    "Nc5",
    "Ka8",
    "Be6",
    "Kb8",
    "Na6+",
    "Ka8",
    "Bd5#",
  ];
  const chess = Brain.getChess(
    "7k/8/5K2/6N1/4B3/8/8/8 w - - 42 22",
  );
  let lastWhiteTurnFen: string | undefined;
  let blackReturnTargetFen: string | undefined;

  for (const san of line) {
    if (chess.turn() === "w") {
      assert.deepEqual(
        Brain.getKnightAndBishopLookupWhiteMoves(chess.fen()),
        [san],
        `${san} should be the only lookup move from ${chess.fen()}`,
      );
      assert.deepEqual(Brain.getIdealEndgameWhiteMoves(chess.fen()), [san]);
      assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
      blackReturnTargetFen = lastWhiteTurnFen;
      lastWhiteTurnFen = chess.fen();
    } else {
      assert.ok(
        Brain.getEndgameOpponentCandidates(
          chess,
          blackReturnTargetFen,
        ).idealMoves.includes(san),
        `${san} should be an ideal reply from ${chess.fen()}`,
      );
      blackReturnTargetFen = undefined;
    }
    chess.move(san);
  }
  assert.equal(chess.isCheckmate(), true);
});

test("knight-bishop lookup keeps c-file reflected nc4 branch in net", () => {
  setEndgame("knightAndBishop");
  const line = [
    "Nf2+",
    "Kg1",
    "Bg3",
    "Kf1",
    "Bh2",
    "Ke1",
    "Ne4",
    "Kd1",
    "Ke3",
    "Kc2",
    "Nd2",
    "Kc3",
    "Bd6",
    "Kc2",
    "Be5",
    "Kc1",
    "Kd3",
    "Kd1",
    "Bg3",
    "Kc1",
    "Nc4",
    "Kb1",
    "Kc3",
    "Kc1",
    "Nb2",
    "Kb1",
    "Kb3",
    "Ka1",
    "Nc4",
    "Kb1",
    "Bf4",
    "Ka1",
    "Be3",
    "Kb1",
    "Na3+",
    "Ka1",
    "Bd4#",
  ];
  const chess = Brain.getChess(
    "8/8/8/4B3/6N1/5K2/8/7k w - - 42 22",
  );
  let lastWhiteTurnFen: string | undefined;
  let blackReturnTargetFen: string | undefined;

  for (const san of line) {
    if (chess.turn() === "w") {
      assert.deepEqual(
        Brain.getKnightAndBishopLookupWhiteMoves(chess.fen()),
        [san],
        `${san} should be the only lookup move from ${chess.fen()}`,
      );
      assert.deepEqual(Brain.getIdealEndgameWhiteMoves(chess.fen()), [san]);
      assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
      blackReturnTargetFen = lastWhiteTurnFen;
      lastWhiteTurnFen = chess.fen();
    } else {
      assert.ok(
        Brain.getEndgameOpponentCandidates(
          chess,
          blackReturnTargetFen,
        ).idealMoves.includes(san),
        `${san} should be an ideal reply from ${chess.fen()}`,
      );
      blackReturnTargetFen = undefined;
    }
    chess.move(san);
  }
  assert.equal(chess.isCheckmate(), true);
});

test("knight-bishop lookup keeps h-file reflected nf1 branch in net", () => {
  setEndgame("knightAndBishop");
  const line = [
    "Nc2+",
    "Kb1",
    "Bb3",
    "Kc1",
    "Ba2",
    "Kd1",
    "Nd4",
    "Ke1",
    "Kd3",
    "Kf1",
    "Ne2",
    "Kg2",
    "Be6",
    "Kh2",
    "Ke3",
    "Kg2",
    "Bf5",
    "Kh1",
    "Kf2",
    "Kh2",
    "Bg4",
    "Kh1",
    "Ng3+",
    "Kh2",
    "Nf1+",
    "Kh1",
    "Bf3#",
  ];
  const chess = Brain.getChess(
    "8/8/8/3B4/1N6/2K5/8/k7 w - - 42 22",
  );
  let lastWhiteTurnFen: string | undefined;
  let blackReturnTargetFen: string | undefined;

  for (const san of line) {
    if (chess.turn() === "w") {
      assert.deepEqual(
        Brain.getKnightAndBishopLookupWhiteMoves(chess.fen()),
        [san],
        `${san} should be the only lookup move from ${chess.fen()}`,
      );
      assert.deepEqual(Brain.getIdealEndgameWhiteMoves(chess.fen()), [san]);
      assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
      blackReturnTargetFen = lastWhiteTurnFen;
      lastWhiteTurnFen = chess.fen();
    } else {
      assert.ok(
        Brain.getEndgameOpponentCandidates(
          chess,
          blackReturnTargetFen,
        ).idealMoves.includes(san),
        `${san} should be an ideal reply from ${chess.fen()}`,
      );
      blackReturnTargetFen = undefined;
    }
    chess.move(san);
  }
  assert.equal(chess.isCheckmate(), true);
});

test("knight-bishop lookup keeps short kb6 re-entry in net", () => {
  setEndgame("knightAndBishop");
  const line = [
    "Kb6",
    "Kb8",
    "Bf5",
    "Ka8",
    "Be6",
    "Kb8",
    "Na6+",
    "Ka8",
    "Bd5#",
  ];
  const chess = Brain.getChess(
    "k7/8/2K3B1/2N5/8/8/8/8 w - - 64 33",
  );
  let lastWhiteTurnFen: string | undefined;
  let blackReturnTargetFen: string | undefined;

  for (const san of line) {
    if (chess.turn() === "w") {
      assert.deepEqual(
        Brain.getKnightAndBishopLookupWhiteMoves(chess.fen()),
        [san],
        `${san} should be the only lookup move from ${chess.fen()}`,
      );
      assert.deepEqual(Brain.getIdealEndgameWhiteMoves(chess.fen()), [san]);
      assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
      blackReturnTargetFen = lastWhiteTurnFen;
      lastWhiteTurnFen = chess.fen();
    } else {
      assert.ok(
        Brain.getEndgameOpponentCandidates(
          chess,
          blackReturnTargetFen,
        ).idealMoves.includes(san),
        `${san} should be an ideal reply from ${chess.fen()}`,
      );
      blackReturnTargetFen = undefined;
    }
    chess.move(san);
  }
  assert.equal(chess.isCheckmate(), true);
});

test("knight-bishop lookup keeps short kg6 ng5 handoff in net", () => {
  setEndgame("knightAndBishop");
  const line = [
    "Kg6",
    "Kh8",
    "Ng5",
    "Kg8",
    "Bc5",
    "Kh8",
  ];
  const chess = Brain.getChess(
    "6k1/8/4NK2/8/8/8/5B2/8 w - - 68 35",
  );
  let lastWhiteTurnFen: string | undefined;
  let blackReturnTargetFen: string | undefined;

  for (const san of line) {
    if (chess.turn() === "w") {
      assert.deepEqual(
        Brain.getKnightAndBishopLookupWhiteMoves(chess.fen()),
        [san],
        `${san} should be the only lookup move from ${chess.fen()}`,
      );
      assert.deepEqual(Brain.getIdealEndgameWhiteMoves(chess.fen()), [san]);
      assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
      blackReturnTargetFen = lastWhiteTurnFen;
      lastWhiteTurnFen = chess.fen();
    } else {
      assert.ok(
        Brain.getEndgameOpponentCandidates(
          chess,
          blackReturnTargetFen,
        ).idealMoves.includes(san),
        `${san} should be an ideal reply from ${chess.fen()}`,
      );
      blackReturnTargetFen = undefined;
    }
    chess.move(san);
  }
});

test("knight-bishop lookup keeps short kb6 bishop-e6 re-entry in net", () => {
  setEndgame("knightAndBishop");
  const line = ["Kb6", "Kb8"];
  const chess = Brain.getChess(
    "k7/8/2K1B3/1N6/8/8/8/8 w - - 66 34",
  );
  let lastWhiteTurnFen: string | undefined;
  let blackReturnTargetFen: string | undefined;

  for (const san of line) {
    if (chess.turn() === "w") {
      assert.deepEqual(
        Brain.getKnightAndBishopLookupWhiteMoves(chess.fen()),
        [san],
        `${san} should be the only lookup move from ${chess.fen()}`,
      );
      assert.deepEqual(Brain.getIdealEndgameWhiteMoves(chess.fen()), [san]);
      assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
      blackReturnTargetFen = lastWhiteTurnFen;
      lastWhiteTurnFen = chess.fen();
    } else {
      assert.ok(
        Brain.getEndgameOpponentCandidates(
          chess,
          blackReturnTargetFen,
        ).idealMoves.includes(san),
        `${san} should be an ideal reply from ${chess.fen()}`,
      );
      blackReturnTargetFen = undefined;
    }
    chess.move(san);
  }
});

test("knight-bishop lookup accepts moves through every board symmetry", () => {
  setEndgame("knightAndBishop");

  for (const entry of Brain.KNIGHT_AND_BISHOP_LOOKUP_ENTRIES) {
    for (const transform of Brain.SQUARE_TRANSFORMS) {
      const inverseTransform = Brain.getSquareTransform(transform.inverseName);
      const fen = transformLookupEntryFen(entry.key, inverseTransform.name);
      const from = Brain.transformSquare(entry.from, inverseTransform);
      const to = Brain.transformSquare(entry.to, inverseTransform);
      const expectedSan = getMoveSan(fen, from, to);

      assert.ok(
        Brain.getKnightAndBishopLookupWhiteMoves(fen).includes(expectedSan),
        `${entry.key} via ${transform.name}: ${expectedSan}`,
      );
      assert.equal(Brain.getEndgamePhase(fen), "2/2", fen);
    }
  }
});

test("knight-bishop lookup table has no transformed collisions", () => {
  setEndgame("knightAndBishop");
  const movesByFen = new Map<string, Set<string>>();

  for (const entry of Brain.KNIGHT_AND_BISHOP_LOOKUP_ENTRIES) {
    for (const transform of Brain.SQUARE_TRANSFORMS) {
      const inverseTransform = Brain.getSquareTransform(transform.inverseName);
      const fen = transformLookupEntryFen(entry.key, inverseTransform.name);
      const from = Brain.transformSquare(entry.from, inverseTransform);
      const to = Brain.transformSquare(entry.to, inverseTransform);
      const san = getMoveSan(fen, from, to);
      const key = Brain.boardTurnKey(fen);
      const moves = movesByFen.get(key) ?? new Set<string>();
      moves.add(san);
      movesByFen.set(key, moves);
    }
  }

  const collisions = Array.from(movesByFen.entries()).filter(
    ([, moves]) => moves.size > 1,
  );
  assert.deepEqual(
    collisions.map(([fen, moves]) => [fen, Array.from(moves).sort()]),
    [],
  );
});

test("knight-bishop phase-two black replies are all ideal when a lookup reply exists", () => {
  setEndgame("knightAndBishop");
  const chess = Brain.getChess(
    "1k6/1N3B2/2K5/8/8/8/8/8 w - - 66 34",
  );

  assert.ok(Brain.getIdealEndgameWhiteMoves(chess.fen()).includes("Kb6"));
  assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");

  chess.move("Kb6");
  const candidates = Brain.getEndgameOpponentCandidates(chess);
  assert.deepEqual(candidates.moves, ["Kc8", "Ka8"]);
  assert.deepEqual(candidates.idealMoves, candidates.moves);

  chess.move("Ka8");
  assert.ok(Brain.getIdealEndgameWhiteMoves(chess.fen()).includes("Be6"));
  assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
  assertPhaseTwoOnlyOnWhiteTurn(chess.fen());
});

test("knight-bishop lookup includes alternate bishop f7 branches", () => {
  setEndgame("knightAndBishop");
  const lines = [
    [
      "Bf7",
      "Kb8",
      "Be6",
      "Ka7",
      "Kc7",
      "Ka8",
      "Kb6",
      "Kb8",
      "Na6+",
      "Ka8",
      "Bd5#",
    ],
    [
      "Bf7",
      "Kb8",
      "Be6",
      "Ka8",
      "Kc6",
      "Ka7",
      "Bd7",
      "Kb8",
      "Kb6",
      "Ka8",
      "Be6",
      "Kb8",
      "Na6+",
      "Ka8",
      "Bd5#",
    ],
  ];

  for (const line of lines) {
    const chess = Brain.getChess(
      "2k5/8/3K2B1/2N5/8/8/8/8 w - - 60 31",
    );
    assertPhaseTwoOnlyOnWhiteTurn(chess.fen());
    assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");

    for (const san of line) {
      if (chess.turn() === "w") {
        assert.ok(
          Brain.getIdealEndgameWhiteMoves(chess.fen()).includes(san),
          `${san} should be accepted from ${chess.fen()}`,
        );
        assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
      } else {
        const candidates = Brain.getEndgameOpponentCandidates(chess);
        if (chess.fen().startsWith("2k5/5B2/3K4/2N5/8/8/8/8 b ")) {
          assert.deepEqual(candidates.moves, ["Kd8", "Kb8"]);
          assert.deepEqual(candidates.idealMoves, candidates.moves);
        }
        assert.ok(
          candidates.idealMoves.includes(san),
          `${san} should be an ideal reply from ${chess.fen()}`,
        );
      }
      chess.move(san);
      assertPhaseTwoOnlyOnWhiteTurn(chess.fen());
    }
    assert.equal(chess.isCheckmate(), true);
  }
});

test("knight-bishop lookup includes knight retreat branches", () => {
  setEndgame("knightAndBishop");
  const lines = [
    ["Ke6", "Ke8", "Nd7", "Kd8"],
    [
      "Ke6",
      "Kc7",
      "Nd7",
      "Kc6",
      "Bd3",
      "Kc7",
      "Be4",
      "Kd8",
      "Kd6",
      "Ke8",
      "Bg6+",
      "Kd8",
    ],
    [
      "Ke6",
      "Kc7",
      "Nd7",
      "Kc6",
      "Bd3",
      "Kc7",
      "Be4",
      "Kd8",
      "Kd6",
      "Kc8",
      "Bd5",
      "Kd8",
      "Bf7",
      "Kc8",
      "Nc5",
      "Kd8",
    ],
  ];

  for (const line of lines) {
    const chess = Brain.getChess(
      "3k4/7B/5K2/4N3/8/8/8/8 w - - 50 26",
    );
    assertPhaseTwoOnlyOnWhiteTurn(chess.fen());
    assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");

    for (const san of line) {
      if (chess.turn() === "w") {
        assert.ok(
          Brain.getIdealEndgameWhiteMoves(chess.fen()).includes(san),
          `${san} should be accepted from ${chess.fen()}`,
        );
        assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
      } else {
        assert.ok(
          Brain.getEndgameOpponentCandidates(chess).idealMoves.includes(san),
          `${san} should be an ideal reply from ${chess.fen()}`,
        );
      }
      chess.move(san);
      assertPhaseTwoOnlyOnWhiteTurn(chess.fen());
    }
  }
});

test("knight-bishop lookup includes king c8 and knight d7 branches", () => {
  setEndgame("knightAndBishop");
  const lines = [
    [
      "Nd7",
      "Kc7",
      "Be4",
      "Kd8",
    ],
    [
      "Ke6",
      "Kc8",
      "Nd7",
      "Kb7",
      "Bd3",
      "Ka8",
      "Kd6",
      "Kb7",
      "Bc4",
      "Ka7",
      "Kc7",
      "Ka8",
      "Nb6+",
      "Ka7",
    ],
  ];

  const starts = [
    "2k5/7B/4K3/4N3/8/8/8/8 w - - 52 27",
    "3k4/7B/5K2/4N3/8/8/8/8 w - - 50 26",
  ];

  lines.forEach((line, index) => {
    const chess = Brain.getChess(starts[index]);
    assertPhaseTwoOnlyOnWhiteTurn(chess.fen());
    assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");

    for (const san of line) {
      if (chess.turn() === "w") {
        assert.ok(
          Brain.getIdealEndgameWhiteMoves(chess.fen()).includes(san),
          `${san} should be accepted from ${chess.fen()}`,
        );
        assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
      } else {
        const candidates = Brain.getEndgameOpponentCandidates(chess);
        if (chess.fen().startsWith("2k5/3N3B/4K3/8/8/8/8/8 b ")) {
          assert.deepEqual(candidates.idealMoves, candidates.moves);
        }
        if (chess.fen().startsWith("3k4/7B/4K3/4N3/8/8/8/8 b ")) {
          assert.deepEqual(candidates.idealMoves, candidates.moves);
        }
        assert.ok(
          candidates.idealMoves.includes(san),
          `${san} should be an ideal reply from ${chess.fen()}`,
        );
      }
      chess.move(san);
    }
  });
});

test("knight-bishop lookup patches forced re-entry holes", () => {
  setEndgame("knightAndBishop");
  const cases = [
    ["2k5/3N3B/4K3/8/8/8/8/8 w - - 54 28", "Be4"],
    ["2k5/3N3B/3K4/8/8/8/8/8 w - - 56 29", "Nc5"],
    ["2k5/3N4/4K3/8/8/3B4/8/8 w - - 56 29", "Be4"],
    ["2k5/3N4/4K3/8/4B3/8/8/8 w - - 56 29", "Kd6"],
    ["2k5/3N4/4K3/3B4/8/8/8/8 w - - 58 30", "Kd6"],
    ["8/k2N4/3K4/8/8/3B4/8/8 w - - 58 30", "Kc7"],
    ["2k5/3N4/3K4/3B4/8/8/8/8 w - - 60 31", "Be4"],
    ["2k5/3N4/3K4/8/2B5/8/8/8 w - - 60 31", "Bd5"],
    ["3k4/8/3K4/2N2B2/8/8/8/8 w - - 64 33", "Bg6"],
    ["8/k7/2K5/2N5/2B5/8/8/8 w - - 64 33", "Nd7"],
    ["1k6/8/2K5/2N5/2B5/8/8/8 w - - 64 33", "Be6"],
    ["1k6/8/2K1B3/2N5/8/8/8/8 w - - 66 34", "Kb6"],
    ["k7/8/2K5/2N2B2/8/8/8/8 w - - 66 34", "Be6"],
    ["8/2kN4/4K3/8/2B5/8/8/8 w - - 58 30", "Bd5"],
    ["k7/3N4/3K4/8/2B5/8/8/8 w - - 60 31", "Kc7"],
    ["k7/3B4/2K5/2N5/8/8/8/8 w - - 68 35", "Kb6"],
  ] as const;

  for (const [fen, expectedMoves] of cases) {
    const moves = expectedMovesArray(expectedMoves);
    for (const expectedMove of moves) {
      const chess = Brain.getChess(fen);
      assert.ok(
        Brain.getKnightAndBishopLookupWhiteMoves(chess.fen()).includes(
          expectedMove,
        ),
        `${expectedMove} should be present in lookup from ${chess.fen()}`,
      );
      assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");

      chess.move(expectedMove);
      const candidates = Brain.getEndgameOpponentCandidates(chess);
      assert.deepEqual(candidates.idealMoves, candidates.moves, chess.fen());

      for (const blackMove of candidates.moves) {
        const branch = Brain.getChess(chess.fen());
        branch.move(blackMove);
        assertPhaseTwoOnlyOnWhiteTurn(branch.fen());
      }
    }
  }
});

test("knight-bishop lookup includes bishop d5 branch", () => {
  setEndgame("knightAndBishop");
  const chess = Brain.getChess(
    "8/2kN4/4K3/8/4B3/8/8/8 w - - 56 29",
  );
  const line = ["Bd5", "Kd8", "Kd6", "Ke8", "Be6", "Kd8", "Bf7", "Kc8"];

  assertPhaseTwoOnlyOnWhiteTurn(chess.fen());
  assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
  for (const san of line) {
    if (chess.turn() === "w") {
      assert.ok(
        Brain.getIdealEndgameWhiteMoves(chess.fen()).includes(san),
        `${san} should be accepted from ${chess.fen()}`,
      );
      assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
    } else {
      assert.ok(
        Brain.getEndgameOpponentCandidates(chess).idealMoves.includes(san),
        `${san} should be an ideal reply from ${chess.fen()}`,
      );
    }
    chess.move(san);
    assertPhaseTwoOnlyOnWhiteTurn(chess.fen());
  }

  assert.ok(Brain.getIdealEndgameWhiteMoves(chess.fen()).includes("Nc5"));
});

test("knight-bishop lookup includes bishop d3 retreat branch", () => {
  setEndgame("knightAndBishop");
  const lines = [
    ["Kd6", "Kc8", "Be4", "Kd8", "Bg6", "Kc8"],
    [
      "Kd6",
      "Kc8",
      "Be4",
      "Kd8",
      "Bg6",
      "Kc8",
      "Nc5",
      "Kd8",
      "Nb7+",
      "Kc8",
      "Kc6",
      "Kb8",
      "Kb6",
      "Kc8",
    ],
  ];

  for (const line of lines) {
    const chess = Brain.getChess(
      "8/1k1N4/4K3/8/8/3B4/8/8 w - - 56 29",
    );
    assertPhaseTwoOnlyOnWhiteTurn(chess.fen());
    assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");

    for (const san of line) {
      if (chess.turn() === "w") {
        assert.ok(
          Brain.getIdealEndgameWhiteMoves(chess.fen()).includes(san),
          `${san} should be accepted from ${chess.fen()}`,
        );
        assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
      } else {
        assert.ok(
          Brain.getEndgameOpponentCandidates(chess).idealMoves.includes(san),
          `${san} should be an ideal reply from ${chess.fen()}`,
        );
      }
      chess.move(san);
      assertPhaseTwoOnlyOnWhiteTurn(chess.fen());
    }
  }
});

test("knight-bishop lookup includes final bishop d3 holes", () => {
  setEndgame("knightAndBishop");
  const lines = [
    {
      fen: "8/3N4/2k1K3/8/8/3B4/8/8 w - - 56 29",
      moves: ["Bc4", "Kb7", "Kd6", "Ka8"],
    },
    {
      fen: "8/k2N4/4K3/8/8/3B4/8/8 w - - 56 29",
      moves: ["Kd6", "Ka8", "Kc6", "Ka7", "Bc4", "Ka8"],
    },
  ];

  for (const line of lines) {
    const chess = Brain.getChess(line.fen);
    assertPhaseTwoOnlyOnWhiteTurn(chess.fen());
    assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");

    for (const san of line.moves) {
      if (chess.turn() === "w") {
        assert.ok(
          Brain.getIdealEndgameWhiteMoves(chess.fen()).includes(san),
          `${san} should be accepted from ${chess.fen()}`,
        );
        assert.equal(Brain.getEndgameReason(chess.fen()), "mating net");
      } else {
        assert.ok(
          Brain.getEndgameOpponentCandidates(chess).idealMoves.includes(san),
          `${san} should be an ideal reply from ${chess.fen()}`,
        );
      }
      chess.move(san);
      assertPhaseTwoOnlyOnWhiteTurn(chess.fen());
    }
  }
});

test("two-bishop phase two uses the documented front-square conditions", () => {
  setEndgame("twoBishops");
  const formerLookupPosition = "4k3/8/4K3/3BB3/8/8/8/8 w - - 38 20";

  assert.equal(Brain.getEndgamePhase(formerLookupPosition), "2/2");
  assert.equal(Brain.shouldShowPhaseTwoBoardBorder(formerLookupPosition), true);
  assert.notEqual(Brain.getEndgameReason(formerLookupPosition), "mating net");
});

test("endgame phase two is only reported on white turns", () => {
  const cases: Array<[EndgameId, string]> = [
    ["knightAndBishop", "7k/8/5K2/6N1/4B3/8/8/8 w - - 42 22"],
    ["twoBishops", "8/8/8/8/8/4K3/1BB5/5k2 w - - 34 18"],
    ["rook", "8/8/8/8/3k4/8/3R4/3K4 w - - 0 1"],
    ["queen", "8/8/8/8/3k4/8/3Q4/3K4 w - - 0 1"],
  ];

  for (const [id, whiteFen] of cases) {
    setEndgame(id);
    assert.equal(Brain.getEndgamePhase(whiteFen), "2/2", whiteFen);
    const blackFen = whiteFen.replace(" w ", " b ");
    assert.equal(Brain.getEndgamePhase(blackFen), "1/2", blackFen);
  }
});

test("endgame board border keeps phase two during black reply animation", () => {
  setEndgame("knightAndBishop");
  const startingFen = "4k3/5N1B/5K2/8/8/8/8/8 w - - 48 25";
  const afterWhiteFen = Brain.getFen(startingFen, "Ne5");
  const finalFen = Brain.getFen(afterWhiteFen, "Kd8");
  Brain.history = {
    index: 0,
    states: [
      {
        fen: finalFen,
        startingFen: afterWhiteFen,
        orientationIsWhite: true,
        logs: [
          {
            fen: startingFen,
            san: "Ne5",
            opponent_san: "Kd8",
            ...Brain.getEndgameLogFields(
              startingFen,
              "Ne5",
              afterWhiteFen,
            ),
          },
        ],
      },
    ],
  };

  assert.equal(Brain.getEndgamePhase(afterWhiteFen), "1/2");
  assert.equal(Brain.getVisibleEndgamePhase(afterWhiteFen), "2/2");
  assert.equal(Brain.shouldShowPhaseTwoBoardBorder(afterWhiteFen), true);
});

test("two-bishop phase two follows the documented front-square conditions", () => {
  setEndgame("twoBishops");

  assert.deepEqual(Brain.getBlackKingFrontSquares("a1"), ["a2", "b1", "b2"]);
  assert.deepEqual(Brain.getBlackKingFrontSquares("h1"), ["h2", "g1", "g2"]);
  assert.deepEqual(Brain.getBlackKingFrontSquares("a8"), ["a7", "b8", "b7"]);
  assert.deepEqual(Brain.getBlackKingFrontSquares("h8"), ["h7", "g8", "g7"]);
  assert.equal(
    Brain.getEndgamePhase("8/8/8/8/8/4K3/1BB5/5k2 w - - 34 18"),
    "2/2",
  );
  assert.equal(
    Brain.getEndgamePhase("8/8/8/8/2B5/3KB3/8/3k4 w - - 48 25"),
    "2/2",
  );
  assert.equal(
    Brain.getEndgamePhase("8/8/B6B/8/8/8/8/3k1K2 w - - 0 1"),
    "1/2",
  );
  assert.equal(
    Brain.getEndgamePhase("8/8/2B5/2B5/8/8/2K5/k7 w - - 40 21"),
    "2/2",
  );
  assert.equal(
    Brain.getEndgamePhase("8/8/2B5/2B5/8/8/K7/k7 w - - 0 1"),
    "2/2",
  );
  assert.equal(
    Brain.getEndgamePhase("4k3/8/4B3/5B2/4K3/8/8/8 w - - 0 1"),
    "1/2",
  );
  assert.equal(
    Brain.getEndgamePhase("8/8/8/8/1B6/8/k1B5/2K5 w - - 0 1"),
    "2/2",
  );
  assert.equal(
    Brain.getEndgamePhase("8/8/8/8/8/5K2/B7/B6k w - - 0 1"),
    "1/2",
  );
  assert.equal(
    Brain.getEndgamePhase("8/8/8/5K2/4BB2/7k/8/8 w - - 32 17"),
    "2/2",
  );
});

test("two-bishop diagonal edge-walk phase two preserves the phase", () => {
  setEndgame("twoBishops");
  const fen = "8/8/8/5K2/4B2k/4B3/8/8 w - - 30 16";
  const afterWhite = Brain.getFen(fen, "Bf4");
  const afterBlack = Brain.getFen(afterWhite, "Kh3");

  assert.equal(afterBlack, "8/8/8/5K2/4BB2/7k/8/8 w - - 32 17");
  assert.equal(Brain.getEndgamePhase(afterBlack), "2/2");
  assert.equal(Brain.scoreTwoBishopsWhiteMove(fen, "Bf4").phaseTwoForceOpponentOppositionPenalty, 1);
});

test("two-bishop phase two direct opposition satisfies the combined opposition rule", () => {
  setEndgame("twoBishops");
  const fen = "8/8/8/3B4/8/3K2B1/8/2k5 w - - 64 33";
  const directOpposition = Brain.scoreTwoBishopsWhiteMove(fen, "Kc3");
  const movesBlackColorBishop = Brain.scoreTwoBishopsWhiteMove(fen, "Bf2");

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.equal(directOpposition.phaseTwoForceOpponentOppositionPenalty, 0);
  assert.equal(movesBlackColorBishop.phaseTwoForceOpponentOppositionPenalty, 1);
  assert.equal(Brain.compareTwoBishopsWhiteScores(directOpposition, movesBlackColorBishop) < 0, true);
  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Kc3"]);
});

test("two-bishop phase two can move the black-color bishop when checking into opposition", () => {
  setEndgame("twoBishops");
  const fen = "3k4/5BB1/2K5/8/8/8/8/8 w - - 24 13";
  const checkingEdgeWalk = Brain.scoreTwoBishopsWhiteMove(fen, "Bf6+");

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.equal(checkingEdgeWalk.phaseTwoForceOpponentOppositionPenalty, 0);
  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Bf6+"]);
});

test("two-bishop white priorities are ordered", () => {
  assert.deepEqual(
    Brain.getTwoBishopsWhiteScoreReasons().map(({ reason }) => reason),
    [
      "mate",
      "no stalemate",
      "bishops safe",
      "stay phase two",
      "keep opponent on edge",
      "waiting move",
      "king not on bishop line",
      "force opponent to take opposition",
      "force opponent toward corner",
      "check king",
      "bishops far from corner",
      "bishops in middle 16",
      "bishops together",
      "king not on edge",
      "king closer",
      "force black to edge",
      "take adjacent bishops opposition",
      "bishops closer",
    ],
  );
});

test("two-bishop white rules take opposition when king already touches both bishops", () => {
  setEndgame("twoBishops");
  const fen = "8/8/2B5/2BK4/5k2/8/8/8 w - - 14 8";
  const opposition = Brain.scoreTwoBishopsWhiteMove(fen, "Kd4");
  const bishopCloser = Brain.scoreTwoBishopsWhiteMove(fen, "Bd6+");

  assert.equal(Brain.getEndgamePhase(fen), "1/2");
  assert.equal(opposition.adjacentBishopsOppositionPenalty, 0);
  assert.equal(bishopCloser.adjacentBishopsOppositionPenalty, 1);
  assert.equal(opposition.bishopBlackKingDistance > bishopCloser.bishopBlackKingDistance, true);
  assert.equal(Brain.compareTwoBishopsWhiteScores(opposition, bishopCloser) < 0, true);
  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Kd4"]);
  assert.equal(Brain.getEndgameReason(fen), "take adjacent bishops opposition");
  assert.equal(Brain.getEndgameReasonText(Brain.getEndgameReason(fen)), "take king opposition");
});

test("two-bishop white rules avoid bishops being captured or attacked", () => {
  setEndgame("twoBishops");
  const fen = "8/8/8/8/8/1k6/4B3/2K2B2 w - - 0 1";
  const safe = Brain.scoreTwoBishopsWhiteMove(fen, "Bf3");
  const attacked = Brain.scoreTwoBishopsWhiteMove(fen, "Bd3");

  assert.equal(safe.bishopSafetyPenalty, 0);
  assert.equal(attacked.bishopSafetyPenalty, 1);
  assert.equal(Brain.compareTwoBishopsWhiteScores(safe, attacked) < 0, true);
});

test("two-bishop phase two prefers the waiting move after safety", () => {
  setEndgame("twoBishops");
  const fen = "8/8/2B5/2B5/8/8/2K5/k7 w - - 40 21";
  const waiting = Brain.scoreTwoBishopsWhiteMove(fen, "Be4");
  const otherSafeSqueeze = Brain.scoreTwoBishopsWhiteMove(fen, "Bf3");

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.equal(waiting.bishopSafetyPenalty, 0);
  assert.equal(otherSafeSqueeze.bishopSafetyPenalty, 0);
  assert.equal(waiting.phaseTwoWaitingMovePenalty, 0);
  assert.equal(otherSafeSqueeze.phaseTwoWaitingMovePenalty, 1);
  assert.equal(
    Brain.compareTwoBishopsWhiteScores(waiting, otherSafeSqueeze) < 0,
    true,
  );
  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Be4"]);
  assert.equal(Brain.getEndgameReason(fen), "waiting move");
});

test("two-bishop phase two uses corner waiting moves", () => {
  setEndgame("twoBishops");
  const fen = "8/8/2B5/2B5/8/8/2K5/k7 w - - 40 21";
  const waiting = Brain.scoreTwoBishopsWhiteMove(fen, "Be4");
  const nonWaiting = Brain.scoreTwoBishopsWhiteMove(fen, "Bf3");
  const cornerWaitingMoves = Brain.getTwoBishopsCornerWaitingMoves(fen);

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Be4"]);
  assert.equal(Brain.getEndgameReason(fen), "waiting move");
  assert.equal(waiting.phaseTwoWaitingMovePenalty, 0);
  assert.equal(nonWaiting.phaseTwoWaitingMovePenalty, 1);
  assert.deepEqual(cornerWaitingMoves, [{ from: "c6", to: "e4" }]);
});

test("two-bishop best move reuses corner waiting move search", () => {
  setEndgame("twoBishops");
  const fen = "8/8/2B5/2B5/8/8/2K5/k7 w - - 40 21";
  const original = Brain.getTwoBishopsCornerWaitingMoves;
  let calls = 0;
  Brain.getTwoBishopsCornerWaitingMoves = ((...args) => {
    calls += 1;
    return original.apply(Brain, args);
  }) as typeof Brain.getTwoBishopsCornerWaitingMoves;

  try {
    assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Be4"]);
    assert.equal(calls, 1);
    assert.equal(Brain.getEndgameReason(fen), "waiting move");
  } finally {
    Brain.getTwoBishopsCornerWaitingMoves = original;
  }
});

test("two-bishop phase two prefers forcing opposition before corner distance", () => {
  setEndgame("twoBishops");
  const fen = "8/8/8/B7/B7/8/2K5/k7 w - - 0 1";
  const forceOpposition = Brain.scoreTwoBishopsWhiteMove(fen, "Kb3");
  const forceCorner = Brain.scoreTwoBishopsWhiteMove(fen, "Kc3");

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.equal(forceOpposition.phaseTwoWaitingMovePenalty, forceCorner.phaseTwoWaitingMovePenalty);
  assert.equal(forceOpposition.phaseTwoKingOnBishopLinePenalty, forceCorner.phaseTwoKingOnBishopLinePenalty);
  assert.equal(forceOpposition.phaseTwoForceOpponentOppositionPenalty, 0);
  assert.equal(forceCorner.phaseTwoForceOpponentOppositionPenalty, 1);
  assert.equal(forceOpposition.phaseTwoForceOpponentCornerPenalty, 6);
  assert.equal(forceCorner.phaseTwoForceOpponentCornerPenalty, 7);
  assert.equal(
    Brain.compareTwoBishopsWhiteScores(forceOpposition, forceCorner) < 0,
    true,
  );
});

test("two-bishop phase two prefers checking before bishop-corner distance", () => {
  setEndgame("twoBishops");
  const fen = "8/8/8/1B6/1B6/8/k1K5/8 w - - 0 1";
  const checking = Brain.scoreTwoBishopsWhiteMove(fen, "Bc4+");
  const nonCheckingNearer = Brain.scoreTwoBishopsWhiteMove(fen, "Be2");

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.equal(checking.phaseTwoForceOpponentCornerPenalty, 7);
  assert.equal(nonCheckingNearer.phaseTwoForceOpponentCornerPenalty, 7);
  assert.equal(checking.phaseTwoCheckPenalty, 0);
  assert.equal(nonCheckingNearer.phaseTwoCheckPenalty, 1);
  assert.equal(checking.phaseTwoBishopCornerDistance <= nonCheckingNearer.phaseTwoBishopCornerDistance, true);
  assert.equal(Brain.compareTwoBishopsWhiteScores(checking, nonCheckingNearer) < 0, true);
});

test("two-bishop phase two staying in phase two comes before edge details", () => {
  setEndgame("twoBishops");
  const fen = "7B/8/8/8/4B3/8/k1K5/8 w - - 0 1";
  const checkingEdgeLock = Brain.scoreTwoBishopsWhiteMove(fen, "Bd5+");
  const kingMoveLooser = Brain.scoreTwoBishopsWhiteMove(fen, "Kd3");

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.equal(checkingEdgeLock.phaseTwoStayPhaseTwoPenalty, 0);
  assert.equal(kingMoveLooser.phaseTwoStayPhaseTwoPenalty, 1);
  assert.equal(checkingEdgeLock.phaseTwoKeepOpponentEdgePenalty, 0);
  assert.equal(kingMoveLooser.phaseTwoKeepOpponentEdgePenalty, 1);
  assert.equal(Brain.compareTwoBishopsWhiteScores(checkingEdgeLock, kingMoveLooser) < 0, true);
  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Bd5+"]);
  assert.equal(Brain.getEndgameReason(fen, "Kd3"), "stay phase two");
});

test("two-bishop phase two forces Black to stay in phase two before edge details", () => {
  setEndgame("twoBishops");
  const fen = "8/1B6/8/6B1/8/5K2/7k/8 w - - 0 1";
  const staysPhaseTwo = Brain.scoreTwoBishopsWhiteMove(fen, "Kf2");
  const leavesPhaseTwo = Brain.scoreTwoBishopsWhiteMove(fen, "Ba8");

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.equal(staysPhaseTwo.bishopSafetyPenalty, leavesPhaseTwo.bishopSafetyPenalty);
  assert.equal(staysPhaseTwo.phaseTwoStayPhaseTwoPenalty, 0);
  assert.equal(leavesPhaseTwo.phaseTwoStayPhaseTwoPenalty, 1);
  assert.equal(staysPhaseTwo.phaseTwoKeepOpponentEdgePenalty, 0);
  assert.equal(leavesPhaseTwo.phaseTwoKeepOpponentEdgePenalty, 0);
  assert.equal(Brain.compareTwoBishopsWhiteScores(staysPhaseTwo, leavesPhaseTwo) < 0, true);
  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Kf2"]);
  assert.equal(Brain.getEndgameReason(fen, "Ba8"), "stay phase two");
});

test("two-bishop phase two accepts checking moves that keep Black in the corner", () => {
  setEndgame("twoBishops");
  const fen = "8/k1K5/8/4B3/2B5/8/8/8 w - - 32 17";
  const checkingCorner = Brain.scoreTwoBishopsWhiteMove(fen, "Bd4+");
  const quietCorner = Brain.scoreTwoBishopsWhiteMove(fen, "Bc3");

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.equal(checkingCorner.phaseTwoKeepOpponentEdgePenalty, 0);
  assert.equal(quietCorner.phaseTwoKeepOpponentEdgePenalty, 0);
  assert.equal(checkingCorner.phaseTwoCheckPenalty, 0);
  assert.equal(quietCorner.phaseTwoCheckPenalty, 1);
  assert.equal(Brain.compareTwoBishopsWhiteScores(checkingCorner, quietCorner) < 0, true);
  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Bd4+"]);
  assert.equal(Brain.getEndgameReason(fen, "Bd4+"), "check king");
});

test("two-bishop phase two folds direct opposition into the combined opposition rule", () => {
  setEndgame("twoBishops");
  const fen = "8/8/8/1B6/1B6/8/k1K5/8 w - - 0 1";
  const forceCorner = Brain.scoreTwoBishopsWhiteMove(fen, "Kc3");
  const takeOpposition = Brain.scoreTwoBishopsWhiteMove(fen, "Ba5");

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.equal(forceCorner.bishopSafetyPenalty, 0);
  assert.equal(takeOpposition.bishopSafetyPenalty, 0);
  assert.equal(forceCorner.phaseTwoForceOpponentOppositionPenalty, 1);
  assert.equal(takeOpposition.phaseTwoForceOpponentOppositionPenalty, 0);
  assert.equal(forceCorner.phaseTwoForceOpponentCornerPenalty, 9);
  assert.equal(takeOpposition.phaseTwoForceOpponentCornerPenalty, 2);
  assert.equal(forceCorner.phaseTwoKingOnBishopLinePenalty, 1);
  assert.equal(takeOpposition.phaseTwoKingOnBishopLinePenalty, 0);
  assert.equal(Brain.compareTwoBishopsWhiteScores(takeOpposition, forceCorner) < 0, true);
});

test("two-bishop phase two uses corner distance after opposition", () => {
  setEndgame("twoBishops");
  const fen = "3k4/6B1/3KB3/8/8/8/8/8 w - - 70 36";
  const towardCorner = Brain.scoreTwoBishopsWhiteMove(fen, "Bf7");
  const centralBishops = Brain.scoreTwoBishopsWhiteMove(fen, "Bf6+");

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.equal(towardCorner.phaseTwoForceOpponentOppositionPenalty, 0);
  assert.equal(centralBishops.phaseTwoForceOpponentOppositionPenalty, 0);
  assert.equal(towardCorner.phaseTwoForceOpponentCornerPenalty, 2);
  assert.equal(centralBishops.phaseTwoForceOpponentCornerPenalty, 4);
  assert.equal(towardCorner.bishopMiddle16Penalty > centralBishops.bishopMiddle16Penalty, true);
  assert.equal(Brain.compareTwoBishopsWhiteScores(towardCorner, centralBishops) < 0, true);
  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Bf7"]);
  assert.equal(Brain.getEndgameReason(fen), "force opponent toward corner");
});

test("two-bishop phase two takes opposition before later priorities", () => {
  setEndgame("twoBishops");
  const fen = "8/8/8/8/8/4K3/1BB5/5k2 w - - 34 18";
  const opposition = Brain.scoreTwoBishopsWhiteMove(fen, "Kf3");
  const middle = Brain.scoreTwoBishopsWhiteMove(fen, "Bc3");

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.equal(opposition.phaseTwoForceOpponentOppositionPenalty, 0);
  assert.equal(middle.phaseTwoForceOpponentOppositionPenalty, 1);
  assert.equal(opposition.phaseTwoForceOpponentCornerPenalty, 3);
  assert.equal(middle.phaseTwoForceOpponentCornerPenalty, 9);
  assert.equal(Brain.compareTwoBishopsWhiteScores(opposition, middle) < 0, true);
});

test("two-bishop phase two takes the optimal opposition entry", () => {
  setEndgame("twoBishops");
  const fen = "8/7k/5K2/8/6B1/6B1/8/8 w - - 64 33";
  const opposition = Brain.scoreTwoBishopsWhiteMove(fen, "Kf7");
  const bishopSetup = Brain.scoreTwoBishopsWhiteMove(fen, "Bf4");

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.equal(opposition.phaseTwoStayPhaseTwoPenalty, 0);
  assert.equal(bishopSetup.phaseTwoStayPhaseTwoPenalty, 1);
  assert.equal(opposition.phaseTwoForceOpponentCornerPenalty, 2);
  assert.equal(bishopSetup.phaseTwoForceOpponentCornerPenalty, 9);
  assert.equal(Brain.compareTwoBishopsWhiteScores(opposition, bishopSetup) < 0, true);
  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Kf7"]);
  assert.equal(Brain.getEndgameReason(fen), "force opponent to take opposition");
});

test("two-bishop white rules prefer middle 16 before adjacent bishops", () => {
  setEndgame("twoBishops");
  const fen = "7k/8/8/8/8/8/8/B1B1K3 w - - 0 1";
  const middle = Brain.scoreTwoBishopsWhiteMove(fen, "Be3");
  const together = Brain.scoreTwoBishopsWhiteMove(fen, "Bcb2");

  assert.equal(middle.bishopMiddle16Penalty < together.bishopMiddle16Penalty, true);
  assert.equal(middle.bishopAdjacencyPenalty > together.bishopAdjacencyPenalty, true);
  assert.equal(Brain.compareTwoBishopsWhiteScores(middle, together) < 0, true);
});

test("two-bishop white rules prefer adjacent bishops", () => {
  setEndgame("twoBishops");
  const fen = "8/8/8/8/1k6/8/3B4/2K2B2 w - - 0 1";
  const together = Brain.scoreTwoBishopsWhiteMove(fen, "Be2");
  const apart = Brain.scoreTwoBishopsWhiteMove(fen, "Bh3");

  assert.equal(together.bishopAdjacencyPenalty, 0);
  assert.equal(apart.bishopAdjacencyPenalty, 1);
  assert.equal(Brain.compareTwoBishopsWhiteScores(together, apart) < 0, true);
});

test("two-bishop white rules prefer king not on edge before king closer", () => {
  setEndgame("twoBishops");
  const fen = "8/8/8/8/8/3BB3/8/1K3k2 w - - 0 1";
  const offEdge = Brain.scoreTwoBishopsWhiteMove(fen, "Kb2+");
  const closerOnEdge = Brain.scoreTwoBishopsWhiteMove(fen, "Kc1");

  assert.equal(offEdge.kingEdgePenalty, 0);
  assert.equal(closerOnEdge.kingEdgePenalty, 1);
  assert.equal(offEdge.kingWalkDistance > closerOnEdge.kingWalkDistance, true);
  assert.equal(Brain.compareTwoBishopsWhiteScores(offEdge, closerOnEdge) < 0, true);
});

test("two-bishop white rules prefer king closer before bishops closer", () => {
  setEndgame("twoBishops");
  const fen = getEndgame("twoBishops").fen;
  const kingCloser = Brain.scoreTwoBishopsWhiteMove(fen, "Kd2");
  const bishopCloser = Brain.scoreTwoBishopsWhiteMove(fen, "Bd2");

  assert.equal(kingCloser.kingWalkDistance < bishopCloser.kingWalkDistance, true);
  assert.equal(
    kingCloser.bishopBlackKingDistance > bishopCloser.bishopBlackKingDistance,
    true,
  );
  assert.equal(
    Brain.compareTwoBishopsWhiteScores(kingCloser, bishopCloser) < 0,
    true,
  );
});

test("two-bishop white rules use bishop distance after king walk distance", () => {
  setEndgame("twoBishops");
  const fen = "8/8/1k2B3/4B3/1K6/8/8/8 w - - 14 8";
  const closer = Brain.scoreTwoBishopsWhiteMove(fen, "Bd5");
  const farther = Brain.scoreTwoBishopsWhiteMove(fen, "Kc4");

  assert.equal(closer.kingWalkDistance, farther.kingWalkDistance);
  assert.equal(closer.bishopMiddle16Penalty, farther.bishopMiddle16Penalty);
  assert.equal(closer.bishopAdjacencyPenalty, farther.bishopAdjacencyPenalty);
  assert.equal(closer.bishopBlackKingDistance, 5);
  assert.equal(farther.bishopBlackKingDistance, 6);
  assert.equal(Brain.compareTwoBishopsWhiteScores(closer, farther) < 0, true);
  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Bd5"]);
});

test("two-bishop king closer uses king walk distance", () => {
  setEndgame("twoBishops");

  assert.equal(
    Brain.scoreTwoBishopsWhiteMove(
      "8/8/8/1k2B3/4B3/2K5/8/8 w - - 10 6",
      "Kd4",
    ).kingWalkDistance,
    2,
  );
});

test("two-bishop black rules stay off edges before approaching unprotected bishops", () => {
  setEndgame("twoBishops");
  const fen = "8/3k4/7B/8/8/8/K7/5B2 b - - 0 1";
  const central = Brain.scoreTwoBishopsBlackMove(fen, "Kd6");
  const bishopApproach = Brain.scoreTwoBishopsBlackMove(fen, "Ke8");

  assert.equal(central.centerDistance < bishopApproach.centerDistance, true);
  assert.equal(
    central.unprotectedBishopDistance > bishopApproach.unprotectedBishopDistance,
    true,
  );
  assert.equal(Brain.compareTwoBishopsBlackScores(central, bishopApproach) < 0, true);
});

test("two-bishop black rules approach unprotected bishops after edge distance", () => {
  setEndgame("twoBishops");
  const fen = getEndgame("twoBishops").fen.replace(" w ", " b ");
  const closer = Brain.scoreTwoBishopsBlackMove(fen, "Kd7");
  const farther = Brain.scoreTwoBishopsBlackMove(fen, "Kd8");

  assert.equal(closer.centerDistance < farther.centerDistance, true);
  assert.equal(
    closer.unprotectedBishopDistance < farther.unprotectedBishopDistance,
    true,
  );
  assert.equal(Brain.compareTwoBishopsBlackScores(closer, farther) < 0, true);
});

test("queen white rules choose explicit best moves", () => {
  setEndgame("queen");

  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("7k/5K2/8/8/8/8/8/1Q6 w - - 0 1"),
    ["Qh1#"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/8/8/8/4k3/8/8/3QK3 w - - 0 1"),
    ["Qd6"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("7k/8/8/6Q1/8/5K2/8/8 w - - 0 1"),
    ["Kf4"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/8/8/6K1/8/4Q3/6k1/8 w - - 6 4"),
    ["Kg4"],
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
    ["Qf3"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/8/3K4/8/8/4k3/7Q/8 w - - 0 1"),
    ["Qc2"],
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

test("queen white rules prefer white pieces off edge before queen knight geometry", () => {
  setEndgame("queen");
  const fen = "8/8/8/8/8/8/1K1k4/7Q w - - 0 1";
  const offEdge = Brain.scoreQueenWhiteMove(fen, "Qd5");
  const edgeKnight = Brain.scoreQueenWhiteMove(fen, "Qf1");

  assert.equal(offEdge.whitePieceEdgePenalty, 0);
  assert.equal(offEdge.queenKnightMovePenalty, 1);
  assert.equal(edgeKnight.whitePieceEdgePenalty, 1);
  assert.equal(edgeKnight.queenKnightMovePenalty, 0);
  assert.equal(Brain.compareQueenWhiteScores(offEdge, edgeKnight) < 0, true);
});

test("queen white rules prefer smaller queen box after queen knight geometry", () => {
  setEndgame("queen");
  const fen = "8/8/8/8/4k3/8/8/3QK3 w - - 0 1";
  const smallerBox = Brain.scoreQueenWhiteMove(fen, "Qd6");
  const largerBox = Brain.scoreQueenWhiteMove(fen, "Qd2");

  assert.equal(smallerBox.queenKnightMovePenalty, 0);
  assert.equal(largerBox.queenKnightMovePenalty, 0);
  assert.equal(smallerBox.queenBoxArea < largerBox.queenBoxArea, true);
  assert.equal(Brain.compareQueenWhiteScores(smallerBox, largerBox) < 0, true);
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
  assert.deepEqual(
    Brain.getEndgameOpponentCandidates(
      Brain.getChess("8/5k2/3Q4/8/8/8/8/5K2 b - - 3 2"),
    ).idealMoves,
    ["Kg7"],
  );
});

test("queen best-move line from two-square cage walks to mate", () => {
  assertBestEndgameLineToMate(
    "queen",
    "8/8/8/8/8/3K4/3Q4/1k6 w - - 34 18",
    ["Kc3", "Ka1", "Qb2#"],
  );
});

test("rook white rules follow the requested priority order", () => {
  setEndgame("rook");

  assert.deepEqual(
    Brain.getRookWhiteScoreReasons().map(({ reason }) => reason),
    [
      "mate",
      "rook safe",
      "no stalemate",
      "establish box",
      "forcing check",
      "rook waiting move",
      "rook waiting distance",
      "king closer",
      "maximize black distance",
    ],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("7k/5K2/8/8/8/8/8/R7 w - - 0 1"),
    ["Rh1#"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("2R5/8/8/8/6K1/4k3/8/8 w - - 0 1"),
    ["Rf8"],
  );
  assert.equal(
    Brain.getEndgamePhase("8/2k5/8/8/7R/3K4/8/8 w - - 2 2"),
    "2/2",
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("8/2k5/8/8/7R/3K4/8/8 w - - 2 2"),
    ["Rh6"],
  );
  assert.equal(
    Brain.getEndgameReason("8/2k5/8/8/7R/3K4/8/8 w - - 2 2"),
    "establish box",
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("1R3K2/8/8/8/8/8/8/7k w - - 0 1"),
    ["Rb2"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("5R2/8/8/8/8/8/4k1K1/8 w - - 6 4"),
    ["Re8+"],
  );
  assert.deepEqual(
    Brain.getIdealEndgameWhiteMoves("6k1/8/8/8/8/2R5/8/2K5 w - - 0 1"),
    ["Rf3"],
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

test("rook white rules mate from seeded random starts", () => {
  setEndgame("rook");
  const random = seededRandom(42050);
  const originalRandom = Math.random;

  Math.random = random;
  try {
    for (let index = 0; index < 50; index += 1) {
      const fen = Brain.getRandomEndgameFen("rook");
      const result = Brain.tryEndgamePathToMate(fen, 220, random);
      assert.equal(
        result.result,
        "mate",
        `rook random ${index} from ${fen}: ${result.result} after ${result.plies} plies ${result.moves.join(" ")}`,
      );
    }
  } finally {
    Math.random = originalRandom;
  }
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
    ["Rg3", "Ra3"],
  );
});

function setStateWithExtraEndgameLog(id: EndgameId, log: LogType) {
  setEndgame(id);
  const resultFen = Brain.getLogResultFen(log);
  const chess = Brain.getChess(resultFen);
  const laterSan = chess.moves()[0];
  const logs = laterSan
    ? [log, { fen: resultFen, san: laterSan }]
    : [log];
  Brain.history = {
    index: 0,
    states: [
      {
        fen: laterSan ? Brain.getFen(resultFen, laterSan) : resultFen,
        startingFen: undefined,
        orientationIsWhite: true,
        logs,
      },
    ],
  };
  Brain.updateHistory = (history) => {
    Brain.history = history;
  };
}

function findBlackReplyFixture(
  predicate: (candidates: { moves: string[]; idealMoves: string[] }) => boolean,
): {
  id: EndgameId;
  log: LogType;
  candidates: { moves: string[]; idealMoves: string[] };
} {
  for (const fixture of HARDCODED_ENDGAME_LINE_FIXTURES) {
    setEndgame(fixture.id);
    const chess = Brain.getChess(fixture.startingFen);
    let lastWhiteTurnFen: string | undefined;
    for (const expectedMoves of fixture.expectedLine) {
      if (chess.turn() === "w") {
        const fen = chess.fen();
        const previousTurnFen = lastWhiteTurnFen;
        const whiteMove = chess.move(firstLegalExpectedMove(chess, expectedMoves));
        assert.ok(whiteMove);
        const candidates = Brain.getEndgameOpponentCandidates(
          chess,
          previousTurnFen,
        );
        lastWhiteTurnFen = fen;
        if (predicate(candidates)) {
          return {
            id: fixture.id,
            log: {
              fen,
              san: whiteMove.san,
              opponent_san: candidates.idealMoves[0],
              ideal_choices: candidates.idealMoves.length,
              num_choices: candidates.moves.length,
              ...Brain.getEndgameLogFields(fen, whiteMove.san, chess.fen()),
            },
            candidates,
          };
        }
      } else {
        chess.move(firstLegalExpectedMove(chess, expectedMoves));
      }
    }
  }
  throw new Error("No black reply fixture found");
}

function findWhiteChoiceFixture(): {
  id: EndgameId;
  log: LogType;
  idealMoves: string[];
} {
  fixtureLoop: for (const fixture of HARDCODED_ENDGAME_LINE_FIXTURES) {
    setEndgame(fixture.id);
    const chess = Brain.getChess(fixture.startingFen);
    let lastWhiteTurnFen: string | undefined;
    for (const expectedMoves of fixture.expectedLine) {
      if (chess.turn() === "w") {
        const fen = chess.fen();
        const idealMoves = Brain.getIdealEndgameWhiteMoves(fen);
        if (idealMoves.length > 1) {
          const previousTurnFen = lastWhiteTurnFen;
          const whiteMove = chess.move(idealMoves[0]);
          assert.ok(whiteMove);
          const candidates = Brain.getEndgameOpponentCandidates(
            chess,
            previousTurnFen,
          );
          return {
            id: fixture.id,
            log: {
              fen,
              san: whiteMove.san,
              opponent_san: Brain.chooseEndgameOpponentMove(candidates.idealMoves),
              ideal_choices: candidates.idealMoves.length,
              num_choices: candidates.moves.length,
              ...Brain.getEndgameLogFields(fen, whiteMove.san, chess.fen()),
            },
            idealMoves,
          };
        }
        lastWhiteTurnFen = fen;
        const legalMove = expectedMoves.find((move) => chess.moves().includes(move));
        if (!legalMove) {
          continue fixtureLoop;
        }
        chess.move(legalMove);
      } else {
        const legalMove = expectedMoves.find((move) => chess.moves().includes(move));
        if (!legalMove) {
          continue fixtureLoop;
        }
        chess.move(legalMove);
      }
    }
  }
  throw new Error("No white choice fixture found");
}

test("endgame position keys ignore only move counters", () => {
  assert.equal(
    Brain.positionKey("8/8/8/4k3/7B/3K2N1/8/8 w - - 48 25"),
    Brain.positionKey("8/8/8/4k3/7B/3K2N1/8/8 w - - 52 27"),
  );
  assert.notEqual(
    Brain.positionKey("8/8/8/4k3/7B/3K2N1/8/8 w - - 48 25"),
    Brain.positionKey("8/8/8/4k3/7B/3K2N1/8/8 b - - 48 25"),
  );
});

test("endgame lines preload logs and undoable states", () => {
  setEndgame("knightAndBishop");
  const startingFen = "8/8/8/4k3/7B/3K2N1/8/8 w - - 48 25";
  const moves = ["Kc3", "Kf4", "Kd3", "Ke5"];
  const expectedChess = Brain.getChess(startingFen);
  moves.forEach((move) => expectedChess.move(move));

  const states = Brain.getEndgameLineStates(startingFen, moves);
  const finalState = states[states.length - 1];

  assert.equal(states[0].fen, startingFen);
  assert.equal(states[0].logs.length, 0);
  assert.equal(finalState.fen, expectedChess.fen());
  assert.deepEqual(
    finalState.logs.map((log) => [log.san, log.opponent_san]),
    [
      ["Kc3", "Kf4"],
      ["Kd3", "Ke5"],
    ],
  );
  const secondBlackPosition = Brain.getChess(finalState.logs[1].fen);
  secondBlackPosition.move(finalState.logs[1].san);
  const secondBlackCandidates = Brain.getEndgameOpponentCandidates(
    secondBlackPosition,
    finalState.logs[0].fen,
  );
  assert.equal(
    finalState.logs[1].ideal_choices,
    secondBlackCandidates.idealMoves.length,
  );
  assert.equal(finalState.logs[1].num_choices, secondBlackCandidates.moves.length);

  Brain.updateHistory = (history) => {
    Brain.history = history;
  };
  Brain.loadEndgameLine(startingFen, moves);

  assert.equal(Brain.history.index, 0);
  assert.equal(Brain.history.states[0].fen, expectedChess.fen());
  assert.equal(
    Brain.history.states[Brain.history.states.length - 1].fen,
    startingFen,
  );
});

test("endgame loop search detects a single repeated position on the final ply", () => {
  setEndgame("knightAndBishop");
  const startingFen = "8/8/8/4k3/7B/3K2N1/8/8 w - - 48 25";
  const script = ["Kc3", "Kf4", "Kd3", "Ke5"];
  const originalWhiteMoves = Brain.getIdealEndgameWhiteMoves;
  const originalOpponentCandidates = Brain.getEndgameOpponentCandidates;
  let index = 0;

  Brain.getIdealEndgameWhiteMoves = () => [script[index++]];
  Brain.getEndgameOpponentCandidates = () => {
    const move = script[index++];
    return { moves: [move], idealMoves: [move] };
  };

  try {
    const result = Brain.tryEndgamePathToMate(startingFen, script.length, () => 0);
    assert.equal(result.result, "loop");
    assert.equal(result.plies, script.length);
    assert.deepEqual(result.moves, script);
    assert.equal(Brain.boardTurnKey(result.finalFen), Brain.boardTurnKey(startingFen));
  } finally {
    Brain.getIdealEndgameWhiteMoves = originalWhiteMoves;
    Brain.getEndgameOpponentCandidates = originalOpponentCandidates;
  }
});

test("black endgame replies prefer returning to the previous white-turn position", () => {
  setEndgame("knightAndBishop");
  const firstWhiteTurnFen = "8/8/8/4k3/7B/3K2N1/8/8 w - - 48 25";
  const chess = Brain.getChess(firstWhiteTurnFen);
  const firstWhiteMove = chess.move("Kc3");
  assert.ok(firstWhiteMove);
  const firstBlackCandidates = Brain.getEndgameOpponentCandidates(chess);
  const firstBlackMove = chess.move("Kf4");
  assert.ok(firstBlackMove);
  const secondWhiteTurnFen = chess.fen();
  const secondWhiteMove = chess.move("Kd3");
  assert.ok(secondWhiteMove);

  const candidates = Brain.getEndgameOpponentCandidates(chess, firstWhiteTurnFen);
  assert.deepEqual(
    Brain.getEndgameReturnToPositionMoves(chess.fen(), firstWhiteTurnFen),
    ["Ke5"],
  );
  assert.deepEqual(candidates.idealMoves, ["Ke5"]);

  const logs: LogType[] = [
    {
      fen: firstWhiteTurnFen,
      san: firstWhiteMove.san,
      opponent_san: firstBlackMove.san,
      ideal_choices: firstBlackCandidates.idealMoves.length,
      num_choices: firstBlackCandidates.moves.length,
      ...Brain.getEndgameLogFields(
        firstWhiteTurnFen,
        firstWhiteMove.san,
        Brain.getFen(firstWhiteTurnFen, firstWhiteMove.san),
      ),
    },
    {
      fen: secondWhiteTurnFen,
      san: secondWhiteMove.san,
      opponent_san: "Ke5",
      ideal_choices: candidates.idealMoves.length,
      num_choices: candidates.moves.length,
      ...Brain.getEndgameLogFields(
        secondWhiteTurnFen,
        secondWhiteMove.san,
        chess.fen(),
      ),
    },
  ];
  Brain.history = {
    index: 0,
    states: [
      {
        fen: chess.fen(),
        startingFen: secondWhiteTurnFen,
        orientationIsWhite: true,
        logs,
      },
    ],
  };

  assert.equal(Brain.isEndgameLogOpponentMoveIdeal(1), true);
  const nonReturnMove = candidates.moves.find((san) => san !== "Ke5");
  assert.ok(nonReturnMove);
  Brain.history.states[0].logs[1] = {
    ...logs[1],
    opponent_san: nonReturnMove,
  };
  assert.equal(Brain.isEndgameLogOpponentMoveIdeal(1), false);
});

test("black endgame replies fall back when no previous position is available", () => {
  setEndgame("knightAndBishop");
  const chess = Brain.getChess("8/8/8/4k3/7B/3K2N1/8/8 w - - 48 25");
  chess.move("Kc3");
  const candidates = Brain.getEndgameOpponentCandidates(chess);

  assert.deepEqual(
    Brain.getEndgameReturnToPositionMoves(chess.fen(), undefined),
    [],
  );
  assert.equal(candidates.idealMoves.length > 0, true);
});

test("endgame log cycles black to a different best reply", () => {
  const fixture = findBlackReplyFixture(
    (candidates) => candidates.idealMoves.length > 1,
  );
  const originalOpponentSan = fixture.log.opponent_san!;
  setStateWithExtraEndgameLog(fixture.id, fixture.log);

  Brain.forceDifferentIdealEndgameOpponentMove(0);

  const log = Brain.getState().logs[0];
  assert.equal(Brain.getState().logs.length, 1);
  assert.notEqual(log.opponent_san, originalOpponentSan);
  assert.ok(fixture.candidates.idealMoves.includes(log.opponent_san!));
  assert.equal(log.ideal_choices, fixture.candidates.idealMoves.length);
  assert.equal(log.num_choices, fixture.candidates.moves.length);
});

test("endgame log picks a different random legal black reply", () => {
  const fixture = findBlackReplyFixture(
    (candidates) => candidates.moves.length > 1,
  );
  const originalOpponentSan = fixture.log.opponent_san!;
  setStateWithExtraEndgameLog(fixture.id, fixture.log);

  Brain.forceDifferentRandomEndgameOpponentMove(0);

  const log = Brain.getState().logs[0];
  assert.equal(Brain.getState().logs.length, 1);
  assert.notEqual(log.opponent_san, originalOpponentSan);
  assert.ok(fixture.candidates.moves.includes(log.opponent_san!));
});

test("endgame log detects black replies that are legal but not best", () => {
  const fixture = findBlackReplyFixture((candidates) =>
    candidates.moves.some((move) => !candidates.idealMoves.includes(move)),
  );
  const nonIdealMove = fixture.candidates.moves.find(
    (move) => !fixture.candidates.idealMoves.includes(move),
  )!;

  assert.equal(Brain.isEndgameOpponentMoveIdeal(fixture.log), true);
  assert.equal(
    Brain.isEndgameOpponentMoveIdeal({
      ...fixture.log,
      opponent_san: nonIdealMove,
    }),
    false,
  );
});

test("endgame log cycles white to a different best move", () => {
  const fixture = findWhiteChoiceFixture();
  const originalSan = fixture.log.san;
  setStateWithExtraEndgameLog(fixture.id, fixture.log);

  Brain.forceDifferentIdealEndgameWhiteMove(0);

  const log = Brain.getState().logs[0];
  assert.equal(Brain.getState().logs.length, 1);
  assert.notEqual(log.san, originalSan);
  assert.ok(fixture.idealMoves.includes(log.san));
  assert.equal(log.endgame_is_correct, true);
  assert.equal(log.endgame_correct_choices, fixture.idealMoves.length);
  assert.equal(log.endgame_phase, Brain.getEndgamePhase(fixture.log.fen));
  assert.equal(log.endgame_reason, Brain.getEndgameReason(fixture.log.fen));
});

test("incorrect endgame log reason compares the best move to the played move", () => {
  setEndgame("queen");
  const fen = "8/8/4k3/8/8/3Q4/1K6/8 w - - 0 1";
  const playedSan = "Qa6+";

  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Qd4"]);
  assert.equal(Brain.getEndgameReason(fen), "queen knight move");
  assert.equal(Brain.getEndgameReason(fen, playedSan), "white pieces off edge");

  const logFields = Brain.getEndgameLogFields(
    fen,
    playedSan,
    Brain.getFen(fen, playedSan),
  );

  assert.equal(logFields.endgame_is_correct, false);
  assert.equal(logFields.endgame_reason, "white pieces off edge");
});

test("endgame priority help explains white best moves and black resistance", () => {
  for (const id of [
    "rook",
    "queen",
    "knightAndBishop",
    "twoBishops",
  ] as const) {
    setEndgame(id);
    const help = Brain.getEndgamePriorityHelp();

    assert.equal(help.title, "How best moves are chosen");
    assert.doesNotMatch(help.title, new RegExp(getBaseEndgame(id).label));
    assert.match(help.whiteIntro, /best moves/);
    assert.match(help.blackIntro, /strongest resistance/);
    assert.ok(help.whitePriorities.length > 0);
    assert.ok(help.blackPriorities.length > 0);
    assert.equal(
      help.whitePriorities.concat(help.blackPriorities).some((text) =>
        /Penalty|Score|compare|index/.test(text),
      ),
      false,
    );
  }
});

test("endgame priority help covers every white reason key", () => {
  for (const id of [
    "rook",
    "queen",
    "knightAndBishop",
    "twoBishops",
  ] as const) {
    setEndgame(id);
    const baseEndgameId = Brain.getSelectedBaseEndgameId();
    const reasonKeys = Brain.getEndgameWhitePriorityReasonKeys(baseEndgameId);
    const priorities = Brain.getEndgameWhitePriorityLabels(baseEndgameId);

    assert.ok(priorities.length <= reasonKeys.length);
    for (const reason of reasonKeys) {
      const label = Brain.getEndgameWhitePriorityLabel(reason);
      assert.ok(label === "" || label !== `${reason}.`, reason);
    }
  }
});

test("endgame priority help does not hide active queen and rook rules", () => {
  const queenHelp = Brain.getEndgamePriorityHelp("queen");
  const knightAndBishopHelp = Brain.getEndgamePriorityHelp("knightAndBishop");
  assert.equal(
    queenHelp.whitePriorities.includes("Keep White's king near the middle."),
    false,
  );
  assert.equal(
    queenHelp.whitePriorities.some((priority) =>
      priority.includes("walking between the queen and Black's king")
    ),
    true,
  );

  assert.equal(
    Brain.getEndgamePriorityHelp("rook").whitePriorities.some((priority) =>
      priority.includes("rook as far as possible from Black's king")
    ),
    true,
  );
  assert.equal(
    Brain.getEndgamePriorityHelp("rook").whitePriorities.some((priority) =>
      priority.includes("row or file between the kings")
    ),
    true,
  );
  assert.equal(
    Brain.getEndgamePriorityHelp("rook").whitePriorities.some((priority) =>
      priority.includes("row or file between them")
    ),
    true,
  );
  assert.equal(
    knightAndBishopHelp.whitePriorities.includes("Limit Black's legal replies."),
    true,
  );
  assert.equal(
    knightAndBishopHelp.blackPriorities.includes("Keep as many legal replies as possible."),
    true,
  );
  assert.deepEqual(
    Brain.getEndgamePriorityHelp("twoBishops").blackPriorities.slice(1),
    [
      "Take a piece if White isn't looking.",
      "Stay away from edges and corners.",
      "Move toward unprotected bishops.",
    ],
  );
  assert.equal(
    knightAndBishopHelp.whitePriorities.includes("Keep White's king near the middle."),
    true,
  );
});

test("endgame reason text disambiguates terse scoring keys", () => {
  assert.equal(
    Brain.getEndgameReasonText("maximize black distance"),
    "keep Black far from rook",
  );
  assert.equal(
    Brain.getEndgameReasonText("king closer"),
    "White king closer",
  );
  assert.equal(
    Brain.getEndgameReasonText("queen knight move"),
    "queen a knight move from Black king",
  );
  assert.equal(
    Brain.getEndgameReasonText("king near middle"),
    "White king near middle",
  );
  assert.equal(
    Brain.getEndgameReasonText("force black to edge"),
    "force Black to edge",
  );
});

test("two-bishop priority help explains phase-two terms concretely", () => {
  setEndgame("twoBishops");
  const help = Brain.getEndgamePriorityHelp();
  const text = help.whitePriorities.concat(help.notes).join("\n");

  assert.match(text, /Phase 2/);
  assert.match(text, /waiting move is not any quiet move/);
  assert.match(text, /Corner front squares are the 3 inward squares/);
  assert.match(text, /two diagonal king moves/);
  assert.match(text, /c3 through f6/);
  assert.match(text, /Keep the bishops adjacent/);
  assert.match(text, /White king should not occupy a square controlled by a bishop/);
  assert.match(text, /without moving the bishop on the black king's current color \(unless it's a check\)/);
  assert.match(text, /force Black towards the corner along its current edge and further from the bishops/);
  assert.match(text, /force Black to stay in phase 2/);
  assert.match(text, /keep Black's king on the edge or in a corner/);
  assert.doesNotMatch(text, /corner and opposition pressure/);
  assert.doesNotMatch(text, /bishop-controlled square/);
  assert.match(text, /Check the king/);
  assert.match(text, /Prefer bishops to be farther from the corner closest to Black's king/);
  assert.match(text, /Force Black to the edge/);
  assert.match(text, /Take king opposition if king is already adjacent to both bishops/);
  assert.equal(
    help.whitePriorities.indexOf("Phase 2: force Black to stay in phase 2.") <
      help.whitePriorities.indexOf("Phase 2: keep Black's king on the edge or in a corner."),
    true,
  );
  assert.equal(
    help.whitePriorities.indexOf("Phase 2: keep Black's king on the edge or in a corner.") <
      help.whitePriorities.indexOf("Phase 2: use the specific bishop waiting move when Black is boxed in."),
    true,
  );
  assert.equal(
    help.whitePriorities.indexOf("Force Black to the edge.") <
      help.whitePriorities.indexOf("Take king opposition if king is already adjacent to both bishops."),
    true,
  );
  assert.equal(
    help.whitePriorities.indexOf("Take king opposition if king is already adjacent to both bishops.") <
      help.whitePriorities.indexOf("Bring the bishops closer to Black's king."),
    true,
  );
  assert.equal(/useful middle|working together|toward the edge/.test(text), false);
});

test("endgame phase stays on the pre-white-move phase through black reply", () => {
  setEndgame("rook");
  Brain.autoreplyRef = { current: { checked: false } } as typeof Brain.autoreplyRef;
  Brain.history = {
    index: 0,
    states: [
      {
        fen: "8/8/8/8/4K3/7R/3k4/8 w - - 14 8",
        startingFen: undefined,
        orientationIsWhite: true,
        logs: [],
      },
    ],
  };
  Brain.updateHistory = (history) => {
    Brain.history = history;
  };

  assert.equal(Brain.getEndgamePhase(Brain.getState().fen), "2/2");
  Brain.playEndgameMove("Kd4");

  assert.equal(Brain.getEndgamePhase(Brain.getState().fen), "1/2");
  assert.equal(Brain.getVisibleEndgamePhase(Brain.getState().fen), "2/2");
  assert.equal(Brain.getState().logs[0].endgame_phase, "2/2");

  const state = Brain.getState();
  const chess = Brain.getChess(state.fen);
  Brain.playEndgameOpponentMove(chess.moves()[0], state, chess);

  assert.equal(Brain.getState().logs[0].endgame_phase, "2/2");
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
