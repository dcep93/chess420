import assert from "node:assert/strict";
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
        : Brain.getEndgameOpponentCandidates(chess).idealMoves;
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

const HARDCODED_ENDGAME_LINE_FIXTURES = JSON.parse(`[{"id":"knightAndBishop","startingFen":"8/8/8/2N1k3/8/3B4/K7/8 w - - 0 1","seed":73000,"expectedLine":[["Nb3"],["Kd5"],["Ka3"],["Ke5"],["Kb4"],["Kd5"],["Nc5"],["Ke5"],["Kc4"],["Kf4"],["Kd4"],["Kg5"],["Ke5"],["Kg4"],["Ke4"],["Kg5"],["Nd7"],["Kg6"],["Kf4+"],["Kf7"],["Bf5"],["Ke7"],["Ke5"],["Kd8"],["Kd6"],["Ke8","Kc8"],["Bg6+"],["Kd8"],["Nc5"],["Kc8"],["Bf7"],["Kd8","Kb8"],["Be6"],["Ka7","Ka8"],["Kc7"],["Ka8"],["Kb6"],["Kb8"],["Na6+"],["Ka8"],["Bd5#"]]},{"id":"knightAndBishop","startingFen":"2N5/8/8/8/8/2KB4/7k/8 w - - 0 1","seed":73038,"expectedLine":[["Be4"],["Kg3"],["Kd3"],["Kf4"],["Kd4"],["Kg5"],["Ke5"],["Kh6"],["Kf6"],["Kh5"],["Bf3+"],["Kh4"],["Be2"],["Kg3"],["Bd1"],["Kf2"],["Bh5"],["Kg3"],["Kg5"],["Kf2"],["Kf4"],["Kg2"],["Nd6"],["Kh3"],["Bg4+"],["Kh4"],["Nf5#"]]},{"id":"knightAndBishop","startingFen":"5B1N/8/8/4k3/8/5K2/8/8 w - - 0 1","seed":73076,"expectedLine":[["Ke3"],["Kf6"],["Ke4"],["Ke6"],["Bc5"],["Kd7"],["Kd5"],["Ke8"],["Ke6"],["Kd8"],["Bb6+"],["Ke8"],["Nf7"],["Kf8"],["Bc5+"],["Ke8"],["Nd6+"],["Kd8"],["Bb6#"]]},{"id":"knightAndBishop","startingFen":"1k4B1/8/8/4K3/8/3N4/8/8 w - - 0 1","seed":73114,"expectedLine":[["Kd6"],["Kc8"],["Be6+"],["Kd8"],["Ne5"],["Ke8"],["Nd7"],["Kd8"],["Bf7"],["Kc8"],["Nc5"],["Kd8","Kb8"],["Nb7+"],["Kc8"],["Kc6"],["Kb8"],["Kb6"],["Kc8","Ka8"],["Be6"],["Kb8"],["Nc5"],["Ka8"],["Bd7"],["Kb8"],["Na6+"],["Ka8"],["Bc6#"]]},{"id":"knightAndBishop","startingFen":"8/8/8/8/3N3k/1K6/8/B7 w - - 0 1","seed":73152,"expectedLine":[["Ne6"],["Kg4"],["Nd4"],["Kf4"],["Kc4"],["Ke3"],["Kd5"],["Kd2"],["Ke4"],["Kc1"],["Bc3"],["Kd1"],["Kd3"],["Kc1"],["Ne2+"],["Kd1"],["Bd4"],["Ke1"],["Bc3+"],["Kf2"],["Nd4"],["Kg3"],["Ke3"],["Kg4"],["Ke4"],["Kg3"],["Kf5"],["Kf2"],["Kf4"],["Kf1"],["Kf3"],["Kg1"],["Ne2+"],["Kf1"],["Ng3+"],["Kg1"],["Bd4+"],["Kh2"],["Bf2"],["Kh3"],["Bg1"],["Kh4"],["Ne4"],["Kh5","Kh3"],["Ng5+"],["Kh4"],["Kf4"],["Kh5"],["Kf5"],["Kh6","Kh4"],["Bf2+"],["Kh5"],["Ne6"],["Kh6"],["Bg3"],["Kh7","Kh5"],["Ng7+"],["Kh6"],["Kf6"],["Kh7"],["Kf7"],["Kh8","Kh6"],["Bf4"],["Kh7"],["Ne6"],["Kh8"],["Bg5"],["Kh7"],["Nf8+"],["Kh8"],["Bf6#"]]},{"id":"knightAndBishop","startingFen":"3K4/7k/5B2/8/8/8/4N3/8 w - - 0 1","seed":73190,"expectedLine":[["Nf4"],["Kh6"],["Ke7"],["Kh7"],["Kf8"],["Kh6"],["Kf7"],["Kh7"],["Bg5"],["Kh8"],["Ne6"],["Kh7"],["Nf8+"],["Kh8"],["Bf6#"]]},{"id":"knightAndBishop","startingFen":"2K5/8/4k3/5N2/8/8/8/6B1 w - - 0 1","seed":73228,"expectedLine":[["Ne3"],["Ke5"],["Kd7"],["Kf4"],["Ke6"],["Kg3"],["Kf5"],["Kf3"],["Ke5"],["Kg3"],["Ke4"],["Kh3"],["Bf2"],["Kh2"],["Kf3"],["Kh3"],["Be1"],["Kh2"],["Ng4+"],["Kg1"],["Bf2+"],["Kf1"],["Nh2#","Ne3#"]]},{"id":"knightAndBishop","startingFen":"8/4B3/4k3/8/N7/8/2K5/8 w - - 0 1","seed":73266,"expectedLine":[["Bc5"],["Kd5"],["Kd3"],["Kc6"],["Kc4"],["Kb7"],["Kb5"],["Kc7"],["Nb6"],["Kd8"],["Kc6"],["Ke8"],["Kd6"],["Kf7"],["Nd5"],["Kg6"],["Ba7"],["Kf7","Kg7","Kh7","Kh6","Kh5","Kg5","Kf5"],["Ne7+"],["Kf6","Kg5","Kg4","Kf4","Ke4"],["Ke5"],["Kg5"],["Kd6"],["Kf6","Kh6","Kh5","Kh4","Kg4","Kf4"],["Be3"],["Kf7","Kg7"],["Ke6"],["Kf8","Kh8","Kh7"],["Bd4"],["Ke8"],["Bc5"],["Kf8","Kd8"],["Nf5+"],["Kg8","Ke8"],["Kf6"],["Kh8","Kh7"],["Bd6"],["Kg8","Kh8"],["Kg6"],["Kg8"],["Nh6+"],["Kh8"],["Be5#"]]},{"id":"twoBishops","startingFen":"8/8/B7/8/8/2B2K2/8/7k w - - 0 1","seed":73296,"expectedLine":[["Bd3"],["Kh2","Kg1"],["Kg3"],["Kh1"],["Bd2"],["Kg1"],["Be3+"],["Kh1"],["Be4#"]]},{"id":"twoBishops","startingFen":"4k2B/8/8/3B1K2/8/8/8/8 w - - 0 1","seed":73334,"expectedLine":[["Bc6+"],["Ke7"],["Be5"],["Kd8"],["Bd5"],["Ke8","Ke7","Kd7","Kc8"],["Kg6"],["Kd8","Ke8","Kf8","Kd7"],["Kf7"],["Kc8","Kd8"],["Ke6"],["Ke8","Kc8"],["Kd6"],["Kd8","Kb8"],["Bf7"],["Kc8"],["Kc6"],["Kd8"],["Bf6+"],["Kc8"],["Be6+"],["Kb8"],["Kb6"],["Ka8"],["Be7"],["Kb8"],["Bd6+"],["Ka8"],["Bd5#"]]},{"id":"twoBishops","startingFen":"8/B7/K7/8/8/k7/4B3/8 w - - 0 1","seed":73372,"expectedLine":[["Bc5+"],["Ka4","Kb3"],["Bd1#"]]},{"id":"twoBishops","startingFen":"7k/7B/3B4/8/6K1/8/8/8 w - - 0 1","seed":73410,"expectedLine":[["Be4"],["Kg7"],["Be5+"],["Kf7"],["Bd5+"],["Ke7"],["Kg5"],["Kd7"],["Kf5"],["Kc8","Kd8","Ke8","Ke7"],["Kg6"],["Kd8","Ke8","Kf8","Kd7"],["Kf7"],["Kc8","Kd8"],["Ke6"],["Ke8","Kc8"],["Kd6"],["Kd8","Kb8"],["Bf7"],["Kc8"],["Kc6"],["Kd8"],["Bf6+"],["Kc8"],["Be6+"],["Kb8"],["Kb6"],["Ka8"],["Be7"],["Kb8"],["Bd6+"],["Ka8"],["Bd5#"]]},{"id":"twoBishops","startingFen":"8/8/8/8/1BB1K3/8/8/k7 w - - 0 1","seed":73448,"expectedLine":[["Bc3+"],["Kb1"],["Bd3+"],["Kc1"],["Ke3"],["Kd1"],["Bb2"],["Ke1"],["Bc2"],["Kf1"],["Kf3"],["Kg1","Ke1"],["Bc3+","Ke3"],["Kf1"],["Bd3+"],["Kg1"],["Kg3"],["Kh1"],["Bd2"],["Kg1"],["Be3+"],["Kh1"],["Be4#"]]},{"id":"twoBishops","startingFen":"8/6B1/8/8/4K3/3B4/8/3k4 w - - 0 1","seed":73486,"expectedLine":[["Bc3"],["Kc1"],["Ke3"],["Kd1"],["Bb2"],["Ke1"],["Bc2"],["Kf1"],["Kf3"],["Kg1","Ke1"],["Bd3"],["Kh2","Kh1"],["Kg3"],["Kg1"],["Bd4+"],["Kh1"],["Be4#"]]},{"id":"twoBishops","startingFen":"8/8/6B1/4B3/5K2/8/8/4k3 w - - 0 1","seed":73524,"expectedLine":[["Bc3+"],["Ke2"],["Be4"],["Kd1"],["Bd4"],["Kd2","Ke2","Ke1","Kc1"],["Kg3"],["Kf1","Ke1","Kd1","Kd2"],["Kf2"],["Kd1","Kc1"],["Ke3"],["Ke1","Kc1"],["Kd3"],["Kd1","Kb1"],["Bf2"],["Kc1"],["Kc3"],["Kd1"],["Bf3+"],["Kc1"],["Be3+"],["Kb1"],["Kb3"],["Ka1"],["Be2"],["Kb1"],["Bd3+"],["Ka1"],["Bd4#"]]},{"id":"twoBishops","startingFen":"8/4K3/8/1k6/8/7B/8/6B1 w - - 0 1","seed":73562,"expectedLine":[["Be3"],["Kc4"],["Bf5"],["Kd5"],["Kf6","Bd3","Bf4"],["Kd4"],["Kd6"],["Kc4"],["Be5"],["Kb5","Kb4"],["Be4"],["Kc4"],["Ke6"],["Kb5","Kc5","Kb3","Kb4"],["Bd5"],["Kb6","Kb4","Kb5"],["Bd4"],["Kb5"],["Kd7"],["Kb4"],["Kd6"],["Ka5","Kb5","Ka3","Ka4"],["Kc7"],["Ka6","Kb4","Ka4","Ka5"],["Kb6"],["Ka3","Ka4"],["Kc5"],["Ka5","Ka3"],["Bb3"],["Ka6"],["Kc6"],["Ka5"],["Bc3+"],["Ka6"],["Bc4+"],["Ka7"],["Kc7"],["Ka8"],["Bb4"],["Ka7"],["Bc5+"],["Ka8"],["Bd5#"]]},{"id":"rook","startingFen":"8/5k2/8/5K2/8/8/8/6R1 w - - 0 1","seed":73592,"expectedLine":[["Rh1","Re1","Rd1","Rc1","Rb1","Ra1"],["Ke7"],["Rb6"],["Kd7"],["Ke5"],["Kc7"],["Rh6"],["Kd7"],["Kd5"],["Ke7"],["Ke5"],["Kf7"],["Kf5"],["Kg7"],["Ra6"],["Kh7"],["Kg5"],["Kg7"],["Ra7+"],["Kf8"],["Kf6"],["Ke8"],["Ke6"],["Kd8"],["Kd6"],["Kc8"],["Kc6"],["Kb8"],["Rh7"],["Ka8"],["Kb6"],["Kb8"],["Rh8#"]]},{"id":"rook","startingFen":"8/2k5/8/6R1/3K4/8/8/8 w - - 0 1","seed":73630,"expectedLine":[["Rg6"],["Kd7"],["Kd5"],["Ke7"],["Ke5"],["Kf7"],["Ra6"],["Kg7"],["Kf5"],["Kh7"],["Kg5"],["Kg7"],["Ra7+"],["Kf8"],["Kf6"],["Ke8"],["Ke6"],["Kd8"],["Kd6"],["Kc8"],["Kc6"],["Kb8"],["Rh7"],["Ka8"],["Kb6"],["Kb8"],["Rh8#"]]},{"id":"rook","startingFen":"8/5k2/K7/7R/8/8/8/8 w - - 0 1","seed":73668,"expectedLine":[["Re5"],["Kf6"],["Re1"],["Kf5"],["Kb5"],["Kf4"],["Kc4"],["Kf3"],["Kd3"],["Kf2"],["Re8"],["Kf1"],["Kd2"],["Kf2"],["Rf8+"],["Kg3"],["Ke3"],["Kg4"],["Ke4"],["Kg5"],["Ke5"],["Kg6"],["Ke6"],["Kg7"],["Rf1"],["Kg8"],["Ke7"],["Kg7"],["Rg1+"],["Kh6"],["Kf6"],["Kh5"],["Kf5"],["Kh4"],["Kf4"],["Kh3"],["Kf3"],["Kh2"],["Rg8"],["Kh1"],["Kf2"],["Kh2"],["Rh8#"]]},{"id":"rook","startingFen":"8/5k2/8/8/8/8/R5K1/8 w - - 0 1","seed":73706,"expectedLine":[["Ra6"],["Ke7"],["Kf3"],["Kd7"],["Ke4"],["Kc7"],["Kd5"],["Kb7"],["Rh6"],["Kc7"],["Kc5"],["Kd7"],["Kd5"],["Ke7"],["Ke5"],["Kf7"],["Kf5"],["Kg7"],["Ra6"],["Kh7"],["Kg5"],["Kg7"],["Ra7+"],["Kf8"],["Kf6"],["Ke8"],["Ke6"],["Kd8"],["Kd6"],["Kc8"],["Kc6"],["Kb8"],["Rh7"],["Ka8"],["Kb6"],["Kb8"],["Rh8#"]]},{"id":"rook","startingFen":"8/5k2/1R6/8/8/8/8/1K6 w - - 0 1","seed":73744,"expectedLine":[["Kc2"],["Ke7"],["Kd3"],["Kd7"],["Kd4"],["Kc7"],["Rh6"],["Kd7"],["Kd5"],["Ke7"],["Ke5"],["Kf7"],["Kf5"],["Kg7"],["Ra6"],["Kh7"],["Kg5"],["Kg7"],["Ra7+"],["Kf8"],["Kf6"],["Ke8"],["Ke6"],["Kd8"],["Kd6"],["Kc8"],["Kc6"],["Kb8"],["Rh7"],["Ka8"],["Kb6"],["Kb8"],["Rh8#"]]},{"id":"rook","startingFen":"8/8/8/8/1K6/4k3/1R6/8 w - - 0 1","seed":73782,"expectedLine":[["Rc2"],["Kd3"],["Rc8"],["Kd2"],["Kb3"],["Kd1"],["Kb2"],["Kd2"],["Rd8+"],["Ke3"],["Kc3"],["Ke4"],["Kc4"],["Ke5"],["Kc5"],["Ke6"],["Kc6"],["Ke7"],["Rd1"],["Ke8"],["Kc7"],["Ke7"],["Re1+"],["Kf6"],["Kd6"],["Kf5"],["Kd5"],["Kf4"],["Kd4"],["Kf3"],["Kd3"],["Kf2"],["Re8"],["Kf1"],["Kd2"],["Kf2"],["Rf8+"],["Kg3"],["Ke3"],["Kg4"],["Ke4"],["Kg5"],["Ke5"],["Kg6"],["Ke6"],["Kg7"],["Rf1"],["Kg8"],["Ke7"],["Kg7"],["Rg1+"],["Kh6"],["Kf6"],["Kh5"],["Kf5"],["Kh4"],["Kf4"],["Kh3"],["Kf3"],["Kh2"],["Rg8"],["Kh1"],["Kf2"],["Kh2"],["Rh8#"]]},{"id":"rook","startingFen":"8/5k2/8/8/8/8/8/3RK3 w - - 0 1","seed":73820,"expectedLine":[["Rd6"],["Ke7"],["Ra6"],["Kd7"],["Kd2"],["Kc7"],["Kc3"],["Kb7"],["Rh6"],["Kc7"],["Kc4"],["Kd7"],["Kd5"],["Ke7"],["Ke5"],["Kf7"],["Kf5"],["Kg7"],["Ra6"],["Kh7"],["Kg5"],["Kg7"],["Ra7+"],["Kf8"],["Kf6"],["Ke8"],["Ke6"],["Kd8"],["Kd6"],["Kc8"],["Kc6"],["Kb8"],["Rh7"],["Ka8"],["Kb6"],["Kb8"],["Rh8#"]]},{"id":"rook","startingFen":"8/8/8/6k1/8/4R3/6K1/8 w - - 0 1","seed":73858,"expectedLine":[["Re4"],["Kf5"],["Ra4"],["Ke5"],["Kf3"],["Kd5"],["Ke3"],["Kc5"],["Kd3"],["Kb5"],["Rh4"],["Kc5"],["Kc3"],["Kd5"],["Kd3"],["Ke5"],["Ke3"],["Kf5"],["Kf3"],["Kg5"],["Ra4"],["Kh5"],["Kg3"],["Kg5"],["Ra5+"],["Kf6"],["Kf4"],["Ke6"],["Ke4"],["Kd6"],["Kd4"],["Kc6"],["Kc4"],["Kb6"],["Rh5"],["Ka6"],["Kb4"],["Kb6"],["Rh6+"],["Kc7"],["Kc5"],["Kd7"],["Kd5"],["Ke7"],["Ke5"],["Kf7"],["Kf5"],["Kg7"],["Ra6"],["Kh7"],["Kg5"],["Kg7"],["Ra7+"],["Kf8"],["Kf6"],["Ke8"],["Ke6"],["Kd8"],["Kd6"],["Kc8"],["Kc6"],["Kb8"],["Rh7"],["Ka8"],["Kb6"],["Kb8"],["Rh8#"]]},{"id":"queen","startingFen":"8/5k2/8/4Q3/8/8/8/7K w - - 0 1","seed":73888,"expectedLine":[["Qd6"],["Kg7"],["Qe6"],["Kf8","Kh8","Kh7"],["Qf6"],["Kg8"],["Qe7"],["Kh8"],["Kg2"],["Kg8"],["Kg3"],["Kh8"],["Kg4"],["Kg8"],["Kg5"],["Kh8"],["Kg6"],["Kg8"],["Qg7#"]]},{"id":"queen","startingFen":"8/4Q3/8/3K4/8/8/3k4/8 w - - 0 1","seed":73926,"expectedLine":[["Qe4"],["Kc3"],["Ke5"],["Kd2","Kb2","Kb3"],["Qf3"],["Kc2"],["Qe3"],["Kb2"],["Qd3"],["Kc1","Ka1","Ka2"],["Qd2"],["Kb1"],["Kd4"],["Ka1"],["Kc3"],["Kb1"],["Qb2#"]]},{"id":"queen","startingFen":"1K6/5k2/8/8/8/8/8/6Q1 w - - 0 1","seed":73964,"expectedLine":[["Qg5"],["Ke6"],["Qc5"],["Kf6"],["Qd5"],["Ke7","Kg7","Kg6"],["Qc6"],["Kf7"],["Qd6"],["Kg7"],["Qe6"],["Kf8","Kh8","Kh7"],["Qd7"],["Kg8"],["Qe7"],["Kh8"],["Kc7"],["Kg8"],["Kd6"],["Kh8"],["Ke6"],["Kg8"],["Kf6"],["Kh8"],["Qg7#"]]},{"id":"queen","startingFen":"8/8/1Q6/6K1/4k3/8/8/8 w - - 0 1","seed":74002,"expectedLine":[["Qd6","Qc5"],["Kf3","Kd3"],["Qe5"],["Kc4"],["Qd6"],["Kc3"],["Qd5"],["Kb4","Kc2","Kb2"],["Qd3","Qc4"],["Kc1","Ka1","Ka2"],["Qc3"],["Kb1"],["Qd2"],["Ka1"],["Kf4"],["Kb1"],["Ke3"],["Ka1"],["Kd3"],["Kb1"],["Kc3"],["Ka1"],["Qb2#"]]},{"id":"queen","startingFen":"8/3K4/7Q/4k3/8/8/8/8 w - - 0 1","seed":74040,"expectedLine":[["Qc6"],["Kd4"],["Qe6"],["Kc5","Kd3","Kc3"],["Qe5"],["Kc4"],["Qd6"],["Kc3"],["Qd5"],["Kb4","Kc2","Kb2"],["Qc6"],["Kb3"],["Qc5"],["Kb2"],["Qc4"],["Ka3","Kb1","Ka1"],["Qb5"],["Ka2"],["Qb4"],["Ka1"],["Kc6"],["Ka2"],["Kc5"],["Ka1"],["Kc4"],["Ka2"],["Kc3"],["Ka1"],["Qb2#"]]},{"id":"queen","startingFen":"8/5k2/8/8/2K5/8/Q7/8 w - - 0 1","seed":74078,"expectedLine":[["Qe2"],["Kf6"],["Qe4"],["Kf7","Kg7","Kg5"],["Qf3"],["Kg6"],["Qf4"],["Kg7"],["Qf5"],["Kg8","Kh8","Kh6"],["Qf6"],["Kh7"],["Qg5"],["Kh8"],["Kd5"],["Kh7"],["Ke6"],["Kh8"],["Kf7"],["Kh7"],["Qg7#"]]},{"id":"queen","startingFen":"Q6K/5k2/8/8/8/8/8/8 w - - 0 1","seed":74116,"expectedLine":[["Qc6"],["Ke7"],["Kg7"],["Kd8"],["Qb7"],["Ke8"],["Qf7+"],["Kd8"],["Kf6"],["Kc8"],["Qe7"],["Kb8"],["Qd7"],["Ka8"],["Ke6"],["Kb8"],["Kd6"],["Ka8"],["Kc6"],["Kb8"],["Qb7#"]]},{"id":"queen","startingFen":"8/5k2/1Q6/8/8/5K2/8/8 w - - 0 1","seed":74154,"expectedLine":[["Qd6"],["Kg7"],["Qe6"],["Kf8","Kh8","Kh7"],["Qe7"],["Kg8"],["Kg4"],["Kh8"],["Kg5"],["Kg8"],["Kg6"],["Kh8"],["Qg7#"]]}]`) as HardcodedEndgameLineFixture[];

test("hardcoded endgame priority lines mate from random starts", () => {
  const counts = new Map<EndgameId, number>();

  HARDCODED_ENDGAME_LINE_FIXTURES.forEach((fixture) => {
    if (fixture.id === "knightAndBishop" || fixture.id === "twoBishops") {
      return;
    }
    counts.set(fixture.id, (counts.get(fixture.id) ?? 0) + 1);
    assertSeededBestEndgameFixture(fixture);
  });

  (["rook", "queen"] as EndgameId[]).forEach(
    (id) => {
      assert.equal(counts.get(id), 8, id);
    },
  );
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
  assert.match(textContent(header), /find a loop/);
  assert.doesNotMatch(textContent(header), /home/);
  assert.equal(
    findElementsByType(header, "button").find(
      (button) => textContent(button) === "find a loop",
    )?.props?.disabled,
    true,
  );

  Brain.endgameId = "rook";
  header = Header();
  assert.equal(hasElementType(header, "select"), true);
  assert.match(textContent(header), /select endgame/);
  assert.equal(
    findElementsByType(header, "button").find(
      (button) => textContent(button) === "find a loop",
    )?.props?.disabled,
    false,
  );
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
    "4k3/8/3KBB2/8/8/8/8/8 w - - 56 29",
    "5k2/8/3KBB2/8/8/8/8/8 w - - 62 32",
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
        Brain.getIdealEndgameWhiteMoves(fen).includes(expectedSan),
        `${entry.key} via ${transform.name}: ${expectedSan}`,
      );
      assert.equal(Brain.getEndgamePhase(fen), "2/2", fen);
    }
  }
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
      "Kc6",
      "Ka8",
      "Nc5",
      "Kb8",
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
    ["2k5/3N3B/3K4/8/8/8/8/8 w - - 56 29", "Ke6"],
    ["2k5/3N4/4K3/8/8/3B4/8/8 w - - 56 29", "Bh7"],
    ["2k5/3N4/4K3/8/4B3/8/8/8 w - - 56 29", "Bh7"],
    ["2k5/3N4/4K3/3B4/8/8/8/8 w - - 58 30", ["Kd6", "Be4"]],
    ["8/k2N4/3K4/8/8/3B4/8/8 w - - 58 30", "Ke6"],
    ["2k5/3N4/3K4/3B4/8/8/8/8 w - - 60 31", "Be4"],
    ["2k5/3N4/3K4/8/2B5/8/8/8 w - - 60 31", "Bd5"],
    ["3k4/8/3K4/2N2B2/8/8/8/8 w - - 64 33", ["Nd7", "Bg6"]],
    ["8/k7/2K5/2N5/2B5/8/8/8 w - - 64 33", "Nd7"],
    ["1k6/8/2K5/2N5/2B5/8/8/8 w - - 64 33", "Be6"],
    ["1k6/8/2K1B3/2N5/8/8/8/8 w - - 66 34", ["Kd6", "Kb6"]],
    ["k7/8/2K5/2N2B2/8/8/8/8 w - - 66 34", "Be6"],
    ["8/2kN4/4K3/8/2B5/8/8/8 w - - 58 30", "Bd5"],
    ["k7/3N4/3K4/8/2B5/8/8/8 w - - 60 31", "Bd3"],
    ["k7/3B4/2K5/2N5/8/8/8/8 w - - 68 35", "Kb6"],
  ] as const;

  for (const [fen, expectedMoves] of cases) {
    const moves = expectedMovesArray(expectedMoves);
    for (const expectedMove of moves) {
      const chess = Brain.getChess(fen);
      assert.ok(
        Brain.getIdealEndgameWhiteMoves(chess.fen()).includes(expectedMove),
        `${expectedMove} should be accepted from ${chess.fen()}`,
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
    ["Kd6", "Kc8", "Be4", "Kd8", "Bf5", "Ke8", "Bg6+", "Kd8"],
    [
      "Kd6",
      "Kc8",
      "Be4",
      "Kd8",
      "Bf5",
      "Kc8",
      "Nc5+",
      "Kb8",
      "Kc6",
      "Ka7",
      "Be6",
      "Ka8",
      "Kb6",
      "Kb8",
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

test("two-bishop phase two no longer uses the old edge-lock shortcut", () => {
  setEndgame("twoBishops");
  const formerLookupPosition = "4k3/8/4K3/3BB3/8/8/8/8 w - - 38 20";

  assert.equal(Brain.getEndgamePhase(formerLookupPosition), "1/2");
  assert.equal(Brain.shouldShowPhaseTwoBoardBorder(formerLookupPosition), false);
  assert.notEqual(Brain.getEndgameReason(formerLookupPosition), "mating net");
});

test("endgame phase two is only reported on white turns", () => {
  const cases: Array<[EndgameId, string]> = [
    ["knightAndBishop", "7k/8/5K2/6N1/4B3/8/8/8 w - - 42 22"],
    ["twoBishops", "8/8/8/8/1B6/8/k1B5/2K5 w - - 0 1"],
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

test("two-bishop phase two requires black on edge and one target pattern", () => {
  setEndgame("twoBishops");

  assert.equal(
    Brain.getEndgamePhase("4k3/8/4BB2/8/4K3/8/8/8 w - - 0 1"),
    "2/2",
  );
  assert.equal(
    Brain.getEndgamePhase("8/8/8/8/1B6/8/k1B5/2K5 w - - 0 1"),
    "2/2",
  );
  assert.equal(
    Brain.getEndgamePhase("3k4/6B1/3KB3/8/8/8/8/8 w - - 70 36"),
    "2/2",
  );
  assert.equal(
    Brain.getEndgamePhase("8/8/8/8/8/1K6/3B4/k5B1 w - - 0 1"),
    "2/2",
  );
  assert.equal(
    Brain.getEndgamePhase("4k3/8/4B3/5B2/4K3/8/8/8 w - - 0 1"),
    "1/2",
  );
  assert.equal(
    Brain.getEndgamePhase("8/8/8/8/8/1K1B4/8/k5B1 w - - 0 1"),
    "1/2",
  );
  assert.equal(
    Brain.getEndgamePhase("8/8/8/8/8/5K2/B7/B6k w - - 0 1"),
    "1/2",
  );
});

test("two-bishop white priorities are ordered", () => {
  assert.deepEqual(
    Brain.getTwoBishopsWhiteScoreReasons().map(({ reason }) => reason),
    [
      "mate",
      "no stalemate",
      "bishops safe",
      "waiting move",
      "force opponent to take opposition",
      "take opposition",
      "force opponent toward corner",
      "bishops in middle 16",
      "bishops together",
      "king not on edge",
      "king closer",
      "bishops closer",
    ],
  );
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

test("two-bishop phase two prefers the row waiting move after safety", () => {
  setEndgame("twoBishops");
  const fen = "8/8/5K2/5B2/5B1k/8/8/8 w - - 34 18";
  const waiting = Brain.scoreTwoBishopsWhiteMove(fen, "Be5");
  const otherSafeSqueeze = Brain.scoreTwoBishopsWhiteMove(fen, "Be6");

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.equal(waiting.bishopSafetyPenalty, 0);
  assert.equal(otherSafeSqueeze.bishopSafetyPenalty, 0);
  assert.equal(waiting.phaseTwoWaitingMovePenalty, 0);
  assert.equal(otherSafeSqueeze.phaseTwoWaitingMovePenalty, 1);
  assert.equal(
    Brain.compareTwoBishopsWhiteScores(waiting, otherSafeSqueeze) < 0,
    true,
  );
  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Be5"]);
  assert.equal(Brain.getEndgameReason(fen), "waiting move");
});

test("two-bishop phase two uses corner waiting moves", () => {
  setEndgame("twoBishops");
  const fen = "8/8/8/8/B7/BK6/8/k7 w - - 0 1";
  const waiting = Brain.scoreTwoBishopsWhiteMove(fen, "Bc6");
  const nonWaiting = Brain.scoreTwoBishopsWhiteMove(fen, "Bc5");
  const afterWaiting = Brain.getChess(fen);
  afterWaiting.move("Bc6");
  const escapeMove = afterWaiting.moves({ verbose: true })[0];

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Bc6"]);
  assert.equal(Brain.getEndgameReason(fen), "waiting move");
  assert.equal(waiting.phaseTwoWaitingMovePenalty, 0);
  assert.equal(nonWaiting.phaseTwoWaitingMovePenalty, 1);
  assert.equal(escapeMove.to, "b1");
  assert.equal(
    Brain.bishopControlsOrOccupiesSquare(afterWaiting.fen(), "c6", "b1"),
    false,
  );
  afterWaiting.move(escapeMove.san);
  assert.equal(
    Brain.canBishopMoveToControlSquare(afterWaiting.fen(), "c6", "b1"),
    true,
  );
});

test("two-bishop phase two prefers forcing opposition before corner distance", () => {
  setEndgame("twoBishops");
  const fen = "8/8/8/8/1B6/8/k1B5/2K5 w - - 0 1";
  const forceOpposition = Brain.scoreTwoBishopsWhiteMove(fen, "Bc5");
  const forceCorner = Brain.scoreTwoBishopsWhiteMove(fen, "Bc3");

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.equal(forceOpposition.phaseTwoForceOpponentOppositionPenalty, 0);
  assert.equal(forceCorner.phaseTwoForceOpponentOppositionPenalty, 1);
  assert.equal(forceOpposition.phaseTwoForceOpponentCornerPenalty, 0);
  assert.equal(forceCorner.phaseTwoForceOpponentCornerPenalty, 2);
  assert.equal(
    Brain.compareTwoBishopsWhiteScores(forceOpposition, forceCorner) < 0,
    true,
  );
});

test("two-bishop phase two prefers taking opposition before corner distance", () => {
  setEndgame("twoBishops");
  const fen = "8/8/8/1B6/1B6/8/k1K5/8 w - - 0 1";
  const forceCorner = Brain.scoreTwoBishopsWhiteMove(fen, "Kc3");
  const takeOpposition = Brain.scoreTwoBishopsWhiteMove(fen, "Ba5");

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.equal(forceCorner.bishopSafetyPenalty, 0);
  assert.equal(takeOpposition.bishopSafetyPenalty, 0);
  assert.equal(forceCorner.phaseTwoForceOpponentOppositionPenalty, 1);
  assert.equal(takeOpposition.phaseTwoForceOpponentOppositionPenalty, 1);
  assert.equal(forceCorner.phaseTwoForceOpponentCornerPenalty, 1);
  assert.equal(takeOpposition.phaseTwoForceOpponentCornerPenalty, 2);
  assert.equal(forceCorner.phaseTwoTakeOppositionPenalty, 1);
  assert.equal(takeOpposition.phaseTwoTakeOppositionPenalty, 0);
  assert.equal(Brain.compareTwoBishopsWhiteScores(takeOpposition, forceCorner) < 0, true);
});

test("two-bishop phase two uses corner distance after opposition", () => {
  setEndgame("twoBishops");
  const fen = "3k4/6B1/3KB3/8/8/8/8/8 w - - 70 36";
  const towardCorner = Brain.scoreTwoBishopsWhiteMove(fen, "Bf7");
  const centralBishops = Brain.scoreTwoBishopsWhiteMove(fen, "Bf6+");

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.equal(towardCorner.phaseTwoForceOpponentOppositionPenalty, 1);
  assert.equal(centralBishops.phaseTwoForceOpponentOppositionPenalty, 1);
  assert.equal(towardCorner.phaseTwoTakeOppositionPenalty, 0);
  assert.equal(centralBishops.phaseTwoTakeOppositionPenalty, 0);
  assert.equal(towardCorner.phaseTwoForceOpponentCornerPenalty, 2);
  assert.equal(centralBishops.phaseTwoForceOpponentCornerPenalty, 3);
  assert.equal(towardCorner.bishopMiddle16Penalty > centralBishops.bishopMiddle16Penalty, true);
  assert.equal(Brain.compareTwoBishopsWhiteScores(towardCorner, centralBishops) < 0, true);
  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Bf7"]);
  assert.equal(Brain.getEndgameReason(fen), "force opponent toward corner");
});

test("two-bishop phase two takes opposition before later priorities", () => {
  setEndgame("twoBishops");
  const fen = "8/8/8/8/K7/2B5/k1B5/8 w - - 0 1";
  const opposition = Brain.scoreTwoBishopsWhiteMove(fen, "Bd4");
  const middle = Brain.scoreTwoBishopsWhiteMove(fen, "Kb4");

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.equal(opposition.phaseTwoForceOpponentOppositionPenalty, 1);
  assert.equal(middle.phaseTwoForceOpponentOppositionPenalty, 1);
  assert.equal(opposition.phaseTwoForceOpponentCornerPenalty, 0);
  assert.equal(middle.phaseTwoForceOpponentCornerPenalty, 0);
  assert.equal(opposition.phaseTwoTakeOppositionPenalty, 0);
  assert.equal(middle.phaseTwoTakeOppositionPenalty, 1);
  assert.equal(opposition.bishopAdjacencyPenalty > middle.bishopAdjacencyPenalty, true);
  assert.equal(Brain.compareTwoBishopsWhiteScores(opposition, middle) < 0, true);
});

test("two-bishop phase two takes the optimal opposition entry", () => {
  setEndgame("twoBishops");
  const fen = "8/7k/5K2/8/6B1/6B1/8/8 w - - 64 33";
  const opposition = Brain.scoreTwoBishopsWhiteMove(fen, "Kf7");
  const bishopSetup = Brain.scoreTwoBishopsWhiteMove(fen, "Bf4");

  assert.equal(Brain.getEndgamePhase(fen), "2/2");
  assert.equal(opposition.phaseTwoTakeOppositionPenalty, 0);
  assert.equal(bishopSetup.phaseTwoTakeOppositionPenalty, 1);
  assert.equal(opposition.phaseTwoForceOpponentCornerPenalty > bishopSetup.phaseTwoForceOpponentCornerPenalty, true);
  assert.equal(Brain.compareTwoBishopsWhiteScores(opposition, bishopSetup) < 0, true);
  assert.deepEqual(Brain.getIdealEndgameWhiteMoves(fen), ["Kf7"]);
  assert.equal(Brain.getEndgameReason(fen), "take opposition");
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

test("two-bishop black rules approach unprotected bishops", () => {
  setEndgame("twoBishops");
  const fen = getEndgame("twoBishops").fen.replace(" w ", " b ");
  const closer = Brain.scoreTwoBishopsBlackMove(fen, "Kd7");
  const farther = Brain.scoreTwoBishopsBlackMove(fen, "Kd8");

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

test("queen white rules prefer queen off edge before queen knight geometry", () => {
  setEndgame("queen");
  const fen = "8/8/8/8/8/8/3k4/KQ6 w - - 0 1";
  const offEdge = Brain.scoreQueenWhiteMove(fen, "Qb5");
  const edgeKnight = Brain.scoreQueenWhiteMove(fen, "Qf1");

  assert.equal(offEdge.queenEdgePenalty, 0);
  assert.equal(offEdge.queenKnightMovePenalty, 1);
  assert.equal(edgeKnight.queenEdgePenalty, 1);
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
    for (const expectedMoves of fixture.expectedLine) {
      if (chess.turn() === "w") {
        const fen = chess.fen();
        const whiteMove = chess.move(expectedMoves[0]);
        assert.ok(whiteMove);
        const candidates = Brain.getEndgameOpponentCandidates(chess);
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
        chess.move(expectedMoves[0]);
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
  for (const fixture of HARDCODED_ENDGAME_LINE_FIXTURES) {
    setEndgame(fixture.id);
    const chess = Brain.getChess(fixture.startingFen);
    for (const expectedMoves of fixture.expectedLine) {
      if (chess.turn() === "w") {
        const fen = chess.fen();
        const idealMoves = Brain.getIdealEndgameWhiteMoves(fen);
        if (idealMoves.length > 1) {
          const whiteMove = chess.move(idealMoves[0]);
          assert.ok(whiteMove);
          const candidates = Brain.getEndgameOpponentCandidates(chess);
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
        chess.move(expectedMoves[0]);
      } else {
        chess.move(expectedMoves[0]);
      }
    }
  }
  throw new Error("No white choice fixture found");
}

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

test("endgame priority help explains white best moves and black resistance", () => {
  for (const id of [
    "rook",
    "queen",
    "knightAndBishop",
    "twoBishops",
  ] as const) {
    setEndgame(id);
    const help = Brain.getEndgamePriorityHelp();

    assert.match(help.title, new RegExp(getBaseEndgame(id).label));
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

test("two-bishop priority help explains phase-two terms concretely", () => {
  setEndgame("twoBishops");
  const help = Brain.getEndgamePriorityHelp();
  const text = help.whitePriorities.concat(help.notes).join("\n");

  assert.match(text, /Phase 2/);
  assert.match(text, /waiting move is not any quiet move/);
  assert.match(text, /c3 through f6/);
  assert.match(text, /adjacent: one king move apart/);
  assert.match(text, /worst legal-reply distance to the nearest corner/);
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
