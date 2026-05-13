import { Chess, type Square } from "chess.js";
import lichessF, {
  type LiMove,
  getGameById,
  getLatestGame,
  latestGameCache,
} from "./Lichess";
import { getEndgame, type EndgameId } from "./Endgames";
import { type LogType } from "./Log";
import settings from "./Settings";
import StorageW from "./StorageW";
import traverseF, { type TraverseType, startTraverseF } from "./Traverse";

export type StateType = {
  fen: string;
  startingFen: string | undefined;
  orientationIsWhite: boolean;
  logs: LogType[];
  traverse?: TraverseType;
  endgame_started_at_ms?: number;
  endgame_finished_at_ms?: number;
};

export type EndgameTerminalOutcome = "lostPiece" | "checkmate" | "stalemate";

type History = {
  index: number;
  states: StateType[];
};

type EndgamePiece = {
  color: "w" | "b";
  type: string;
  isPawn: boolean;
};

type EndgamePositionScore =
  | {
      kind: "generic";
      mate: number;
      noStalemate: number;
      whiteMaterial: number;
      whitePiecesSafe: number;
      blackConfinement: number;
      blackMobility: number;
      whiteKingProximity: number;
    }
  | {
      kind: "major";
      endgameId: "rook" | "queen";
      mate: number;
      noStalemate: number;
      whiteMaterial: number;
      whiteMajorSafe: number;
      rookUsefulCheck: number;
      quiet: number;
      phase: number;
      rookEdgeTrap: number;
      rookBoxProgress: number;
      majorBetweenKings: number;
      rookBlackAllowsOpposition: number;
      rookBlackKingRookDistance: number;
      rookKingCutApproach: number;
      rookTempo: number;
      rookKingSideApproach: number;
      blackBetweenWhitePieces: number;
      ownKingLine: number;
      adjacentEdgeLock: number;
      edgeEscape: number;
      kingLine: number;
      rookOpposition: number;
      kingApproach: number;
      majorOwnKingDistance: number;
      blackConfinement: number;
      blackMobility: number;
      whiteKingProximity: number;
      majorDistance: number;
    }
  | {
      kind: "knightAndBishop";
      endgameId: "knightAndBishop";
      mate: number;
      noStalemate: number;
      whiteMaterial: number;
      whiteMinorsSafe: number;
      bishopCornerProgress: number;
      blackConfinement: number;
      blackMobility: number;
      whiteKingProximity: number;
      minorCoordination: number;
    }
  | {
      kind: "basic";
      endgameId: "twoBishops" | "twoKnightsVsPawn";
      mate: number;
      noStalemate: number;
      whiteMaterial: number;
      whitePiecesSafe: number;
      blackConfinement: number;
      blackMobility: number;
      whiteKingProximity: number;
    };

type RookWhiteMoveScore = {
  matePenalty: number;
  rookCapturePenalty: number;
  stalematePenalty: number;
  diagonalChainPenalty: number;
  boxSize: number;
  edgeTrapPenalty: number;
  ownLinePenalty: number;
  saveRookDistanceScore: number;
  edgeKingWalkPenalty: number;
  kingEdgePenalty: number;
  kingOppositionPenalty: number;
  kingDistance: number;
  kingManhattanDistance: number;
  waitingPenalty: number;
  waitingRookDistanceScore: number;
};

type RookBlackMoveScore = {
  captureRookPenalty: number;
  oppositionPenalty: number;
  rookCutGap: number;
  rookApproachKingEscapeBalance: number;
};

type QueenWhiteMoveScore = {
  matePenalty: number;
  queenCapturePenalty: number;
  stalematePenalty: number;
  boxArea: number;
  cagePenalty: number;
  cageQueenMovePenalty: number;
  nonCageCheckPenalty: number;
  queenKnightMovePenalty: number;
  cageKingApproach: number;
  kingDistance: number;
  moveDistance: number;
};

type QueenBlackMoveScore = {
  captureQueenPenalty: number;
  edgeDistanceScore: number;
  index: number;
};

export enum View {
  lichess_vs,
  lichess_mistakes,
  lichess_latest,
  lichess_id,
  traverse,
  speedrun,
  traps,
  endgame,
}

export default class Brain {
  static autoreplyRef: React.RefObject<HTMLInputElement | null>;
  static history: History;
  static updateHistory: (history: History) => void;
  static showHelp: boolean;
  static updateShowHelp: (showHelp: boolean) => void;
  static isTraversing: boolean;
  static updateIsTraversing: (isTraversing: boolean) => void;
  static openings: {
    [fen: string]: string;
  } | null;
  static updateOpenings: (openings: { [fen: string]: string }) => void;

  static timeout: ReturnType<typeof setTimeout>;

  //

  static view: View;
  static lichessUsername?: string;
  static endgameId: EndgameId | undefined = undefined;
  static readonly ENDGAME_PICKER_FEN = "8/8/8/8/8/8/8/8 w - - 0 1";

  //

  static getFen(start?: string, san?: string): string {
    const chess = Brain.getChess(start);
    if (san) chess.move(san);
    return chess.fen();
  }

  static getChess(fen?: string): Chess {
    // @ts-ignore
    const chess = new Chess();
    if (fen !== undefined) chess.load(fen);
    return chess;
  }

  static getPieceCount(fen: string): number {
    return Brain.getChess(fen)
      .board()
      .flat()
      .filter((piece) => piece !== null).length;
  }

  static endgamePieceCountMatchesStart(fen: string): boolean {
    if (!Brain.hasSelectedEndgame()) {
      return false;
    }
    return (
      Brain.getPieceCount(fen) ===
      Brain.getPieceCount(getEndgame(Brain.endgameId).fen)
    );
  }

  static hasSelectedEndgame(): boolean {
    return Brain.endgameId !== undefined;
  }

  static getEndgameTerminalOutcome(
    fen: string
  ): EndgameTerminalOutcome | null {
    if (!Brain.endgamePieceCountMatchesStart(fen)) {
      return "lostPiece";
    }
    const chess = Brain.getChess(fen);
    if (chess.isCheckmate()) {
      return "checkmate";
    }
    if (chess.isStalemate()) {
      return "stalemate";
    }
    return null;
  }

  static getEndgameOutcomeText(outcome: EndgameTerminalOutcome): string {
    return (
      {
        lostPiece: "defeated",
        checkmate: "checkmate",
        stalemate: "stalemate",
      } satisfies Record<EndgameTerminalOutcome, string>
    )[outcome];
  }

  static getEndgameElapsedMs(
    state: StateType = Brain.getState(),
    now = Date.now()
  ): number {
    const startedAt = state.logs[0]?.created_at_ms;
    if (startedAt !== undefined) {
      const terminalOutcome = Brain.getEndgameTerminalOutcome(state.fen);
      const finishedAt =
        state.endgame_finished_at_ms ??
        (terminalOutcome
          ? state.logs[state.logs.length - 1]?.created_at_ms
          : undefined);
      return Math.max(0, (finishedAt ?? now) - startedAt);
    }
    const completedDuration = state.logs.reduce(
      (total, log) => total + (log.duration_ms || 0),
      0
    );
    if (state.logs.length === 0) {
      return 0;
    }
    if (Brain.getEndgameTerminalOutcome(state.fen)) {
      return completedDuration;
    }
    const latestLog = state.logs[state.logs.length - 1];
    return (
      completedDuration +
      (latestLog?.created_at_ms === undefined ? 0 : now - latestLog.created_at_ms)
    );
  }

  static getEndgameStartingUrl(): string {
    const url = new URL(window.location.href);
    if (!Brain.hasSelectedEndgame()) return url.toString();
    url.pathname = `/endgames/${Brain.endgameId}`;
    url.search = "";
    url.hash = ["w", Brain.getEndgameStartingFen().replaceAll(" ", "_")].join(
      "//"
    );
    return url.toString();
  }

  static getEndgamePhase(fen: string): string {
    if (!Brain.hasSelectedEndgame()) {
      return "";
    }
    if (Brain.endgameId === "knightAndBishop") {
      return `${Brain.getKnightAndBishopPhase(fen)}/3`;
    }
    const majorPiece = Brain.getMajorEndgamePieceType();
    if (!majorPiece) {
      return "1/2";
    }
    return `${Brain.getMajorEndgamePhase(fen, majorPiece)}/2`;
  }

  static getKnightAndBishopPhase(fen: string): number {
    const bishop = Brain.findPiece(fen, "w", "b");
    const knight = Brain.findPiece(fen, "w", "n");
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (!bishop || !knight || !blackKing) {
      return 0;
    }
    const edgeDistance = Brain.edgeDistance(blackKing.square);
    const cornerDistance = Brain.distanceToNearestBishopCorner(fen);
    if (edgeDistance === 0 && cornerDistance <= 2) {
      return 3;
    }
    if (edgeDistance <= 1) {
      return 2;
    }
    return 1;
  }

  static getLogResultFen(log: LogType): string {
    const chess = Brain.getChess(log.fen);
    chess.move(log.san);
    if (log.opponent_san) {
      chess.move(log.opponent_san);
    }
    return chess.fen();
  }

  static getMajorEndgamePieceType(): "r" | "q" | null {
    if (Brain.endgameId === "rook") return "r";
    if (Brain.endgameId === "queen") return "q";
    return null;
  }

  static getMajorEndgamePhase(fen: string, pieceType: "r" | "q"): number {
    const whiteMajorPiece = Brain.findPiece(fen, "w", pieceType);
    if (!whiteMajorPiece) {
      return 0;
    }
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (!whiteKing || !blackKing) {
      return 1;
    }
    return Brain.isMajorPieceBetweenKings(whiteMajorPiece, whiteKing, blackKing)
      ? 2
      : 1;
  }

  static isEndgameLogCorrect(log: LogType): boolean {
    return Brain.getIdealEndgameWhiteMoves(log.fen).includes(log.san);
  }

  static getEndgameLogFields(
    fen: string,
    san: string,
    resultFen: string
  ): Pick<
    LogType,
    "endgame_phase" | "endgame_is_correct" | "endgame_correct_choices"
  > {
    const correctMoves = Brain.getIdealEndgameWhiteMoves(fen);
    return {
      endgame_phase: Brain.getEndgamePhase(resultFen),
      endgame_is_correct: correctMoves.includes(san),
      endgame_correct_choices: correctMoves.length,
    };
  }

  static getIdealEndgameWhiteMoves(fen: string): string[] {
    const chess = Brain.getChess(fen);
    const moves = chess.moves();
    if (chess.turn() !== "w" || moves.length === 0) {
      return moves;
    }
    if (Brain.endgameId === "rook") {
      return Brain.getIdealRookWhiteMoves(fen);
    }
    if (Brain.endgameId === "queen") {
      return Brain.getIdealQueenWhiteMoves(fen);
    }
    const scoredMoves = Brain.getEndgameMoveScores(fen, moves);
    scoredMoves.sort(
      (a, b) =>
        Brain.compareEndgamePositionScores(b.score, a.score) || a.index - b.index
    );
    const best = scoredMoves[0];
    return scoredMoves
      .filter(
        (move) => Brain.compareEndgamePositionScores(move.score, best.score) === 0
      )
      .map((move) => move.san);
  }

  static getEndgameMoveScores(fen: string, moves: string[]) {
    return moves.map((san, index) => {
      const nextChess = Brain.getChess(fen);
      nextChess.move(san);
      const score = Brain.getEndgamePositionScore(nextChess.fen());
      return {
        san,
        index,
        score,
      };
    });
  }

  static getEndgamePositionScore(fen: string): EndgamePositionScore {
    if (!Brain.hasSelectedEndgame()) {
      throw new Error("no endgame selected");
    }
    return Brain.getGenericEndgamePositionScore(fen);
  }

  static compareEndgamePositionScores(
    a: EndgamePositionScore,
    b: EndgamePositionScore
  ): number {
    const aVector = Brain.getEndgameScoreVector(a);
    const bVector = Brain.getEndgameScoreVector(b);
    for (let index = 0; index < Math.min(aVector.length, bVector.length); index++) {
      const diff = aVector[index] - bVector[index];
      if (diff !== 0) {
        return diff;
      }
    }
    return aVector.length - bVector.length;
  }

  static getEndgameScoreVector(score: EndgamePositionScore): number[] {
    if (score.kind === "generic") {
      return [
        score.mate,
        score.noStalemate,
        score.whiteMaterial,
        score.whitePiecesSafe,
        score.blackConfinement,
        score.blackMobility,
        score.whiteKingProximity,
      ];
    }
    if (score.kind === "major") {
      return [
        score.mate,
        score.noStalemate,
        score.whiteMaterial,
        score.whiteMajorSafe,
        score.rookUsefulCheck,
        score.quiet,
        score.edgeEscape,
        score.phase,
        score.rookEdgeTrap,
        score.rookBoxProgress,
        score.majorBetweenKings,
        score.rookBlackAllowsOpposition,
        score.rookBlackKingRookDistance,
        score.rookKingCutApproach,
        score.rookOpposition,
        score.rookTempo,
        score.rookKingSideApproach,
        score.blackBetweenWhitePieces,
        score.ownKingLine,
        score.adjacentEdgeLock,
        score.kingLine,
        score.kingApproach,
        score.majorOwnKingDistance,
        score.blackConfinement,
        score.whiteKingProximity,
        score.blackMobility,
        score.majorDistance,
      ];
    }
    if (score.kind === "knightAndBishop") {
      return [
        score.mate,
        score.noStalemate,
        score.whiteMaterial,
        score.whiteMinorsSafe,
        score.bishopCornerProgress,
        score.blackConfinement,
        score.whiteKingProximity,
        score.blackMobility,
        score.minorCoordination,
      ];
    }
    return [
      score.mate,
      score.noStalemate,
      score.whiteMaterial,
      score.whitePiecesSafe,
      score.blackConfinement,
      score.blackMobility,
      score.whiteKingProximity,
    ];
  }

  static getGenericEndgamePositionScore(fen: string): EndgamePositionScore {
    const chess = Brain.getChess(fen);
    const blackKing = Brain.findPiece(fen, "b", "k");
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const whitePieceTypes = Brain.hasSelectedEndgame()
      ? Array.from(
          new Set(
            Brain.getEndgamePieces(getEndgame(Brain.endgameId).fen)
              .filter((piece) => piece.color === "w" && piece.type !== "k")
              .map((piece) => piece.type)
          )
        )
      : [];
    return {
      kind: "generic",
      mate: chess.isCheckmate() ? 1 : 0,
      noStalemate: chess.isStalemate() ? 0 : 1,
      whiteMaterial:
        Brain.hasSelectedEndgame() && Brain.endgamePieceCountMatchesStart(fen)
          ? 1
          : 0,
      whitePiecesSafe: Brain.blackCanTakeWhitePieces(fen, whitePieceTypes) ? 0 : 1,
      blackConfinement: blackKing ? 3 - Brain.edgeDistance(blackKing.square) : 0,
      blackMobility: -Brain.getLegalMoveCount(fen),
      whiteKingProximity:
        whiteKing && blackKing
          ? 14 - Brain.manhattanDistance(whiteKing.square, blackKing.square)
          : 0,
    };
  }

  static getMajorEndgamePositionScore(
    fen: string,
    endgameId: "rook" | "queen"
  ): EndgamePositionScore {
    const pieceType = endgameId === "rook" ? "r" : "q";
    const chess = Brain.getChess(fen);
    const whiteMajorPiece = Brain.findPiece(fen, "w", pieceType);
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const blackKing = Brain.findPiece(fen, "b", "k");
    const phase = Brain.getMajorEndgamePhase(fen, pieceType);
    const rookCutAxis =
      endgameId === "rook" && whiteMajorPiece && whiteKing && blackKing
        ? Brain.getRookCutAxis(whiteMajorPiece, whiteKing, blackKing)
        : null;
    const majorBetweenKings =
      whiteMajorPiece && whiteKing && blackKing
        ? Brain.isMajorPieceBetweenKings(whiteMajorPiece, whiteKing, blackKing)
          ? 1
          : 0
        : 0;
    const blackBetweenWhitePieces =
      endgameId === "rook" && whiteMajorPiece && whiteKing && blackKing
        ? Brain.isMajorPieceBetweenKings(blackKing, whiteMajorPiece, whiteKing)
          ? 0
          : 1
        : 1;
    const ownKingLine =
      endgameId === "rook" &&
      phase === 2 &&
      whiteMajorPiece &&
      whiteKing &&
      Brain.sharesRankOrFile(whiteMajorPiece.square, whiteKing.square)
        ? 0
        : 1;
    const adjacentEdgeLock =
      endgameId === "queen" &&
      whiteMajorPiece &&
      blackKing &&
      Brain.edgeDistance(blackKing.square) === 0 &&
      Brain.isMajorPieceOnAdjacentEdgeLine(
        whiteMajorPiece.square,
        blackKing.square
      )
        ? 1
        : endgameId === "rook"
          ? 0
          : 0;
    const edgeEscape =
      endgameId === "queen" && blackKing && Brain.edgeDistance(blackKing.square) <= 2
        ? 3 - Brain.maxBlackKingEdgeDistanceAfterReplies(fen)
        : 0;
    const kingLine =
      endgameId === "queen" &&
      whiteMajorPiece &&
      whiteKing &&
      blackKing &&
      Brain.isCorner(blackKing.square) &&
      Brain.isMajorPieceOnAdjacentEdgeLine(whiteMajorPiece.square, blackKing.square)
        ? Brain.sharesRankOrFile(whiteMajorPiece.square, whiteKing.square)
          ? 0
          : 1
        : 1;
    const rookOpposition = 0;
    const rookTempo =
      endgameId === "rook" && whiteKing && blackKing
        ? Brain.sameSquareColor(whiteKing.square, blackKing.square)
          ? 0
          : 1
        : 0;
    const rookBoxProgress =
      endgameId === "rook" && rookCutAxis && whiteMajorPiece && blackKing
        ? 7 - Brain.getRookOneDimensionalBoxSize(
            whiteMajorPiece.square,
            blackKing.square,
            rookCutAxis
          )
        : 0;
    const rookEdgeTrap =
      endgameId === "rook" &&
      whiteMajorPiece &&
      blackKing &&
      Brain.edgeDistance(blackKing.square) === 0 &&
      Brain.isMajorPieceOnAdjacentEdgeLine(whiteMajorPiece.square, blackKing.square)
        ? Brain.getLegalMoveCount(fen) <= 2
          ? 1
          : 0
        : 0;
    const rookBlackAllowsOpposition =
      endgameId === "rook" &&
      chess.turn() === "w" &&
      whiteMajorPiece &&
      whiteKing &&
      blackKing &&
      !Brain.blackKingAttacksWhiteMajorPiece(fen, "r") &&
      (Brain.hasDirectKingOpposition(whiteKing.square, blackKing.square) ||
        Brain.whiteCanTakeDirectKingOpposition(fen))
        ? 1
        : 0;
    const rookBlackKingRookDistance =
      endgameId === "rook" && chess.turn() === "w" && whiteMajorPiece && blackKing
        ? Brain.manhattanDistance(whiteMajorPiece.square, blackKing.square)
        : 0;
    const rookKingCutApproach =
      endgameId === "rook" && rookCutAxis && whiteKing && blackKing
        ? 7 - Brain.getAxisDistance(whiteKing.square, blackKing.square, rookCutAxis)
        : 0;
    const rookKingSideApproach =
      endgameId === "rook" && rookCutAxis && whiteKing && blackKing
        ? 7 -
          Brain.getAxisDistance(
            whiteKing.square,
            blackKing.square,
            Brain.otherAxis(rookCutAxis)
          )
        : 0;
    const kingApproach =
      endgameId === "queen" && adjacentEdgeLock === 1 && whiteKing && blackKing
        ? Brain.isCorner(blackKing.square)
          ? Brain.kingDistance(whiteKing.square, blackKing.square) <= 3
            ? 1
            : 0
          : 14 - Brain.manhattanDistance(whiteKing.square, blackKing.square)
        : 0;
    const majorOwnKingDistance =
      endgameId === "queen" &&
      adjacentEdgeLock === 0 &&
      whiteMajorPiece &&
      whiteKing
        ? Brain.kingDistance(whiteMajorPiece.square, whiteKing.square) > 1
          ? 1
          : 0
        : 0;
    const cornerKingApproachSettled =
      endgameId === "queen" &&
      adjacentEdgeLock === 1 &&
      whiteKing &&
      blackKing &&
      Brain.isCorner(blackKing.square) &&
      Brain.kingDistance(whiteKing.square, blackKing.square) <= 3;
    const majorDistance =
      whiteMajorPiece && blackKing
        ? 7 - Brain.majorPieceBoxDistance(whiteMajorPiece.square, blackKing.square)
        : 0;
    const rookAdjacentToBlackKing =
      endgameId === "rook" && whiteMajorPiece && blackKing
        ? Brain.kingDistance(whiteMajorPiece.square, blackKing.square) <= 1
        : false;
    const rookUsefulCheck =
      endgameId === "rook" &&
      chess.isCheck() &&
      !chess.isCheckmate() &&
      !rookAdjacentToBlackKing &&
      !Brain.whiteKingIsAdjacentToRook(fen) &&
      Brain.blackMustMoveAwayFromWhiteKing(fen)
        ? 1
        : 0;
    const whiteKingProximity =
      whiteKing && blackKing
        ? 14 - Brain.manhattanDistance(whiteKing.square, blackKing.square)
        : 0;
    return {
      kind: "major",
      endgameId,
      mate: chess.isCheckmate() ? 1 : 0,
      noStalemate: chess.isStalemate() ? 0 : 1,
      whiteMaterial: whiteMajorPiece ? 1 : 0,
      whiteMajorSafe: Brain.blackCanTakeWhitePieces(fen, [pieceType]) ? 0 : 1,
      rookUsefulCheck,
      quiet: chess.isCheck() && !chess.isCheckmate() ? 0 : 1,
      phase,
      rookEdgeTrap,
      rookBoxProgress,
      majorBetweenKings,
      rookBlackAllowsOpposition,
      rookBlackKingRookDistance,
      rookKingCutApproach,
      rookTempo,
      rookKingSideApproach,
      blackBetweenWhitePieces,
      ownKingLine,
      adjacentEdgeLock,
      edgeEscape,
      kingLine,
      rookOpposition,
      kingApproach,
      majorOwnKingDistance,
      blackConfinement: blackKing ? 3 - Brain.edgeDistance(blackKing.square) : 0,
      blackMobility: -Brain.getLegalMoveCount(fen),
      whiteKingProximity: cornerKingApproachSettled ? 0 : whiteKingProximity,
      majorDistance,
    };
  }

  static getKnightAndBishopPositionScore(fen: string): EndgamePositionScore {
    const chess = Brain.getChess(fen);
    const bishop = Brain.findPiece(fen, "w", "b");
    const knight = Brain.findPiece(fen, "w", "n");
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const blackKing = Brain.findPiece(fen, "b", "k");
    return {
      kind: "knightAndBishop",
      endgameId: "knightAndBishop",
      mate: chess.isCheckmate() ? 1 : 0,
      noStalemate: chess.isStalemate() ? 0 : 1,
      whiteMaterial: bishop && knight ? 1 : 0,
      whiteMinorsSafe: Brain.blackCanTakeWhitePieces(fen, ["b", "n"]) ? 0 : 1,
      bishopCornerProgress: 7 - Brain.distanceToNearestBishopCorner(fen),
      blackConfinement: blackKing ? 3 - Brain.edgeDistance(blackKing.square) : 0,
      blackMobility: -Brain.getLegalMoveCount(fen),
      whiteKingProximity:
        whiteKing && blackKing
          ? 14 - Brain.manhattanDistance(whiteKing.square, blackKing.square)
          : 0,
      minorCoordination:
        bishop && knight && blackKing
          ? 28 -
            Brain.manhattanDistance(bishop.square, blackKing.square) -
            Brain.manhattanDistance(knight.square, blackKing.square)
          : 0,
    };
  }

  static getBasicEndgamePositionScore(
    fen: string,
    endgameId: "twoBishops" | "twoKnightsVsPawn"
  ): EndgamePositionScore {
    const chess = Brain.getChess(fen);
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const blackKing = Brain.findPiece(fen, "b", "k");
    const requiredWhitePieces =
      endgameId === "twoBishops" ? ["b", "b"] : ["n", "n"];
    return {
      kind: "basic",
      endgameId,
      mate: chess.isCheckmate() ? 1 : 0,
      noStalemate: chess.isStalemate() ? 0 : 1,
      whiteMaterial: Brain.whiteHasRequiredPieces(fen, requiredWhitePieces)
        ? 1
        : 0,
      whitePiecesSafe: Brain.blackCanTakeWhitePieces(
        fen,
        Array.from(new Set(requiredWhitePieces))
      )
        ? 0
        : 1,
      blackConfinement: blackKing ? 3 - Brain.edgeDistance(blackKing.square) : 0,
      blackMobility: -Brain.getLegalMoveCount(fen),
      whiteKingProximity:
        whiteKing && blackKing
          ? 14 - Brain.manhattanDistance(whiteKing.square, blackKing.square)
          : 0,
    };
  }

  static getIdealKnightAndBishopWhiteMoves(fen: string): string[] {
    const chess = Brain.getChess(fen);
    const moves = chess.moves();
    if (chess.turn() !== "w" || moves.length === 0) {
      return moves;
    }
    const scoredMoves = moves.map((san, index) => ({
      san,
      index,
      ...Brain.scoreKnightAndBishopWhiteMove(fen, san),
    }));
    scoredMoves.sort((a, b) => Brain.compareKnightAndBishopWhiteScores(a, b));
    const best = scoredMoves[0];
    return scoredMoves
      .filter(
        (move) => Brain.compareKnightAndBishopWhiteScores(move, best) === 0
      )
      .map((move) => move.san);
  }

  static scoreKnightAndBishopWhiteMove(fen: string, san: string) {
    const chess = Brain.getChess(fen);
    chess.move(san);
    const resultFen = chess.fen();
    const whiteKing = Brain.findPiece(resultFen, "w", "k");
    const blackKing = Brain.findPiece(resultFen, "b", "k");
    const bishop = Brain.findPiece(resultFen, "w", "b");
    const knight = Brain.findPiece(resultFen, "w", "n");
    return {
      mateScore: chess.isCheckmate() ? 0 : 1,
      stalemateScore:
        !chess.isCheckmate() && chess.isStalemate() ? 1 : 0,
      pieceSafetyScore: Brain.blackCanTakeKnightOrBishop(resultFen) ? 1 : 0,
      whiteKingCentralDistance: whiteKing
        ? Brain.centerDistance(whiteKing.square)
        : 99,
      usefulCheckScore:
        chess.isCheck() && Brain.blackMustMoveAwayFromWhiteKing(resultFen)
          ? 0
          : 1,
      blackMobilityScore: Brain.getLegalMoveCount(resultFen),
      bishopCornerDistance: Brain.distanceToNearestBishopCorner(resultFen),
      edgeDistance: blackKing ? Brain.edgeDistance(blackKing.square) : 99,
      whiteKingDistance:
        whiteKing && blackKing
          ? Brain.manhattanDistance(whiteKing.square, blackKing.square)
          : 99,
      minorCoordination:
        bishop && knight && blackKing
          ? Brain.manhattanDistance(bishop.square, blackKing.square) +
            Brain.manhattanDistance(knight.square, blackKing.square)
          : 99,
    };
  }

  static compareKnightAndBishopWhiteScores(
    a: ReturnType<typeof Brain.scoreKnightAndBishopWhiteMove> & {
      index: number;
    },
    b: ReturnType<typeof Brain.scoreKnightAndBishopWhiteMove> & {
      index: number;
    }
  ): number {
    return (
      a.mateScore - b.mateScore ||
      a.stalemateScore - b.stalemateScore ||
      a.pieceSafetyScore - b.pieceSafetyScore ||
      a.whiteKingCentralDistance - b.whiteKingCentralDistance ||
      a.usefulCheckScore - b.usefulCheckScore ||
      a.blackMobilityScore - b.blackMobilityScore ||
      a.bishopCornerDistance - b.bishopCornerDistance ||
      a.edgeDistance - b.edgeDistance ||
      a.whiteKingDistance - b.whiteKingDistance ||
      a.minorCoordination - b.minorCoordination ||
      a.index - b.index
    );
  }

  static getIdealRookWhiteMoves(fen: string): string[] {
    const chess = Brain.getChess(fen);
    const moves = chess.moves();
    if (chess.turn() !== "w" || moves.length === 0) {
      return moves;
    }
    const scoredMoves = moves
      .map((san) => ({
        san,
        score: Brain.scoreRookWhiteMove(fen, san),
      }))
      .sort((a, b) => Brain.compareRookWhiteScores(a.score, b.score));
    const best = scoredMoves[0].score;
    return scoredMoves
      .filter((move) => Brain.compareRookWhiteScores(move.score, best) === 0)
      .map((move) => move.san);
  }

  static scoreRookWhiteMove(fen: string, san: string): RookWhiteMoveScore {
    const beforeRook = Brain.findPiece(fen, "w", "r");
    const beforeWhiteKing = Brain.findPiece(fen, "w", "k");
    const beforeBlackKing = Brain.findPiece(fen, "b", "k");
    const kingsAreKnightMove =
      beforeWhiteKing && beforeBlackKing
        ? Brain.isKnightMove(beforeWhiteKing.square, beforeBlackKing.square)
        : false;
    const rookStartsAttacked = Brain.blackKingAttacksWhiteMajorPiece(fen, "r");
    const chess = Brain.getChess(fen);
    const move = chess.move(san);
    const resultFen = chess.fen();
    const whiteRook = Brain.findPiece(resultFen, "w", "r");
    const whiteKing = Brain.findPiece(resultFen, "w", "k");
    const blackKing = Brain.findPiece(resultFen, "b", "k");
    const blackKingBetweenWhitePiecesAfter =
      whiteRook && whiteKing && blackKing
        ? Brain.isMajorPieceBetweenKings(blackKing, whiteRook, whiteKing)
        : false;
    const rookMoveDistance =
      beforeRook && whiteRook
        ? Brain.manhattanDistance(beforeRook.square, whiteRook.square)
        : 0;
    const rookIsSafe = !Brain.blackCanTakeWhiteMajorPiece(resultFen, "r");
    const isSavingRook = rookStartsAttacked && rookIsSafe && move?.piece === "r";
    const isWaitingMove =
      kingsAreKnightMove &&
      move?.piece === "r" &&
      !chess.isCheck() &&
      !blackKingBetweenWhitePiecesAfter;
    const hasAdjacentEdgeLock =
      blackKing &&
      whiteRook &&
      Brain.edgeDistance(blackKing.square) === 0 &&
      Brain.isMajorPieceOnAdjacentEdgeLine(whiteRook.square, blackKing.square);
    const shouldLiftRookOnCorner =
      hasAdjacentEdgeLock &&
      whiteKing &&
      blackKing &&
      Brain.isCorner(blackKing.square) &&
      Brain.kingDistance(whiteKing.square, blackKing.square) > 2;
    const shouldWalkKingOnEdge =
      hasAdjacentEdgeLock &&
      whiteKing &&
      blackKing &&
      (!Brain.isCorner(blackKing.square) ||
        Brain.kingDistance(whiteKing.square, blackKing.square) <= 2);
    return {
      matePenalty: chess.isCheckmate() ? 0 : 1,
      rookCapturePenalty: rookIsSafe ? 0 : 1,
      stalematePenalty: !chess.isCheckmate() && chess.isStalemate() ? 1 : 0,
      diagonalChainPenalty:
        whiteRook &&
        whiteKing &&
        blackKing &&
        Brain.isThreePieceDiagonalChain(whiteKing.square, whiteRook.square, blackKing.square)
          ? 1
          : 0,
      boxSize:
        whiteRook && blackKing
          ? Brain.getRookOneDimensionalBoxSize(whiteRook.square, blackKing.square)
          : 99,
      edgeTrapPenalty:
        shouldLiftRookOnCorner
          ? move?.piece === "r"
            ? 0
            : 1
          : 0,
      ownLinePenalty:
        whiteRook && whiteKing && Brain.sharesRankOrFile(whiteRook.square, whiteKing.square)
          ? 1
          : 0,
      saveRookDistanceScore: isSavingRook ? -rookMoveDistance : 0,
      edgeKingWalkPenalty:
        shouldWalkKingOnEdge
          ? move?.piece === "k"
            ? 0
            : 1
          : 0,
      waitingPenalty: kingsAreKnightMove ? (isWaitingMove ? 0 : 1) : 0,
      waitingRookDistanceScore:
        isWaitingMove && whiteRook && blackKing
          ? -Brain.manhattanDistance(whiteRook.square, blackKing.square)
          : 0,
      kingEdgePenalty: whiteKing && Brain.edgeDistance(whiteKing.square) === 0 ? 1 : 0,
      kingOppositionPenalty:
        whiteKing && blackKing && Brain.hasDirectKingOpposition(whiteKing.square, blackKing.square)
          ? 0
          : 1,
      kingDistance:
        whiteKing && blackKing ? Brain.kingDistance(whiteKing.square, blackKing.square) : 99,
      kingManhattanDistance:
        whiteKing && blackKing
          ? Brain.manhattanDistance(whiteKing.square, blackKing.square)
          : 99,
    };
  }

  static compareRookWhiteScores(
    a: RookWhiteMoveScore,
    b: RookWhiteMoveScore
  ): number {
    return (
      a.matePenalty - b.matePenalty ||
      a.rookCapturePenalty - b.rookCapturePenalty ||
      a.stalematePenalty - b.stalematePenalty ||
      a.diagonalChainPenalty - b.diagonalChainPenalty ||
      a.boxSize - b.boxSize ||
      a.edgeTrapPenalty - b.edgeTrapPenalty ||
      a.ownLinePenalty - b.ownLinePenalty ||
      a.saveRookDistanceScore - b.saveRookDistanceScore ||
      a.edgeKingWalkPenalty - b.edgeKingWalkPenalty ||
      a.waitingPenalty - b.waitingPenalty ||
      a.kingEdgePenalty - b.kingEdgePenalty ||
      a.kingOppositionPenalty - b.kingOppositionPenalty ||
      a.kingDistance - b.kingDistance ||
      a.kingManhattanDistance - b.kingManhattanDistance ||
      a.waitingRookDistanceScore - b.waitingRookDistanceScore
    );
  }

  static getIdealQueenWhiteMoves(fen: string): string[] {
    const chess = Brain.getChess(fen);
    const moves = chess.moves();
    if (chess.turn() !== "w" || moves.length === 0) {
      return moves;
    }
    const scoredMoves = moves
      .map((san) => ({
        san,
        score: Brain.scoreQueenWhiteMove(fen, san),
      }))
      .sort((a, b) => Brain.compareQueenWhiteScores(a.score, b.score));
    const best = scoredMoves[0].score;
    return scoredMoves
      .filter((move) => Brain.queenWhiteScoresTie(move.score, best))
      .map((move) => move.san);
  }

  static scoreQueenWhiteMove(fen: string, san: string): QueenWhiteMoveScore {
    const beforeQueen = Brain.findPiece(fen, "w", "q");
    const startingCage = Brain.getQueenTwoSquareCage(fen, "b");
    const shouldWalkCageKing = startingCage != null;
    const chess = Brain.getChess(fen);
    const move = chess.move(san);
    const resultFen = chess.fen();
    const whiteQueen = Brain.findPiece(resultFen, "w", "q");
    const whiteKing = Brain.findPiece(resultFen, "w", "k");
    const blackKing = Brain.findPiece(resultFen, "b", "k");
    const resultCage = Brain.getQueenTwoSquareCage(resultFen);
    return {
      matePenalty: chess.isCheckmate() ? 0 : 1,
      queenCapturePenalty: Brain.blackCanTakeWhiteMajorPiece(resultFen, "q")
        ? 1
        : 0,
      stalematePenalty: !chess.isCheckmate() && chess.isStalemate() ? 1 : 0,
      boxArea:
        whiteQueen && blackKing
          ? Brain.getQueenBoxArea(whiteQueen.square, blackKing.square)
          : 99,
      cagePenalty: resultCage ? 0 : 1,
      cageQueenMovePenalty:
        !shouldWalkCageKing && resultCage ? (move?.piece === "q" ? 0 : 1) : 0,
      nonCageCheckPenalty:
        chess.isCheck() && !chess.isCheckmate() && !resultCage ? 1 : 0,
      queenKnightMovePenalty:
        whiteQueen &&
        blackKing &&
        Brain.isKnightMove(whiteQueen.square, blackKing.square)
          ? 0
          : 1,
      cageKingApproach:
        shouldWalkCageKing && resultCage && whiteKing && whiteQueen
          ? move?.piece === "k"
            ? Brain.getQueenCageKingApproachDistance(
                whiteKing.square,
                whiteQueen.square,
                startingCage.corner
              )
            : 99
          : 0,
      kingDistance:
        whiteKing && blackKing ? Brain.kingDistance(whiteKing.square, blackKing.square) : 99,
      moveDistance: Brain.getQueenMoveDistance(
        beforeQueen?.square,
        whiteQueen?.square,
        move?.piece
      ),
    };
  }

  static compareQueenWhiteScores(
    a: QueenWhiteMoveScore,
    b: QueenWhiteMoveScore
  ): number {
    return (
      a.matePenalty - b.matePenalty ||
      a.queenCapturePenalty - b.queenCapturePenalty ||
      a.stalematePenalty - b.stalematePenalty ||
      a.cagePenalty - b.cagePenalty ||
      a.cageQueenMovePenalty - b.cageQueenMovePenalty ||
      a.nonCageCheckPenalty - b.nonCageCheckPenalty ||
      a.cageKingApproach - b.cageKingApproach ||
      a.boxArea - b.boxArea ||
      a.queenKnightMovePenalty - b.queenKnightMovePenalty ||
      a.kingDistance - b.kingDistance ||
      a.moveDistance - b.moveDistance
    );
  }

  static queenWhiteScoresTie(
    a: QueenWhiteMoveScore,
    b: QueenWhiteMoveScore
  ): boolean {
    return (
      a.matePenalty === b.matePenalty &&
      a.queenCapturePenalty === b.queenCapturePenalty &&
      a.stalematePenalty === b.stalematePenalty &&
      a.cagePenalty === b.cagePenalty &&
      a.cageQueenMovePenalty === b.cageQueenMovePenalty &&
      a.nonCageCheckPenalty === b.nonCageCheckPenalty &&
      a.cageKingApproach === b.cageKingApproach &&
      a.boxArea === b.boxArea &&
      a.queenKnightMovePenalty === b.queenKnightMovePenalty &&
      a.kingDistance === b.kingDistance &&
      a.moveDistance === b.moveDistance
    );
  }

  static findPiece(fen: string, color: "w" | "b", type: string) {
    return Brain.getChess(fen)
      .board()
      .flat()
      .find((piece) => piece?.color === color && piece.type === type);
  }

  static isMajorPieceBetweenKings(
    majorPiece: { square: Square },
    whiteKing: { square: Square },
    blackKing: { square: Square }
  ): boolean {
    const p = Brain.squareCoords(majorPiece.square);
    const w = Brain.squareCoords(whiteKing.square);
    const b = Brain.squareCoords(blackKing.square);
    return (
      Brain.isStrictlyBetween(p.rank, w.rank, b.rank) ||
      Brain.isStrictlyBetween(p.file, w.file, b.file)
    );
  }

  static isMajorPieceOnAdjacentEdgeLine(
    majorPieceSquare: Square,
    blackKingSquare: Square
  ): boolean {
    const majorPiece = Brain.squareCoords(majorPieceSquare);
    const blackKing = Brain.squareCoords(blackKingSquare);
    return (
      (blackKing.file === 0 && majorPiece.file === 1) ||
      (blackKing.file === 7 && majorPiece.file === 6) ||
      (blackKing.rank === 0 && majorPiece.rank === 1) ||
      (blackKing.rank === 7 && majorPiece.rank === 6)
    );
  }

  static blackKingStaysOnEdge(fen: string): boolean {
    const moves = Brain.getChess(fen).moves();
    return (
      moves.length > 0 &&
      moves.every((san) => {
        const nextChess = Brain.getChess(fen);
        nextChess.move(san);
        const blackKing = Brain.findPiece(nextChess.fen(), "b", "k");
        return blackKing != null && Brain.edgeDistance(blackKing.square) === 0;
      })
    );
  }

  static maxBlackKingEdgeDistanceAfterReplies(fen: string): number {
    const moves = Brain.getChess(fen).moves();
    if (moves.length === 0) {
      const blackKing = Brain.findPiece(fen, "b", "k");
      return blackKing ? Brain.edgeDistance(blackKing.square) : 0;
    }
    return Math.max(
      ...moves.map((san) => {
        const nextChess = Brain.getChess(fen);
        nextChess.move(san);
        const blackKing = Brain.findPiece(nextChess.fen(), "b", "k");
        return blackKing ? Brain.edgeDistance(blackKing.square) : 0;
      })
    );
  }

  static isStrictlyBetween(value: number, a: number, b: number): boolean {
    return value > Math.min(a, b) && value < Math.max(a, b);
  }

  static whiteKingTakesDirectRookOpposition(
    startFen: string,
    resultFen: string,
    movePiece?: string
  ): boolean {
    if (movePiece !== "k") {
      return false;
    }
    const startWhiteKing = Brain.findPiece(startFen, "w", "k");
    const startBlackKing = Brain.findPiece(startFen, "b", "k");
    const resultWhiteKing = Brain.findPiece(resultFen, "w", "k");
    const resultBlackKing = Brain.findPiece(resultFen, "b", "k");
    return (
      Brain.getChess(resultFen).turn() === "b" &&
      startWhiteKing != null &&
      startBlackKing != null &&
      resultWhiteKing != null &&
      resultBlackKing != null &&
      Brain.sameSquareColor(startWhiteKing.square, startBlackKing.square) &&
      Brain.hasDirectKingOpposition(
        resultWhiteKing.square,
        resultBlackKing.square
      )
    );
  }

  static whiteCanTakeDirectKingOpposition(fen: string): boolean {
    if (Brain.getChess(fen).turn() !== "w") {
      return false;
    }
    return Brain.getChess(fen)
      .moves()
      .some((san) => {
        const nextChess = Brain.getChess(fen);
        const move = nextChess.move(san);
        const whiteKing = Brain.findPiece(nextChess.fen(), "w", "k");
        const blackKing = Brain.findPiece(nextChess.fen(), "b", "k");
        return (
          move?.piece === "k" &&
          whiteKing != null &&
          blackKing != null &&
          Brain.hasDirectKingOpposition(whiteKing.square, blackKing.square)
        );
      });
  }

  static blackKingAttacksWhiteMajorPiece(
    fen: string,
    pieceType: "r" | "q"
  ): boolean {
    const blackKing = Brain.findPiece(fen, "b", "k");
    const whiteMajorPiece = Brain.findPiece(fen, "w", pieceType);
    return (
      blackKing != null &&
      whiteMajorPiece != null &&
      Brain.kingDistance(blackKing.square, whiteMajorPiece.square) <= 1
    );
  }

  static hasDirectKingOpposition(a: Square, b: Square): boolean {
    const first = Brain.squareCoords(a);
    const second = Brain.squareCoords(b);
    return (
      (first.rank === second.rank && Math.abs(first.file - second.file) === 2) ||
      (first.file === second.file && Math.abs(first.rank - second.rank) === 2)
    );
  }

  static squareCoords(square: Square) {
    return {
      file: square.charCodeAt(0) - "a".charCodeAt(0),
      rank: Number(square[1]) - 1,
    };
  }

  //

  static hash(fen?: string): string {
    if (!fen) fen = Brain.getState().fen;
    if (Brain.getState().orientationIsWhite && Brain.getFen() === fen) {
      return "";
    }
    return [
      Brain.getState().orientationIsWhite ? "w" : "b",
      fen.replaceAll(" ", "_"),
    ].join("//");
  }

  static getFenFromHash(): string | null {
    const hash = window.location.hash.split("#")[1];
    if (hash === undefined || hash === "") {
      return null;
    }
    const parts = hash.split("//");
    if (parts.length !== 2) {
      return null;
    }
    try {
      return Brain.getFen(decodeURI(parts[1]).replaceAll("_", " "));
    } catch {
      return null;
    }
  }

  static getOrientationFromHash(): boolean {
    const hash = window.location.hash.split("#")[1];
    const parts = hash?.split("//") || [];
    return parts.length === 2 ? parts[0] === "w" : true;
  }

  static getEndgameStartingFen(): string {
    return (
      Brain.history.states[Brain.history.states.length - 1]?.fen ||
      Brain.getState()?.fen ||
      getEndgame(Brain.endgameId).fen
    );
  }

  static getInitialState(): StateType {
    const hashFen = Brain.getFenFromHash();
    if (Brain.view === View.endgame) {
      if (!Brain.hasSelectedEndgame()) {
        return {
          fen: Brain.ENDGAME_PICKER_FEN,
          startingFen: undefined,
          orientationIsWhite: true,
          logs: [],
        };
      }
      return hashFen
        ? {
            fen: hashFen,
            startingFen: undefined,
            orientationIsWhite: true,
            logs: [],
            endgame_started_at_ms: Date.now(),
          }
        : Brain.getRandomEndgameState();
    }
    var fen = hashFen || Brain.getFen();
    var orientationIsWhite = Brain.getOrientationFromHash();
    return {
      fen,
      startingFen: undefined,
      orientationIsWhite,
      logs: [] as LogType[],
    };
  }

  static getRandomEndgameState(): StateType {
    if (!Brain.hasSelectedEndgame()) {
      return {
        fen: Brain.ENDGAME_PICKER_FEN,
        startingFen: undefined,
        orientationIsWhite: true,
        logs: [],
      };
    }
    return {
      fen: Brain.getRandomEndgameFen(Brain.endgameId!),
      startingFen: undefined,
      orientationIsWhite: true,
      logs: [],
      endgame_started_at_ms: Date.now(),
    };
  }

  static getRandomEndgameFen(id: EndgameId): string {
    const pieces = Brain.getEndgamePieces(getEndgame(id).fen);
    for (let attempt = 0; attempt < 1000; attempt++) {
      const fen = Brain.getRandomEndgameFenAttempt(pieces);
      if (fen) {
        return fen;
      }
    }
    return getEndgame(id).fen;
  }

  static getEndgamePieces(fen: string): EndgamePiece[] {
    return Brain.getChess(fen)
      .board()
      .flat()
      .filter((piece) => piece !== null)
      .map((piece) => ({
        color: piece!.color,
        type: piece!.type,
        isPawn: piece!.type === "p",
      }));
  }

  static getRandomEndgameFenAttempt(pieces: EndgamePiece[]): string | null {
    const availableSquares = Brain.allSquares();
    const placements: (EndgamePiece & { square: Square })[] = [];
    for (const piece of pieces) {
      const candidates = availableSquares.filter(
        (square) => !piece.isPawn || !["1", "8"].includes(square[1])
      );
      if (candidates.length === 0) {
        return null;
      }
      const square = candidates[Math.floor(Math.random() * candidates.length)];
      availableSquares.splice(availableSquares.indexOf(square), 1);
      placements.push({ ...piece, square });
    }
    const fen = `${Brain.boardFenFromPlacements(placements)} w - - 0 1`;
    if (!Brain.isLegalEndgameStart(fen)) {
      return null;
    }
    return fen;
  }

  static boardFenFromPlacements(
    placements: (EndgamePiece & { square: Square })[]
  ): string {
    const pieceBySquare = new Map(
      placements.map((piece) => [
        piece.square,
        piece.color === "w" ? piece.type.toUpperCase() : piece.type,
      ])
    );
    return Array.from({ length: 8 }, (_, rankIndex) => {
      const rank = 8 - rankIndex;
      let empty = 0;
      let row = "";
      for (let file = 0; file < 8; file++) {
        const square = `${String.fromCharCode("a".charCodeAt(0) + file)}${rank}` as Square;
        const piece = pieceBySquare.get(square);
        if (!piece) {
          empty += 1;
        } else {
          if (empty > 0) {
            row += empty;
            empty = 0;
          }
          row += piece;
        }
      }
      return row + (empty > 0 ? empty : "");
    }).join("/");
  }

  static isLegalEndgameStart(fen: string): boolean {
    try {
      const whiteToMove = Brain.getChess(fen);
      if (whiteToMove.isCheck() || whiteToMove.moves().length === 0) {
        return false;
      }
      const blackToMove = Brain.getChess(fen.replace(" w ", " b "));
      return !blackToMove.isCheck() && blackToMove.moves().length > 0;
    } catch {
      return false;
    }
  }

  static allSquares(): Square[] {
    return Array.from({ length: 8 }, (_, file) =>
      Array.from(
        { length: 8 },
        (_, rank) =>
          `${String.fromCharCode("a".charCodeAt(0) + file)}${rank + 1}` as Square
      )
    ).flat();
  }

  static loadMoves(o: { sans: string[]; orientationIsWhite: boolean }) {
    return Promise.resolve(o)
      .then(({ sans, orientationIsWhite }) => {
        const chess = Brain.getChess();
        clearTimeout(Brain.timeout);
        const logs: LogType[] = [];
        return sans.map((san) => {
          const fen = chess.fen();
          chess.move(san);
          logs.push({ fen, san });
          return {
            fen: chess.fen(),
            startingFen: fen as string | undefined,
            orientationIsWhite,
            logs: logs.slice(),
          };
        });
      })
      .then((moveStates) => {
        const states = moveStates
          .reverse()
          .concat(Brain.history.states.slice(Brain.history.index));
        Brain.updateHistory({
          index: states.length - 2,
          states,
        });
      });
  }

  static setInitialState() {
    const startingState = Brain.getInitialState();
    Brain.setState(startingState);
    Promise.resolve()
      .then(() =>
        Brain.view === View.endgame ? undefined : Brain.fetchOpenings()
      )
      .then(() => {
        if (
          Brain.view === View.lichess_mistakes ||
          Brain.view === View.traverse
        ) {
          startTraverseF(startingState);
        } else if (Brain.view === View.lichess_id) {
          getGameById(Brain.lichessUsername!).then(Brain.loadMoves);
        } else if (Brain.view === View.lichess_latest) {
          getLatestGame(Brain.lichessUsername!).then(Brain.loadMoves);
        }
      });
  }

  static fetchOpenings() {
    return Promise.all(
      ["a.tsv", "b.tsv", "c.tsv", "d.tsv", "e.tsv"].map((f) =>
        fetch(`/eco/dist/${f}`)
          .then((response) => response.text())
          .then((text) =>
            text
              .split("\n")
              .slice(1)
              .filter((l) => l)
              .map((l) => l.split("\t"))
              .map(([eco, name, _pgn, _uci, epd]) => [
                Brain.normalizeFenForOpening(epd),
                `${eco} ${name}`,
              ])
          )
      )
    )
      .then((arr) =>
        arr
          .flatMap((a) => a)
          .concat([
            [Brain.normalizeFenForOpening(Brain.getFen()), "starting position"],
          ])
      )
      .then(Object.fromEntries)
      .then(Brain.updateOpenings);
  }

  static normalizeFenForOpening(fen: string) {
    return fen.split(" ")[0];
  }

  static getOpening(fen: string) {
    return (Brain.openings || {})[Brain.normalizeFenForOpening(fen)];
  }

  //

  static getState(): StateType {
    return Brain.history.states[Brain.history.index];
  }

  static genState<T extends StateType>(startingState: T, san: string): T {
    return {
      ...startingState,
      fen: Brain.getFen(startingState.fen, san),
      startingFen: startingState.fen,
      logs: startingState.logs.concat({
        fen: startingState.fen,
        san,
      }),
    };
  }

  static setState(state: StateType) {
    clearTimeout(Brain.timeout);
    const states = [state].concat(
      Brain.history.states.slice(Brain.history.index)
    );
    Brain.updateHistory({
      index: 0,
      states,
    });
    Brain.maybeReply(state);
  }

  static resetState(state: StateType) {
    clearTimeout(Brain.timeout);
    Brain.updateHistory({
      index: 0,
      states: [state],
    });
    Brain.maybeReply(state);
  }

  static isMyTurn(fen: string, orientationIsWhite?: boolean) {
    if (orientationIsWhite === undefined)
      orientationIsWhite = Brain.getState().orientationIsWhite;
    return Brain.getChess(fen).turn() === (orientationIsWhite ? "w" : "b");
  }

  //

  static maybeReply(state: StateType) {
    if (
      Brain.view !== View.endgame &&
      Brain.view !== View.lichess_latest &&
      Brain.autoreplyRef.current?.checked &&
      !Brain.isMyTurn(state.fen, state.orientationIsWhite)
    ) {
      Brain.timeout = setTimeout(Brain.playWeighted, settings.REPLY_DELAY_MS);
    }
  }

  //

  static startOver() {
    if (Brain.view === View.endgame) {
      if (!Brain.hasSelectedEndgame()) return;
      Brain.resetState(Brain.getRandomEndgameState());
      return;
    }
    const original = Brain.history.states[Brain.history.states.length - 1];
    Brain.setState(original);
  }

  static newGame() {
    if (Brain.view === View.endgame) {
      if (!Brain.hasSelectedEndgame()) return;
      Brain.resetState(Brain.getRandomEndgameState());
      return;
    }
    if (Brain.view === View.lichess_latest) {
      if (latestGameCache.sans.length > 0) {
        Brain.setState({
          fen: Brain.getFen(),
          startingFen: undefined,
          orientationIsWhite: latestGameCache.orientationIsWhite,
          logs: [],
        });
        return;
      }
    }
    Brain.setState({
      fen: Brain.getFen(),
      startingFen: undefined,
      orientationIsWhite: !Brain.getState().orientationIsWhite,
      logs: [],
    });
  }

  static undo() {
    if (Brain.history.index + 1 >= Brain.history.states.length) {
      return alert("no undo available");
    }
    Brain.updateHistory({
      ...Brain.history,
      index: Brain.history.index + 1,
    });
  }

  static redo() {
    if (Brain.view === View.lichess_latest) {
      if (latestGameCache.sans.length > 0) {
        const logs = Brain.getState().logs;
        const onLine = logs.every(
          (log, i) => log.san === latestGameCache.sans[i]
        );
        if (onLine && logs.length < latestGameCache.sans.length) {
          const nextSan = latestGameCache.sans[logs.length];
          Brain.playMove(nextSan);
          return;
        }
      }
    }
    if (Brain.history.index <= 0) {
      return alert("no redo available");
    }
    Brain.updateHistory({
      ...Brain.history,
      index: Brain.history.index - 1,
    });
  }

  //

  static playMove(san?: string) {
    if (!san) {
      return alert("no move to play");
    }
    if (Brain.view === View.endgame) {
      if (!Brain.hasSelectedEndgame()) {
        return;
      }
      Brain.playEndgameMove(san);
      return;
    }
    const state = Brain.getState();
    if (state.traverse?.states?.slice(-1)[0].fen === state.fen) {
      traverseF(state.traverse, san);
    } else {
      Brain.setState(Brain.genState(Brain.getState(), san));
    }
  }

  static playWeighted() {
    if (Brain.view === View.endgame) {
      return alert("play weighted is not available in endgame mode");
    }
    const fen = Brain.getState().fen;
    lichessF(fen, {
      username:
        Brain.isMyTurn(fen) || Brain.view !== View.lichess_vs
          ? undefined
          : Brain.lichessUsername,
      prepareNext: true,
    })
      .then((moves) => {
        const weights = moves.map((move: LiMove) =>
          Math.pow(move.total, settings.WEIGHTED_POWER)
        );
        var choice = Math.random() * weights.reduce((a, b) => a + b, 0);
        for (let i = 0; i < weights.length; i++) {
          choice -= weights[i];
          if (choice <= 0) return moves[i].san;
        }
      })
      .then((san) => Brain.playMove(san));
  }

  static playBest() {
    if (Brain.view === View.endgame) {
      if (!Brain.hasSelectedEndgame()) return;
      const moves = Brain.getIdealEndgameWhiteMoves(Brain.getState().fen);
      return Brain.playMove(moves[Math.floor(Math.random() * moves.length)]);
    }
    Brain.getBest(Brain.getState().fen).then((san) => Brain.playMove(san));
  }

  static getBest(fen: string): Promise<string> {
    if (Brain.view === View.endgame) {
      if (!Brain.hasSelectedEndgame()) {
        return Promise.resolve("");
      }
      const moves = Brain.getIdealEndgameWhiteMoves(fen);
      return Promise.resolve(moves[Math.floor(Math.random() * moves.length)]);
    }
    if (Brain.isMyTurn(fen)) {
      const novelty = Brain.getNovelty(fen);
      if (novelty !== null) {
        return Promise.resolve(novelty);
      }
    }
    return lichessF(fen, { prepareNext: true })
      .then((moves) => moves.sort((a, b) => b.score - a.score))
      .then((moves) => moves[0]?.san);
  }

  static getNovelty(fen?: string): string | null {
    if (!fen) fen = Brain.getState().fen;
    return StorageW.getNovelty(fen);
  }

  static clearNovelty() {
    StorageW.setNovelty(Brain.getState().fen, null);
  }

  static clearStorage() {
    StorageW.clear(0);
  }

  //

  static traverse() {
    window.location.href = `/traverse#${Brain.hash()}`;
  }

  static speedrun() {
    window.location.href = `/speedrun#${Brain.hash()}`;
  }

  static traps() {
    window.location.href = `/traps#${Brain.hash()}`;
  }

  static endgames() {
    window.location.href = "/endgames";
  }

  static selectEndgame(id: EndgameId) {
    window.location.href = `/endgames/${id}`;
  }

  static findMistakes(username: string) {
    if (!username) return alert("no username provided");

    window.location.href = `/lichess/${username}/mistakes#${Brain.hash()}`;
  }

  static playVs(username: string) {
    if (!username) return alert("no username provided");

    window.location.href = `/lichess/${username}/vs#${Brain.hash()}`;
  }

  static importLatestGame(username: string) {
    if (!username) return alert("no username provided");

    window.location.href = `/lichess/${username}/latest`;
  }

  static home() {
    if (Brain.showHelp) return Brain.updateShowHelp(false);
    if (Brain.view === View.endgame) {
      window.location.assign("/");
      return;
    }
    setTimeout(() => {
      window.location.assign(`/#${Brain.hash()}`);
      if (Brain.view === undefined) window.location.reload();
    });
  }

  //

  static help() {
    Brain.updateShowHelp(!Brain.showHelp);
  }

  static toggleAutoreply() {
    Brain.autoreplyRef.current!.checked = !Brain.autoreplyRef.current!.checked;
  }

  static setNovelty(fen: string, san: string) {
    StorageW.setNovelty(fen, san);
    return new Promise<void>((resolve) => {
      function helper() {
        if (StorageW.getNovelty(fen) === san) return resolve();
        setTimeout(helper, 100);
      }
      helper();
    });
  }

  // board
  static moveFromTo(from: string, to: string) {
    const state = Brain.getState();
    if (Brain.view === View.endgame && !Brain.hasSelectedEndgame()) {
      return false;
    }
    if (
      Brain.view === View.endgame &&
      Brain.getEndgameTerminalOutcome(state.fen)
    ) {
      return false;
    }
    const chess = Brain.getChess(state.fen);
    const move = chess.move({ from: from as Square, to: to as Square });
    if (move !== null) {
      if (
        Brain.isMyTurn(state.fen) &&
        Brain.view !== View.traverse &&
        Brain.view !== View.endgame
      ) {
        Brain.setNovelty(state.fen, move.san);
      }
      Brain.playMove(move.san);
      return true;
    } else {
      return false;
    }
  }

  static playEndgameMove(san: string) {
    if (!Brain.hasSelectedEndgame()) {
      return;
    }
    const state = Brain.getState();
    const chess = Brain.getChess(state.fen);
    if (Brain.getEndgameTerminalOutcome(state.fen)) {
      return;
    }
    if (chess.turn() === "b") {
      Brain.playEndgameOpponentMove(san, state, chess);
      return;
    }
    if (chess.turn() !== "w") return;
    const whiteMove = chess.move(san);
    if (whiteMove === null) {
      return;
    }
    const shouldReply = Brain.autoreplyRef.current?.checked;
    const blackReplyCandidates = shouldReply
      ? Brain.getEndgameOpponentCandidates(chess)
      : { moves: [], idealMoves: [] };
    const opponentSan = shouldReply
      ? Brain.chooseEndgameOpponentMove(blackReplyCandidates.idealMoves)
      : undefined;
    const now = Date.now();
    const previousLog = state.logs[state.logs.length - 1];
    const previousMoveAt =
      previousLog?.created_at_ms ?? state.endgame_started_at_ms;
    const endgameLogFields = Brain.getEndgameLogFields(
      state.fen,
      whiteMove.san,
      chess.fen()
    );
    const terminalOutcome = Brain.getEndgameTerminalOutcome(chess.fen());
    const nextState = {
      ...state,
      fen: chess.fen(),
      startingFen: state.fen,
      orientationIsWhite: true,
      endgame_finished_at_ms: terminalOutcome ? now : undefined,
      logs: state.logs.concat({
        fen: state.fen,
        san: whiteMove.san,
        ideal_choices: shouldReply
          ? blackReplyCandidates.idealMoves.length
          : undefined,
        num_choices: shouldReply ? blackReplyCandidates.moves.length : undefined,
        created_at_ms: now,
        duration_ms:
          previousMoveAt === undefined
            ? undefined
            : now - previousMoveAt,
        ...endgameLogFields,
      }),
    };
    Brain.setState(nextState);
    if (opponentSan && !terminalOutcome) {
      Brain.timeout = setTimeout(() => {
        if (Brain.getState().fen !== nextState.fen) {
          return;
        }
        Brain.playEndgameOpponentMove(
          opponentSan,
          nextState,
          Brain.getChess(nextState.fen)
        );
      }, settings.ENDGAME_REPLY_DELAY_MS);
    }
  }

  static chooseEndgameOpponentMove(idealMoves: string[]): string | undefined {
    if (idealMoves.length === 0) {
      return undefined;
    }
    return idealMoves[Math.floor(Math.random() * idealMoves.length)];
  }

  static getEndgameOpponentCandidates(chess: Chess): {
    moves: string[];
    idealMoves: string[];
  } {
    const moves = chess.moves();
    if (moves.length === 0) {
      return { moves, idealMoves: [] };
    }
    if (Brain.endgameId === "rook") {
      return {
        moves,
        idealMoves: Brain.getIdealRookBlackMoves(chess, moves),
      };
    }
    if (Brain.endgameId === "queen") {
      return {
        moves,
        idealMoves: Brain.getIdealQueenBlackMoves(chess, moves),
      };
    }
    const scoredMoves = Brain.getEndgameMoveScores(chess.fen(), moves);
    scoredMoves.sort(
      (a, b) =>
        Brain.compareEndgamePositionScores(a.score, b.score) || a.index - b.index
    );
    const best = scoredMoves[0];
    const idealMoves = scoredMoves
      .filter(
        (move) => Brain.compareEndgamePositionScores(move.score, best.score) === 0
      )
      .map((move) => move.san);
    return {
      moves,
      idealMoves,
    };
  }

  static getIdealRookBlackMoves(chess: Chess, moves: string[]): string[] {
    const scoredMoves = moves
      .map((san) => ({
        san,
        score: Brain.scoreRookBlackMove(chess.fen(), san),
      }))
      .sort((a, b) => Brain.compareRookBlackScores(a.score, b.score));
    const best = scoredMoves[0].score;
    return scoredMoves
      .filter((move) => Brain.compareRookBlackScores(move.score, best) === 0)
      .map((move) => move.san);
  }

  static scoreRookBlackMove(fen: string, san: string): RookBlackMoveScore {
    const startingBlackKing = Brain.findPiece(fen, "b", "k");
    const startingWhiteRook = Brain.findPiece(fen, "w", "r");
    const startingWhiteKing = Brain.findPiece(fen, "w", "k");
    const rookCutAxis =
      startingBlackKing && startingWhiteRook && startingWhiteKing
        ? Brain.getRookCutAxis(startingWhiteRook, startingWhiteKing, startingBlackKing)
        : null;
    const shouldAvoidOpposition =
      startingBlackKing != null &&
      startingWhiteRook != null &&
      Brain.edgeDistance(startingBlackKing.square) <= 1 &&
      Brain.manhattanDistance(startingBlackKing.square, startingWhiteRook.square) > 3;
    const chess = Brain.getChess(fen);
    const move = chess.move(san);
    const whiteRook = Brain.findPiece(chess.fen(), "w", "r");
    const whiteKing = Brain.findPiece(chess.fen(), "w", "k");
    const blackKing = Brain.findPiece(chess.fen(), "b", "k");
    return {
      captureRookPenalty: move?.captured === "r" ? 0 : 1,
      oppositionPenalty:
        shouldAvoidOpposition &&
        whiteKing &&
        blackKing &&
        Brain.hasDirectKingOpposition(whiteKing.square, blackKing.square)
          ? 1
          : 0,
      rookCutGap:
        rookCutAxis && whiteRook && blackKing
          ? Brain.getAxisDistance(blackKing.square, whiteRook.square, rookCutAxis)
          : 0,
      rookApproachKingEscapeBalance:
        whiteRook && whiteKing && blackKing
          ? Brain.manhattanDistance(blackKing.square, whiteRook.square) -
            Brain.manhattanDistance(blackKing.square, whiteKing.square)
          : 0,
    };
  }

  static compareRookBlackScores(
    a: RookBlackMoveScore,
    b: RookBlackMoveScore
  ): number {
    return (
      a.captureRookPenalty - b.captureRookPenalty ||
      a.oppositionPenalty - b.oppositionPenalty ||
      a.rookCutGap - b.rookCutGap ||
      a.rookApproachKingEscapeBalance - b.rookApproachKingEscapeBalance
    );
  }

  static getIdealQueenBlackMoves(chess: Chess, moves: string[]): string[] {
    const scoredMoves = moves
      .map((san, index) => ({
        san,
        score: Brain.scoreQueenBlackMove(chess.fen(), san, index),
      }))
      .sort((a, b) => Brain.compareQueenBlackScores(a.score, b.score));
    const best = scoredMoves[0].score;
    return scoredMoves
      .filter((move) => Brain.queenBlackScoresTie(move.score, best))
      .map((move) => move.san);
  }

  static scoreQueenBlackMove(
    fen: string,
    san: string,
    index: number
  ): QueenBlackMoveScore {
    const chess = Brain.getChess(fen);
    const move = chess.move(san);
    const blackKing = Brain.findPiece(chess.fen(), "b", "k");
    return {
      captureQueenPenalty: move?.captured === "q" ? 0 : 1,
      edgeDistanceScore: blackKing ? -Brain.edgeDistance(blackKing.square) : 0,
      index,
    };
  }

  static compareQueenBlackScores(
    a: QueenBlackMoveScore,
    b: QueenBlackMoveScore
  ): number {
    return (
      a.captureQueenPenalty - b.captureQueenPenalty ||
      a.edgeDistanceScore - b.edgeDistanceScore ||
      a.index - b.index
    );
  }

  static queenBlackScoresTie(
    a: QueenBlackMoveScore,
    b: QueenBlackMoveScore
  ): boolean {
    return (
      a.captureQueenPenalty === b.captureQueenPenalty &&
      a.edgeDistanceScore === b.edgeDistanceScore
    );
  }

  static getRookCutAxisPreservingOpponentMoves(
    chess: Chess,
    moves: string[],
    idealMoves: string[]
  ): string[] | null {
    if (
      Brain.endgameId !== "rook" ||
      chess.turn() !== "b" ||
      Brain.getMajorEndgamePhase(chess.fen(), "r") !== 2
    ) {
      return null;
    }
    const whiteRook = Brain.findPiece(chess.fen(), "w", "r");
    const whiteKing = Brain.findPiece(chess.fen(), "w", "k");
    const blackKing = Brain.findPiece(chess.fen(), "b", "k");
    if (!whiteRook || !whiteKing || !blackKing) {
      return null;
    }
    const rookCutAxis = Brain.getRookCutAxis(whiteRook, whiteKing, blackKing);
    if (!rookCutAxis) {
      return null;
    }
    const blackKingAxisValue = Brain.squareCoords(blackKing.square)[rookCutAxis];
    const preservesRookCutAxis = (san: string) => {
      const nextChess = Brain.getChess(chess.fen());
      const move = nextChess.move(san);
      const nextBlackKing = Brain.findPiece(nextChess.fen(), "b", "k");
      return (
        move?.piece === "k" &&
        nextBlackKing != null &&
        Brain.squareCoords(nextBlackKing.square)[rookCutAxis] ===
          blackKingAxisValue
      );
    };
    if (idealMoves.some(preservesRookCutAxis)) {
      return null;
    }
    const blackKingRookDistanceAfter = (san: string) => {
      const nextChess = Brain.getChess(chess.fen());
      nextChess.move(san);
      const nextWhiteRook = Brain.findPiece(nextChess.fen(), "w", "r");
      const nextBlackKing = Brain.findPiece(nextChess.fen(), "b", "k");
      return nextWhiteRook && nextBlackKing
        ? Brain.manhattanDistance(nextWhiteRook.square, nextBlackKing.square)
        : 99;
    };
    const bestIdealRookDistance = Math.min(
      ...idealMoves.map(blackKingRookDistanceAfter)
    );
    const axisPreservingMoves = moves
      .filter(preservesRookCutAxis)
      .filter((san) => blackKingRookDistanceAfter(san) <= bestIdealRookDistance);
    const hasStableAxisPreservingMove = axisPreservingMoves.some((san) => {
      const nextChess = Brain.getChess(chess.fen());
      nextChess.move(san);
      const score = Brain.getEndgamePositionScore(nextChess.fen());
      return (
        score.kind === "major" &&
        score.endgameId === "rook" &&
        score.rookBlackAllowsOpposition === 0
      );
    });
    return hasStableAxisPreservingMove ? axisPreservingMoves : null;
  }

  static getKnightAndBishopOpponentCandidates(
    chess: Chess,
    moves: string[]
  ): {
    moves: string[];
    idealMoves: string[];
  } {
    const scoredMoves = moves.map((san, index) => {
      const nextChess = Brain.getChess(chess.fen());
      nextChess.move(san);
      return {
        san,
        index,
        ...Brain.scoreKnightAndBishopOpponentPosition(nextChess.fen()),
      };
    });
    scoredMoves.sort(
      (a, b) =>
        a.captureMinorPenalty - b.captureMinorPenalty ||
        a.cornerEscapeScore - b.cornerEscapeScore ||
        a.centerDistance - b.centerDistance ||
        a.mobilityScore - b.mobilityScore ||
        a.whiteKingDistanceScore - b.whiteKingDistanceScore ||
        a.index - b.index
    );
    const best = scoredMoves[0];
    return {
      moves,
      idealMoves: scoredMoves
        .filter(
          (move) =>
            move.captureMinorPenalty === best.captureMinorPenalty &&
            move.cornerEscapeScore === best.cornerEscapeScore &&
            move.centerDistance === best.centerDistance &&
            move.mobilityScore === best.mobilityScore &&
            move.whiteKingDistanceScore === best.whiteKingDistanceScore
        )
        .map((move) => move.san),
    };
  }

  static scoreKnightAndBishopOpponentPosition(fen: string) {
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const blackKing = Brain.findPiece(fen, "b", "k");
    return {
      captureMinorPenalty: Brain.knightAndBishopPiecesPresent(fen) ? 1 : 0,
      cornerEscapeScore: -Brain.distanceToNearestBishopCorner(fen),
      centerDistance: blackKing ? Brain.centerDistance(blackKing.square) : 99,
      mobilityScore: -Brain.getLegalMoveCount(fen),
      whiteKingDistanceScore:
        whiteKing && blackKing
          ? -Brain.manhattanDistance(whiteKing.square, blackKing.square)
          : 0,
    };
  }

  static scoreMajorPieceOpponentPosition(fen: string, pieceType: "r" | "q") {
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const blackKing = Brain.findPiece(fen, "b", "k");
    const whiteMajorPiece = Brain.findPiece(fen, "w", pieceType);
    const majorPieceDistance =
      whiteMajorPiece && blackKing
        ? Brain.manhattanDistance(whiteMajorPiece.square, blackKing.square)
        : 0;
    return {
      capturePenalty: whiteMajorPiece ? 1 : 0,
      diagonalDistance:
        whiteKing && blackKing
          ? Brain.diagonalDistance(whiteKing.square, blackKing.square)
          : 0,
      whiteKingDistance:
        whiteKing && blackKing
          ? Brain.kingDistance(whiteKing.square, blackKing.square)
          : 0,
      whiteMajorPieceDistance:
        pieceType === "q" ? -majorPieceDistance : majorPieceDistance,
    };
  }

  static diagonalDistance(a: Square, b: Square): number {
    const first = Brain.squareCoords(a);
    const second = Brain.squareCoords(b);
    return Math.abs(
      Math.abs(first.file - second.file) - Math.abs(first.rank - second.rank)
    );
  }

  static isDiagonalKingMove(a: Square, b: Square): boolean {
    const first = Brain.squareCoords(a);
    const second = Brain.squareCoords(b);
    return (
      Math.abs(first.file - second.file) === 1 &&
      Math.abs(first.rank - second.rank) === 1
    );
  }

  static isKnightMove(a: Square, b: Square): boolean {
    const first = Brain.squareCoords(a);
    const second = Brain.squareCoords(b);
    const fileDistance = Math.abs(first.file - second.file);
    const rankDistance = Math.abs(first.rank - second.rank);
    return (
      (fileDistance === 1 && rankDistance === 2) ||
      (fileDistance === 2 && rankDistance === 1)
    );
  }

  static isThreePieceDiagonalChain(a: Square, middle: Square, b: Square): boolean {
    const first = Brain.squareCoords(a);
    const center = Brain.squareCoords(middle);
    const last = Brain.squareCoords(b);
    const firstFileDistance = center.file - first.file;
    const firstRankDistance = center.rank - first.rank;
    const secondFileDistance = last.file - center.file;
    const secondRankDistance = last.rank - center.rank;
    return (
      Math.abs(firstFileDistance) === 1 &&
      Math.abs(firstRankDistance) === 1 &&
      firstFileDistance === secondFileDistance &&
      firstRankDistance === secondRankDistance
    );
  }

  static sameSquareColor(a: Square, b: Square): boolean {
    const first = Brain.squareCoords(a);
    const second = Brain.squareCoords(b);
    return (first.file + first.rank) % 2 === (second.file + second.rank) % 2;
  }

  static knightAndBishopPiecesPresent(fen: string): boolean {
    return (
      Brain.findPiece(fen, "w", "b") != null &&
      Brain.findPiece(fen, "w", "n") != null
    );
  }

  static distanceToNearestBishopCorner(fen: string): number {
    const bishop = Brain.findPiece(fen, "w", "b");
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (!bishop || !blackKing) {
      return 99;
    }
    const bishopColor = Brain.squareColor(bishop.square);
    return Brain.corners()
      .filter((corner) => Brain.squareColor(corner) === bishopColor)
      .map((corner) => Brain.kingDistance(blackKing.square, corner))
      .sort((a, b) => a - b)[0];
  }

  static squareColor(square: Square): number {
    const coords = Brain.squareCoords(square);
    return (coords.file + coords.rank) % 2;
  }

  static corners(): Square[] {
    return ["a1", "a8", "h1", "h8"];
  }

  static isCorner(square: Square): boolean {
    return Brain.corners().includes(square);
  }

  static sharesRankOrFile(a: Square, b: Square): boolean {
    const first = Brain.squareCoords(a);
    const second = Brain.squareCoords(b);
    return first.file === second.file || first.rank === second.rank;
  }

  static edgeDistance(square: Square): number {
    const coords = Brain.squareCoords(square);
    return Math.min(
      coords.file,
      7 - coords.file,
      coords.rank,
      7 - coords.rank
    );
  }

  static centerDistance(square: Square): number {
    const coords = Brain.squareCoords(square);
    return Math.min(
      Math.abs(coords.file - 3),
      Math.abs(coords.file - 4)
    ) + Math.min(Math.abs(coords.rank - 3), Math.abs(coords.rank - 4));
  }

  static majorPieceBoxDistance(a: Square, b: Square): number {
    const first = Brain.squareCoords(a);
    const second = Brain.squareCoords(b);
    return Math.min(
      Math.abs(first.file - second.file),
      Math.abs(first.rank - second.rank)
    );
  }

  static getQueenBoxArea(
    whiteQueenSquare: Square,
    blackKingSquare: Square
  ): number {
    const queen = Brain.squareCoords(whiteQueenSquare);
    const black = Brain.squareCoords(blackKingSquare);
    const width =
      queen.file === black.file
        ? 8
        : black.file > queen.file
          ? 7 - queen.file
          : queen.file;
    const height =
      queen.rank === black.rank
        ? 8
        : black.rank > queen.rank
          ? 7 - queen.rank
          : queen.rank;
    return width * height;
  }

  static getQueenMoveDistance(
    beforeQueenSquare: Square | undefined,
    afterQueenSquare: Square | undefined,
    piece: string | undefined
  ): number {
    if (piece === "q" && beforeQueenSquare && afterQueenSquare) {
      return Brain.manhattanDistance(beforeQueenSquare, afterQueenSquare);
    }
    return piece ? 1 : 99;
  }

  static getQueenTwoSquareCage(
    fen: string,
    turnOverride?: "w" | "b"
  ): { corner: Square; pair: [Square, Square] } | null {
    const cageFen = turnOverride ? Brain.withFenTurn(fen, turnOverride) : fen;
    let chess: Chess;
    try {
      chess = Brain.getChess(cageFen);
    } catch {
      return null;
    }
    const blackKing = Brain.findPiece(cageFen, "b", "k");
    const moves = chess.moves();
    if (!blackKing || moves.length === 0) {
      return null;
    }
    for (const { corner, pair } of Brain.getQueenTwoSquareCagePairs()) {
      if (!pair.includes(blackKing.square)) {
        continue;
      }
      if (Brain.queenCagePairIsStable(cageFen, pair)) {
        return { corner, pair };
      }
    }
    return null;
  }

  static queenCagePairIsStable(fen: string, pair: [Square, Square]): boolean {
    return pair.every((blackKingSquare) => {
      const pairFen = Brain.withBlackKingOnSquare(fen, blackKingSquare, "b");
      if (pairFen === null) {
        return false;
      }
      const moves = Brain.getChess(pairFen).moves();
      return (
        moves.length > 0 &&
        moves.every((san) => {
          const nextChess = Brain.getChess(pairFen);
          nextChess.move(san);
          const nextBlackKing = Brain.findPiece(nextChess.fen(), "b", "k");
          return nextBlackKing != null && pair.includes(nextBlackKing.square);
        })
      );
    });
  }

  static withBlackKingOnSquare(
    fen: string,
    square: Square,
    turn: "w" | "b"
  ): string | null {
    const occupant = Brain.getChess(fen)
      .board()
      .flat()
      .find((piece) => piece?.square === square);
    if (occupant && !(occupant.color === "b" && occupant.type === "k")) {
      return null;
    }
    const placements = Brain.getChess(fen)
      .board()
      .flat()
      .filter((piece) => piece !== null && piece.square !== square)
      .map((piece) => ({
        color: piece!.color,
        type: piece!.type,
        isPawn: piece!.type === "p",
        square: piece!.color === "b" && piece!.type === "k" ? square : piece!.square,
      }));
    if (!placements.some((piece) => piece.color === "b" && piece.type === "k")) {
      return null;
    }
    const candidateFen = `${Brain.boardFenFromPlacements(placements)} ${turn} - - 0 1`;
    try {
      Brain.getChess(candidateFen);
    } catch {
      return null;
    }
    return candidateFen;
  }

  static getQueenTwoSquareCagePairs(): Array<{
    corner: Square;
    pair: [Square, Square];
  }> {
    return Brain.corners().flatMap((corner) => {
      const coords = Brain.squareCoords(corner);
      return [
        Brain.squareFromCoords(coords.file + 1, coords.rank),
        Brain.squareFromCoords(coords.file - 1, coords.rank),
        Brain.squareFromCoords(coords.file, coords.rank + 1),
        Brain.squareFromCoords(coords.file, coords.rank - 1),
      ]
        .filter((square): square is Square => square != null)
        .map((edgeSquare) => ({ corner, pair: [corner, edgeSquare] }));
    });
  }

  static getQueenCageKingApproachDistance(
    whiteKingSquare: Square,
    whiteQueenSquare: Square,
    corner: Square
  ): number {
    const targetDistances = Brain.boardSquares()
      .filter(
        (square) =>
          Brain.isKnightMove(square, corner) &&
          Brain.isKnightMove(square, whiteQueenSquare)
      )
      .map((square) => Brain.kingDistance(whiteKingSquare, square));
    return targetDistances.length === 0 ? 99 : Math.min(...targetDistances);
  }

  static withFenTurn(fen: string, turn: "w" | "b"): string {
    const fields = fen.split(" ");
    fields[1] = turn;
    return fields.join(" ");
  }

  static boardSquares(): Square[] {
    const squares: Square[] = [];
    for (let rank = 0; rank < 8; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const square = Brain.squareFromCoords(file, rank);
        if (square) {
          squares.push(square);
        }
      }
    }
    return squares;
  }

  static squareFromCoords(file: number, rank: number): Square | null {
    if (file < 0 || file > 7 || rank < 0 || rank > 7) {
      return null;
    }
    const fileName = String.fromCharCode("a".charCodeAt(0) + file);
    return `${fileName}${rank + 1}` as Square;
  }

  static getRookCutAxis(
    whiteRook: { square: Square },
    whiteKing: { square: Square },
    blackKing: { square: Square }
  ): "rank" | "file" | null {
    const rook = Brain.squareCoords(whiteRook.square);
    const white = Brain.squareCoords(whiteKing.square);
    const black = Brain.squareCoords(blackKing.square);
    if (Brain.isStrictlyBetween(rook.rank, white.rank, black.rank)) {
      return "rank";
    }
    if (Brain.isStrictlyBetween(rook.file, white.file, black.file)) {
      return "file";
    }
    return null;
  }

  static getRookOneDimensionalBoxSize(
    whiteRookSquare: Square,
    blackKingSquare: Square,
    axis?: "rank" | "file"
  ): number {
    if (!axis) {
      const rook = Brain.squareCoords(whiteRookSquare);
      const black = Brain.squareCoords(blackKingSquare);
      const rankSize =
        rook.rank === black.rank
          ? 99
          : Brain.getRookOneDimensionalBoxSize(
              whiteRookSquare,
              blackKingSquare,
              "rank"
            );
      const fileSize =
        rook.file === black.file
          ? 99
          : Brain.getRookOneDimensionalBoxSize(
              whiteRookSquare,
              blackKingSquare,
              "file"
            );
      return Math.min(rankSize, fileSize);
    }
    const rook = Brain.squareCoords(whiteRookSquare);
    const black = Brain.squareCoords(blackKingSquare);
    if (axis === "rank") {
      return black.rank > rook.rank ? 7 - rook.rank : rook.rank;
    }
    return black.file > rook.file ? 7 - rook.file : rook.file;
  }

  static getAxisDistance(
    a: Square,
    b: Square,
    axis: "rank" | "file"
  ): number {
    const first = Brain.squareCoords(a);
    const second = Brain.squareCoords(b);
    return Math.abs(first[axis] - second[axis]);
  }

  static otherAxis(axis: "rank" | "file"): "rank" | "file" {
    return axis === "rank" ? "file" : "rank";
  }

  static getLegalMoveCount(fen: string): number {
    return Brain.getChess(fen).moves().length;
  }

  static blackCanMoveTowardWhiteKing(fen: string): boolean {
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (!whiteKing || !blackKing) {
      return false;
    }
    const currentDistance = Brain.kingDistance(
      whiteKing.square,
      blackKing.square
    );
    return Brain.getChess(fen)
      .moves()
      .some((san) => {
        const nextChess = Brain.getChess(fen);
        nextChess.move(san);
        const nextBlackKing = Brain.findPiece(nextChess.fen(), "b", "k");
        return (
          nextBlackKing != null &&
          Brain.kingDistance(whiteKing.square, nextBlackKing.square) <
            currentDistance
        );
      });
  }

  static blackMustMoveAwayFromWhiteKing(fen: string): boolean {
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (!whiteKing || !blackKing) {
      return false;
    }
    const currentDistance = Brain.kingDistance(
      whiteKing.square,
      blackKing.square
    );
    const moves = Brain.getChess(fen).moves();
    return (
      moves.length > 0 &&
      moves.every((san) => {
        const nextChess = Brain.getChess(fen);
        nextChess.move(san);
        const nextBlackKing = Brain.findPiece(nextChess.fen(), "b", "k");
        return (
          nextBlackKing != null &&
          Brain.kingDistance(whiteKing.square, nextBlackKing.square) >
            currentDistance
        );
      })
    );
  }

  static blackCanTakeWhiteMajorPiece(
    fen: string,
    pieceType: "r" | "q"
  ): boolean {
    const whiteMajorPiece = Brain.findPiece(fen, "w", pieceType);
    if (!whiteMajorPiece) {
      return true;
    }
    return Brain.getChess(fen)
      .moves()
      .some((san) => {
        const nextChess = Brain.getChess(fen);
        nextChess.move(san);
        return !nextChess
          .board()
          .flat()
          .some((piece) => piece?.color === "w" && piece.type === pieceType);
      });
  }

  static blackCanTakeWhitePieces(fen: string, pieceTypes: string[]): boolean {
    const chess = Brain.getChess(fen);
    if (chess.turn() !== "b") {
      return false;
    }
    const currentCounts = Brain.getWhitePieceCounts(fen, pieceTypes);
    return chess.moves().some((san) => {
      const nextChess = Brain.getChess(fen);
      nextChess.move(san);
      const nextCounts = Brain.getWhitePieceCounts(nextChess.fen(), pieceTypes);
      return pieceTypes.some(
        (pieceType) => nextCounts.get(pieceType)! < currentCounts.get(pieceType)!
      );
    });
  }

  static whiteHasRequiredPieces(fen: string, pieceTypes: string[]): boolean {
    const counts = Brain.getWhitePieceCounts(fen, pieceTypes);
    const requiredCounts = Brain.countPieceTypes(pieceTypes);
    return Array.from(requiredCounts.entries()).every(
      ([pieceType, count]) => (counts.get(pieceType) ?? 0) >= count
    );
  }

  static getWhitePieceCounts(fen: string, pieceTypes: string[]): Map<string, number> {
    const pieceTypeSet = new Set(pieceTypes);
    return Brain.getChess(fen)
      .board()
      .flat()
      .filter(
        (piece) =>
          piece != null && piece.color === "w" && pieceTypeSet.has(piece.type)
      )
      .reduce((counts, piece) => {
        counts.set(piece!.type, (counts.get(piece!.type) ?? 0) + 1);
        return counts;
      }, Brain.initializePieceTypeCounts(pieceTypes));
  }

  static initializePieceTypeCounts(pieceTypes: string[]): Map<string, number> {
    return Array.from(new Set(pieceTypes)).reduce((counts, pieceType) => {
      counts.set(pieceType, 0);
      return counts;
    }, new Map<string, number>());
  }

  static countPieceTypes(pieceTypes: string[]): Map<string, number> {
    return pieceTypes.reduce((counts, pieceType) => {
      counts.set(pieceType, (counts.get(pieceType) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
  }

  static blackCanTakeKnightOrBishop(fen: string): boolean {
    if (!Brain.knightAndBishopPiecesPresent(fen)) {
      return true;
    }
    return Brain.getChess(fen)
      .moves()
      .some((san) => {
        const nextChess = Brain.getChess(fen);
        nextChess.move(san);
        return !Brain.knightAndBishopPiecesPresent(nextChess.fen());
      });
  }

  static whiteKingIsAdjacentToRook(fen: string): boolean {
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const whiteRook = Brain.findPiece(fen, "w", "r");
    return (
      whiteKing != null &&
      whiteRook != null &&
      Brain.kingDistance(whiteKing.square, whiteRook.square) === 1
    );
  }

  static kingDistance(a: Square, b: Square): number {
    const first = Brain.squareCoords(a);
    const second = Brain.squareCoords(b);
    return Math.max(
      Math.abs(first.file - second.file),
      Math.abs(first.rank - second.rank)
    );
  }

  static manhattanDistance(a: Square, b: Square): number {
    const first = Brain.squareCoords(a);
    const second = Brain.squareCoords(b);
    return (
      Math.abs(first.file - second.file) + Math.abs(first.rank - second.rank)
    );
  }

  static playEndgameOpponentMove(san: string, state: StateType, chess: Chess) {
    if (Brain.getEndgameTerminalOutcome(state.fen)) {
      return;
    }
    const blackReplyCandidates = Brain.getEndgameOpponentCandidates(chess);
    const blackMove = chess.move(san);
    if (blackMove === null) {
      return;
    }
    const now = Date.now();
    const terminalOutcome = Brain.getEndgameTerminalOutcome(chess.fen());
    const logs = state.logs.slice();
    const latestLog = logs[logs.length - 1];
    if (latestLog) {
      logs[logs.length - 1] = {
        ...latestLog,
        opponent_san: blackMove.san,
        ideal_choices: blackReplyCandidates.idealMoves.length,
        num_choices: blackReplyCandidates.moves.length,
        endgame_phase: Brain.getEndgamePhase(chess.fen()),
      };
    }
    Brain.setState({
      ...state,
      fen: chess.fen(),
      startingFen: state.fen,
      orientationIsWhite: true,
      endgame_finished_at_ms: terminalOutcome ? now : undefined,
      logs,
    });
  }

  static forceDifferentIdealEndgameMove(logIndex: number) {
    const state = Brain.getState();
    const log = state.logs[logIndex];
    if (!log) {
      return;
    }
    const chess = Brain.getChess(log.fen);
    const whiteMove = chess.move(log.san);
    if (whiteMove === null) {
      return;
    }
    const candidates = Brain.getEndgameOpponentCandidates(chess);
    if (candidates.idealMoves.length <= 1) {
      return;
    }
    const currentIndex = candidates.idealMoves.indexOf(log.opponent_san || "");
    const nextSan =
      candidates.idealMoves[(currentIndex + 1) % candidates.idealMoves.length];
    const blackMove = chess.move(nextSan);
    if (blackMove === null) {
      return;
    }
    const logs = state.logs.slice(0, logIndex + 1);
    logs[logIndex] = {
      ...log,
      opponent_san: blackMove.san,
      ideal_choices: candidates.idealMoves.length,
      num_choices: candidates.moves.length,
      endgame_phase: Brain.getEndgamePhase(chess.fen()),
    };
    Brain.setState({
      ...state,
      fen: chess.fen(),
      startingFen: log.fen,
      endgame_finished_at_ms: Brain.getEndgameTerminalOutcome(chess.fen())
        ? log.created_at_ms ?? state.endgame_finished_at_ms ?? Date.now()
        : undefined,
      logs,
    });
  }
}
