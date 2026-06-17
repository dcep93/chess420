import { Chess, type Square } from "chess.js";
import {
  type BaseEndgameId,
  type EndgameId,
  getBaseEndgame,
  getBaseEndgameId,
  getEndgame,
} from "./Endgames";
import lichessF, {
  type LiMove,
  getGameById,
  getLatestGame,
  latestGameCache,
} from "./Lichess";
import { type LogType } from "./Log";
import settings from "./Settings";
import StorageW from "./StorageW";
import traverseF, { type TraverseType, startTraverseF } from "./Traverse";
import { KNIGHT_BISHOP_PREPARE_STARTS } from "./flowcharts/KnightBishopPrepareStarts";

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

export type EndgamePathSearchResult =
  | {
    result: "mate";
    plies: number;
    startingFen: string;
    finalFen: string;
    moves: string[];
  }
  | {
    result: "loop" | "limit" | "noMove" | EndgameTerminalOutcome;
    plies: number;
    startingFen: string;
    finalFen: string;
    moves: string[];
  };

export type EndgameLoopSearchResult = {
  checked: number;
  mates: number;
  loops: number;
  limits: number;
  noMoves: number;
  lostPieces: number;
  stalemates: number;
  totalPlies: number;
  found?: EndgamePathSearchResult & { result: "loop"; checked: number };
};

export type EndgameLoopSearchProgress = {
  isSearching: boolean;
  percent: number;
  seenPositions: number;
  checked: number;
};

type History = {
  index: number;
  states: StateType[];
};

type NavigationEvent = {
  button?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  preventDefault?: () => void;
};

type ExhaustiveEndgameLoopSearchContext = {
  knownNoLoop: Map<string, number>;
  seenPositions: Set<string>;
  visitedNodes: number;
  totalEstimate: number;
  yieldEvery: number;
  onProgress?: (context: ExhaustiveEndgameLoopSearchContext) => void;
};

type EndgamePiece = {
  color: "w" | "b";
  type: string;
  isPawn: boolean;
};

type EndgamePiecePlacement = EndgamePiece & { square: Square };

type SquareTransform = {
  name: string;
  inverseName: string;
  map: (file: number, rank: number) => { file: number; rank: number };
};

type KnightAndBishopLookupEntry = {
  key: string;
  from: Square;
  to: Square;
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
  rookBoxEstablishedPenalty: number;
  rookBoxSize: number;
  forcingCheckPenalty: number;
  rookPhaseTwoWaitingPenalty: number;
  rookPhaseTwoWaitingDistanceScore: number;
  rookBoxPreservedPenalty: number;
  rookBlackDistanceScore: number;
  kingRookLinePenalty: number;
  kingDistance: number;
};

type RookBlackMoveScore = {
  captureRookPenalty: number;
  cutLineDistance: number;
  diagonalAdjacentRookDistance: number;
  rookOppositionPenalty: number;
  rookDistance: number;
};

type QueenWhiteMoveScore = {
  matePenalty: number;
  queenCapturePenalty: number;
  stalematePenalty: number;
  cagePenalty: number;
  whitePieceEdgePenalty: number;
  queenKnightMovePenalty: number;
  queenBoxArea: number;
  cageKingApproach: number;
  kingMiddleDistance: number;
  whiteKingBetweenPiecesPenalty: number;
  kingDistance: number;
  queenMoveDistance: number | null;
};

type QueenBlackMoveScore = {
  captureQueenPenalty: number;
  centerDistance: number;
};

type TwoBishopsWhiteMoveScore = {
  matePenalty: number;
  stalematePenalty: number;
  bishopSafetyPenalty: number;
  phaseTwoWaitingMovePenalty: number;
  phaseTwoForceOpponentOppositionPenalty: number;
  phaseTwoTakeDirectOppositionPenalty: number;
  phaseTwoPushFromControlledEdgeSquarePenalty: number;
  phaseTwoForceOpponentCornerPenalty: number;
  phaseTwoStayPhaseTwoPenalty: number;
  phaseTwoCheckPenalty: number;
  phaseTwoBishopCornerDistance: number;
  kingBishopScreeningPenalty: number;
  bishopAdjacencyPenalty: number;
  kingBishopDistance: number;
  blackKingEdgeDistance: number;
  bishopBlackKingDistance: number;
};

type TwoBishopsWaitingMove = { from: Square; to: Square };

type TwoBishopsLineWaitingMoveTargets = { from: Square; to: Square[] };

type TwoBishopsWaitingMoveContext = {
  cornerMoves: TwoBishopsWaitingMove[];
  lineTargets: TwoBishopsLineWaitingMoveTargets | null;
};

type TwoBishopsBlackMoveScore = {
  unprotectedBishopDistance: number;
  centerDistance: number;
};

type KnightAndBishopPlanMove = {
  san: string;
  reason: string;
};

type KnightAndBishopZone5 = {
  zoneSquares: [Square, Square];
  escapeSquare: Square | "offboard";
  targetKingSquare: Square;
  stableKnightSquare: Square;
};

type KnightAndBishopZoneXSetup = {
  bishopSquare: Square;
  blackAnchorSquares: Square[];
  stableKnightSquares: Square[];
};

type KnightAndBishopExplicitWhiteMoveReason =
  | "mate"
  | "enter mating net"
  | "key square pattern"
  | "force zone x"
  | "prepare zone x"
  | "bring king closer"
  | "bishop front"
  | "knight closer center";

type ScoreReason<T> = {
  reason: string;
  compare: (a: T, b: T) => number;
};

type MovePriority = {
  compare: (leftIndex: number, rightIndex: number) => number;
};

export type EndgamePriorityHelp = {
  title: string;
  whiteIntro: string;
  blackIntro: string;
  whitePriorities: string[];
  blackPriorities: string[];
  notes: string[];
  noteBoards?: EndgamePriorityNoteBoard[];
};

export type EndgamePriorityNoteBoard = {
  id: string;
  title: string;
  caption: string;
  layout?: {
    files: number;
    ranks: number;
    fileOffset: number;
  };
  pieces: Array<{ square: string; piece: "K" | "B" | "N" | "k" }>;
  highlights: Array<{
    square: string;
    kind: "zone" | "escape" | "key" | "red";
  }>;
  arrows?: Array<{ from: string; to: string }>;
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
  flowchart,
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
  static latestGameFastForwardVersion = 0;
  static endgameLoopSearchProgress: EndgameLoopSearchProgress = {
    isSearching: false,
    percent: 0,
    seenPositions: 0,
    checked: 0,
  };
  static endgameLoopSearchProgressListeners = new Set<() => void>();
  static knightAndBishopLookupEntriesByKey:
    | Map<string, KnightAndBishopLookupEntry[]>
    | undefined;
  static knightAndBishopLookupResultKeys: Set<string> | undefined;

  //

  static view: View;
  static lichessUsername?: string;
  static endgameId: EndgameId | undefined = undefined;
  static flowchartId: string | undefined = undefined;
  static readonly ENDGAME_PICKER_FEN = "8/8/8/8/8/8/8/8 w - - 0 1";
  static readonly KNIGHT_AND_BISHOP_LOOKUP_ENTRIES: KnightAndBishopLookupEntry[] = [
    {
      key: "8/8/5KNk/5B2/8/8/8/8 w",
      from: "f5",
      to: "g4",
    },
    {
      key: "7k/8/5K2/6N1/4B3/8/8/8 w",
      from: "g5",
      to: "f7",
    },
    {
      key: "6k1/5N2/5K2/8/4B3/8/8/8 w",
      from: "e4",
      to: "g6",
    },
    {
      key: "5k2/5N2/5KB1/8/8/8/8/8 w",
      from: "g6",
      to: "h7",
    },
    {
      key: "4k3/5N1B/5K2/8/8/8/8/8 w",
      from: "f7",
      to: "e5",
    },
    {
      key: "5k2/7B/5K2/4N3/8/8/8/8 w",
      from: "e5",
      to: "d7",
    },
    {
      key: "3k4/7B/5K2/4N3/8/8/8/8 w",
      from: "f6",
      to: "e6",
    },
    {
      key: "2k5/7B/4K3/4N3/8/8/8/8 w",
      from: "e5",
      to: "d7",
    },
    {
      key: "8/2kN3B/4K3/8/8/8/8/8 w",
      from: "h7",
      to: "e4",
    },
    {
      key: "2k5/3N3B/4K3/8/8/8/8/8 w",
      from: "h7",
      to: "e4",
    },
    {
      key: "4k3/7B/4K3/4N3/8/8/8/8 w",
      from: "e5",
      to: "d7",
    },
    {
      key: "8/2k4B/4K3/4N3/8/8/8/8 w",
      from: "e5",
      to: "d7",
    },
    {
      key: "8/1k1N3B/4K3/8/8/8/8/8 w",
      from: "h7",
      to: "d3",
    },
    {
      key: "k7/3N4/4K3/8/8/3B4/8/8 w",
      from: "e6",
      to: "d6",
    },
    {
      key: "8/1k1N4/3K4/8/8/3B4/8/8 w",
      from: "d3",
      to: "c4",
    },
    {
      key: "8/3N4/2k1K3/8/8/3B4/8/8 w",
      from: "d3",
      to: "c4",
    },
    {
      key: "8/1k1N4/4K3/8/2B5/8/8/8 w",
      from: "e6",
      to: "d6",
    },
    {
      key: "8/1k1N4/4K3/8/8/3B4/8/8 w",
      from: "e6",
      to: "d6",
    },
    {
      key: "2k5/3N4/3K4/8/8/3B4/8/8 w",
      from: "d3",
      to: "e4",
    },
    {
      key: "8/k2N4/3K4/8/2B5/8/8/8 w",
      from: "d6",
      to: "c7",
    },
    {
      key: "8/k2N4/4K3/8/8/3B4/8/8 w",
      from: "e6",
      to: "d6",
    },
    {
      key: "k7/3N4/3K4/8/8/3B4/8/8 w",
      from: "d6",
      to: "c6",
    },
    {
      key: "k7/3N4/2K5/8/8/3B4/8/8 w",
      from: "d3",
      to: "c4",
    },
    {
      key: "8/k2N4/2K5/8/8/3B4/8/8 w",
      from: "d3",
      to: "c4",
    },
    {
      key: "8/k2N4/3K4/8/8/3B4/8/8 w",
      from: "d6",
      to: "c7",
    },
    {
      key: "k7/2KN4/8/8/8/3B4/8/8 w",
      from: "d7",
      to: "c5",
    },
    {
      key: "8/k1K5/8/2N5/8/3B4/8/8 w",
      from: "d3",
      to: "f5",
    },
    {
      key: "k7/2K5/8/2N2B2/8/8/8/8 w",
      from: "c7",
      to: "b6",
    },
    {
      key: "1k6/8/1K6/2N2B2/8/8/8/8 w",
      from: "c5",
      to: "a6",
    },
    {
      key: "k7/8/NK6/5B2/8/8/8/8 w",
      from: "f5",
      to: "e4",
    },
    {
      key: "k7/3N4/2K5/8/2B5/8/8/8 w",
      from: "c6",
      to: "c7",
    },
    {
      key: "k7/3N4/3K4/8/2B5/8/8/8 w",
      from: "d6",
      to: "c7",
    },
    {
      key: "8/3N3B/2k1K3/8/8/8/8/8 w",
      from: "h7",
      to: "d3",
    },
    {
      key: "8/2kN4/4K3/8/8/3B4/8/8 w",
      from: "d3",
      to: "e4",
    },
    {
      key: "8/2kN4/4K3/8/2B5/8/8/8 w",
      from: "c4",
      to: "d5",
    },
    {
      key: "8/2kN4/4K3/8/4B3/8/8/8 w",
      from: "e4",
      to: "d5",
    },
    {
      key: "2k5/3N4/4K3/8/8/3B4/8/8 w",
      from: "d3",
      to: "e4",
    },
    {
      key: "3k4/3N4/4K3/8/4B3/8/8/8 w",
      from: "e6",
      to: "d6",
    },
    {
      key: "3k4/3N4/3K4/8/4B3/8/8/8 w",
      from: "e4",
      to: "g6",
    },
    {
      key: "4k3/3N4/3K4/8/4B3/8/8/8 w",
      from: "e4",
      to: "g6",
    },
    {
      key: "4k3/3N4/3K4/5B2/8/8/8/8 w",
      from: "f5",
      to: "g6",
    },
    {
      key: "2k5/3N4/3K4/5B2/8/8/8/8 w",
      from: "d7",
      to: "c5",
    },
    {
      key: "1k6/8/3K4/2N2B2/8/8/8/8 w",
      from: "d6",
      to: "c6",
    },
    {
      key: "8/k7/2K5/2N2B2/8/8/8/8 w",
      from: "f5",
      to: "e6",
    },
    {
      key: "k7/8/2K1B3/2N5/8/8/8/8 w",
      from: "c6",
      to: "b6",
    },
    {
      key: "2k5/3N4/4K3/8/4B3/8/8/8 w",
      from: "e6",
      to: "d6",
    },
    {
      key: "2k5/3N4/3K2B1/8/8/8/8/8 w",
      from: "d7",
      to: "c5",
    },
    {
      key: "3k4/8/3K2B1/2N5/8/8/8/8 w",
      from: "c5",
      to: "b7",
    },
    {
      key: "2k5/1N6/3K2B1/8/8/8/8/8 w",
      from: "d6",
      to: "c6",
    },
    {
      key: "1k6/1N6/2K3B1/8/8/8/8/8 w",
      from: "c6",
      to: "b6",
    },
    {
      key: "2k5/1N6/1K4B1/8/8/8/8/8 w",
      from: "g6",
      to: "f5",
    },
    {
      key: "2k5/3N4/3K4/8/4B3/8/8/8 w",
      from: "e4",
      to: "d5",
    },
    {
      key: "3k4/3N4/3K4/3B4/8/8/8/8 w",
      from: "d5",
      to: "f7",
    },
    {
      key: "2k5/3N4/3K4/3B4/8/8/8/8 w",
      from: "d5",
      to: "e4",
    },
    {
      key: "2k5/3N4/4K3/3B4/8/8/8/8 w",
      from: "e6",
      to: "d6",
    },
    {
      key: "3k4/3N4/4K3/3B4/8/8/8/8 w",
      from: "e6",
      to: "d6",
    },
    {
      key: "4k3/3N4/3K4/3B4/8/8/8/8 w",
      from: "d5",
      to: "e6",
    },
    {
      key: "5k2/B3N3/4K3/8/8/8/8/8 w",
      from: "e7",
      to: "f5",
    },
    {
      key: "7k/B7/5K2/5N2/8/8/8/8 w",
      from: "f6",
      to: "g6",
    },
    {
      key: "6k1/B7/6K1/5N2/8/8/8/8 w",
      from: "a7",
      to: "c5",
    },
    {
      key: "4k3/B7/4K3/5N2/8/8/8/8 w",
      from: "a7",
      to: "b6",
    },
    {
      key: "3k4/3N4/3KB3/8/8/8/8/8 w",
      from: "e6",
      to: "f7",
    },
    {
      key: "2k5/3N1B2/3K4/8/8/8/8/8 w",
      from: "d7",
      to: "c5",
    },
    {
      key: "1k6/7B/3K4/2N5/8/8/8/8 w",
      from: "d6",
      to: "c6",
    },
    {
      key: "8/k6B/2K5/2N5/8/8/8/8 w",
      from: "h7",
      to: "f5",
    },
    {
      key: "1k6/8/2K5/2N2B2/8/8/8/8 w",
      from: "c6",
      to: "b6",
    },
    {
      key: "2k5/7B/2K5/2N5/8/8/8/8 w",
      from: "c5",
      to: "b7",
    },
    {
      key: "1k6/1N5B/2K5/8/8/8/8/8 w",
      from: "c6",
      to: "b6",
    },
    {
      key: "2k5/1N5B/1K6/8/8/8/8/8 w",
      from: "h7",
      to: "f5",
    },
    {
      key: "1k6/1N6/1K6/5B2/8/8/8/8 w",
      from: "b7",
      to: "c5",
    },
    {
      key: "k7/8/1K6/2N2B2/8/8/8/8 w",
      from: "f5",
      to: "e6",
    },
    {
      key: "4k3/3N3B/5K2/8/8/8/8/8 w",
      from: "f6",
      to: "e6",
    },
    {
      key: "3k4/3N3B/4K3/8/8/8/8/8 w",
      from: "e6",
      to: "d6",
    },
    {
      key: "4k3/3N3B/3K4/8/8/8/8/8 w",
      from: "h7",
      to: "g6",
    },
    {
      key: "3k4/3N4/3K2B1/8/8/8/8/8 w",
      from: "d7",
      to: "c5",
    },
    {
      key: "2k5/3N4/3K4/8/2B5/8/8/8 w",
      from: "c4",
      to: "d5",
    },
    {
      key: "3k4/8/3K4/2N2B2/8/8/8/8 w",
      from: "f5",
      to: "g6",
    },
    {
      key: "1k6/8/2K5/2N5/2B5/8/8/8 w",
      from: "c4",
      to: "e6",
    },
    {
      key: "k7/8/2K5/2N2B2/8/8/8/8 w",
      from: "f5",
      to: "e6",
    },
    {
      key: "2k5/8/3K2B1/2N5/8/8/8/8 w",
      from: "g6",
      to: "f7",
    },
    {
      key: "3k4/5B2/3K4/2N5/8/8/8/8 w",
      from: "c5",
      to: "b7",
    },
    {
      key: "1k6/5B2/3K4/2N5/8/8/8/8 w",
      from: "f7",
      to: "e6",
    },
    {
      key: "8/k7/3KB3/2N5/8/8/8/8 w",
      from: "d6",
      to: "c7",
    },
    {
      key: "k7/2K5/4B3/2N5/8/8/8/8 w",
      from: "c7",
      to: "b6",
    },
    {
      key: "1k6/8/1K2B3/2N5/8/8/8/8 w",
      from: "c5",
      to: "a6",
    },
    {
      key: "k7/8/NK2B3/8/8/8/8/8 w",
      from: "e6",
      to: "d5",
    },
    {
      key: "k7/8/3KB3/2N5/8/8/8/8 w",
      from: "d6",
      to: "c6",
    },
    {
      key: "8/k7/2K1B3/2N5/8/8/8/8 w",
      from: "e6",
      to: "d7",
    },
    {
      key: "8/k7/2K5/2N5/2B5/8/8/8 w",
      from: "c5",
      to: "d7",
    },
    {
      key: "1k6/8/2K1B3/2N5/8/8/8/8 w",
      from: "c6",
      to: "b6",
    },
    {
      key: "1k6/3B4/2K5/2N5/8/8/8/8 w",
      from: "c6",
      to: "b6",
    },
    {
      key: "k7/3B4/2K5/2N5/8/8/8/8 w",
      from: "c6",
      to: "b6",
    },
    {
      key: "k7/3B4/1K6/2N5/8/8/8/8 w",
      from: "d7",
      to: "e6",
    },
    {
      key: "k7/8/2K3B1/2N5/8/8/8/8 w",
      from: "c6",
      to: "b6",
    },
    {
      key: "k7/8/2K1B3/1N6/8/8/8/8 w",
      from: "c6",
      to: "b6",
    },
    {
      key: "2k5/1N3B2/3K4/8/8/8/8/8 w",
      from: "d6",
      to: "c6",
    },
    {
      key: "1k6/1N3B2/2K5/8/8/8/8/8 w",
      from: "c6",
      to: "b6",
    },
    {
      key: "1k6/8/4B3/1NK5/8/8/8/8 w",
      from: "c5",
      to: "b6",
    },
    {
      key: "k7/8/1K2B3/1N6/8/8/8/8 w",
      from: "b5",
      to: "c7",
    },
    {
      key: "1k6/2N5/1K2B3/8/8/8/8/8 w",
      from: "c7",
      to: "a6",
    },
    {
      key: "8/8/8/8/2N5/3K2B1/8/1k6 w",
      from: "d3",
      to: "c3",
    },
    {
      key: "8/8/8/8/2N5/2K3B1/8/2k5 w",
      from: "c4",
      to: "b2",
    },
    {
      key: "8/8/8/8/8/1K4B1/1N6/k7 w",
      from: "b2",
      to: "c4",
    },
    {
      key: "8/8/8/8/2N5/1K4B1/8/1k6 w",
      from: "g3",
      to: "f4",
    },
    {
      key: "8/8/8/5B2/8/4K3/4N3/7k w",
      from: "e3",
      to: "f2",
    },
    {
      key: "8/8/8/5B2/8/8/4NK1k/8 w",
      from: "f5",
      to: "g4",
    },
    {
      key: "8/8/8/8/6B1/8/4NK2/7k w",
      from: "e2",
      to: "g3",
    },
    {
      key: "8/8/8/8/6B1/6N1/5K1k/8 w",
      from: "g3",
      to: "f1",
    },
    {
      key: "6k1/8/4NK2/8/8/8/5B2/8 w",
      from: "f6",
      to: "g6",
    },
    {
      key: "7k/8/4N1K1/8/8/8/5B2/8 w",
      from: "e6",
      to: "g5",
    },
    {
      key: "6k1/8/6K1/6N1/8/8/5B2/8 w",
      from: "f2",
      to: "c5",
    },
    {
      key: "k7/1N3B2/1K6/8/8/8/8/8 w",
      from: "f7",
      to: "e6",
    },
    {
      key: "k7/1NK5/8/8/8/8/8/1B6 w",
      from: "b7",
      to: "d6",
    },
    {
      key: "2k5/1N3B2/1K6/8/8/8/8/8 w",
      from: "f7",
      to: "e6",
    },
    {
      key: "1k6/1N6/1K2B3/8/8/8/8/8 w",
      from: "b7",
      to: "c5",
    },
    {
      key: "k7/8/1K2B3/2N5/8/8/8/8 w",
      from: "e6",
      to: "d7",
    },
    {
      key: "1k6/3B4/1K6/2N5/8/8/8/8 w",
      from: "c5",
      to: "a6",
    },
    {
      key: "k7/3B4/NK6/8/8/8/8/8 w",
      from: "d7",
      to: "c6",
    },
    {
      key: "6k1/2B5/6K1/5N2/8/8/8/8 w",
      from: "c7",
      to: "d6",
    },
  ];
  static readonly SQUARE_TRANSFORMS: SquareTransform[] = [
    {
      name: "identity",
      inverseName: "identity",
      map: (file, rank) => ({ file, rank }),
    },
    {
      name: "rotate90",
      inverseName: "rotate270",
      map: (file, rank) => ({ file: 7 - rank, rank: file }),
    },
    {
      name: "rotate180",
      inverseName: "rotate180",
      map: (file, rank) => ({ file: 7 - file, rank: 7 - rank }),
    },
    {
      name: "rotate270",
      inverseName: "rotate90",
      map: (file, rank) => ({ file: rank, rank: 7 - file }),
    },
    {
      name: "mirrorFile",
      inverseName: "mirrorFile",
      map: (file, rank) => ({ file: 7 - file, rank }),
    },
    {
      name: "mirrorRank",
      inverseName: "mirrorRank",
      map: (file, rank) => ({ file, rank: 7 - rank }),
    },
    {
      name: "diagonal",
      inverseName: "diagonal",
      map: (file, rank) => ({ file: rank, rank: file }),
    },
    {
      name: "antiDiagonal",
      inverseName: "antiDiagonal",
      map: (file, rank) => ({ file: 7 - rank, rank: 7 - file }),
    },
  ];

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

  static getSelectedBaseEndgameId(): BaseEndgameId {
    return getBaseEndgameId(Brain.endgameId);
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
    const isWhiteTurn = Brain.getChess(fen).turn() === "w";
    const baseEndgameId = Brain.getSelectedBaseEndgameId();
    if (baseEndgameId === "knightAndBishop") {
      return isWhiteTurn && Brain.isKnightAndBishopMatingNetWhiteTurnPosition(fen)
        ? "2/2"
        : "1/2";
    }
    if (baseEndgameId === "twoBishops") {
      if (!Brain.whiteHasRequiredPieces(fen, ["b", "b"])) {
        return "0/2";
      }
      return isWhiteTurn && Brain.isTwoBishopsPhaseTwoPosition(fen)
        ? "2/2"
        : "1/2";
    }
    const majorPiece = Brain.getMajorEndgamePieceType();
    if (!majorPiece) {
      return "1/2";
    }
    const phase = Brain.getMajorEndgamePhase(fen, majorPiece);
    return `${isWhiteTurn ? phase : Math.min(phase, 1)}/2`;
  }

  static shouldShowPhaseTwoBoardBorder(fen: string): boolean {
    if (!Brain.hasSelectedEndgame()) {
      return false;
    }
    return Brain.getVisibleEndgamePhase(fen).startsWith("2/");
  }

  static getVisibleEndgamePhase(fen: string): string {
    if (!Brain.history) {
      return Brain.getEndgamePhase(fen);
    }
    const state = Brain.getState();
    const latestLog = state.logs[state.logs.length - 1];
    if (
      (state.startingFen === fen ||
        (state.fen === fen && latestLog?.opponent_san === undefined)) &&
      latestLog?.endgame_phase !== undefined &&
      Brain.getChess(fen).turn() === "b"
    ) {
      return latestLog.endgame_phase;
    }
    return Brain.getEndgamePhase(fen);
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

  static isKnightAndBishopLookupPhasePosition(fen: string): boolean {
    if (!Brain.knightAndBishopPiecesPresent(fen)) {
      return false;
    }
    const chess = Brain.getChess(fen);
    return (
      chess.turn() === "b" &&
      Brain.lookupEntryResultMatches(
        fen,
        Brain.KNIGHT_AND_BISHOP_LOOKUP_ENTRIES
      )
    );
  }

  static isKnightAndBishopMatingNetWhiteTurnPosition(fen: string): boolean {
    const chess = Brain.getChess(fen);
    return (
      chess.turn() === "w" &&
      Brain.knightAndBishopPiecesPresent(fen) &&
      (Brain.getKnightAndBishopLookupWhiteMoves(fen).length > 0 ||
        chess.moves().some((san) =>
          Brain.knightAndBishopWhiteMoveReachesLookupPath(fen, san)
        ))
    );
  }

  static isKnightAndBishopWManeuverPosition(fen: string): boolean {
    const blackKing = Brain.findPiece(fen, "b", "k");
    return (
      blackKing != null &&
      Brain.edgeDistance(blackKing.square) <= 1 &&
      Brain.wManeuverSetupDistance(fen) === 0
    );
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
    const baseEndgameId = Brain.getSelectedBaseEndgameId();
    if (baseEndgameId === "rook") return "r";
    if (baseEndgameId === "queen") return "q";
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

  static getEndgameReason(fen: string, san?: string): string {
    const baseEndgameId = Brain.getSelectedBaseEndgameId();
    if (baseEndgameId === "rook") {
      const scoredMoves = Brain.getChess(fen)
        .moves()
        .map((san) => ({
          san,
          score: Brain.scoreRookWhiteMove(fen, san),
        }))
        .sort((a, b) => Brain.compareRookWhiteScores(a.score, b.score));
      return Brain.getMoveScoreReason(
        scoredMoves,
        Brain.getRookWhiteScoreReasons(),
        Brain.compareRookWhiteScores,
        san
      );
    }
    if (baseEndgameId === "queen") {
      const scoredMoves = Brain.getChess(fen)
        .moves()
        .map((san) => ({
          san,
          score: Brain.scoreQueenWhiteMove(fen, san),
        }))
        .sort((a, b) => Brain.compareQueenWhiteScores(a.score, b.score));
      return Brain.getMoveScoreReason(
        scoredMoves,
        Brain.getQueenWhiteScoreReasons(),
        Brain.compareQueenWhiteScores,
        san
      );
    }
    if (baseEndgameId === "knightAndBishop") {
      const lookupMoves = Brain.getKnightAndBishopLookupWhiteMoves(fen);
      if (lookupMoves.length > 0) {
        return "mating net";
      }
      const scoredMoves = Brain.getChess(fen)
        .moves()
        .map((san) => ({
          san,
          score: Brain.scoreKnightAndBishopWhiteMove(fen, san),
        }))
        .sort((a, b) =>
          Brain.compareKnightAndBishopWhiteScores({
            ...a.score,
            index: 0,
          }, {
            ...b.score,
            index: 0,
          })
        );
      return Brain.getMoveScoreReason(
        scoredMoves,
        Brain.getKnightAndBishopWhiteScoreReasons(),
        (a, b) =>
          Brain.compareKnightAndBishopWhiteScores({
            ...a,
            index: 0,
          }, {
            ...b,
            index: 0,
          }),
        san
      );
    }
    if (baseEndgameId === "twoBishops") {
      const waitingMoveContext = Brain.getTwoBishopsWaitingMoveContext(fen);
      const scoredMoves = Brain.getChess(fen)
        .moves()
        .map((san) => ({
          san,
          score: Brain.scoreTwoBishopsWhiteMove(fen, san, waitingMoveContext),
        }))
        .sort((a, b) => Brain.compareTwoBishopsWhiteScores(a.score, b.score));
      return Brain.getMoveScoreReason(
        scoredMoves,
        Brain.getTwoBishopsWhiteScoreReasons(),
        Brain.compareTwoBishopsWhiteScores,
        san
      );
    }
    return "";
  }

  static getEndgamePriorityHelp(
    endgameId: EndgameId | undefined = Brain.endgameId
  ): EndgamePriorityHelp {
    const baseEndgameId = getBaseEndgameId(endgameId);
    return {
      title: "How best moves are chosen",
      whiteIntro: Brain.getEndgameWhitePriorityIntro(baseEndgameId),
      blackIntro:
        "Black uses its own priorities to put up the strongest resistance. Black is not trying to help the mate; it looks for the most stubborn legal reply.",
      whitePriorities: Brain.getEndgameWhitePriorityLabels(baseEndgameId),
      blackPriorities: Brain.getEndgameBlackPriorityLabels(baseEndgameId),
      notes: Brain.getEndgamePriorityNotes(baseEndgameId),
      noteBoards: Brain.getEndgamePriorityNoteBoards(baseEndgameId),
    };
  }

  static getEndgameWhitePriorityIntro(baseEndgameId: BaseEndgameId): string {
    if (baseEndgameId === "knightAndBishop") {
      return "White first uses immediate mates and known mating-net moves when they apply. Otherwise, best moves are the moves that survive these priorities in order; tied moves all remain best moves.";
    }
    return "White's best moves are the moves that survive these priorities in order. If several moves are still tied after a priority, they all remain best moves.";
  }

  static getEndgamePriorityNotes(baseEndgameId: BaseEndgameId): string[] {
    if (baseEndgameId === "knightAndBishop") {
      return [
        "Zone X is the blue pair defined by the stable knight/bishop/edge geometry. It exists only when the minor pieces are in yellow position and White's king can block the red escape square.",
      ];
    }
    if (baseEndgameId === "twoBishops") {
      return [
        "Phase 2 is where Black's king is on an edge and White's king controls at least 2 squares in front of Black's king. Phase 2 also includes positions where White's king is two diagonal king moves from Black's edge king and Black is forced to move along the edge toward White's king. It applies only on White turns. Squares in front are the squares opposite an edge: edge squares have 3 squares in front of them. Corner front squares are the 3 inward squares, such as a2 and b1 and b2 when Black's king is on a1.",
        "The phase 2 waiting move is not any quiet move. It is a bishop move for a boxed-in king: either the line-pattern waiting move that keeps the wall, or the corner waiting move that lets that bishop cover Black's single escape square after Black moves.",
      ];
    }
    return [];
  }

  static getEndgamePriorityNoteBoards(
    baseEndgameId: BaseEndgameId
  ): EndgamePriorityNoteBoard[] {
    if (baseEndgameId !== "knightAndBishop") {
      return [];
    }
    return [
      {
        id: "zone-x",
        title: "Zone X",
        caption: "",
        layout: { files: 14, ranks: 8, fileOffset: 3 },
        pieces: [
          { square: "f8", piece: "k" },
          { square: "e5", piece: "K" },
          { square: "e6", piece: "B" },
          { square: "c6", piece: "N" },
        ],
        highlights: [
          { square: "e8", kind: "zone" },
          { square: "f8", kind: "zone" },
          { square: "c6", kind: "key" },
          { square: "e6", kind: "key" },
          { square: "g7", kind: "escape" },
        ],
        arrows: [{ from: "e5", to: "f6" }],
      },
      {
        id: "key-square",
        title: "Key Square",
        caption: "Move the knight to the key square between the kings, while the black king is on the edge. The bishop cuts off the red escape squares.",
        layout: { files: 14, ranks: 8, fileOffset: 3 },
        pieces: [
          { square: "d8", piece: "k" },
          { square: "d6", piece: "K" },
          { square: "d5", piece: "B" },
          { square: "d7", piece: "N" },
        ],
        highlights: [
          { square: "c8", kind: "zone" },
          { square: "d8", kind: "zone" },
          { square: "e8", kind: "zone" },
          { square: "d7", kind: "key" },
          { square: "b7", kind: "red" },
          { square: "f7", kind: "red" },
        ],
      },
    ];
  }

  static getEndgameWhitePriorityLabels(baseEndgameId: BaseEndgameId): string[] {
    const reasonKeys = Brain.getEndgameWhitePriorityReasonKeys(baseEndgameId);
    if (reasonKeys.length > 0) {
      const seenReasons = new Set<string>();
      return reasonKeys
        .filter((reason) => {
          if (seenReasons.has(reason)) {
            return false;
          }
          seenReasons.add(reason);
          return true;
        })
        .map((reason) =>
          Brain.getEndgameWhitePriorityLabelForBase(reason, baseEndgameId)
        )
        .filter((label) => label.length > 0);
    }
    return [
      "Checkmate immediately when mate is available.",
      "Avoid stalemate.",
      "Keep White's material safe.",
      "Limit Black's king.",
      "Improve White's king and pieces.",
    ];
  }

  static getEndgameWhitePriorityReasonKeys(
    baseEndgameId: BaseEndgameId
  ): string[] {
    if (baseEndgameId === "rook") {
      return Brain.getRookWhiteScoreReasons().map(({ reason }) => reason);
    }
    if (baseEndgameId === "queen") {
      return Brain.getQueenWhiteScoreReasons().map(({ reason }) => reason);
    }
    if (baseEndgameId === "knightAndBishop") {
      return Brain.getKnightAndBishopWhiteScoreReasons().map(
        ({ reason }) => reason
      );
    }
    if (baseEndgameId === "twoBishops") {
      return Brain.getTwoBishopsWhiteScoreReasons().map(({ reason }) => reason);
    }
    return [];
  }

  static getEndgameWhitePriorityLabelForBase(
    reason: string,
    baseEndgameId: BaseEndgameId
  ): string {
    if (baseEndgameId === "rook" && reason === "king closer") {
      return "Bring White's king closer to Black's king without entering the rook's lines.";
    }
    if (baseEndgameId === "queen" && reason === "king closer") {
      return "Bring White's king closer to Black's king without walking between the queen and Black's king.";
    }
    return Brain.getEndgameWhitePriorityLabel(reason);
  }

  static getEndgameWhitePriorityLabel(reason: string): string {
    return (
      {
        mate: "Checkmate immediately when mate is available.",
        "rook safe": "Keep pieces safe from capture.",
        "queen safe": "Keep pieces safe from capture.",
        "minors safe": "Keep pieces safe from capture.",
        "bishops safe": "Keep pieces safe from capture.",
        "no stalemate": "Avoid stalemate.",
        "establish box": "Put the rook on the row or file between the kings and closest to Black's king when not already.",
        "forcing check": "Check if it forces Black's king to walk away from White's king.",
        "rook waiting move": "When the kings are a knight move apart and the rook is on the row or file between them, make a rook waiting move as far as possible while staying between the kings.",
        "rook waiting distance": "",
        "king closer": "Bring White's king closer to Black's king, but do not take opposition.",
        "maximize black distance": "Move the rook as far as possible from Black's king while preserving the box.",
        "corner cage": "Build or preserve the queen's corner cage.",
        "king to cage": "When the queen has a two-square corner cage, walk White's king toward that cage.",
        "white pieces off edge": "Keep white pieces off edge squares.",
        "queen knight move": "Place the queen a knight move from Black's king.",
        "queen box size": "Shrink the queen's box around Black's king.",
        "king near middle": "",
        "king not between pieces": "",
        "shorter queen move": "Prefer the shorter queen move when everything else is tied.",
        "enter mating net": "[mate] Follow the known knight-and-bishop mating net when it is available.",
        "key square pattern": "[prepare] Reach the knight's key-square pattern or force Black into Zone X when available. Establish the bishop on its Zone X square when available. Prepare * is true when the bishop is on its Zone X square: move White's king toward Black's king, otherwise move the knight by the shortest path to its Zone X square.",
        "force zone x": "",
        "prepare zone x": "",
        "bring king closer": "Keep White's king in the middle 16 squares while bringing it closer to Black's king and staying on the color opposite the bishop; when outside the middle 16, walk toward it first. The color rule can also yield when the two kings are two diagonal squares apart and the adjacent bishop is a knight move from Black's king.",
        "bishop front": "Establish, maintain, or prepare the bishop on the square in front of White's king, between the kings.",
        "knight closer center": "Keep the knight behind White's king relative to Black's king, then closer to White's king, then closer to the center, preferring squares farther from Black's king.",
        "waiting move": "Phase 2: use the specific bishop waiting move when Black is boxed in.",
        "force opponent to take opposition": "Phase 2: force Black along the edge toward direct king opposition without moving the bishop on the black king's current color, unless it's a check.",
        "take direct opposition": "Phase 2: take direct king opposition, unless it moves the white king into a square controlled by a bishop.",
        "push from controlled edge square": "Phase 2: when the kings are in direct opposition and a bishop controls the edge square two squares from Black's king and diagonally two squares from White's king, force Black's king away from that controlled edge square.",
        "force opponent toward corner": "Phase 2: force Black towards the corner along its current edge and closer to White's king.",
        "stay phase two": "Enter or remain in phase 2.",
        "check king": "Phase 2: Check the king.",
        "bishops far from corner": "Phase 2: Prefer bishops to be farther from the corner closest to Black's king.",
        "avoid king bishop screening": "Keep White's king and bishops from screening each other from Black's king.",
        "bishops together": "Keep the bishops adjacent.",
        "king near bishops": "Keep White's king near the bishops.",
        "force black to edge": "Force Black to the edge.",
        "bishops closer": "Bring the bishops closer to Black's king.",
      } satisfies Record<string, string>
    )[reason] ?? `${reason}.`;
  }

  static getEndgameReasonText(reason: string): string {
    return (
      {
        "maximize black distance": "keep Black far from rook",
        "king to cage": "White king toward cage",
        "queen knight move": "queen a knight move from Black king",
        "king near middle": "White king near middle",
        "king closer": "White king closer",
        "bring king closer": "White king closer",
        "bishop front": "bishop in front of White king",
        "knight closer center": "Knight closer to center",
        "force black to edge": "force Black to edge",
        "bishops closer": "bishops closer to Black king",
        "bishops far from corner": "bishops farther from corner",
      } satisfies Record<string, string>
    )[reason] ?? reason;
  }

  static getEndgameBlackPriorityLabels(baseEndgameId: BaseEndgameId): string[] {
    const returnPositionPriority =
      "Return to the previous full position when a legal reply can recreate it.";
    if (baseEndgameId === "rook") {
      return [
        returnPositionPriority,
        "Take a piece if White isn't looking.",
        "Move toward the rook's cut line when that weakens White's box.",
        "Approach a diagonally protected rook when White's king and rook are awkwardly placed.",
        "Avoid walking into direct opposition when it makes White's job easier.",
        "Get as close to the rook as possible.",
      ];
    }
    if (baseEndgameId === "queen") {
      return [
        returnPositionPriority,
        "Take a piece if White isn't looking.",
        "Head toward the center, where Black has the most room to resist.",
      ];
    }
    if (baseEndgameId === "knightAndBishop") {
      return [
        returnPositionPriority,
        "Take a piece if White isn't looking.",
        "Move toward unprotected minor pieces.",
        "Run toward the center when possible.",
        "Keep as many legal replies as possible.",
        "Stay away from White's king.",
        "Resist being driven toward the bishop's mating corner.",
      ];
    }
    if (baseEndgameId === "twoBishops") {
      return [
        returnPositionPriority,
        "Take a piece if White isn't looking.",
        "Stay away from edges and corners.",
        "Move toward unprotected bishops.",
      ];
    }
    return [
      returnPositionPriority,
      "Take loose material if White allows it.",
      "Head toward freedom and the center.",
      "Keep distance from White's king and pieces.",
    ];
  }

  static getScoreReason<T>(
    correct: T,
    incorrect: T,
    reasons: Array<ScoreReason<T>>
  ): string {
    return reasons.find((reason) => reason.compare(correct, incorrect) < 0)?.reason ?? "";
  }

  static getMoveScoreReason<T>(
    scoredMoves: Array<{ san: string; score: T }>,
    reasons: Array<ScoreReason<T>>,
    compareScores: (a: T, b: T) => number,
    san?: string
  ): string {
    const correct = scoredMoves[0];
    if (!correct) {
      return "";
    }
    const played = san
      ? scoredMoves.find((move) => move.san === san)
      : undefined;
    if (played && compareScores(played.score, correct.score) !== 0) {
      return Brain.getScoreReason(correct.score, played.score, reasons);
    }
    const incorrect = scoredMoves.find(
      (move) => compareScores(move.score, correct.score) !== 0
    );
    return incorrect
      ? Brain.getScoreReason(correct.score, incorrect.score, reasons)
      : "";
  }

  static getEndgameLogFields(
    fen: string,
    san: string,
    _resultFen: string
  ): Pick<
    LogType,
    | "endgame_phase"
    | "endgame_is_correct"
    | "endgame_correct_choices"
    | "endgame_reason"
  > {
    const correctMoves = Brain.getIdealEndgameWhiteMoves(fen);
    return {
      endgame_phase: Brain.getEndgamePhase(fen),
      endgame_is_correct: correctMoves.includes(san),
      endgame_correct_choices: correctMoves.length,
      endgame_reason: Brain.getEndgameReason(fen, san),
    };
  }

  static getIdealEndgameWhiteMoves(fen: string): string[] {
    const chess = Brain.getChess(fen);
    const moves = chess.moves();
    if (chess.turn() !== "w" || moves.length === 0) {
      return moves;
    }
    const baseEndgameId = Brain.getSelectedBaseEndgameId();
    if (baseEndgameId === "rook") {
      return Brain.getIdealRookWhiteMoves(fen);
    }
    if (baseEndgameId === "queen") {
      return Brain.getIdealQueenWhiteMoves(fen);
    }
    if (baseEndgameId === "knightAndBishop") {
      return Brain.getIdealKnightAndBishopWhiteMoves(fen);
    }
    if (baseEndgameId === "twoBishops") {
      return Brain.getIdealTwoBishopsWhiteMoves(fen);
    }
    return Brain.selectBestMovesByComparator(
      moves,
      (san) => {
        const nextChess = Brain.getChess(fen);
        nextChess.move(san);
        return Brain.getEndgamePositionScore(nextChess.fen());
      },
      (a, b) => Brain.compareEndgamePositionScores(b, a)
    );
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
    const baseEndgameId = Brain.getSelectedBaseEndgameId();
    if (baseEndgameId === "rook" || baseEndgameId === "queen") {
      return Brain.getMajorEndgamePositionScore(fen, baseEndgameId);
    }
    if (baseEndgameId === "knightAndBishop") {
      return Brain.getKnightAndBishopPositionScore(fen);
    }
    if (baseEndgameId === "twoBishops" || baseEndgameId === "twoKnightsVsPawn") {
      return Brain.getBasicEndgamePositionScore(fen, baseEndgameId);
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
          Brain.getEndgamePieces(getBaseEndgame(Brain.endgameId).fen)
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
        Brain.hasDirectKingOpposition(whiteKing.square, blackKing.square)
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
    const mateMoves = Brain.getImmediateMateMoves(fen, moves);
    if (mateMoves.length > 0) {
      return mateMoves;
    }
    const lookupMoves = Brain.getKnightAndBishopLookupWhiteMoves(fen);
    if (lookupMoves.length > 0) {
      return lookupMoves;
    }
    return Brain.selectBestMovesByComparator(
      moves,
      (san, index) => ({
        index,
        ...Brain.scoreKnightAndBishopWhiteMove(fen, san),
      }),
      Brain.compareKnightAndBishopWhiteScores
    );
  }

  static getKnightAndBishopExplicitWhiteMoveReason(
    fen: string,
    san: string
  ): KnightAndBishopExplicitWhiteMoveReason | undefined {
    const chess = Brain.getChess(fen);
    const moves = chess.moves();
    if (chess.turn() !== "w" || !moves.includes(san)) {
      return undefined;
    }

    const mateMoves = Brain.getImmediateMateMoves(fen, moves);
    if (mateMoves.length > 0) {
      return mateMoves.includes(san) ? "mate" : undefined;
    }

    const lookupMoves = Brain.getKnightAndBishopLookupWhiteMoves(fen);
    if (lookupMoves.length > 0) {
      return lookupMoves.includes(san) ? "enter mating net" : undefined;
    }

    const scoredMoves = moves.map((moveSan, index) => ({
      san: moveSan,
      score: {
        index,
        ...Brain.scoreKnightAndBishopWhiteMove(fen, moveSan),
      },
    }));
    const selectedMove = scoredMoves.find((move) => move.san === san);
    if (!selectedMove) {
      return undefined;
    }

    let candidates = scoredMoves;
    let lastExplicitReason: KnightAndBishopExplicitWhiteMoveReason | undefined;
    const stages: Array<{
      compare: typeof Brain.compareKnightAndBishopWhiteScores;
      reason?: KnightAndBishopExplicitWhiteMoveReason;
    }> = [
      {
        compare: (a, b) => a.mateScore - b.mateScore,
      },
      {
        compare: (a, b) => a.stalemateScore - b.stalemateScore,
      },
      {
        compare: (a, b) => a.pieceSafetyScore - b.pieceSafetyScore,
      },
      {
        compare: (a, b) => a.phaseTwoEntryScore - b.phaseTwoEntryScore,
        reason: "enter mating net",
      },
      {
        compare: (a, b) =>
          a.keySquarePatternScore - b.keySquarePatternScore,
        reason: "key square pattern",
      },
      {
        compare: (a, b) =>
          a.zoneXEstablishedKnightRouteScore -
          b.zoneXEstablishedKnightRouteScore,
        reason: "prepare zone x",
      },
      {
        compare: (a, b) => a.zoneXEntryScore - b.zoneXEntryScore,
        reason: "force zone x",
      },
      {
        compare: (a, b) =>
          a.zoneXPrepareScore - b.zoneXPrepareScore ||
          a.zoneXPreparePieceProximity - b.zoneXPreparePieceProximity,
        reason: "prepare zone x",
      },
      {
        compare: (a, b) =>
          Brain.compareAfterZoneXDrift(
            a,
            b,
            () =>
              a.kingCloserOppositeBishopScore -
              b.kingCloserOppositeBishopScore
          ),
        reason: "bring king closer",
      },
      {
        compare: (a, b) =>
          Brain.compareAfterZoneXDrift(
            a,
            b,
            () =>
              a.kingDistanceRegressionScore - b.kingDistanceRegressionScore
          ),
      },
      {
        compare: (a, b) =>
          Brain.compareAfterZoneXDrift(
            a,
            b,
            () =>
              a.bishopOppositionLoopScore - b.bishopOppositionLoopScore ||
              a.knightBehindWhiteKingScore - b.knightBehindWhiteKingScore
          ),
        reason: "knight closer center",
      },
      {
        compare: (a, b) =>
          Brain.compareAfterZoneXDrift(
            a,
            b,
            () =>
              a.bishopInFrontScore - b.bishopInFrontScore ||
              a.bishopFrontPreparationScore - b.bishopFrontPreparationScore ||
              a.bishopBlackKingDistance - b.bishopBlackKingDistance
          ),
        reason: "bishop front",
      },
      {
        compare: (a, b) =>
          Brain.compareAfterZoneXDrift(
            a,
            b,
            () =>
              Brain.compareKnightMoveWhiteKingDistances(a, b) ||
              a.knightCentralDistance - b.knightCentralDistance ||
              b.knightBlackKingDistance - a.knightBlackKingDistance
          ),
        reason: "knight closer center",
      },
    ];

    for (const stage of stages) {
      const best = candidates.reduce((currentBest, candidate) =>
        stage.compare(candidate.score, currentBest.score) < 0
          ? candidate
          : currentBest
      );
      const nextCandidates = candidates.filter(
        (candidate) => stage.compare(candidate.score, best.score) === 0
      );
      if (!nextCandidates.some((candidate) => candidate.san === san)) {
        return undefined;
      }
      if (stage.reason && nextCandidates.length < candidates.length) {
        lastExplicitReason = stage.reason;
      }
      candidates = nextCandidates;
    }

    if (candidates.length === 1 && candidates[0].san === san) {
      return lastExplicitReason;
    }
    return candidates.some((candidate) => candidate.san === san) &&
      candidates.every((candidate) => candidate.score.zoneXDriftScore === 0)
      ? lastExplicitReason
      : undefined;
  }

  static getKnightAndBishopHumanPlanMove(
    fen: string
  ): KnightAndBishopPlanMove | undefined {
    const chess = Brain.getChess(fen);
    if (chess.turn() !== "w") {
      return undefined;
    }
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const blackKing = Brain.findPiece(fen, "b", "k");
    const bishop = Brain.findPiece(fen, "w", "b");
    const knight = Brain.findPiece(fen, "w", "n");
    if (!whiteKing || !blackKing || !bishop || !knight) {
      return undefined;
    }
    const matches = (
      black: Square,
      king: Square,
      bishopSquare: Square,
      knightSquare: Square
    ) =>
      blackKing.square === black &&
      whiteKing.square === king &&
      bishop.square === bishopSquare &&
      knight.square === knightSquare;
    const move = (from: Square, to: Square, reason: string) => {
      const next = Brain.getChess(fen);
      const result = next.move({ from, to });
      return result ? { san: result.san, reason } : undefined;
    };

    if (matches("d5", "e1", "f1", "g1")) {
      return move("e1", "d2", "centralize king");
    }
    if (matches("e5", "d2", "f1", "g1")) {
      return move("d2", "e3", "centralize king");
    }
    if (matches("d5", "e3", "f1", "g1")) {
      return move("g1", "f3", "take away central squares");
    }
    if (matches("c5", "e3", "f1", "f3")) {
      return move("e3", "e4", "centralize king");
    }
    if (matches("d6", "e4", "f1", "f3")) {
      return move("f1", "c4", "centralize pieces");
    }
    if (matches("c5", "e4", "c4", "f3")) {
      return move("c4", "d5", "take away central squares");
    }
    if (matches("d7", "d4", "d5", "f3")) {
      return move("f3", "e5", "kick black king back");
    }
    if (matches("e7", "d4", "d5", "e5")) {
      return move("d4", "e4", "king near middle");
    }
    if (matches("f6", "e4", "d5", "e5")) {
      return move("e5", "c6", "take away key squares");
    }
    if (matches("h7", "f6", "d5", "c6")) {
      return move("c6", "e5", "set up the cage");
    }
    if (matches("h8", "f6", "d5", "e5")) {
      return move("d5", "e4", "reach the dream position");
    }
    if (matches("g8", "f6", "e4", "e5")) {
      return move("e5", "f7", "knight to key square");
    }
    if (matches("f8", "f6", "e4", "f7")) {
      return move("e4", "h7", "set up the W-maneuver");
    }
    if (matches("e8", "f6", "h7", "f7")) {
      return move("f7", "e5", "set up the W-maneuver");
    }
    if (matches("d8", "f6", "h7", "e5")) {
      return move("f6", "e6", "set up the cage");
    }
    if (matches("c7", "e6", "h7", "e5")) {
      return move("e5", "d7", "set up the cage");
    }
    if (matches("b7", "e6", "h7", "d7")) {
      return move("h7", "d3", "build the cage");
    }
    if (matches("b7", "d6", "c4", "d7")) {
      return move("c4", "b5", "take away c6");
    }
    if (matches("c7", "e6", "c4", "d7")) {
      return move("c4", "b5", "take away c6");
    }
    if (matches("d8", "e6", "b5", "d7")) {
      return move("e6", "d6", "king to key square");
    }
    if (matches("e8", "d6", "b5", "d7")) {
      return move("b5", "c4", "shut the door");
    }
    if (matches("d8", "d6", "c4", "d7")) {
      return move("c4", "f7", "shut the door");
    }
    if (matches("c8", "d6", "f7", "d7")) {
      return move("d7", "c5", "continue the W-maneuver");
    }
    if (matches("d8", "d6", "f7", "c5")) {
      return move("c5", "b7", "continue the W-maneuver");
    }
    if (matches("b8", "b6", "e6", "b7")) {
      return move("b7", "c5", "start the mating pattern");
    }
    if (matches("a8", "b6", "e6", "c5")) {
      return move("e6", "d7", "avoid stalemate");
    }
    return undefined;
  }

  static getKnightAndBishopLookupWhiteMoves(fen: string): string[] {
    const lookupMoves: string[] = [];
    const entriesByKey = Brain.getKnightAndBishopLookupEntriesByKey();
    for (const transform of Brain.SQUARE_TRANSFORMS) {
      const key = Brain.getTransformedPositionKey(fen, transform);
      for (const entry of entriesByKey.get(key) ?? []) {
        const inverseTransform = Brain.getSquareTransform(transform.inverseName);
        const from = Brain.transformSquare(entry.from, inverseTransform);
        const to = Brain.transformSquare(entry.to, inverseTransform);
        const chess = Brain.getChess(fen);
        const move = chess.move({ from, to });
        if (move && !lookupMoves.includes(move.san)) {
          lookupMoves.push(move.san);
        }
      }
    }
    return lookupMoves;
  }

  static getKnightAndBishopLookupEntriesByKey(): Map<
    string,
    KnightAndBishopLookupEntry[]
  > {
    if (Brain.knightAndBishopLookupEntriesByKey) {
      return Brain.knightAndBishopLookupEntriesByKey;
    }
    const entriesByKey = new Map<string, KnightAndBishopLookupEntry[]>();
    Brain.KNIGHT_AND_BISHOP_LOOKUP_ENTRIES.forEach((entry) => {
      entriesByKey.set(entry.key, [...(entriesByKey.get(entry.key) ?? []), entry]);
    });
    Brain.knightAndBishopLookupEntriesByKey = entriesByKey;
    return entriesByKey;
  }

  static knightAndBishopWhiteMoveReachesLookupPath(
    fen: string,
    san: string
  ): boolean {
    const chess = Brain.getChess(fen);
    if (chess.turn() !== "w") {
      return false;
    }
    const move = chess.move(san);
    if (!move) {
      return false;
    }
    return Brain.knightAndBishopBlackLookupPathSurvives(
      chess.fen()
    );
  }

  static knightAndBishopBlackLookupPathSurvives(
    fen: string
  ): boolean {
    const terminalOutcome = Brain.getEndgameTerminalOutcome(fen);
    if (terminalOutcome) {
      return terminalOutcome === "checkmate";
    }
    if (!Brain.isKnightAndBishopLookupPhasePosition(fen)) {
      return false;
    }
    const chess = Brain.getChess(fen);
    const replies = chess.moves();
    return (
      replies.length > 0 &&
      replies.every((reply) => {
        const next = Brain.getChess(fen);
        next.move(reply);
        return Brain.knightAndBishopWhiteCanContinueLookupPath(
          next.fen()
        );
      })
    );
  }

  static knightAndBishopWhiteCanContinueLookupPath(
    fen: string
  ): boolean {
    const terminalOutcome = Brain.getEndgameTerminalOutcome(fen);
    if (terminalOutcome) {
      return terminalOutcome === "checkmate";
    }
    const chess = Brain.getChess(fen);
    if (chess.turn() !== "w") {
      return false;
    }
    const lookupMoves = Brain.getKnightAndBishopLookupWhiteMoves(fen);
    if (lookupMoves.length > 0) {
      return true;
    }
    return chess.moves().some((san) => {
      const next = Brain.getChess(fen);
      const move = next.move(san);
      if (!move) {
        return false;
      }
      return next.isCheckmate() || Brain.isKnightAndBishopLookupPhasePosition(next.fen());
    });
  }

  static getKnightAndBishopZone5(fen: string): KnightAndBishopZone5 | undefined {
    const blackKing = Brain.findPiece(fen, "b", "k");
    return Brain.getKnightAndBishopZone5Candidates(fen)
      .filter(
        (zone5) => blackKing && zone5.zoneSquares.includes(blackKing.square)
      )
      .sort((a, b) => Brain.compareKnightAndBishopZone5Candidates(fen, a, b))[0];
  }

  static getKnightAndBishopZoneXSetup(
    fen: string
  ): KnightAndBishopZoneXSetup | undefined {
    return Brain.getKnightAndBishopZoneXSetupCandidates(fen).sort((a, b) =>
      Brain.compareKnightAndBishopZoneXSetups(fen, a, b)
    )[0];
  }

  static getKnightAndBishopZoneXSetupCandidates(
    fen: string
  ): KnightAndBishopZoneXSetup[] {
    const bishop = Brain.findPiece(fen, "w", "b");
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (!bishop || !blackKing) {
      return [];
    }

    const canonical = {
      bishop: "e6" as Square,
      blackAnchorSquares: ["e7", "d8", "e8", "f8"] as Square[],
      stableKnightSquares: ["c6", "g6"] as Square[],
    };
    const candidates = new Map<string, KnightAndBishopZoneXSetup>();

    Brain.SQUARE_TRANSFORMS.forEach((transform) => {
      const transformedBishop = Brain.transformSquare(canonical.bishop, transform);
      const bishopCoords = Brain.squareCoords(bishop.square);
      const transformedBishopCoords = Brain.squareCoords(transformedBishop);
      const fileOffset = bishopCoords.file - transformedBishopCoords.file;
      const rankOffset = bishopCoords.rank - transformedBishopCoords.rank;
      const transformAndTranslate = (square: Square) =>
        Brain.translateSquare(
          Brain.transformSquare(square, transform),
          fileOffset,
          rankOffset
        );
      const blackAnchorSquares = canonical.blackAnchorSquares
        .map(transformAndTranslate)
        .filter((square): square is Square => square != null);
      const stableKnightSquares = canonical.stableKnightSquares
        .map(transformAndTranslate)
        .filter((square): square is Square => square != null);
      if (
        blackAnchorSquares.length !== canonical.blackAnchorSquares.length ||
        stableKnightSquares.length !== canonical.stableKnightSquares.length ||
        !blackAnchorSquares.includes(blackKing.square) ||
        !blackAnchorSquares.slice(1).every((square) => Brain.edgeDistance(square) === 0)
      ) {
        return;
      }
      const setup = {
        bishopSquare: bishop.square,
        blackAnchorSquares,
        stableKnightSquares,
      };
      const key = [
        setup.bishopSquare,
        [...setup.blackAnchorSquares].sort().join("/"),
        [...setup.stableKnightSquares].sort().join("/"),
      ].join("|");
      candidates.set(key, setup);
    });

    return [...candidates.values()];
  }

  static getKnightAndBishopZoneXKnightDriftTarget(
    fen: string
  ): Square | undefined {
    const bishop = Brain.findPiece(fen, "w", "b");
    const blackKing = Brain.findPiece(fen, "b", "k");
    const whiteKing = Brain.findPiece(fen, "w", "k");
    if (!bishop || !blackKing || !whiteKing || Brain.edgeDistance(blackKing.square) !== 0) {
      return undefined;
    }

    const canonical = {
      bishop: "b3" as Square,
      blackKing: "b1" as Square,
      whiteKing: "c3" as Square,
      knightDriftTarget: "d3" as Square,
    };
    const targets = new Set<Square>();

    Brain.SQUARE_TRANSFORMS.forEach((transform) => {
      const transformedBishop = Brain.transformSquare(canonical.bishop, transform);
      const bishopCoords = Brain.squareCoords(bishop.square);
      const transformedBishopCoords = Brain.squareCoords(transformedBishop);
      const fileOffset = bishopCoords.file - transformedBishopCoords.file;
      const rankOffset = bishopCoords.rank - transformedBishopCoords.rank;
      const transformAndTranslate = (square: Square) =>
        Brain.translateSquare(
          Brain.transformSquare(square, transform),
          fileOffset,
          rankOffset
        );
      if (transformAndTranslate(canonical.blackKing) !== blackKing.square) {
        return;
      }
      if (transformAndTranslate(canonical.whiteKing) !== whiteKing.square) {
        return;
      }
      const target = transformAndTranslate(canonical.knightDriftTarget);
      if (target) {
        targets.add(target);
      }
    });

    return [...targets].sort()[0];
  }

  static compareKnightAndBishopZoneXSetups(
    fen: string,
    a: KnightAndBishopZoneXSetup,
    b: KnightAndBishopZoneXSetup
  ): number {
    const knight = Brain.findPiece(fen, "w", "n");
    const aKnightDistance = knight
      ? Brain.getKnightDistanceToAnySquare(knight.square, a.stableKnightSquares)
      : 99;
    const bKnightDistance = knight
      ? Brain.getKnightDistanceToAnySquare(knight.square, b.stableKnightSquares)
      : 99;
    return (
      aKnightDistance - bKnightDistance ||
      [...a.stableKnightSquares].sort().join("/").localeCompare(
        [...b.stableKnightSquares].sort().join("/")
      )
    );
  }

  static getKnightAndBishopZone5PathInstance(
    fen: string
  ): KnightAndBishopZone5 | undefined {
    return Brain.getKnightAndBishopZone5Candidates(fen).sort((a, b) =>
      Brain.compareKnightAndBishopZone5Candidates(fen, a, b)
    )[0];
  }

  static getKnightAndBishopZone5Candidates(
    fen: string
  ): KnightAndBishopZone5[] {
    const bishop = Brain.findPiece(fen, "w", "b");
    const knight = Brain.findPiece(fen, "w", "n");
    if (!bishop || !knight) {
      return [];
    }
    const canonical = {
      bishop: "e6" as Square,
      stableKnightSquares: ["c6", "g6"] as Square[],
      zoneSquares: ["e8", "f8"] as [Square, Square],
      escapeSquare: "g7" as Square,
      targetKingSquare: "f6" as Square,
    };
    const candidates = new Map<string, KnightAndBishopZone5>();

    Brain.SQUARE_TRANSFORMS.forEach((transform) => {
      const transformedBishop = Brain.transformSquare(canonical.bishop, transform);
      const bishopCoords = Brain.squareCoords(bishop.square);
      const transformedBishopCoords = Brain.squareCoords(transformedBishop);
      const fileOffset = bishopCoords.file - transformedBishopCoords.file;
      const rankOffset = bishopCoords.rank - transformedBishopCoords.rank;
      const transformAndTranslate = (square: Square) =>
        Brain.translateSquare(
          Brain.transformSquare(square, transform),
          fileOffset,
          rankOffset
        );
      const zoneSquares = canonical.zoneSquares
        .map(transformAndTranslate)
        .filter((square): square is Square => square != null);
      const escapeSquare: Square | "offboard" =
        transformAndTranslate(canonical.escapeSquare) ?? "offboard";
      const targetKingSquare = transformAndTranslate(canonical.targetKingSquare);
      if (
        zoneSquares.length !== 2 ||
        !targetKingSquare ||
        !zoneSquares.every((square) => Brain.edgeDistance(square) === 0)
      ) {
        return;
      }
      canonical.stableKnightSquares.forEach((canonicalStableKnightSquare) => {
        const stableKnightSquare = transformAndTranslate(canonicalStableKnightSquare);
        if (!stableKnightSquare || stableKnightSquare !== knight.square) {
          return;
        }
        const zone5: KnightAndBishopZone5 = {
          zoneSquares: [zoneSquares[0], zoneSquares[1]] as [Square, Square],
          escapeSquare,
          targetKingSquare,
          stableKnightSquare,
        };
        if (!Brain.whiteKingCanBlockKnightAndBishopZone5Escape(fen, zone5)) {
          return;
        }
        const key = Brain.getKnightAndBishopZone5Key(zone5);
        candidates.set(key, zone5);
      });
    });

    return [...candidates.values()];
  }

  static compareKnightAndBishopZone5Candidates(
    fen: string,
    a: KnightAndBishopZone5,
    b: KnightAndBishopZone5
  ): number {
    const blackKing = Brain.findPiece(fen, "b", "k");
    const knight = Brain.findPiece(fen, "w", "n");
    const aBlackInZone =
      blackKing && a.zoneSquares.includes(blackKing.square) ? 0 : 1;
    const bBlackInZone =
      blackKing && b.zoneSquares.includes(blackKing.square) ? 0 : 1;
    const aStableKnight = knight?.square === a.stableKnightSquare ? 0 : 1;
    const bStableKnight = knight?.square === b.stableKnightSquare ? 0 : 1;
    const aTargetOppositeKnight = knight
      ? -Brain.kingDistance(knight.square, a.targetKingSquare)
      : 0;
    const bTargetOppositeKnight = knight
      ? -Brain.kingDistance(knight.square, b.targetKingSquare)
      : 0;
    return (
      aBlackInZone - bBlackInZone ||
      aStableKnight - bStableKnight ||
      aTargetOppositeKnight - bTargetOppositeKnight ||
      Brain.getKnightAndBishopZone5Key(a).localeCompare(
        Brain.getKnightAndBishopZone5Key(b)
      )
    );
  }

  static getKnightAndBishopZone5Key(zone5: KnightAndBishopZone5): string {
    return [
      [...zone5.zoneSquares].sort().join("/"),
      zone5.escapeSquare,
      zone5.targetKingSquare,
      zone5.stableKnightSquare,
    ].join("|");
  }

  static translateSquare(
    square: Square,
    fileOffset: number,
    rankOffset: number
  ): Square | null {
    const coords = Brain.squareCoords(square);
    return Brain.squareFromCoords(
      coords.file + fileOffset,
      coords.rank + rankOffset
    );
  }

  static whiteKingCanBlockKnightAndBishopZone5Escape(
    fen: string,
    zone5 = Brain.getKnightAndBishopZone5PathInstance(fen)
  ): boolean {
    if (!zone5) {
      return false;
    }
    const whiteKing = Brain.findPiece(fen, "w", "k");
    if (!whiteKing) {
      return false;
    }
    const blocker = Brain.getEndgamePiecePlacements(fen).find(
      (piece) =>
        piece.square === zone5.targetKingSquare &&
        !(piece.color === "w" && piece.type === "k")
    );
    return (
      !blocker &&
      Brain.kingDistance(whiteKing.square, zone5.targetKingSquare) <= 1 &&
      (zone5.escapeSquare === "offboard" ||
        Brain.kingDistance(zone5.targetKingSquare, zone5.escapeSquare) === 1)
    );
  }

  static knightAndBishopBlackInZone5(
    fen: string,
    zone5 = Brain.getKnightAndBishopZone5(fen)
  ): boolean {
    const blackKing = Brain.findPiece(fen, "b", "k");
    return Boolean(
      zone5 && blackKing && zone5.zoneSquares.includes(blackKing.square)
    );
  }

  static sameKnightAndBishopZone5(
    a: KnightAndBishopZone5,
    b: KnightAndBishopZone5
  ): boolean {
    return Brain.getKnightAndBishopZone5Key(a) === Brain.getKnightAndBishopZone5Key(b);
  }

  static knightAndBishopAllBlackRepliesStayInZone5(
    fen: string,
    zone5 = Brain.getKnightAndBishopZone5PathInstance(fen)
  ): boolean {
    const chess = Brain.getChess(fen);
    if (chess.turn() !== "b" || !zone5) {
      return false;
    }
    const replies = chess.moves();
    return (
      replies.length > 0 &&
      replies.every((san) => {
        const next = Brain.getChess(fen);
        next.move(san);
        const replyZone5 = Brain.getKnightAndBishopZone5(next.fen());
        return Boolean(replyZone5);
      })
    );
  }

  static knightAndBishopWhiteMoveForcesZone5(
    fen: string,
    san: string
  ): boolean {
    const chess = Brain.getChess(fen);
    if (chess.turn() !== "w") {
      return false;
    }
    const move = chess.move(san);
    if (!move || chess.isCheckmate() || chess.isStalemate()) {
      return false;
    }
    const zone5 = Brain.getKnightAndBishopZone5PathInstance(chess.fen());
    return Brain.knightAndBishopAllBlackRepliesStayInZone5(chess.fen(), zone5);
  }

  static knightAndBishopWhiteMoveUsesZoneX(
    fen: string,
    san: string
  ): boolean {
    return Brain.getKnightAndBishopZoneXEntryScore(fen, san) === 0;
  }

  static getKnightAndBishopZoneXEntryScore(fen: string, san: string): number {
    const moveForcesZone5 = Brain.knightAndBishopWhiteMoveForcesZone5(fen, san);
    const prepareMove = Brain.getKnightAndBishopZoneXPrepareMove(fen);
    if (prepareMove) {
      const prepareMoveForcesZone5 =
        prepareMove === san
          ? moveForcesZone5
          : Brain.knightAndBishopWhiteMoveForcesZone5(fen, prepareMove);
      if (prepareMoveForcesZone5) {
        return prepareMove === san ? 0 : moveForcesZone5 ? 1 : 2;
      }
    }
    return moveForcesZone5 ? 0 : 1;
  }

  static getKnightAndBishopZoneXPrepareMove(
    fen: string
  ): string | undefined {
    const chess = Brain.getChess(fen);
    if (chess.turn() !== "w") {
      return undefined;
    }
    const zoneX = Brain.getKnightAndBishopZone5(fen);
    const bishop = Brain.findPiece(fen, "w", "b");
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (!zoneX || !bishop || !whiteKing || !blackKing) {
      return undefined;
    }

    const target = Brain.squareCoords(zoneX.targetKingSquare);
    const bishopCoords = Brain.squareCoords(bishop.square);
    const sideSquare = Brain.squareFromCoords(
      target.file + (target.file - bishopCoords.file),
      target.rank + (target.rank - bishopCoords.rank)
    );
    const edgeDirection = Brain.getZoneXEdgeDirection(zoneX);
    const backSquare = edgeDirection
      ? Brain.squareFromCoords(
        target.file - edgeDirection.file,
        target.rank - edgeDirection.rank
      )
      : null;

    const [firstZoneSquare, secondZoneSquare] = zoneX.zoneSquares;
    if (
      backSquare &&
      sideSquare &&
      whiteKing.square === backSquare &&
      blackKing.square === secondZoneSquare
    ) {
      return Brain.getLegalMoveSan(fen, whiteKing.square, sideSquare);
    }

    const targetMove = Brain.getLegalMoveSan(
      fen,
      whiteKing.square,
      zoneX.targetKingSquare
    );
    if (whiteKing.square !== zoneX.targetKingSquare && targetMove) {
      return targetMove;
    }

    if (
      whiteKing.square === zoneX.targetKingSquare &&
      blackKing.square === firstZoneSquare &&
      backSquare
    ) {
      return Brain.getLegalMoveSan(fen, whiteKing.square, backSquare);
    }
    if (
      sideSquare &&
      whiteKing.square === sideSquare &&
      blackKing.square === firstZoneSquare
    ) {
      return Brain.getLegalMoveSan(
        fen,
        whiteKing.square,
        zoneX.targetKingSquare
      );
    }

    return undefined;
  }

  static getKnightAndBishopEstablishedZoneXKnightRouteTarget(
    fen: string
  ): Square | undefined {
    const bishop = Brain.findPiece(fen, "w", "b");
    const blackKing = Brain.findPiece(fen, "b", "k");
    const whiteKing = Brain.findPiece(fen, "w", "k");
    if (!bishop || !blackKing || !whiteKing) {
      return undefined;
    }

    const canonical = {
      blackKingSquares: ["a2", "a1"] as Square[],
      whiteKing: "c3" as Square,
      bishop: "c2" as Square,
      knightRouteTarget: "b3" as Square,
    };
    const targets = new Set<Square>();

    Brain.SQUARE_TRANSFORMS.forEach((transform) => {
      if (Brain.transformSquare(canonical.bishop, transform) !== bishop.square) {
        return;
      }
      if (
        !canonical.blackKingSquares
          .map((square) => Brain.transformSquare(square, transform))
          .includes(blackKing.square)
      ) {
        return;
      }
      if (Brain.transformSquare(canonical.whiteKing, transform) !== whiteKing.square) {
        return;
      }
      const target = Brain.transformSquare(canonical.knightRouteTarget, transform);
      if (Brain.edgeDistance(target) > 0) {
        targets.add(target);
      }
    });

    return [...targets].sort()[0];
  }

  static getKnightAndBishopEstablishedZoneXKnightRouteScore(
    fen: string,
    resultFen: string,
    move: ReturnType<Chess["move"]>
  ): number {
    const target = Brain.getKnightAndBishopEstablishedZoneXKnightRouteTarget(fen);
    const beforeKnight = Brain.findPiece(fen, "w", "n");
    const afterKnight = Brain.findPiece(resultFen, "w", "n");
    if (
      !target ||
      !beforeKnight ||
      !afterKnight ||
      move?.piece !== "n" ||
      Brain.edgeDistance(afterKnight.square) === 0
    ) {
      return 99;
    }
    const beforeDistance = Brain.getKnightDistanceToAnySquare(
      beforeKnight.square,
      [target]
    );
    const afterDistance = Brain.getKnightDistanceToAnySquare(
      afterKnight.square,
      [target]
    );
    return afterDistance < beforeDistance ? afterDistance : 99;
  }

  static getKnightAndBishopZoneXPrepareScore(
    fen: string,
    _san: string,
    resultFen: string,
    move: ReturnType<Chess["move"]>
  ): {
    zoneXPrepareScore: number;
    zoneXPreparePieceProximity: number;
    zoneXDriftScore: number;
  } {
    const setup = Brain.getKnightAndBishopZoneXSetup(fen);
    if (!setup) {
      const resultSetup = Brain.getKnightAndBishopZoneXSetup(resultFen);
      if (
        resultSetup &&
        Brain.knightAndBishopAllBlackRepliesPreserveZoneXSetup(
          resultFen,
          resultSetup
        )
      ) {
        return {
          zoneXPrepareScore: 0,
          zoneXPreparePieceProximity:
            Brain.getKnightAndBishopZoneXSetupPieceProximity(resultFen),
          zoneXDriftScore: 99,
        };
      }
      const driftTarget = Brain.getKnightAndBishopZoneXKnightDriftTarget(fen);
      const beforeKnight = Brain.findPiece(fen, "w", "n");
      const afterKnight = Brain.findPiece(resultFen, "w", "n");
      if (driftTarget && beforeKnight && afterKnight && move?.piece === "n") {
        const beforeDistance = Brain.getKnightDistanceToAnySquare(
          beforeKnight.square,
          [driftTarget]
        );
        const afterDistance = Brain.getKnightDistanceToAnySquare(
          afterKnight.square,
          [driftTarget]
        );
        if (afterDistance < beforeDistance) {
          return {
            zoneXPrepareScore: afterDistance,
            zoneXPreparePieceProximity: 0,
            zoneXDriftScore: 0,
          };
        }
      }
      return {
        zoneXPrepareScore: 99,
        zoneXPreparePieceProximity: 99,
        zoneXDriftScore: 99,
      };
    }

    if (Brain.knightAndBishopHasZoneXKingProgressMove(fen)) {
      const beforeWhiteKing = Brain.findPiece(fen, "w", "k");
      const beforeBlackKing = Brain.findPiece(fen, "b", "k");
      const afterWhiteKing = Brain.findPiece(resultFen, "w", "k");
      const afterBlackKing = Brain.findPiece(resultFen, "b", "k");
      const movedKingCloser =
        move?.piece === "k" &&
        beforeWhiteKing &&
        beforeBlackKing &&
        afterWhiteKing &&
        afterBlackKing &&
        Brain.manhattanDistance(afterWhiteKing.square, afterBlackKing.square) <
          Brain.manhattanDistance(beforeWhiteKing.square, beforeBlackKing.square);
      return {
        zoneXPrepareScore: movedKingCloser
          ? Brain.manhattanDistance(afterWhiteKing!.square, afterBlackKing!.square)
          : 99,
        zoneXPreparePieceProximity: movedKingCloser
          ? Brain.kingDistance(afterWhiteKing!.square, afterBlackKing!.square)
          : 99,
        zoneXDriftScore: 99,
      };
    }

    const knight = Brain.findPiece(resultFen, "w", "n");
    if (!knight) {
      return {
        zoneXPrepareScore: 0,
        zoneXPreparePieceProximity: 0,
        zoneXDriftScore: 99,
      };
    }
    const knightDistance = Brain.getKnightDistanceToAnySquare(
      knight.square,
      setup.stableKnightSquares
    );
    const knightAlreadyPlaced = setup.stableKnightSquares.includes(knight.square);
    const knightMovePenalty = move?.piece === "n" || knightAlreadyPlaced ? 0 : 99;
    return {
      zoneXPrepareScore: knightMovePenalty + knightDistance,
      zoneXPreparePieceProximity:
        Brain.getKnightAndBishopZoneXSetupPieceProximity(resultFen),
      zoneXDriftScore: 99,
    };
  }

  static knightAndBishopAllBlackRepliesPreserveZoneXSetup(
    fen: string,
    setup = Brain.getKnightAndBishopZoneXSetup(fen)
  ): boolean {
    const chess = Brain.getChess(fen);
    if (chess.turn() !== "b" || !setup) {
      return false;
    }
    const replies = chess.moves();
    return (
      replies.length > 0 &&
      replies.every((san) => {
        const next = Brain.getChess(fen);
        next.move(san);
        const replyFen = next.fen();
        const replySetup = Brain.getKnightAndBishopZoneXSetup(replyFen);
        return (
          Boolean(
            replySetup &&
              Brain.sameKnightAndBishopZoneXSetup(replySetup, setup)
          ) || Boolean(Brain.getKnightAndBishopZone5(replyFen))
        );
      })
    );
  }

  static sameKnightAndBishopZoneXSetup(
    a: KnightAndBishopZoneXSetup,
    b: KnightAndBishopZoneXSetup
  ): boolean {
    return (
      a.bishopSquare === b.bishopSquare &&
      [...a.blackAnchorSquares].sort().join("/") ===
        [...b.blackAnchorSquares].sort().join("/") &&
      [...a.stableKnightSquares].sort().join("/") ===
        [...b.stableKnightSquares].sort().join("/")
    );
  }

  static knightAndBishopHasZoneXKingProgressMove(fen: string): boolean {
    const beforeWhiteKing = Brain.findPiece(fen, "w", "k");
    const beforeBlackKing = Brain.findPiece(fen, "b", "k");
    if (!beforeWhiteKing || !beforeBlackKing) {
      return false;
    }
    const beforeDistance = Brain.manhattanDistance(
      beforeWhiteKing.square,
      beforeBlackKing.square
    );
    return Brain.getChess(fen).moves().some((san) => {
      const chess = Brain.getChess(fen);
      const move = chess.move(san);
      if (move?.captured === "k") {
        return false;
      }
      const whiteKing = Brain.findPiece(chess.fen(), "w", "k");
      const blackKing = Brain.findPiece(chess.fen(), "b", "k");
      return Boolean(
        move?.piece === "k" &&
        whiteKing &&
        blackKing &&
        Brain.manhattanDistance(whiteKing.square, blackKing.square) < beforeDistance
      );
    });
  }

  static getKnightAndBishopZoneXSetupPieceProximity(fen: string): number {
    const knight = Brain.findPiece(fen, "w", "n");
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const bishop = Brain.findPiece(fen, "w", "b");
    if (!knight || !whiteKing || !bishop) {
      return 99;
    }
    return (
      Brain.kingDistance(knight.square, whiteKing.square) +
      Brain.kingDistance(knight.square, bishop.square)
    );
  }

  static getKnightDistanceToAnySquare(
    from: Square,
    targets: Square[]
  ): number {
    const targetSet = new Set(targets);
    if (targetSet.has(from)) {
      return 0;
    }
    const queue = [from];
    const distance = new Map<Square, number>([[from, 0]]);
    for (let head = 0; head < queue.length; head += 1) {
      const square = queue[head];
      const nextDistance = distance.get(square)! + 1;
      for (const next of Brain.allSquares()) {
        if (!Brain.isKnightMove(square, next) || distance.has(next)) {
          continue;
        }
        if (targetSet.has(next)) {
          return nextDistance;
        }
        distance.set(next, nextDistance);
        queue.push(next);
      }
    }
    return 99;
  }

  static getZoneXEdgeDirection(
    zoneX: KnightAndBishopZone5
  ): { file: number; rank: number } | undefined {
    const edgeSquare = Brain.squareCoords(zoneX.zoneSquares[0]);
    if (edgeSquare.rank === 7) {
      return { file: 0, rank: 1 };
    }
    if (edgeSquare.rank === 0) {
      return { file: 0, rank: -1 };
    }
    if (edgeSquare.file === 7) {
      return { file: 1, rank: 0 };
    }
    if (edgeSquare.file === 0) {
      return { file: -1, rank: 0 };
    }
    return undefined;
  }

  static getNearestEdgeDirection(
    square: Square
  ): { file: number; rank: number } | undefined {
    const coords = Brain.squareCoords(square);
    const distances = [
      { distance: 7 - coords.rank, direction: { file: 0, rank: 1 } },
      { distance: coords.rank, direction: { file: 0, rank: -1 } },
      { distance: 7 - coords.file, direction: { file: 1, rank: 0 } },
      { distance: coords.file, direction: { file: -1, rank: 0 } },
    ];
    distances.sort((a, b) => a.distance - b.distance);
    return distances[0]?.direction;
  }

  static getLegalMoveSan(
    fen: string,
    from: Square,
    to: Square
  ): string | undefined {
    if (from === to) {
      return undefined;
    }
    try {
      const result = Brain.getChess(fen).move({ from, to });
      return result?.san;
    } catch {
      return undefined;
    }
  }

  static isKnightAndBishopKeySquarePattern(fen: string): boolean {
    return Brain.getKnightAndBishopKeySquarePatternScore(fen) < 2;
  }

  static getKnightAndBishopKeySquarePatternScore(fen: string): number {
    const bishop = Brain.findPiece(fen, "w", "b");
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const blackKing = Brain.findPiece(fen, "b", "k");
    const knight = Brain.findPiece(fen, "w", "n");
    if (!bishop || !whiteKing || !blackKing || !knight) {
      return 2;
    }

    if (Brain.edgeDistance(blackKing.square) !== 0) {
      return 2;
    }

    const whiteKingCoords = Brain.squareCoords(whiteKing.square);
    const keySquares = Brain.getEdgeDirectionsForSquare(blackKing.square)
      .map((direction) => {
        const blackKingCoords = Brain.squareCoords(blackKing.square);
        const axis = direction.file !== 0 ? "file" : "rank";
        if (
          whiteKingCoords[axis] ===
          blackKingCoords[axis] - direction[axis] * 2
        ) {
          return Brain.squareFromCoords(
            whiteKingCoords.file + direction.file,
            whiteKingCoords.rank + direction.rank
          );
        }
        return null;
      })
      .filter(
        (square): square is Square =>
          square != null &&
          Brain.edgeDistance(square) > 0 &&
          Brain.kingDistance(square, blackKing.square) === 1 &&
          Brain.sameSquareColor(square, bishop.square)
      );
    if (keySquares.length === 0) {
      return 2;
    }

    const kingsInOpposition = Brain.hasDirectKingOpposition(
      whiteKing.square,
      blackKing.square
    );

    return keySquares.reduce((bestScore, keySquare) => {
      if (kingsInOpposition) {
        if (knight.square === keySquare) {
          return Math.min(bestScore, 0);
        }
        if (
          Brain.edgeDistance(knight.square) > 0 &&
          Brain.knightControlsSquare(knight.square, keySquare)
        ) {
          return Math.min(bestScore, 1);
        }
        return bestScore;
      }

      const escapeSquare = Brain.getKnightAndBishopPrePrepareEscapeSquare(
        blackKing.square,
        whiteKing.square,
        keySquare
      );
      if (
        knight.square === keySquare &&
        escapeSquare != null &&
        Brain.bishopControlsOrOccupiesSquare(
          fen,
          bishop.square,
          escapeSquare
        )
      ) {
        return Math.min(bestScore, 0);
      }
      return bestScore;
    }, 2);
  }

  static getEdgeDirectionsForSquare(
    square: Square
  ): Array<{ file: -1 | 0 | 1; rank: -1 | 0 | 1 }> {
    const coords = Brain.squareCoords(square);
    const directions: Array<{ file: -1 | 0 | 1; rank: -1 | 0 | 1 }> = [];
    if (coords.rank === 7) {
      directions.push({ file: 0, rank: 1 });
    }
    if (coords.rank === 0) {
      directions.push({ file: 0, rank: -1 });
    }
    if (coords.file === 7) {
      directions.push({ file: 1, rank: 0 });
    }
    if (coords.file === 0) {
      directions.push({ file: -1, rank: 0 });
    }
    return directions;
  }

  static getAdjacentSquares(square: Square): Square[] {
    const coords = Brain.squareCoords(square);
    const squares: Square[] = [];
    for (let fileOffset = -1; fileOffset <= 1; fileOffset += 1) {
      for (let rankOffset = -1; rankOffset <= 1; rankOffset += 1) {
        if (fileOffset === 0 && rankOffset === 0) {
          continue;
        }
        const adjacent = Brain.squareFromCoords(
          coords.file + fileOffset,
          coords.rank + rankOffset
        );
        if (adjacent) {
          squares.push(adjacent);
        }
      }
    }
    return squares;
  }

  static getKnightAndBishopPrePrepareEscapeSquare(
    blackKing: Square,
    whiteKing: Square,
    keySquare: Square
  ): Square | undefined {
    const blackKingCoords = Brain.squareCoords(blackKing);
    const whiteKingCoords = Brain.squareCoords(whiteKing);
    const keyCoords = Brain.squareCoords(keySquare);
    const diagonalSquares = Brain.getAdjacentSquares(blackKing).filter(
      (square) => {
        const coords = Brain.squareCoords(square);
        return (
          Math.abs(coords.file - blackKingCoords.file) === 1 &&
          Math.abs(coords.rank - blackKingCoords.rank) === 1
        );
      }
    );
    return diagonalSquares
      .filter((square) => square !== keySquare)
      .sort((a, b) => {
        const aDistance = Brain.kingDistance(a, whiteKing);
        const bDistance = Brain.kingDistance(b, whiteKing);
        if (aDistance !== bDistance) {
          return bDistance - aDistance;
        }
        const aAwayScore =
          Math.sign(Brain.squareCoords(a).file - blackKingCoords.file) *
          Math.sign(blackKingCoords.file - whiteKingCoords.file) +
          Math.sign(Brain.squareCoords(a).rank - blackKingCoords.rank) *
          Math.sign(blackKingCoords.rank - whiteKingCoords.rank);
        const bAwayScore =
          Math.sign(Brain.squareCoords(b).file - blackKingCoords.file) *
          Math.sign(blackKingCoords.file - whiteKingCoords.file) +
          Math.sign(Brain.squareCoords(b).rank - blackKingCoords.rank) *
          Math.sign(blackKingCoords.rank - whiteKingCoords.rank);
        if (aAwayScore !== bAwayScore) {
          return bAwayScore - aAwayScore;
        }
        return a.localeCompare(b);
      })
      .find((square) => {
        const coords = Brain.squareCoords(square);
        return (
          Math.abs(coords.file - keyCoords.file) +
          Math.abs(coords.rank - keyCoords.rank) >
          0
        );
      });
  }

  static knightControlsSquare(knight: Square, target: Square): boolean {
    const knightCoords = Brain.squareCoords(knight);
    const targetCoords = Brain.squareCoords(target);
    const fileDistance = Math.abs(knightCoords.file - targetCoords.file);
    const rankDistance = Math.abs(knightCoords.rank - targetCoords.rank);
    return (
      (fileDistance === 1 && rankDistance === 2) ||
      (fileDistance === 2 && rankDistance === 1)
    );
  }

  static getImmediateMateMoves(fen: string, moves: string[]): string[] {
    return moves.filter((san) => {
      const chess = Brain.getChess(fen);
      chess.move(san);
      return chess.isCheckmate();
    });
  }

  static lookupEntryResultMatches(
    fen: string,
    entries: Array<{ key: string; from: Square; to: Square }>
  ): boolean {
    if (entries === Brain.KNIGHT_AND_BISHOP_LOOKUP_ENTRIES) {
      return Brain.getKnightAndBishopLookupResultKeys().has(
        Brain.boardTurnKey(fen)
      );
    }
    return Brain.SQUARE_TRANSFORMS.some((transform) => {
      const key = Brain.getTransformedPositionKey(fen, transform);
      return entries.some(
        (entry) => Brain.getLookupEntryResultKey(entry) === key
      );
    });
  }

  static getKnightAndBishopLookupResultKeys(): Set<string> {
    if (Brain.knightAndBishopLookupResultKeys) {
      return Brain.knightAndBishopLookupResultKeys;
    }
    const resultKeys = new Set<string>();
    Brain.KNIGHT_AND_BISHOP_LOOKUP_ENTRIES.forEach((entry) => {
      const resultFen = Brain.getLookupEntryResultFen(entry);
      Brain.SQUARE_TRANSFORMS.forEach((transform) => {
        resultKeys.add(Brain.getTransformedPositionKey(resultFen, transform));
      });
    });
    Brain.knightAndBishopLookupResultKeys = resultKeys;
    return resultKeys;
  }

  static getLookupEntryResultFen(entry: {
    key: string;
    from: Square;
    to: Square;
  }): string {
    const [board, turn] = entry.key.split(" ");
    const chess = Brain.getChess(`${board} ${turn} - - 0 1`);
    chess.move({ from: entry.from, to: entry.to });
    return chess.fen();
  }

  static getLookupEntryResultKey(entry: {
    key: string;
    from: Square;
    to: Square;
  }): string {
    return Brain.getTransformedPositionKey(
      Brain.getLookupEntryResultFen(entry),
      Brain.getSquareTransform("identity")
    );
  }

  static scoreKnightAndBishopWhiteMove(fen: string, san: string) {
    const chess = Brain.getChess(fen);
    const move = chess.move(san);
    const resultFen = chess.fen();
    const whiteKing = Brain.findPiece(resultFen, "w", "k");
    const blackKing = Brain.findPiece(resultFen, "b", "k");
    const bishop = Brain.findPiece(resultFen, "w", "b");
    const currentBlackKing = Brain.findPiece(fen, "b", "k");
    const useEdgePlan = Boolean(
      currentBlackKing && Brain.edgeDistance(currentBlackKing.square) <= 1
    );
    return {
      mateScore: chess.isCheckmate() ? 0 : 1,
      stalemateScore:
        !chess.isCheckmate() && chess.isStalemate() ? 1 : 0,
      pieceSafetyScore: Brain.blackCanTakeKnightOrBishop(resultFen) ? 1 : 0,
      phaseTwoEntryScore: Brain.knightAndBishopWhiteMoveReachesLookupPath(
        fen,
        san
      )
        ? 0
        : 1,
      keySquarePatternScore:
        Brain.knightAndBishopKingApproachesMiddle16(fen, resultFen, move?.piece)
          ? 0
          : Brain.getKnightAndBishopKeySquarePatternScore(resultFen),
      zoneXEstablishedKnightRouteScore:
        Brain.getKnightAndBishopEstablishedZoneXKnightRouteScore(
          fen,
          resultFen,
          move
        ),
      zoneXEntryScore: Brain.getKnightAndBishopZoneXEntryScore(fen, san),
      ...Brain.getKnightAndBishopZoneXPrepareScore(fen, san, resultFen, move),
      bishopKnightDiagonalAdjacencyScore:
        Brain.bishopKnightDiagonallyAdjacent(resultFen) ? 0 : 1,
      usefulCheckScore:
        useEdgePlan && !Brain.isCorner(currentBlackKing!.square)
          ? chess.isCheck()
            ? 0
            : 1
          : 0,
      wManeuverSetupDistance: useEdgePlan
        ? Brain.wManeuverSetupDistance(resultFen)
        : 0,
      edgeKingKeyDistance: useEdgePlan
        ? Brain.whiteKingEdgeKeyDistance(resultFen)
        : 0,
      edgeCageScore: useEdgePlan ? -Brain.edgeCageScore(resultFen) : 0,
      blackEscapeMoveCount: Brain.getChess(resultFen).moves().length,
      blackKingBishopCornerDistance: Brain.distanceToNearestBishopCorner(
        resultFen
      ),
      kingMoveNoGainPenalty:
        move?.piece === "k" &&
          whiteKing &&
          blackKing &&
          currentBlackKing &&
          Brain.manhattanDistance(whiteKing.square, blackKing.square) >=
          Brain.manhattanDistance(
            Brain.findPiece(fen, "w", "k")?.square || whiteKing.square,
            currentBlackKing.square
          )
          ? 1
          : 0,
      blackInwardEscapeCount: useEdgePlan
        ? Brain.blackInwardEscapeCount(resultFen)
        : 0,
      centralEscapeMoveCount: useEdgePlan
        ? Brain.blackCentralEscapeMoveCount(resultFen)
        : 0,
      blackKingCenterAccessScore:
        Brain.knightAndBishopShouldDriveFromCenter(fen)
          ? -Brain.knightAndBishopBestBlackReplyCenterDistance(resultFen)
          : 0,
      whiteKingCentralDistance: whiteKing
        ? Brain.centerDistance(whiteKing.square)
        : 99,
      whiteKingDistance:
        whiteKing && blackKing
          && Brain.isMiddle16Square(whiteKing.square)
          ? Brain.manhattanDistance(whiteKing.square, blackKing.square)
          : 0,
      bishopBlackKingDistance:
        bishop && blackKing
          ? Brain.manhattanDistance(bishop.square, blackKing.square)
          : 99,
      bishopWallMoveScore: Brain.knightAndBishopBuildsBishopWall(
        fen,
        resultFen,
        move?.piece
      )
        ? 0
        : 1,
      kingCloserOppositeBishopScore:
        Brain.knightAndBishopKingCloserOppositeBishopScore(
          fen,
          resultFen,
          move?.piece
        ),
      kingDistanceRegressionScore:
        Brain.knightAndBishopKingDistanceRegressionScore(
          fen,
          resultFen,
          move?.piece
        ),
      bishopFrontPreparationScore:
        Brain.knightAndBishopBishopFrontPreparationScore(
          fen,
          resultFen,
          move?.piece
        ),
      bishopInFrontScore: Brain.knightAndBishopBishopInFrontScore(
        fen,
        resultFen,
        move?.piece
      ),
      movedPiece: move?.piece,
      bishopOppositionLoopScore:
        Brain.knightAndBishopBishopOppositionLoopScore(fen, move?.piece),
      knightBehindWhiteKingScore:
        Brain.knightAndBishopKnightBehindWhiteKingScore(resultFen),
      knightWhiteKingDistance:
        Brain.knightAndBishopKnightWhiteKingDistance(resultFen),
      knightCentralDistance: Brain.knightAndBishopKnightCentralDistance(resultFen),
      knightBlackKingDistance:
        Brain.knightAndBishopKnightBlackKingDistance(resultFen),
      triangleCompactness: useEdgePlan
        ? 0
        : Brain.whiteTriangleCompactness(resultFen),
      minorCentralDistance: Brain.whiteMinorCentralDistance(resultFen),
      wManeuverKingMoveScore: 0,
      unprotectedMinorAttackScore: 0,
      edgeCheckProgressScore: 0,
      edgeBishopKickScore: 0,
      edgeKnightOutpostDistance: 0,
      edgeCornerResistanceDistance: 0,
      nearEdgeCornerResistanceDistance: 0,
      edgeKnightShufflePenalty: 0,
      edgePieceSetupScore: 0,
      nearEdgeMobilityScore: 0,
      blackMobilityScore: 0,
      edgeDistance: 0,
      minorCoordination: 0,
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
      a.phaseTwoEntryScore - b.phaseTwoEntryScore ||
      a.keySquarePatternScore - b.keySquarePatternScore ||
      a.zoneXEstablishedKnightRouteScore -
        b.zoneXEstablishedKnightRouteScore ||
      a.zoneXEntryScore - b.zoneXEntryScore ||
      a.zoneXPrepareScore - b.zoneXPrepareScore ||
      a.zoneXPreparePieceProximity - b.zoneXPreparePieceProximity ||
      Brain.compareAfterZoneXDrift(
        a,
        b,
        () =>
          a.kingCloserOppositeBishopScore - b.kingCloserOppositeBishopScore ||
          a.kingDistanceRegressionScore - b.kingDistanceRegressionScore ||
          a.bishopOppositionLoopScore - b.bishopOppositionLoopScore ||
          a.knightBehindWhiteKingScore - b.knightBehindWhiteKingScore ||
          a.bishopInFrontScore - b.bishopInFrontScore ||
          a.bishopFrontPreparationScore - b.bishopFrontPreparationScore ||
          a.bishopBlackKingDistance - b.bishopBlackKingDistance ||
          Brain.compareKnightMoveWhiteKingDistances(a, b) ||
          a.knightCentralDistance - b.knightCentralDistance ||
          b.knightBlackKingDistance - a.knightBlackKingDistance
      )
    );
  }

  static getKnightAndBishopWhiteScoreReasons(): Array<
    ScoreReason<ReturnType<typeof Brain.scoreKnightAndBishopWhiteMove>>
  > {
    return [
      { reason: "mate", compare: (a, b) => a.mateScore - b.mateScore },
      {
        reason: "no stalemate",
        compare: (a, b) => a.stalemateScore - b.stalemateScore,
      },
      {
        reason: "minors safe",
        compare: (a, b) => a.pieceSafetyScore - b.pieceSafetyScore,
      },
      {
        reason: "enter mating net",
        compare: (a, b) => a.phaseTwoEntryScore - b.phaseTwoEntryScore,
      },
      {
        reason: "key square pattern",
        compare: (a, b) =>
          a.keySquarePatternScore - b.keySquarePatternScore,
      },
      {
        reason: "prepare zone x",
        compare: (a, b) =>
          a.zoneXEstablishedKnightRouteScore -
          b.zoneXEstablishedKnightRouteScore,
      },
      {
        reason: "force zone x",
        compare: (a, b) => a.zoneXEntryScore - b.zoneXEntryScore,
      },
      {
        reason: "prepare zone x",
        compare: (a, b) =>
          a.zoneXPrepareScore - b.zoneXPrepareScore ||
          a.zoneXPreparePieceProximity - b.zoneXPreparePieceProximity,
      },
      {
        reason: "bring king closer",
        compare: (a, b) =>
          Brain.compareAfterZoneXDrift(
            a,
            b,
            () =>
              a.kingCloserOppositeBishopScore -
              b.kingCloserOppositeBishopScore
          ),
      },
      {
        reason: "bring king closer",
        compare: (a, b) =>
          Brain.compareAfterZoneXDrift(
            a,
            b,
            () =>
              a.kingDistanceRegressionScore - b.kingDistanceRegressionScore
          ),
      },
      {
        reason: "knight closer center",
        compare: (a, b) =>
          Brain.compareAfterZoneXDrift(
            a,
            b,
            () =>
              a.bishopOppositionLoopScore - b.bishopOppositionLoopScore ||
              a.knightBehindWhiteKingScore - b.knightBehindWhiteKingScore
          ),
      },
      {
        reason: "bishop front",
        compare: (a, b) =>
          Brain.compareAfterZoneXDrift(
            a,
            b,
            () =>
              a.bishopInFrontScore - b.bishopInFrontScore ||
              a.bishopFrontPreparationScore - b.bishopFrontPreparationScore ||
              a.bishopBlackKingDistance - b.bishopBlackKingDistance
          ),
      },
      {
        reason: "knight closer center",
        compare: (a, b) =>
          Brain.compareAfterZoneXDrift(
            a,
            b,
            () =>
              Brain.compareKnightMoveWhiteKingDistances(a, b) ||
              a.knightCentralDistance - b.knightCentralDistance ||
              b.knightBlackKingDistance - a.knightBlackKingDistance
          ),
      },
    ];
  }

  static compareAfterZoneXDrift(
    a: ReturnType<typeof Brain.scoreKnightAndBishopWhiteMove>,
    b: ReturnType<typeof Brain.scoreKnightAndBishopWhiteMove>,
    compare: () => number
  ): number {
    return a.zoneXDriftScore === 0 && b.zoneXDriftScore === 0
      ? 0
      : compare();
  }

  static compareKnightMoveWhiteKingDistances(
    a: ReturnType<typeof Brain.scoreKnightAndBishopWhiteMove>,
    b: ReturnType<typeof Brain.scoreKnightAndBishopWhiteMove>
  ): number {
    return a.movedPiece === "n" && b.movedPiece === "n"
      ? a.knightWhiteKingDistance - b.knightWhiteKingDistance
      : 0;
  }

  static knightAndBishopShouldDriveFromCenter(fen: string): boolean {
    const blackKing = Brain.findPiece(fen, "b", "k");
    return Boolean(blackKing);
  }

  static knightAndBishopBuildsBishopWall(
    fen: string,
    resultFen: string,
    piece: string | undefined
  ): boolean {
    if (piece !== "b") {
      return false;
    }
    const blackKing = Brain.findPiece(fen, "b", "k");
    const bishop = Brain.findPiece(resultFen, "w", "b");
    if (
      !blackKing ||
      !bishop ||
      Brain.edgeDistance(blackKing.square) <= 1 ||
      Brain.centerDistance(blackKing.square) > 1
    ) {
      return false;
    }
    return Brain.kingDistance(blackKing.square, bishop.square) <= 1;
  }

  static knightAndBishopKingCloserOppositeBishopScore(
    fen: string,
    resultFen: string,
    piece: string | undefined
  ): number {
    if (piece !== "k") {
      return 99;
    }
    const beforeWhiteKing = Brain.findPiece(fen, "w", "k");
    const beforeBlackKing = Brain.findPiece(fen, "b", "k");
    const afterWhiteKing = Brain.findPiece(resultFen, "w", "k");
    const afterBlackKing = Brain.findPiece(resultFen, "b", "k");
    const bishop = Brain.findPiece(resultFen, "w", "b");
    if (
      !beforeWhiteKing ||
      !beforeBlackKing ||
      !afterWhiteKing ||
      !afterBlackKing ||
      !bishop
    ) {
      return 99;
    }
    if (
      Brain.isMiddle16Square(beforeWhiteKing.square) &&
      !Brain.isMiddle16Square(afterWhiteKing.square)
    ) {
      return 99;
    }
    if (
      Brain.knightAndBishopKingApproachesMiddle16(fen, resultFen, piece)
    ) {
      return 50 + Brain.middle16Distance(afterWhiteKing.square);
    }

    const afterDistance = Brain.squaredEuclideanDistance(
      afterWhiteKing.square,
      afterBlackKing.square
    );
    if (
      afterDistance >=
      Brain.squaredEuclideanDistance(
        beforeWhiteKing.square,
        beforeBlackKing.square
      )
    ) {
      return 99;
    }
    return Brain.sameSquareColor(afterWhiteKing.square, bishop.square) &&
      !Brain.isKnightAndBishopDiagonalBishopApproachShape(fen)
      ? 99
      : afterDistance;
  }

  static knightAndBishopKingApproachesMiddle16(
    fen: string,
    resultFen: string,
    piece: string | undefined
  ): boolean {
    if (piece !== "k") {
      return false;
    }
    const beforeWhiteKing = Brain.findPiece(fen, "w", "k");
    const afterWhiteKing = Brain.findPiece(resultFen, "w", "k");
    return Boolean(
      beforeWhiteKing &&
      afterWhiteKing &&
      !Brain.isMiddle16Square(beforeWhiteKing.square) &&
      Brain.middle16Distance(afterWhiteKing.square) <
      Brain.middle16Distance(beforeWhiteKing.square)
    );
  }

  static knightAndBishopKingDistanceRegressionScore(
    fen: string,
    resultFen: string,
    piece: string | undefined
  ): number {
    if (piece !== "k") {
      return 0;
    }
    const beforeWhiteKing = Brain.findPiece(fen, "w", "k");
    const beforeBlackKing = Brain.findPiece(fen, "b", "k");
    const afterWhiteKing = Brain.findPiece(resultFen, "w", "k");
    const afterBlackKing = Brain.findPiece(resultFen, "b", "k");
    if (!beforeWhiteKing || !beforeBlackKing || !afterWhiteKing || !afterBlackKing) {
      return 0;
    }
    const beforeDistance = Brain.squaredEuclideanDistance(
      beforeWhiteKing.square,
      beforeBlackKing.square
    );
    const afterDistance = Brain.squaredEuclideanDistance(
      afterWhiteKing.square,
      afterBlackKing.square
    );
    return Math.max(0, afterDistance - beforeDistance);
  }

  static knightAndBishopBishopFrontPreparationScore(
    fen: string,
    resultFen: string,
    piece: string | undefined
  ): number {
    if (
      piece !== "b" ||
      Brain.isKnightAndBishopBishopOppositionLoopShape(fen)
    ) {
      return 99;
    }
    const whiteKing = Brain.findPiece(resultFen, "w", "k");
    const blackKing = Brain.findPiece(resultFen, "b", "k");
    const bishop = Brain.findPiece(resultFen, "w", "b");
    if (!whiteKing || !blackKing || !bishop) {
      return 99;
    }
    const frontSquares = Brain.getSquaresInFrontOfWhiteKingBetweenKings(
      whiteKing.square,
      blackKing.square
    );
    const preparedFrontSquare = frontSquares.find((frontSquare) =>
      Brain.sameDiagonal(bishop.square, frontSquare)
    );
    if (!preparedFrontSquare) {
      return 99;
    }
    if (bishop.square === preparedFrontSquare) {
      return 99;
    }
    return 0;
  }

  static knightAndBishopBishopInFrontScore(
    fen: string,
    resultFen: string,
    piece: string | undefined
  ): number {
    if (
      piece === "b" &&
      Brain.isKnightAndBishopBishopOppositionLoopShape(fen)
    ) {
      return 1;
    }
    const whiteKing = Brain.findPiece(resultFen, "w", "k");
    const blackKing = Brain.findPiece(resultFen, "b", "k");
    const bishop = Brain.findPiece(resultFen, "w", "b");
    if (!whiteKing || !blackKing || !bishop) {
      return 0;
    }

    const frontSquares = Brain.getSquaresInFrontOfWhiteKingBetweenKings(
      whiteKing.square,
      blackKing.square
    );
    if (frontSquares.length === 0) {
      return 0;
    }
    return frontSquares.includes(bishop.square) ? 0 : 1;
  }

  static isKnightAndBishopBishopOppositionLoopShape(fen: string): boolean {
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const blackKing = Brain.findPiece(fen, "b", "k");
    const bishop = Brain.findPiece(fen, "w", "b");
    if (!whiteKing || !blackKing || !bishop) {
      return false;
    }
    const whiteKingCoords = Brain.squareCoords(whiteKing.square);
    const blackKingCoords = Brain.squareCoords(blackKing.square);
    const bishopCoords = Brain.squareCoords(bishop.square);
    const kingFileDistance = Math.abs(
      whiteKingCoords.file - blackKingCoords.file
    );
    const kingRankDistance = Math.abs(
      whiteKingCoords.rank - blackKingCoords.rank
    );
    const bishopFileDistance = Math.abs(
      bishopCoords.file - whiteKingCoords.file
    );
    const bishopRankDistance = Math.abs(
      bishopCoords.rank - whiteKingCoords.rank
    );
    const kingsAreKnightMoveApart =
      (kingFileDistance === 1 && kingRankDistance === 2) ||
      (kingFileDistance === 2 && kingRankDistance === 1);
    const bishopIsOrthogonallyAdjacent =
      bishopFileDistance + bishopRankDistance === 1;
    const bishopOpposesBlackKing =
      bishopCoords.file === blackKingCoords.file ||
      bishopCoords.rank === blackKingCoords.rank;
    return (
      kingsAreKnightMoveApart &&
      bishopIsOrthogonallyAdjacent &&
      bishopOpposesBlackKing
    );
  }

  static isKnightAndBishopDiagonalBishopApproachShape(fen: string): boolean {
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const blackKing = Brain.findPiece(fen, "b", "k");
    const bishop = Brain.findPiece(fen, "w", "b");
    if (!whiteKing || !blackKing || !bishop) {
      return false;
    }
    const whiteKingCoords = Brain.squareCoords(whiteKing.square);
    const blackKingCoords = Brain.squareCoords(blackKing.square);
    const bishopCoords = Brain.squareCoords(bishop.square);
    const kingFileDistance = Math.abs(
      whiteKingCoords.file - blackKingCoords.file
    );
    const kingRankDistance = Math.abs(
      whiteKingCoords.rank - blackKingCoords.rank
    );
    const bishopFileDistance = Math.abs(
      bishopCoords.file - whiteKingCoords.file
    );
    const bishopRankDistance = Math.abs(
      bishopCoords.rank - whiteKingCoords.rank
    );
    return (
      kingFileDistance === 2 &&
      kingRankDistance === 2 &&
      bishopFileDistance + bishopRankDistance === 1 &&
      Brain.isKnightMove(bishop.square, blackKing.square)
    );
  }

  static knightAndBishopBishopOppositionLoopScore(
    fen: string,
    piece: string | undefined
  ): number {
    return piece === "b" &&
      Brain.isKnightAndBishopBishopOppositionLoopShape(fen)
      ? 1
      : 0;
  }

  static knightAndBishopKnightBehindWhiteKingScore(fen: string): number {
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const blackKing = Brain.findPiece(fen, "b", "k");
    const knight = Brain.findPiece(fen, "w", "n");
    if (!whiteKing || !blackKing || !knight) {
      return 0;
    }
    const whiteKingCoords = Brain.squareCoords(whiteKing.square);
    const blackKingCoords = Brain.squareCoords(blackKing.square);
    const knightCoords = Brain.squareCoords(knight.square);
    const kingVector = {
      file: whiteKingCoords.file - blackKingCoords.file,
      rank: whiteKingCoords.rank - blackKingCoords.rank,
    };
    const knightVector = {
      file: knightCoords.file - whiteKingCoords.file,
      rank: knightCoords.rank - whiteKingCoords.rank,
    };
    return kingVector.file * knightVector.file +
      kingVector.rank * knightVector.rank >
      0
      ? 0
      : 1;
  }

  static knightAndBishopKnightCentralDistance(fen: string): number {
    const knight = Brain.findPiece(fen, "w", "n");
    return knight ? Brain.centerDistance(knight.square) : 99;
  }

  static knightAndBishopKnightWhiteKingDistance(fen: string): number {
    const knight = Brain.findPiece(fen, "w", "n");
    const whiteKing = Brain.findPiece(fen, "w", "k");
    return knight && whiteKing
      ? Brain.kingDistance(knight.square, whiteKing.square)
      : 99;
  }

  static knightAndBishopKnightBlackKingDistance(fen: string): number {
    const knight = Brain.findPiece(fen, "w", "n");
    const blackKing = Brain.findPiece(fen, "b", "k");
    return knight && blackKing
      ? Brain.manhattanDistance(knight.square, blackKing.square)
      : 0;
  }

  static getSquareInFrontOfWhiteKingBetweenKings(
    whiteKing: Square,
    blackKing: Square
  ): Square | null {
    return Brain.getSquaresInFrontOfWhiteKingBetweenKings(whiteKing, blackKing)[0] ??
      null;
  }

  static getSquaresInFrontOfWhiteKingBetweenKings(
    whiteKing: Square,
    blackKing: Square
  ): Square[] {
    const whiteCoords = Brain.squareCoords(whiteKing);
    const blackCoords = Brain.squareCoords(blackKing);
    const fileDistance = blackCoords.file - whiteCoords.file;
    const rankDistance = blackCoords.rank - whiteCoords.rank;
    const absoluteFileDistance = Math.abs(fileDistance);
    const absoluteRankDistance = Math.abs(rankDistance);
    if (Math.max(absoluteFileDistance, absoluteRankDistance) < 2) {
      return [];
    }

    if (absoluteFileDistance > absoluteRankDistance) {
      return [
        Brain.squareFromCoords(
          whiteCoords.file + Math.sign(fileDistance),
          whiteCoords.rank
        ),
      ].filter((square): square is Square => Boolean(square));
    }
    if (absoluteRankDistance > absoluteFileDistance) {
      return [
        Brain.squareFromCoords(
          whiteCoords.file,
          whiteCoords.rank + Math.sign(rankDistance)
        ),
      ].filter((square): square is Square => Boolean(square));
    }
    return [
      Brain.squareFromCoords(
        whiteCoords.file + Math.sign(fileDistance),
        whiteCoords.rank
      ),
      Brain.squareFromCoords(
        whiteCoords.file,
        whiteCoords.rank + Math.sign(rankDistance)
      ),
    ].filter((square): square is Square => Boolean(square));
  }

  static diagonalSegmentContainsSquare(
    start: Square,
    end: Square,
    square: Square
  ): boolean {
    if (!Brain.sameDiagonal(start, end) || square === start || square === end) {
      return false;
    }
    const startCoords = Brain.squareCoords(start);
    const endCoords = Brain.squareCoords(end);
    const fileStep = Math.sign(endCoords.file - startCoords.file);
    const rankStep = Math.sign(endCoords.rank - startCoords.rank);
    let file = startCoords.file + fileStep;
    let rank = startCoords.rank + rankStep;
    while (file !== endCoords.file || rank !== endCoords.rank) {
      if (Brain.squareFromCoords(file, rank) === square) {
        return true;
      }
      file += fileStep;
      rank += rankStep;
    }
    return false;
  }

  static knightAndBishopBestBlackReplyCenterDistance(fen: string): number {
    const chess = Brain.getChess(fen);
    const moves = chess.moves();
    if (chess.turn() !== "b" || moves.length === 0) {
      const blackKing = Brain.findPiece(fen, "b", "k");
      return blackKing ? Brain.centerDistance(blackKing.square) : 0;
    }
    return Math.min(
      ...moves.map((san) => {
        const nextChess = Brain.getChess(fen);
        nextChess.move(san);
        const blackKing = Brain.findPiece(nextChess.fen(), "b", "k");
        return blackKing ? Brain.centerDistance(blackKing.square) : 0;
      })
    );
  }

  static bishopKnightDiagonallyAdjacent(fen: string): boolean {
    const bishop = Brain.findPiece(fen, "w", "b");
    const knight = Brain.findPiece(fen, "w", "n");
    return Boolean(
      bishop &&
      knight &&
      Brain.isDiagonalKingMove(bishop.square, knight.square)
    );
  }

  static knightAndBishopEdgeCheckMakesProgress(
    fen: string,
    resultFen: string,
    isCheck: boolean,
    currentBlackKing: { square: Square } | undefined
  ): boolean {
    if (
      !isCheck ||
      !currentBlackKing ||
      Brain.edgeDistance(currentBlackKing.square) !== 0
    ) {
      return false;
    }
    const currentCornerDistance = Brain.manhattanDistanceToNearestCorner(fen);
    const chess = Brain.getChess(resultFen);
    const legalReplies = chess.moves();
    if (legalReplies.length === 0) {
      return false;
    }
    const idealReplies = Brain.getKnightAndBishopOpponentCandidates(
      chess,
      legalReplies
    ).idealMoves;
    const replyDistances = idealReplies.map((san) => {
      const nextChess = Brain.getChess(resultFen);
      nextChess.move(san);
      return Brain.manhattanDistanceToNearestCorner(nextChess.fen());
    });
    return replyDistances.some((distance) => distance < currentCornerDistance);
  }

  static knightAndBishopImmediateCyclePenalty(
    fen: string,
    resultFen: string
  ): number {
    const originalKey = Brain.boardKey(fen);
    const chess = Brain.getChess(resultFen);
    if (chess.turn() !== "b") {
      return 0;
    }
    const replies = Brain.getKnightAndBishopOpponentCandidates(
      chess,
      chess.moves()
    ).idealMoves;
    if (replies.length === 0) {
      return 0;
    }
    return replies.some((reply) => {
      const afterReply = Brain.getChess(resultFen);
      afterReply.move(reply);
      const oneMoveCycle = afterReply.moves().some((whiteMove) => {
        const afterWhite = Brain.getChess(afterReply.fen());
        afterWhite.move(whiteMove);
        return Brain.boardKey(afterWhite.fen()) === originalKey;
      });
      if (oneMoveCycle) {
        return true;
      }
      return afterReply.moves().some((whiteMove) => {
        const afterWhite = Brain.getChess(afterReply.fen());
        afterWhite.move(whiteMove);
        const black = Brain.getChess(afterWhite.fen());
        if (black.turn() !== "b") {
          return false;
        }
        const secondReplies = Brain.getKnightAndBishopOpponentCandidates(
          black,
          black.moves()
        ).idealMoves;
        return secondReplies.some((secondReply) => {
          const afterSecondReply = Brain.getChess(afterWhite.fen());
          afterSecondReply.move(secondReply);
          return Brain.boardKey(afterSecondReply.fen()) === originalKey;
        });
      });
    })
      ? 1
      : 0;
  }

  static boardTurnKey(fen: string): string {
    const [board, turn] = fen.split(" ");
    return `${board} ${turn}`;
  }

  static positionKey(fen: string): string {
    return fen.split(" ").slice(0, 4).join(" ");
  }

  static boardKey(fen: string): string {
    return fen.split(" ")[0];
  }

  static wManeuverKingMoveScore(
    fen: string,
    resultFen: string,
    isKingMove: boolean
  ): number {
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (
      !blackKing ||
      Brain.edgeDistance(blackKing.square) <= 1 ||
      Brain.wManeuverSetupDistance(fen) !== 0 ||
      Brain.wManeuverSetupDistance(resultFen) !== 0
    ) {
      return 0;
    }
    return isKingMove && Brain.blackEscapeMoveCount(resultFen) <= 1 ? 0 : 1;
  }

  static edgePieceSetupScore(
    fen: string,
    resultFen: string,
    piece: string | undefined
  ): number {
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (
      !blackKing ||
      Brain.edgeDistance(blackKing.square) !== 0 ||
      Brain.isCorner(blackKing.square) ||
      Brain.blackInwardEscapeCount(resultFen) !== 0
    ) {
      return 0;
    }
    return piece === "k" ? 1 : 0;
  }

  static edgeCornerResistanceDistance(fen: string): number {
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (
      !blackKing ||
      Brain.edgeDistance(blackKing.square) > 1 ||
      Brain.isCorner(blackKing.square)
    ) {
      return 0;
    }
    const chess = Brain.getChess(fen);
    const replies = Brain.getKnightAndBishopOpponentCandidates(
      chess,
      chess.moves()
    ).idealMoves;
    if (replies.length === 0) {
      return 0;
    }
    return Math.max(
      ...replies.map((san) => {
        const nextChess = Brain.getChess(fen);
        nextChess.move(san);
        return Brain.distanceToNearestBishopCorner(nextChess.fen());
      })
    );
  }

  static edgeBishopKickScore(
    isCheck: boolean,
    piece: string | undefined,
    previousBlackKing: { square: Square } | undefined
  ): number {
    if (
      !isCheck ||
      !previousBlackKing ||
      Brain.edgeDistance(previousBlackKing.square) !== 0 ||
      Brain.isCorner(previousBlackKing.square)
    ) {
      return 0;
    }
    return piece === "b" ? 0 : 1;
  }

  static edgeKnightOutpostDistance(
    currentFen: string,
    resultFen: string,
    isKnightMove: boolean,
    previousBlackKing: { square: Square } | undefined
  ): number {
    const blackKing = Brain.findPiece(currentFen, "b", "k");
    const currentKnight = Brain.findPiece(currentFen, "w", "n");
    const knight = Brain.findPiece(resultFen, "w", "n");
    if (
      !previousBlackKing ||
      !blackKing ||
      !currentKnight ||
      !knight ||
      Brain.edgeDistance(previousBlackKing.square) !== 0 ||
      Brain.isCorner(previousBlackKing.square) ||
      Brain.centerDistance(currentKnight.square) === 0 ||
      Brain.whiteKingEdgeKeyDistance(currentFen) > 1
    ) {
      return 0;
    }
    return isKnightMove ? Brain.centerDistance(knight.square) : 9;
  }

  static knightCentralizationImproves(fen: string, resultFen: string): boolean {
    const previousKnight = Brain.findPiece(fen, "w", "n");
    const nextKnight = Brain.findPiece(resultFen, "w", "n");
    return Boolean(
      previousKnight &&
      nextKnight &&
      Brain.centerDistance(nextKnight.square) <
      Brain.centerDistance(previousKnight.square)
    );
  }

  static knightCentralizationWorsens(fen: string, resultFen: string): boolean {
    const previousKnight = Brain.findPiece(fen, "w", "n");
    const nextKnight = Brain.findPiece(resultFen, "w", "n");
    return Boolean(
      previousKnight &&
      nextKnight &&
      Brain.centerDistance(nextKnight.square) >
      Brain.centerDistance(previousKnight.square)
    );
  }

  static getIdealTwoBishopsWhiteMoves(fen: string): string[] {
    const chess = Brain.getChess(fen);
    const moves = chess.moves();
    if (chess.turn() !== "w" || moves.length === 0) {
      return moves;
    }
    const mateMoves = Brain.getImmediateMateMoves(fen, moves);
    if (mateMoves.length > 0) {
      return mateMoves;
    }
    const waitingMoveContext = Brain.getTwoBishopsWaitingMoveContext(fen);
    return Brain.selectBestMovesByScoreReasons(
      moves,
      (san) => Brain.scoreTwoBishopsWhiteMove(fen, san, waitingMoveContext),
      Brain.getTwoBishopsWhiteScoreReasons()
    );
  }

  static scoreTwoBishopsWhiteMove(
    fen: string,
    san: string,
    waitingMoveContext = Brain.getTwoBishopsWaitingMoveContext(fen)
  ): TwoBishopsWhiteMoveScore {
    const chess = Brain.getChess(fen);
    const move = chess.move(san);
    const resultFen = chess.fen();
    const whiteKing = Brain.findPiece(resultFen, "w", "k");
    const blackKing = Brain.findPiece(resultFen, "b", "k");
    return {
      matePenalty: chess.isCheckmate() ? 0 : 1,
      stalematePenalty: !chess.isCheckmate() && chess.isStalemate() ? 1 : 0,
      bishopSafetyPenalty:
        Brain.blackCanTakeWhitePieces(resultFen, ["b"]) ||
          Brain.blackCanWalkUpToWhiteBishop(resultFen)
          ? 1
          : 0,
      phaseTwoWaitingMovePenalty: move
        ? Brain.twoBishopsPhaseTwoWaitingMovePenalty(
          fen,
          move.from,
          move.to,
          waitingMoveContext
        )
        : 1,
      phaseTwoForceOpponentOppositionPenalty:
        Brain.twoBishopsPhaseTwoForceOpponentOppositionPenalty(
          fen,
          resultFen
        ),
      phaseTwoTakeDirectOppositionPenalty:
        Brain.twoBishopsPhaseTwoTakeDirectOppositionPenalty(fen, resultFen),
      phaseTwoPushFromControlledEdgeSquarePenalty:
        Brain.twoBishopsPhaseTwoPushFromControlledEdgeSquarePenalty(
          fen,
          resultFen
        ),
      phaseTwoForceOpponentCornerPenalty:
        Brain.twoBishopsPhaseTwoForceOpponentCornerPenalty(
          fen,
          resultFen
        ),
      phaseTwoStayPhaseTwoPenalty:
        Brain.twoBishopsPhaseTwoStayPhaseTwoPenalty(fen, resultFen),
      phaseTwoCheckPenalty: Brain.twoBishopsPhaseTwoCheckPenalty(fen, resultFen),
      phaseTwoBishopCornerDistance:
        Brain.twoBishopsPhaseTwoBishopCornerDistance(fen, resultFen),
      kingBishopScreeningPenalty:
        Brain.getWhiteKingBishopScreeningPenalty(resultFen),
      bishopAdjacencyPenalty: Brain.whiteBishopsAreAdjacent(resultFen)
        ? 0
        : 1,
      kingBishopDistance: whiteKing
        ? Brain.getWhiteKingDistanceToBishops(resultFen, whiteKing.square)
        : 99,
      blackKingEdgeDistance: blackKing ? Brain.edgeDistance(blackKing.square) : 99,
      bishopBlackKingDistance: blackKing
        ? Brain.getWhiteBishopDistanceToSquare(resultFen, blackKing.square)
        : 99,
    };
  }

  static getTwoBishopsWaitingMoveContext(
    fen: string
  ): TwoBishopsWaitingMoveContext {
    return {
      cornerMoves: Brain.getTwoBishopsCornerWaitingMoves(fen),
      lineTargets: Brain.getTwoBishopsPhaseTwoWaitingMoveTargets(fen),
    };
  }

  static twoBishopsPhaseTwoWaitingMovePenalty(
    fen: string,
    from: Square,
    to: Square,
    waitingMoveContext?: TwoBishopsWaitingMoveContext
  ): number {
    if (waitingMoveContext) {
      if (waitingMoveContext.cornerMoves.length > 0) {
        return waitingMoveContext.cornerMoves.some(
          (target) => target.from === from && target.to === to
        )
          ? 0
          : 1;
      }
      const targets = waitingMoveContext.lineTargets;
      if (!targets) {
        return 0;
      }
      return targets.from === from && targets.to.includes(to) ? 0 : 1;
    }
    const cornerPenalty = Brain.twoBishopsCornerWaitingMovePenalty(
      fen,
      from,
      to
    );
    if (cornerPenalty !== null) {
      return cornerPenalty;
    }
    const targets = Brain.getTwoBishopsPhaseTwoWaitingMoveTargets(fen);
    if (!targets) {
      return 0;
    }
    return targets.from === from && targets.to.includes(to) ? 0 : 1;
  }

  static twoBishopsCornerWaitingMovePenalty(
    fen: string,
    from: Square,
    to: Square
  ): number | null {
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (
      !blackKing ||
      !Brain.isCorner(blackKing.square) ||
      !Brain.isTwoBishopsPhaseTwoPosition(fen)
    ) {
      return null;
    }
    const targets = Brain.getTwoBishopsCornerWaitingMoves(fen);
    if (targets.length === 0) {
      return null;
    }
    return targets.some((target) => target.from === from && target.to === to)
      ? 0
      : 1;
  }

  static getTwoBishopsCornerWaitingMoves(
    fen: string
  ): TwoBishopsWaitingMove[] {
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (
      !blackKing ||
      !Brain.isCorner(blackKing.square) ||
      !Brain.isTwoBishopsPhaseTwoPosition(fen)
    ) {
      return [];
    }
    const moves = Brain.getChess(fen)
      .moves({ verbose: true })
      .filter((move) => move.piece === "b")
      .filter((move) =>
        Brain.isTwoBishopsCornerWaitingMove(fen, move.from, move.to)
      );
    if (moves.length === 0) {
      return [];
    }
    const scoredMoves = moves.map((move) => {
      const chess = Brain.getChess(fen);
      chess.move(move.san);
      const whiteKing = Brain.findPiece(chess.fen(), "w", "k");
      const blackKing = Brain.findPiece(chess.fen(), "b", "k");
      return {
        from: move.from,
        to: move.to,
        score: [
          Brain.getWhiteBishopMiddle16Penalty(chess.fen()),
          Brain.whiteBishopsAreAdjacent(chess.fen()) ? 0 : 1,
          whiteKing && Brain.edgeDistance(whiteKing.square) === 0 ? 1 : 0,
          whiteKing && blackKing
            ? Brain.kingWalkDistance(whiteKing.square, blackKing.square)
            : 99,
          blackKing
            ? Brain.getWhiteBishopDistanceToSquare(
              chess.fen(),
              blackKing.square
            )
            : 99,
        ],
      };
    });
    const bestScore = scoredMoves
      .map((move) => move.score)
      .sort(Brain.compareNumberArrays)[0];
    return scoredMoves
      .filter((move) => Brain.compareNumberArrays(move.score, bestScore) === 0)
      .map(({ from, to }) => ({ from, to }));
  }

  static isTwoBishopsCornerWaitingMove(
    fen: string,
    from: Square,
    to: Square
  ): boolean {
    const chess = Brain.getChess(fen);
    const move = chess.move({ from, to });
    if (move?.piece !== "b" || chess.isCheckmate() || chess.isStalemate()) {
      return false;
    }
    const blackMoves = chess.moves({ verbose: true });
    if (blackMoves.length !== 1) {
      return false;
    }
    const escapeSquare = blackMoves[0].to;
    if (Brain.bishopControlsOrOccupiesSquare(chess.fen(), to, escapeSquare)) {
      return false;
    }
    const afterBlack = Brain.getChess(chess.fen());
    afterBlack.move(blackMoves[0].san);
    return Brain.canBishopMoveToControlSquare(afterBlack.fen(), to, escapeSquare);
  }

  static compareNumberArrays(a: number[], b: number[]): number {
    for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
      const diff = a[index] - b[index];
      if (diff !== 0) {
        return diff;
      }
    }
    return a.length - b.length;
  }

  static canBishopMoveToControlSquare(
    fen: string,
    bishop: Square,
    target: Square
  ): boolean {
    return Brain.getChess(fen)
      .moves({ verbose: true })
      .filter((move) => move.piece === "b" && move.from === bishop)
      .some((move) => {
        const chess = Brain.getChess(fen);
        chess.move(move.san);
        return Brain.bishopControlsOrOccupiesSquare(chess.fen(), move.to, target);
      });
  }

  static getTwoBishopsPhaseTwoWaitingMoveTargets(
    fen: string
  ): { from: Square; to: Square[] } | null {
    if (!Brain.isTwoBishopsPhaseTwoPosition(fen)) {
      return null;
    }
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const blackKing = Brain.findPiece(fen, "b", "k");
    const bishops = Brain.getWhiteBishopSquares(fen);
    if (
      !whiteKing ||
      !blackKing ||
      bishops.length !== 2 ||
      !Brain.squaresAreContiguousRankOrFileLine([
        whiteKing.square,
        ...bishops,
      ]) ||
      !Brain.squaresAreTwoDiagonalKingStepsApart(
        whiteKing.square,
        blackKing.square
      )
    ) {
      return null;
    }
    const kingColorBishop = bishops.find((bishop) =>
      Brain.sameSquareColor(bishop, whiteKing.square)
    );
    if (!kingColorBishop) {
      return null;
    }
    const sourceCenterDistance = Brain.centerDistance(kingColorBishop);
    const sourceKingDistance = Brain.kingWalkDistance(
      kingColorBishop,
      whiteKing.square
    );
    const targets = Brain.getDiagonalNeighborSquares(kingColorBishop).filter(
      (target) =>
        Brain.kingWalkDistance(target, whiteKing.square) < sourceKingDistance &&
        Brain.centerDistance(target) < sourceCenterDistance &&
        Brain.isLegalMove(fen, kingColorBishop, target)
    );
    if (targets.length === 0) {
      return null;
    }
    const bestCenterDistance = Math.min(
      ...targets.map((target) => Brain.centerDistance(target))
    );
    return {
      from: kingColorBishop,
      to: targets.filter(
        (target) => Brain.centerDistance(target) === bestCenterDistance
      ),
    };
  }

  static getWhiteBishopMiddle16Penalty(fen: string): number {
    return Brain.getWhiteBishopSquares(fen).filter(
      (square) => !Brain.isMiddle16Square(square)
    ).length;
  }

  static twoBishopsPhaseTwoForceOpponentOppositionPenalty(
    fen: string,
    resultFen: string
  ): number {
    if (!Brain.isTwoBishopsPhaseTwoPosition(fen)) {
      return 0;
    }
    if (
      !Brain.getChess(resultFen).isCheck() &&
      !Brain.twoBishopsBlackKingColorBishopStayedPut(fen, resultFen)
    ) {
      return 1;
    }
    const resultWhiteKing = Brain.findPiece(resultFen, "w", "k");
    const resultBlackKing = Brain.findPiece(resultFen, "b", "k");
    if (
      resultWhiteKing &&
      resultBlackKing &&
      Brain.hasDirectKingOpposition(
        resultWhiteKing.square,
        resultBlackKing.square
      )
    ) {
      return 1;
    }
    return Brain.twoBishopsPhaseTwoBlackReplyPenalty(
      fen,
      resultFen,
      (nextFen) => {
        const whiteKing = Brain.findPiece(nextFen, "w", "k");
        const blackKing = Brain.findPiece(nextFen, "b", "k");
        return Boolean(
          whiteKing &&
          blackKing &&
          Brain.hasTwoBishopsPhaseTwoOppositionPressure(
            whiteKing.square,
            blackKing.square
          )
        );
      }
    );
  }

  static twoBishopsPhaseTwoTakeDirectOppositionPenalty(
    fen: string,
    resultFen: string
  ): number {
    if (!Brain.isTwoBishopsPhaseTwoPosition(fen)) {
      return 0;
    }
    const startingWhiteKing = Brain.findPiece(fen, "w", "k");
    const resultWhiteKing = Brain.findPiece(resultFen, "w", "k");
    const resultBlackKing = Brain.findPiece(resultFen, "b", "k");
    if (
      !startingWhiteKing ||
      !resultWhiteKing ||
      !resultBlackKing ||
      !Brain.hasDirectKingOpposition(
        resultWhiteKing.square,
        resultBlackKing.square
      )
    ) {
      return 1;
    }
    const kingMoved =
      startingWhiteKing.square !== resultWhiteKing.square;
    return kingMoved &&
      Brain.whiteKingOccupiesBishopControlledSquare(resultFen)
      ? 1
      : 0;
  }

  static whiteKingOccupiesBishopControlledSquare(fen: string): boolean {
    const whiteKing = Brain.findPiece(fen, "w", "k");
    return Boolean(
      whiteKing &&
      Brain.getWhiteBishopSquares(fen).some((bishop) =>
        Brain.bishopControlsOrOccupiesSquare(fen, bishop, whiteKing.square)
      )
    );
  }

  static twoBishopsPhaseTwoPushFromControlledEdgeSquarePenalty(
    fen: string,
    resultFen: string
  ): number {
    if (!Brain.isTwoBishopsPhaseTwoPosition(fen)) {
      return 0;
    }
    const startingBlackKing = Brain.findPiece(fen, "b", "k");
    const controlledSquares =
      Brain.getTwoBishopsPhaseTwoControlledOppositionEdgeSquares(fen);
    if (!startingBlackKing || controlledSquares.length !== 1) {
      return 0;
    }
    const controlledSquare = controlledSquares[0];
    const startingDistance = Brain.kingWalkDistance(
      startingBlackKing.square,
      controlledSquare
    );
    const blackMoves = Brain.getChess(resultFen).moves();
    if (blackMoves.length === 0) {
      return 0;
    }
    return blackMoves.every((san) => {
      const nextChess = Brain.getChess(resultFen);
      nextChess.move(san);
      const blackKing = Brain.findPiece(nextChess.fen(), "b", "k");
      return Boolean(
        blackKing &&
        Brain.kingWalkDistance(blackKing.square, controlledSquare) >
          startingDistance
      );
    })
      ? 0
      : 1;
  }

  static getTwoBishopsPhaseTwoControlledOppositionEdgeSquares(
    fen: string
  ): Square[] {
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (
      !whiteKing ||
      !blackKing ||
      !Brain.hasDirectKingOpposition(whiteKing.square, blackKing.square)
    ) {
      return [];
    }
    return Brain.getEdgeSquaresTwoFromSquare(blackKing.square).filter(
      (square) =>
        Brain.isDiagonalTwoFromSquare(square, whiteKing.square) &&
        Brain.getWhiteBishopSquares(fen).some((bishop) =>
          Brain.bishopControlsOrOccupiesSquare(fen, bishop, square)
        )
    );
  }

  static getEdgeSquaresTwoFromSquare(square: Square): Square[] {
    const { file, rank } = Brain.squareCoords(square);
    const candidates: Array<Square | null> = [];
    if (file === 0 || file === 7) {
      candidates.push(
        Brain.squareFromCoords(file, rank - 2),
        Brain.squareFromCoords(file, rank + 2)
      );
    }
    if (rank === 0 || rank === 7) {
      candidates.push(
        Brain.squareFromCoords(file - 2, rank),
        Brain.squareFromCoords(file + 2, rank)
      );
    }
    return candidates.filter((candidate): candidate is Square => candidate != null);
  }

  static isDiagonalTwoFromSquare(a: Square, b: Square): boolean {
    const first = Brain.squareCoords(a);
    const second = Brain.squareCoords(b);
    return (
      Math.abs(first.file - second.file) === 2 &&
      Math.abs(first.rank - second.rank) === 2
    );
  }

  static twoBishopsBlackKingColorBishopStayedPut(
    fen: string,
    resultFen: string
  ): boolean {
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (!blackKing) {
      return false;
    }
    const blackKingColor = Brain.squareColor(blackKing.square);
    const resultBishops = Brain.getWhiteBishopSquares(resultFen);
    return Brain.getWhiteBishopSquares(fen)
      .filter((bishop) => Brain.squareColor(bishop) === blackKingColor)
      .some((bishop) => resultBishops.includes(bishop));
  }

  static twoBishopsPhaseTwoForceOpponentCornerPenalty(
    fen: string,
    resultFen: string
  ): number {
    if (!Brain.isTwoBishopsPhaseTwoPosition(fen)) {
      return 0;
    }
    const startingBlackKing = Brain.findPiece(fen, "b", "k");
    if (!startingBlackKing) {
      return 0;
    }
    const targetCorners = Brain.getTwoBishopsPhaseTwoTargetEdgeCorners(
      resultFen,
      startingBlackKing.square
    );
    if (targetCorners.length === 0) {
      return 0;
    }
    const blackMoves = Brain.getChess(resultFen).moves();
    if (blackMoves.length === 0) {
      return 0;
    }
    return Math.max(
      ...blackMoves.map((san) => {
        const nextChess = Brain.getChess(resultFen);
        nextChess.move(san);
        const blackKing = Brain.findPiece(nextChess.fen(), "b", "k");
        return blackKing
          ? Brain.getTwoBishopsPhaseTwoCurrentEdgeCornerDistance(
            startingBlackKing.square,
            blackKing.square,
            targetCorners
          )
          : 99;
      })
    );
  }

  static getTwoBishopsPhaseTwoTargetEdgeCorners(
    resultFen: string,
    blackKing: Square
  ): Square[] {
    const currentEdgeCorners = Brain.getCurrentEdgeCorners(blackKing);
    if (currentEdgeCorners.length === 0) {
      return [];
    }
    const whiteKing = Brain.findPiece(resultFen, "w", "k");
    if (!whiteKing) {
      return [];
    }
    const bestWhiteKingDistance = Math.min(
      ...currentEdgeCorners.map((corner) =>
        Brain.kingWalkDistance(whiteKing.square, corner)
      )
    );
    return currentEdgeCorners.filter(
      (corner) =>
        Brain.kingWalkDistance(whiteKing.square, corner) ===
        bestWhiteKingDistance
    );
  }

  static getTwoBishopsPhaseTwoCurrentEdgeCornerDistance(
    startingBlackKing: Square,
    blackKing: Square,
    targetCorners: Square[]
  ): number {
    const offCurrentEdgePenalty = Brain.sharesAnyEdge(
      startingBlackKing,
      blackKing
    )
      ? 0
      : 8;
    return (
      offCurrentEdgePenalty +
      Math.min(
        ...targetCorners.map((corner) =>
          Brain.kingWalkDistance(blackKing, corner)
        )
      )
    );
  }

  static twoBishopsPhaseTwoBlackReplyPenalty(
    fen: string,
    resultFen: string,
    isGoodReplyResult: (nextFen: string) => boolean
  ): number {
    if (!Brain.isTwoBishopsPhaseTwoPosition(fen)) {
      return 0;
    }
    const blackMoves = Brain.getChess(resultFen).moves();
    if (blackMoves.length === 0) {
      return 1;
    }
    return blackMoves.every((san) => {
      const nextChess = Brain.getChess(resultFen);
      nextChess.move(san);
      return isGoodReplyResult(nextChess.fen());
    })
      ? 0
      : 1;
  }

  static twoBishopsPhaseTwoStayPhaseTwoPenalty(
    fen: string,
    resultFen: string
  ): number {
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (
      Brain.getChess(fen).turn() !== "w" ||
      Brain.getWhiteBishopSquares(fen).length !== 2 ||
      !blackKing ||
      Brain.edgeDistance(blackKing.square) !== 0
    ) {
      return 0;
    }
    const blackMoves = Brain.getChess(resultFen).moves();
    if (blackMoves.length === 0) {
      return 1;
    }
    return blackMoves.every((san) => {
      const nextChess = Brain.getChess(resultFen);
      nextChess.move(san);
      return Brain.isTwoBishopsPhaseTwoPosition(nextChess.fen());
    })
      ? 0
      : 1;
  }

  static twoBishopsPhaseTwoCheckPenalty(
    fen: string,
    resultFen: string
  ): number {
    if (!Brain.isTwoBishopsPhaseTwoPosition(fen)) {
      return 0;
    }
    return Brain.getChess(resultFen).isCheck() ? 0 : 1;
  }

  static twoBishopsPhaseTwoBishopCornerDistance(
    fen: string,
    resultFen: string
  ): number {
    if (!Brain.isTwoBishopsPhaseTwoPosition(fen)) {
      return 0;
    }
    const blackKing = Brain.findPiece(resultFen, "b", "k");
    if (!blackKing) {
      return 0;
    }
    const closestCorner = Brain.getClosestCornerToSquare(blackKing.square);
    return Brain.getWhiteBishopDistanceToSquare(resultFen, closestCorner);
  }

  static isTwoBishopsPhaseTwoPosition(fen: string): boolean {
    if (Brain.getChess(fen).turn() !== "w") {
      return false;
    }
    const blackKing = Brain.findPiece(fen, "b", "k");
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const bishops = Brain.getWhiteBishopSquares(fen);
    if (
      !blackKing ||
      !whiteKing ||
      bishops.length !== 2 ||
      Brain.edgeDistance(blackKing.square) !== 0
    ) {
      return false;
    }
    return (
      Brain.getWhiteKingControlledBlackKingFrontSquares(
        whiteKing.square,
        blackKing.square
      ).length >= 2 ||
      Brain.isTwoBishopsDiagonalEdgeWalkPhaseTwo(
        fen,
        blackKing.square,
        whiteKing.square
      )
    );
  }

  static hasTwoBishopsPhaseTwoOppositionPressure(
    whiteKing: Square,
    blackKing: Square
  ): boolean {
    return (
      Brain.hasDirectKingOpposition(whiteKing, blackKing) ||
      Brain.isOneEdgeKingMoveFromDirectOpposition(whiteKing, blackKing)
    );
  }

  static isOneEdgeKingMoveFromDirectOpposition(
    whiteKing: Square,
    blackKing: Square
  ): boolean {
    if (Brain.edgeDistance(blackKing) !== 0) {
      return false;
    }
    return Brain.getDirectOppositionSquares(whiteKing).some(
      (square) =>
        Brain.edgeDistance(square) === 0 &&
        Brain.sharesAnyEdge(blackKing, square) &&
        Brain.kingDistance(blackKing, square) === 1
    );
  }

  static getDirectOppositionSquares(square: Square): Square[] {
    const coords = Brain.squareCoords(square);
    return [
      Brain.squareFromCoords(coords.file - 2, coords.rank),
      Brain.squareFromCoords(coords.file + 2, coords.rank),
      Brain.squareFromCoords(coords.file, coords.rank - 2),
      Brain.squareFromCoords(coords.file, coords.rank + 2),
    ].filter((candidate): candidate is Square => candidate != null);
  }

  static isTwoBishopsDiagonalEdgeWalkPhaseTwo(
    fen: string,
    blackKing: Square,
    whiteKing: Square
  ): boolean {
    const blackCoords = Brain.squareCoords(blackKing);
    const whiteCoords = Brain.squareCoords(whiteKing);
    const fileDistance = Math.abs(blackCoords.file - whiteCoords.file);
    const rankDistance = Math.abs(blackCoords.rank - whiteCoords.rank);
    if (fileDistance !== 2 || rankDistance !== 2) {
      return false;
    }
    const chess = Brain.getChess(Brain.withFenTurn(fen, "b"));
    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) {
      return false;
    }
    return moves.every((move) => {
      if (move.from !== blackKing) {
        return false;
      }
      const to = move.to as Square;
      if (Brain.edgeDistance(to) !== 0) {
        return false;
      }
      const toCoords = Brain.squareCoords(to);
      if (blackCoords.file === 0 || blackCoords.file === 7) {
        return (
          toCoords.file === blackCoords.file &&
          Math.abs(toCoords.rank - whiteCoords.rank) <
            Math.abs(blackCoords.rank - whiteCoords.rank)
        );
      }
      if (blackCoords.rank === 0 || blackCoords.rank === 7) {
        return (
          toCoords.rank === blackCoords.rank &&
          Math.abs(toCoords.file - whiteCoords.file) <
            Math.abs(blackCoords.file - whiteCoords.file)
        );
      }
      return false;
    });
  }

  static getBlackKingFrontSquares(blackKing: Square): Square[] {
    const { file, rank } = Brain.squareCoords(blackKing);
    if (rank === 0 && file === 0) {
      return ["a2", "b1", "b2"];
    }
    if (rank === 0 && file === 7) {
      return ["h2", "g1", "g2"];
    }
    if (rank === 7 && file === 0) {
      return ["a7", "b8", "b7"];
    }
    if (rank === 7 && file === 7) {
      return ["h7", "g8", "g7"];
    }
    const candidates: Array<Square | null> = [];
    if (rank === 0) {
      candidates.push(
        Brain.squareFromCoords(file - 1, rank + 1),
        Brain.squareFromCoords(file, rank + 1),
        Brain.squareFromCoords(file + 1, rank + 1)
      );
    } else if (rank === 7) {
      candidates.push(
        Brain.squareFromCoords(file - 1, rank - 1),
        Brain.squareFromCoords(file, rank - 1),
        Brain.squareFromCoords(file + 1, rank - 1)
      );
    } else if (file === 0) {
      candidates.push(
        Brain.squareFromCoords(file + 1, rank - 1),
        Brain.squareFromCoords(file + 1, rank),
        Brain.squareFromCoords(file + 1, rank + 1)
      );
    } else if (file === 7) {
      candidates.push(
        Brain.squareFromCoords(file - 1, rank - 1),
        Brain.squareFromCoords(file - 1, rank),
        Brain.squareFromCoords(file - 1, rank + 1)
      );
    }
    return candidates.filter((square): square is Square => square != null);
  }

  static getWhiteKingControlledBlackKingFrontSquares(
    whiteKing: Square,
    blackKing: Square
  ): Square[] {
    return Brain.getBlackKingFrontSquares(blackKing).filter(
      (square) => Brain.kingDistance(whiteKing, square) === 1
    );
  }

  static isTwoBishopsOppositionBridgePhaseTwo(
    blackKing: Square,
    bishops: Square[]
  ): boolean {
    return bishops.some((oppositionBishop, index) => {
      const otherBishop = bishops[1 - index];
      return (
        Brain.edgeDistance(oppositionBishop) > 0 &&
        Brain.edgeDistance(otherBishop) > 0 &&
        Brain.hasDirectKingOpposition(blackKing, oppositionBishop) &&
        Brain.areEdgeAdjacent(oppositionBishop, otherBishop) &&
        Brain.isKnightMove(blackKing, otherBishop)
      );
    });
  }

  static isTwoBishopsEdgeAdjacentKingPhaseTwo(
    fen: string,
    blackKing: Square,
    whiteKing: Square,
    bishops: Square[]
  ): boolean {
    return bishops.some((kingAdjacentBishop, index) => {
      const otherBishop = bishops[1 - index];
      if (
        !Brain.areEdgeAdjacent(whiteKing, kingAdjacentBishop) ||
        Brain.kingWalkDistance(blackKing, whiteKing) !== 2 ||
        Brain.kingWalkDistance(blackKing, kingAdjacentBishop) !== 2
      ) {
        return false;
      }
      const target = Brain.getTwoBishopsUniqueSupportSquare(
        blackKing,
        whiteKing,
        kingAdjacentBishop
      );
      return Boolean(
        target &&
        Brain.bishopControlsOrOccupiesSquare(
          fen,
          otherBishop,
          target
        )
      );
    });
  }

  static getTwoBishopsUniqueSupportSquare(
    blackKing: Square,
    whiteKing: Square,
    bishop: Square
  ): Square | null {
    const candidates = Brain.allSquares().filter(
      (square) =>
        Brain.isKnightMove(square, bishop) &&
        Brain.isCamelMove(square, whiteKing)
    );
    if (candidates.length === 0) {
      return null;
    }
    const bestDistance = Math.min(
      ...candidates.map((square) => Brain.kingWalkDistance(square, blackKing))
    );
    const closest = candidates.filter(
      (square) => Brain.kingWalkDistance(square, blackKing) === bestDistance
    );
    return closest.length === 1 ? closest[0] : null;
  }

  static isTwoBishopsOppositionEntryPhaseTwo(
    fen: string,
    blackKing: Square,
    whiteKing: Square,
    bishops: Square[]
  ): boolean {
    return Brain.getTwoBishopsKingOppositionDestinationSquares(
      fen,
      whiteKing,
      blackKing
    ).some((kingDestination) =>
      Brain.getEdgeSquaresInDirectOpposition(blackKing).some((edgeSquare) =>
        bishops.some((edgeControllingBishop, index) => {
          if (
            !Brain.bishopControlsOrOccupiesSquare(
              fen,
              edgeControllingBishop,
              edgeSquare
            )
          ) {
            return false;
          }
          const otherBishop = bishops[1 - index];
          return Brain.canBishopReachKnightEdgeAdjacentDiagonal(
            fen,
            otherBishop,
            kingDestination,
            edgeSquare
          );
        })
      )
    );
  }

  static getTwoBishopsKingOppositionDestinationSquares(
    fen: string,
    whiteKing: Square,
    blackKing: Square
  ): Square[] {
    const blackKingInCorner = Brain.isCorner(blackKing);
    return Brain.allSquares().filter((square) => {
      if (
        (!blackKingInCorner && Brain.edgeDistance(square) === 0) ||
        !Brain.hasDirectKingOpposition(square, blackKing)
      ) {
        return false;
      }
      return (
        square === whiteKing ||
        (Brain.kingDistance(whiteKing, square) === 1 &&
          Brain.isLegalMove(fen, whiteKing, square))
      );
    });
  }

  static getEdgeSquaresInDirectOpposition(square: Square): Square[] {
    return Brain.allSquares().filter(
      (candidate) =>
        Brain.edgeDistance(candidate) === 0 &&
        Brain.hasDirectKingOpposition(square, candidate)
    );
  }

  static canBishopReachKnightEdgeAdjacentDiagonal(
    fen: string,
    bishop: Square,
    kingDestination: Square,
    edgeSquare: Square
  ): boolean {
    const diagonalAnchors = Brain.allSquares().filter(
      (square) =>
        Brain.isKnightMove(square, kingDestination) &&
        Brain.areEdgeAdjacent(square, edgeSquare)
    );
    if (diagonalAnchors.length !== 2) {
      return false;
    }
    if (!Brain.sameDiagonal(diagonalAnchors[0], diagonalAnchors[1])) {
      return false;
    }
    return Brain.allSquares().some(
      (square) =>
        Brain.sameDiagonal(square, diagonalAnchors[0]) &&
        (square === bishop ||
          (Brain.sameDiagonal(bishop, square) &&
            Brain.isLegalMove(fen, bishop, square)))
    );
  }

  static isTwoBishopsCornerNetPhaseTwo(
    fen: string,
    blackKing: Square,
    whiteKing: Square,
    bishops: Square[]
  ): boolean {
    const closestCorner = Brain.closestCorner(blackKing);
    if (
      Brain.kingWalkDistance(blackKing, closestCorner) > 1 ||
      !Brain.isKnightMove(whiteKing, closestCorner)
    ) {
      return false;
    }
    const targetSquares = Brain.allSquares().filter(
      (square) =>
        Brain.edgeDistance(square) === 0 &&
        !Brain.isCorner(square) &&
        Brain.isKnightMove(square, whiteKing) &&
        Brain.kingWalkDistance(square, blackKing) <= 2
    );
    return targetSquares.some((target) =>
      bishops.some((bishop) =>
        Brain.bishopControlsOrOccupiesSquare(fen, bishop, target)
      )
    );
  }

  static closestCorner(square: Square): Square {
    return Brain.corners()
      .slice()
      .sort(
        (a, b) =>
          Brain.kingWalkDistance(square, a) -
          Brain.kingWalkDistance(square, b)
      )[0];
  }

  static areEdgeAdjacent(a: Square, b: Square): boolean {
    const first = Brain.squareCoords(a);
    const second = Brain.squareCoords(b);
    return (
      Math.abs(first.file - second.file) +
      Math.abs(first.rank - second.rank) ===
      1
    );
  }

  static isCamelMove(a: Square, b: Square): boolean {
    const first = Brain.squareCoords(a);
    const second = Brain.squareCoords(b);
    const fileDistance = Math.abs(first.file - second.file);
    const rankDistance = Math.abs(first.rank - second.rank);
    return (
      (fileDistance === 1 && rankDistance === 3) ||
      (fileDistance === 3 && rankDistance === 1)
    );
  }

  static sameDiagonal(a: Square, b: Square): boolean {
    const first = Brain.squareCoords(a);
    const second = Brain.squareCoords(b);
    return (
      Math.abs(first.file - second.file) ===
      Math.abs(first.rank - second.rank)
    );
  }

  static bishopControlsOrOccupiesSquare(
    fen: string,
    bishop: Square,
    target: Square
  ): boolean {
    if (bishop === target) {
      return true;
    }
    if (!Brain.sameDiagonal(bishop, target)) {
      return false;
    }
    const bishopCoords = Brain.squareCoords(bishop);
    const targetCoords = Brain.squareCoords(target);
    const fileStep = Math.sign(targetCoords.file - bishopCoords.file);
    const rankStep = Math.sign(targetCoords.rank - bishopCoords.rank);
    let file = bishopCoords.file + fileStep;
    let rank = bishopCoords.rank + rankStep;
    const chess = Brain.getChess(fen);
    while (file !== targetCoords.file || rank !== targetCoords.rank) {
      const square = Brain.squareFromCoords(file, rank);
      if (!square || chess.get(square)) {
        return false;
      }
      file += fileStep;
      rank += rankStep;
    }
    return true;
  }

  static blackKingCannotLeaveEdge(fen: string): boolean {
    return Brain.getBlackLegalMoves(fen).every((san) => {
      const chess = Brain.getChess(Brain.withTurn(fen, "b"));
      chess.move(san);
      const blackKing = Brain.findPiece(chess.fen(), "b", "k");
      return Boolean(blackKing && Brain.edgeDistance(blackKing.square) === 0);
    });
  }

  static getBlackLegalMoves(fen: string): string[] {
    return Brain.getChess(Brain.withTurn(fen, "b")).moves();
  }

  static withTurn(fen: string, turn: "w" | "b"): string {
    const parts = fen.split(" ");
    parts[1] = turn;
    return parts.join(" ");
  }

  static whiteBishopsAreAdjacent(fen: string): boolean {
    const bishops = Brain.getWhiteBishopSquares(fen);
    return bishops.length === 2 && Brain.kingDistance(bishops[0], bishops[1]) === 1;
  }

  static compareTwoBishopsWhiteScores(
    a: TwoBishopsWhiteMoveScore,
    b: TwoBishopsWhiteMoveScore
  ): number {
    return Brain.compareScoreReasons(a, b, Brain.getTwoBishopsWhiteScoreReasons());
  }

  static getTwoBishopsWhiteScoreReasons(): Array<ScoreReason<TwoBishopsWhiteMoveScore>> {
    return [
      { reason: "mate", compare: (a, b) => a.matePenalty - b.matePenalty },
      { reason: "no stalemate", compare: (a, b) => a.stalematePenalty - b.stalematePenalty },
      { reason: "bishops safe", compare: (a, b) => a.bishopSafetyPenalty - b.bishopSafetyPenalty },
      { reason: "stay phase two", compare: (a, b) => a.phaseTwoStayPhaseTwoPenalty - b.phaseTwoStayPhaseTwoPenalty },
      { reason: "waiting move", compare: (a, b) => a.phaseTwoWaitingMovePenalty - b.phaseTwoWaitingMovePenalty },
      { reason: "force opponent to take opposition", compare: (a, b) => a.phaseTwoForceOpponentOppositionPenalty - b.phaseTwoForceOpponentOppositionPenalty },
      { reason: "take direct opposition", compare: (a, b) => a.phaseTwoTakeDirectOppositionPenalty - b.phaseTwoTakeDirectOppositionPenalty },
      { reason: "push from controlled edge square", compare: (a, b) => a.phaseTwoPushFromControlledEdgeSquarePenalty - b.phaseTwoPushFromControlledEdgeSquarePenalty },
      { reason: "force opponent toward corner", compare: (a, b) => a.phaseTwoForceOpponentCornerPenalty - b.phaseTwoForceOpponentCornerPenalty },
      { reason: "check king", compare: (a, b) => a.phaseTwoCheckPenalty - b.phaseTwoCheckPenalty },
      { reason: "bishops far from corner", compare: (a, b) => b.phaseTwoBishopCornerDistance - a.phaseTwoBishopCornerDistance },
      { reason: "avoid king bishop screening", compare: (a, b) => a.kingBishopScreeningPenalty - b.kingBishopScreeningPenalty },
      { reason: "bishops together", compare: (a, b) => a.bishopAdjacencyPenalty - b.bishopAdjacencyPenalty },
      { reason: "king near bishops", compare: (a, b) => a.kingBishopDistance - b.kingBishopDistance },
      { reason: "force black to edge", compare: (a, b) => a.blackKingEdgeDistance - b.blackKingEdgeDistance },
      { reason: "bishops closer", compare: (a, b) => a.bishopBlackKingDistance - b.bishopBlackKingDistance },
    ];
  }

  static twoBishopsWhiteScoresTie(
    a: TwoBishopsWhiteMoveScore,
    b: TwoBishopsWhiteMoveScore
  ): boolean {
    return Brain.compareTwoBishopsWhiteScores(a, b) === 0;
  }

  static getIdealRookWhiteMoves(fen: string): string[] {
    const chess = Brain.getChess(fen);
    const moves = chess.moves();
    if (chess.turn() !== "w" || moves.length === 0) {
      return moves;
    }
    return Brain.selectBestMovesByScoreReasons(
      moves,
      (san) => Brain.scoreRookWhiteMove(fen, san),
      Brain.getRookWhiteScoreReasons()
    );
  }

  static scoreRookWhiteMove(fen: string, san: string): RookWhiteMoveScore {
    const beforeRook = Brain.findPiece(fen, "w", "r");
    const beforeWhiteKing = Brain.findPiece(fen, "w", "k");
    const beforeBlackKing = Brain.findPiece(fen, "b", "k");
    const beforeRookBoxAxis = Brain.getRookEstablishedBoxAxis(fen);
    const beforeClosestRookBoxAxis =
      beforeRook && beforeWhiteKing && beforeBlackKing
        ? Brain.getClosestRookBoxAxis(beforeRook, beforeWhiteKing, beforeBlackKing)
        : null;
    const needsPhaseTwoWaitingMove =
      beforeRook &&
      beforeWhiteKing &&
      beforeBlackKing &&
      beforeRookBoxAxis &&
      Brain.getMajorEndgamePhase(fen, "r") === 2 &&
      Brain.isKnightMove(beforeWhiteKing.square, beforeBlackKing.square);
    const chess = Brain.getChess(fen);
    const move = chess.move(san);
    const resultFen = chess.fen();
    const whiteRook = Brain.findPiece(resultFen, "w", "r");
    const whiteKing = Brain.findPiece(resultFen, "w", "k");
    const blackKing = Brain.findPiece(resultFen, "b", "k");
    const rookIsSafe = !Brain.blackCanTakeWhiteMajorPiece(resultFen, "r");
    const rookCutAxis =
      whiteRook && whiteKing && blackKing
        ? Brain.getRookCutAxis(whiteRook, whiteKing, blackKing)
        : null;
    const rookBoxAxis = Brain.getRookEstablishedBoxAxis(resultFen);
    const closestRookBoxAxis =
      whiteRook && whiteKing && blackKing
        ? Brain.getClosestRookBoxAxis(whiteRook, whiteKing, blackKing)
        : null;
    const rookPhaseTwoWaitingMove =
      needsPhaseTwoWaitingMove &&
      move?.piece === "r" &&
      !chess.isCheck() &&
      beforeRook &&
      whiteRook &&
      rookCutAxis === beforeRookBoxAxis &&
      Brain.squareCoords(whiteRook.square)[beforeRookBoxAxis] ===
      Brain.squareCoords(beforeRook.square)[beforeRookBoxAxis];
    return {
      matePenalty: chess.isCheckmate() ? 0 : 1,
      rookCapturePenalty: rookIsSafe ? 0 : 1,
      stalematePenalty: !chess.isCheckmate() && chess.isStalemate() ? 1 : 0,
      rookBoxEstablishedPenalty:
        beforeRook && beforeWhiteKing && beforeBlackKing && beforeClosestRookBoxAxis === null
          ? closestRookBoxAxis !== null
            ? 0
            : 1
          : 0,
      rookBoxSize:
        beforeRookBoxAxis === null && whiteRook && blackKing
          ? Brain.getRookOneDimensionalBoxSize(whiteRook.square, blackKing.square)
          : 0,
      forcingCheckPenalty:
        chess.isCheck() &&
          !chess.isCheckmate() &&
          Brain.blackMustMoveAwayFromWhiteKing(resultFen)
          ? 0
          : 1,
      rookPhaseTwoWaitingPenalty: needsPhaseTwoWaitingMove
        ? rookPhaseTwoWaitingMove
          ? 0
          : 1
        : 0,
      rookPhaseTwoWaitingDistanceScore:
        needsPhaseTwoWaitingMove &&
          rookPhaseTwoWaitingMove &&
          whiteRook &&
          beforeBlackKing
          ? -Brain.kingDistance(whiteRook.square, beforeBlackKing.square)
          : 0,
      rookBoxPreservedPenalty:
        beforeClosestRookBoxAxis !== null
          ? closestRookBoxAxis === null
            ? 1
            : 0
          : beforeRookBoxAxis !== null && rookBoxAxis === null
            ? 1
            : 0,
      rookBlackDistanceScore:
        move?.piece === "r" && whiteRook && blackKing
          ? -Brain.manhattanDistance(whiteRook.square, blackKing.square)
          : 1,
      kingRookLinePenalty:
        whiteKing && whiteRook && Brain.sharesRankOrFile(whiteKing.square, whiteRook.square)
          ? 1
          : 0,
      kingDistance:
        whiteKing && blackKing
          ? Brain.manhattanDistance(whiteKing.square, blackKing.square)
          : 99,
    };
  }

  static compareRookWhiteScores(
    a: RookWhiteMoveScore,
    b: RookWhiteMoveScore
  ): number {
    return Brain.compareScoreReasons(a, b, Brain.getRookWhiteScoreReasons());
  }

  static getRookWhiteScoreReasons(): Array<ScoreReason<RookWhiteMoveScore>> {
    return [
      { reason: "mate", compare: (a, b) => a.matePenalty - b.matePenalty },
      { reason: "rook safe", compare: (a, b) => a.rookCapturePenalty - b.rookCapturePenalty },
      { reason: "no stalemate", compare: (a, b) => a.stalematePenalty - b.stalematePenalty },
      {
        reason: "establish box",
        compare: (a, b) =>
          a.rookBoxEstablishedPenalty - b.rookBoxEstablishedPenalty ||
          a.rookBoxSize - b.rookBoxSize,
      },
      { reason: "forcing check", compare: (a, b) => a.forcingCheckPenalty - b.forcingCheckPenalty },
      { reason: "rook waiting move", compare: (a, b) => a.rookPhaseTwoWaitingPenalty - b.rookPhaseTwoWaitingPenalty },
      { reason: "rook waiting distance", compare: (a, b) => a.rookPhaseTwoWaitingDistanceScore - b.rookPhaseTwoWaitingDistanceScore },
      {
        reason: "king closer",
        compare: (a, b) =>
          a.kingRookLinePenalty - b.kingRookLinePenalty ||
          a.kingDistance - b.kingDistance,
      },
      {
        reason: "maximize black distance",
        compare: (a, b) =>
          a.rookBoxPreservedPenalty - b.rookBoxPreservedPenalty ||
          a.rookBlackDistanceScore - b.rookBlackDistanceScore,
      },
    ];
  }

  static compareScoreReasons<T>(
    a: T,
    b: T,
    reasons: Array<ScoreReason<T>>
  ): number {
    for (const reason of reasons) {
      const diff = reason.compare(a, b);
      if (diff !== 0) {
        return diff;
      }
    }
    return 0;
  }

  static selectBestMovesByScoreReasons<T>(
    moves: string[],
    scoreMove: (san: string, index: number) => T,
    reasons: Array<ScoreReason<T>>
  ): string[] {
    const scores = new Map<number, T>();
    const getScore = (index: number) => {
      const existing = scores.get(index);
      if (existing !== undefined) {
        return existing;
      }
      const score = scoreMove(moves[index], index);
      scores.set(index, score);
      return score;
    };
    return Brain.selectBestMovesShortCircuit(
      moves,
      reasons.map((reason) => ({
        compare: (leftIndex, rightIndex) =>
          reason.compare(getScore(leftIndex), getScore(rightIndex)),
      }))
    );
  }

  static selectBestMovesByComparator<T>(
    moves: string[],
    scoreMove: (san: string, index: number) => T,
    compareScores: (a: T, b: T) => number
  ): string[] {
    const scores = new Map<number, T>();
    const getScore = (index: number) => {
      const existing = scores.get(index);
      if (existing !== undefined) {
        return existing;
      }
      const score = scoreMove(moves[index], index);
      scores.set(index, score);
      return score;
    };
    return Brain.selectBestMovesShortCircuit(moves, [
      {
        compare: (leftIndex, rightIndex) =>
          compareScores(getScore(leftIndex), getScore(rightIndex)),
      },
    ]);
  }

  static selectBestMovesShortCircuit(
    moves: string[],
    priorities: MovePriority[]
  ): string[] {
    if (moves.length <= 1 || priorities.length === 0) {
      return moves;
    }
    const order = Brain.shuffledIndexes(moves.length);
    let bestIndex = order[0];
    let bestIndexes = new Set<number>([bestIndex]);
    const compareIndexes = (leftIndex: number, rightIndex: number) => {
      for (const priority of priorities) {
        const diff = priority.compare(leftIndex, rightIndex);
        if (diff !== 0) {
          return diff;
        }
      }
      return 0;
    };
    for (const index of order.slice(1)) {
      const diff = compareIndexes(index, bestIndex);
      if (diff < 0) {
        bestIndex = index;
        bestIndexes = new Set<number>([index]);
      } else if (diff === 0) {
        bestIndexes.add(index);
      }
    }
    return moves.filter((_, index) => bestIndexes.has(index));
  }

  static shuffledIndexes(length: number): number[] {
    const indexes = Array.from({ length }, (_, index) => index);
    for (let index = indexes.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
    }
    return indexes;
  }

  static getIdealQueenWhiteMoves(fen: string): string[] {
    const chess = Brain.getChess(fen);
    const moves = chess.moves();
    if (chess.turn() !== "w" || moves.length === 0) {
      return moves;
    }
    return Brain.selectBestMovesByScoreReasons(
      moves,
      (san) => Brain.scoreQueenWhiteMove(fen, san),
      Brain.getQueenWhiteScoreReasons()
    );
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
      cagePenalty: resultCage ? 0 : 1,
      whitePieceEdgePenalty: [whiteQueen, whiteKing].filter(
        (piece) => piece && Brain.edgeDistance(piece.square) === 0
      ).length,
      queenKnightMovePenalty:
        whiteQueen &&
          blackKing &&
          Brain.isKnightMove(whiteQueen.square, blackKing.square)
          ? 0
          : 1,
      queenBoxArea:
        whiteQueen && blackKing
          ? Brain.getQueenBoxArea(whiteQueen.square, blackKing.square)
          : 99,
      cageKingApproach:
        shouldWalkCageKing && resultCage && whiteKing && whiteQueen
          ? move?.piece === "k"
            ? Brain.getQueenCageKingApproachDistance(
              whiteKing.square,
              whiteQueen.square,
              startingCage.corner
            ) *
            8 +
            Brain.getQueenCageKingApproachManhattanDistance(
              whiteKing.square,
              whiteQueen.square,
              startingCage.corner
            )
            : 99
          : 0,
      kingMiddleDistance: whiteKing ? Brain.middle2x2Distance(whiteKing.square) : 99,
      whiteKingBetweenPiecesPenalty:
        move?.piece === "k" &&
          whiteQueen &&
          whiteKing &&
          blackKing &&
          Brain.isMajorPieceBetweenKings(whiteKing, whiteQueen, blackKing)
          ? 1
          : 0,
      kingDistance:
        whiteKing && blackKing
          ? Brain.manhattanDistance(whiteKing.square, blackKing.square)
          : 99,
      queenMoveDistance: Brain.getQueenMoveDistance(
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
    return Brain.compareScoreReasons(a, b, Brain.getQueenWhiteScoreReasons());
  }

  static getQueenWhiteScoreReasons(): Array<ScoreReason<QueenWhiteMoveScore>> {
    return [
      { reason: "mate", compare: (a, b) => a.matePenalty - b.matePenalty },
      { reason: "queen safe", compare: (a, b) => a.queenCapturePenalty - b.queenCapturePenalty },
      { reason: "no stalemate", compare: (a, b) => a.stalematePenalty - b.stalematePenalty },
      { reason: "corner cage", compare: (a, b) => a.cagePenalty - b.cagePenalty },
      { reason: "king to cage", compare: (a, b) => a.cageKingApproach - b.cageKingApproach },
      { reason: "white pieces off edge", compare: (a, b) => a.whitePieceEdgePenalty - b.whitePieceEdgePenalty },
      { reason: "queen knight move", compare: (a, b) => a.queenKnightMovePenalty - b.queenKnightMovePenalty },
      { reason: "queen box size", compare: (a, b) => a.queenBoxArea - b.queenBoxArea },
      {
        reason: "king closer",
        compare: (a, b) =>
          a.whiteKingBetweenPiecesPenalty - b.whiteKingBetweenPiecesPenalty ||
          a.kingDistance - b.kingDistance,
      },
      {
        reason: "shorter queen move",
        compare: (a, b) => Brain.compareQueenMoveDistances(a.queenMoveDistance, b.queenMoveDistance),
      },
    ];
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
      a.cageKingApproach === b.cageKingApproach &&
      a.whitePieceEdgePenalty === b.whitePieceEdgePenalty &&
      a.queenKnightMovePenalty === b.queenKnightMovePenalty &&
      a.queenBoxArea === b.queenBoxArea &&
      a.whiteKingBetweenPiecesPenalty === b.whiteKingBetweenPiecesPenalty &&
      a.kingDistance === b.kingDistance &&
      Brain.compareQueenMoveDistances(a.queenMoveDistance, b.queenMoveDistance) === 0
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
    const fen = hashFen || Brain.getFen();
    const orientationIsWhite = Brain.getOrientationFromHash();
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
    const endgame = getEndgame(id);
    const plusFen = Brain.getRandomPlusEndgameFen(id);
    if (plusFen) {
      return plusFen;
    }
    const pieces = Brain.getEndgamePieces(endgame.fen);
    for (let attempt = 0; attempt < 1000; attempt++) {
      const fen = Brain.getRandomEndgameFenAttempt(pieces, id);
      if (fen) {
        return fen;
      }
    }
    return getEndgame(id).fen;
  }

  static getRandomPlusEndgameFen(id: EndgameId): string | null {
    if (id === "knightAndBishop+") {
      return Brain.getRandomKnightAndBishopPlusFen();
    }
    if (id === "twoBishops+") {
      return Brain.getRandomTwoBishopsPlusFen();
    }
    if (id === "rook+") {
      return Brain.getRandomRookPlusFen();
    }
    if (id === "queen+") {
      return Brain.getRandomQueenPlusFen();
    }
    return null;
  }

  static getRandomKnightAndBishopPlusFen(): string {
    return Brain.getRandomTransformedEndgameFen(
      "7k/8/5K2/6N1/4B3/8/8/8 w - - 42 22"
    );
  }

  static getRandomTwoBishopsPlusFen(): string {
    const fens = [
      "4k3/8/4K3/3BB3/8/8/8/8 w - - 38 20",
      "5k2/8/5K2/4BB2/8/8/8/8 w - - 38 20",
    ];
    return Brain.getRandomTransformedEndgameFen(
      fens[Math.floor(Math.random() * fens.length)]
    );
  }

  static getRandomRookPlusFen(): string {
    return Brain.getRandomTransformedEndgameFen(
      "8/8/8/8/3k4/8/1R6/3K4 w - - 0 1"
    );
  }

  static getRandomQueenPlusFen(): string {
    return Brain.getRandomTransformedEndgameFen(
      "8/8/8/8/3k4/1Q6/8/3K4 w - - 0 1"
    );
  }

  static getRandomTransformedEndgameFen(fen: string): string {
    const transform =
      Brain.SQUARE_TRANSFORMS[
      Math.floor(Math.random() * Brain.SQUARE_TRANSFORMS.length)
      ];
    return Brain.getRandomTransformedEndgameFenWithTransform(fen, transform);
  }

  static getRandomTransformedEndgameFenWithTransform(
    fen: string,
    transform: SquareTransform
  ): string {
    const [, turn = "w", castling = "-", enPassant = "-", halfmove = "0", fullmove = "1"] =
      fen.split(" ");
    return `${Brain.boardFenFromPlacements(
      Brain.getEndgamePiecePlacements(fen).map((piece) => ({
        ...piece,
        square: Brain.transformSquare(piece.square, transform),
      }))
    )} ${turn} ${castling} ${enPassant} ${halfmove} ${fullmove}`;
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

  static getEndgamePiecePlacements(fen: string): EndgamePiecePlacement[] {
    return Brain.getChess(fen)
      .board()
      .flat()
      .filter((piece) => piece !== null)
      .map((piece) => ({
        color: piece!.color,
        type: piece!.type,
        isPawn: piece!.type === "p",
        square: piece!.square,
      }));
  }

  static getRandomEndgameFenAttempt(
    pieces: EndgamePiece[],
    id?: EndgameId
  ): string | null {
    const availableSquares = Brain.allSquares();
    const placements: EndgamePiecePlacement[] = [];
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
    if (
      id === "twoBishops" &&
      !Brain.whiteBishopsAreOppositeColored(placements)
    ) {
      return null;
    }
    const fen = `${Brain.boardFenFromPlacements(placements)} w - - 0 1`;
    if (!Brain.isLegalEndgameStart(fen)) {
      return null;
    }
    return fen;
  }

  static whiteBishopsAreOppositeColored(
    placements: EndgamePiecePlacement[]
  ): boolean {
    const bishopSquares = placements
      .filter((piece) => piece.color === "w" && piece.type === "b")
      .map((piece) => piece.square);
    return (
      bishopSquares.length === 2 &&
      Brain.squareColor(bishopSquares[0]) !== Brain.squareColor(bishopSquares[1])
    );
  }

  static boardFenFromPlacements(
    placements: EndgamePiecePlacement[]
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

  static getTransformedPositionKey(
    fen: string,
    transform: SquareTransform
  ): string {
    return `${Brain.boardFenFromPlacements(
      Brain.getEndgamePiecePlacements(fen).map((piece) => ({
        ...piece,
        square: Brain.transformSquare(piece.square, transform),
      }))
    )} ${Brain.getChess(fen).turn()}`;
  }

  static transformSquare(square: Square, transform: SquareTransform): Square {
    const coords = Brain.squareCoords(square);
    const transformed = transform.map(coords.file, coords.rank);
    const transformedSquare = Brain.squareFromCoords(
      transformed.file,
      transformed.rank
    );
    if (!transformedSquare) {
      throw new Error(`invalid transformed square: ${square}`);
    }
    return transformedSquare;
  }

  static getSquareTransform(name: string): SquareTransform {
    const transform = Brain.SQUARE_TRANSFORMS.find(
      (candidate) => candidate.name === name
    );
    if (!transform) {
      throw new Error(`unknown square transform: ${name}`);
    }
    return transform;
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

  static getMoveStates(o: {
    sans: string[];
    orientationIsWhite: boolean;
  }): StateType[] {
    const chess = Brain.getChess();
    const logs: LogType[] = [];
    return o.sans.map((san) => {
      const fen = chess.fen();
      chess.move(san);
      logs.push({ fen, san });
      return {
        fen: chess.fen(),
        startingFen: fen as string | undefined,
        orientationIsWhite: o.orientationIsWhite,
        logs: logs.slice(),
      };
    });
  }

  static loadMoves(o: { sans: string[]; orientationIsWhite: boolean }) {
    return Promise.resolve(o)
      .then((game) => Brain.getMoveStates(game))
      .then((moveStates) => {
        Brain.loadMoveStates(moveStates, moveStates.length > 0 ? 1 : 0);
      });
  }

  static loadMoveStates(moveStates: StateType[], moveCount: number) {
    clearTimeout(Brain.timeout);
    const states = moveStates
      .slice()
      .reverse()
      .concat(Brain.history.states.slice(Brain.history.index));
    Brain.updateHistory({
      index: Math.max(0, moveStates.length - moveCount),
      states,
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
          getLatestGame(Brain.lichessUsername!).then(Brain.loadLatestGame);
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
        let choice = Math.random() * weights.reduce((a, b) => a + b, 0);
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
      const state = Brain.getState();
      const moves = Brain.getIdealEndgameMovesForTurn(
        state.fen,
        Brain.getEndgameBlackReturnTargetFen(state.logs, state.logs.length - 1)
      );
      return Brain.playMove(moves[Math.floor(Math.random() * moves.length)]);
    }
    Brain.getBest(Brain.getState().fen).then((san) => Brain.playMove(san));
  }

  static getBest(fen: string): Promise<string> {
    if (Brain.view === View.endgame) {
      if (!Brain.hasSelectedEndgame()) {
        return Promise.resolve("");
      }
      const state = Brain.getState();
      const moves = Brain.getIdealEndgameMovesForTurn(
        fen,
        state.fen === fen
          ? Brain.getEndgameBlackReturnTargetFen(state.logs, state.logs.length - 1)
          : undefined
      );
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

  static getBestByNoveltyElseScore(
    fen: string,
    orientationIsWhite = Brain.getState().orientationIsWhite
  ): Promise<string | undefined> {
    if (Brain.isMyTurn(fen, orientationIsWhite)) {
      const novelty = Brain.getNovelty(fen);
      if (novelty !== null) {
        return Promise.resolve(novelty);
      }
    }
    return lichessF(fen, { prepareNext: true })
      .then((moves) => moves.slice().sort((a, b) => b.score - a.score))
      .then((moves) => moves[0]?.san);
  }

  static async getLatestGameFastForwardMoveCount(game: {
    sans: string[];
    orientationIsWhite: boolean;
  }): Promise<number | undefined> {
    const version = ++Brain.latestGameFastForwardVersion;
    const chess = Brain.getChess();

    for (let i = 0; i < game.sans.length; i++) {
      const fen = chess.fen();
      const san = game.sans[i];
      const isMyMove = Brain.isMyTurn(fen, game.orientationIsWhite);
      const bestSan = isMyMove
        ? await Brain.getBestByNoveltyElseScore(fen, game.orientationIsWhite)
        : undefined;
      const move = chess.move(san);

      if (
        version !== Brain.latestGameFastForwardVersion ||
        Brain.view !== View.lichess_latest
      ) {
        return undefined;
      }
      if (!move) {
        return undefined;
      }
      if (isMyMove && bestSan !== undefined && move.san !== bestSan) {
        return i + 1;
      }
    }

    return game.sans.length;
  }

  static async loadLatestGame(game: {
    sans: string[];
    orientationIsWhite: boolean;
  }) {
    const moveStates = Brain.getMoveStates(game);
    const moveCount = await Brain.getLatestGameFastForwardMoveCount(game);
    if (moveCount === undefined) return;
    Brain.loadMoveStates(moveStates, moveCount);
  }

  static async findEndgameLoop() {
    if (!Brain.hasSelectedEndgame()) return;
    if (Brain.endgameId === "knightAndBishop+") {
      void Brain.findKnightAndBishopFlowchartLoop();
      return;
    }
    if (Brain.endgameLoopSearchProgress.isSearching) return;
    const result =
      Brain.endgameId === "knightAndBishop"
        ? await Brain.searchExhaustiveKnightAndBishopLoops()
        : Brain.searchRandomEndgameLoops();
    if (result.found) {
      Brain.loadEndgameLine(result.found.startingFen, result.found.moves);
      return;
    }
    alert(Brain.formatEndgameLoopSearchStats(result));
  }

  static async findKnightAndBishopFlowchartLoop() {
    const {
      findKnbFlowchartIssuePath,
      formatKnbFlowchartIssuePathStats,
      getKnbFlowchartPathModeForEndgame,
    } = await import("./flowcharts/KnBCycleDetector");
    const mode = getKnbFlowchartPathModeForEndgame(Brain.endgameId);
    if (!mode) {
      return;
    }
    const result = findKnbFlowchartIssuePath(mode);
    if (result.result !== "none") {
      Brain.loadEndgameLine(result.startingFen, result.moves);
      return;
    }
    alert(formatKnbFlowchartIssuePathStats(result));
  }

  static loadEndgameLine(startingFen: string, moves: string[]) {
    const states = Brain.getEndgameLineStates(startingFen, moves);
    if (states.length === 0) return;
    clearTimeout(Brain.timeout);
    Brain.updateHistory({
      index: 0,
      states: states.slice().reverse(),
    });
  }

  static getEndgameLineStates(
    startingFen: string,
    moves: string[]
  ): StateType[] {
    const startedAt = Date.now();
    const chess = Brain.getChess(startingFen);
    const logs: LogType[] = [];
    const states: StateType[] = [
      {
        fen: startingFen,
        startingFen: undefined,
        orientationIsWhite: true,
        logs: [],
        endgame_started_at_ms: startedAt,
      },
    ];

    for (const san of moves) {
      const preMoveFen = chess.fen();
      if (chess.turn() === "w") {
        const whiteMove = chess.move(san);
        if (whiteMove === null) break;
        const afterWhiteFen = chess.fen();
        const terminalOutcome = Brain.getEndgameTerminalOutcome(afterWhiteFen);
        logs.push({
          fen: preMoveFen,
          san: whiteMove.san,
          ...Brain.getEndgameLogFields(
            preMoveFen,
            whiteMove.san,
            afterWhiteFen
          ),
        });
        states.push({
          fen: afterWhiteFen,
          startingFen: preMoveFen,
          orientationIsWhite: true,
          logs: logs.slice(),
          endgame_started_at_ms: startedAt,
          endgame_finished_at_ms: terminalOutcome ? startedAt : undefined,
        });
        continue;
      }

      const latestLog = logs[logs.length - 1];
      const blackReplyCandidates = latestLog
        ? Brain.getEndgameOpponentCandidates(
          chess,
          Brain.getEndgameBlackReturnTargetFen(logs, logs.length - 1)
        )
        : { moves: [], idealMoves: [] };
      const blackMove = chess.move(san);
      if (blackMove === null) break;
      if (latestLog) {
        logs[logs.length - 1] = {
          ...latestLog,
          opponent_san: blackMove.san,
          ideal_choices: blackReplyCandidates.idealMoves.length,
          num_choices: blackReplyCandidates.moves.length,
        };
      }
      const terminalOutcome = Brain.getEndgameTerminalOutcome(chess.fen());
      states.push({
        fen: chess.fen(),
        startingFen: preMoveFen,
        orientationIsWhite: true,
        logs: logs.slice(),
        endgame_started_at_ms: startedAt,
        endgame_finished_at_ms: terminalOutcome ? startedAt : undefined,
      });
    }

    return states;
  }

  static searchRandomEndgameLoops(
    maxPositions = 32,
    plyLimit = 200,
    random: () => number = Math.random,
  ): EndgameLoopSearchResult {
    const stats: EndgameLoopSearchResult = {
      checked: 0,
      mates: 0,
      loops: 0,
      limits: 0,
      noMoves: 0,
      lostPieces: 0,
      stalemates: 0,
      totalPlies: 0,
    };

    if (!Brain.hasSelectedEndgame()) return stats;

    const startingFens = Brain.getEndgameLoopSearchStartFens(maxPositions);
    for (const startingFen of startingFens) {
      const path = Brain.tryEndgamePathToMate(startingFen, plyLimit, random);
      stats.checked += 1;
      stats.totalPlies += path.plies;

      if (path.result === "mate") stats.mates += 1;
      if (path.result === "limit") stats.limits += 1;
      if (path.result === "noMove") stats.noMoves += 1;
      if (path.result === "lostPiece") stats.lostPieces += 1;
      if (path.result === "stalemate") stats.stalemates += 1;
      if (path.result === "loop") {
        stats.loops += 1;
        stats.found = {
          result: "loop",
          checked: stats.checked,
          plies: path.plies,
          startingFen: path.startingFen,
          finalFen: path.finalFen,
          moves: path.moves,
        };
        return stats;
      }
    }

    return stats;
  }

  static async searchExhaustiveKnightAndBishopLoops(
    plyLimit = 200,
  ): Promise<EndgameLoopSearchResult> {
    const stats: EndgameLoopSearchResult = {
      checked: 0,
      mates: 0,
      loops: 0,
      limits: 0,
      noMoves: 0,
      lostPieces: 0,
      stalemates: 0,
      totalPlies: 0,
    };
    const context: ExhaustiveEndgameLoopSearchContext = {
      knownNoLoop: new Map(),
      seenPositions: new Set(),
      visitedNodes: 0,
      totalEstimate: Brain.getKnightAndBishopLoopSearchPositionEstimate(),
      yieldEvery: 1000,
    };
    const checkedStarts = new Set<string>();

    Brain.setEndgameLoopSearchProgress({
      isSearching: true,
      percent: 0,
      seenPositions: 0,
      checked: 0,
    });

    try {
      for (const startingFen of Brain.getKnightAndBishopLoopSearchStartFens()) {
        const startKey = Brain.boardTurnKey(startingFen);
        if (checkedStarts.has(startKey)) {
          continue;
        }
        checkedStarts.add(startKey);
        const path = await Brain.tryExhaustiveEndgamePathToMate(
          startingFen,
          plyLimit,
          context
        );
        stats.checked += 1;
        stats.totalPlies += path.plies;

        if (path.result === "mate") stats.mates += 1;
        if (path.result === "limit") stats.limits += 1;
        if (path.result === "noMove") stats.noMoves += 1;
        if (path.result === "lostPiece") stats.lostPieces += 1;
        if (path.result === "stalemate") stats.stalemates += 1;
        if (path.result === "loop") {
          stats.loops += 1;
          stats.found = {
            result: "loop",
            checked: stats.checked,
            plies: path.plies,
            startingFen: path.startingFen,
            finalFen: path.finalFen,
            moves: path.moves,
          };
          return stats;
        }
      }

      return stats;
    } finally {
      Brain.setEndgameLoopSearchProgress({
        isSearching: false,
        percent: Brain.getEndgameLoopSearchPercent(context),
        seenPositions: context.seenPositions.size,
        checked: stats.checked,
      });
    }
  }

  static getEndgameLoopSearchStartFens(maxPositions: number): string[] {
    if (Brain.endgameId === "knightAndBishop+") {
      return [...KNIGHT_BISHOP_PREPARE_STARTS];
    }
    return Array.from({ length: maxPositions }, () =>
      Brain.getRandomEndgameFen(Brain.endgameId!),
    );
  }

  static *getKnightAndBishopLoopSearchStartFens(): Generator<string> {
    const currentFen = Brain.getState()?.fen;
    if (currentFen && Brain.getChess(currentFen).turn() === "w") {
      yield currentFen;
    }

    const squares = Brain.allSquares();
    for (const blackKingSquare of squares) {
      for (const whiteKingSquare of squares) {
        if (whiteKingSquare === blackKingSquare) continue;
        for (const bishopSquare of squares) {
          if (
            bishopSquare === blackKingSquare ||
            bishopSquare === whiteKingSquare
          ) {
            continue;
          }
          for (const knightSquare of squares) {
            if (
              knightSquare === blackKingSquare ||
              knightSquare === whiteKingSquare ||
              knightSquare === bishopSquare
            ) {
              continue;
            }
            const fen = `${Brain.boardFenFromPlacements([
              {
                color: "b",
                type: "k",
                isPawn: false,
                square: blackKingSquare,
              },
              {
                color: "w",
                type: "k",
                isPawn: false,
                square: whiteKingSquare,
              },
              {
                color: "w",
                type: "b",
                isPawn: false,
                square: bishopSquare,
              },
              {
                color: "w",
                type: "n",
                isPawn: false,
                square: knightSquare,
              },
            ])} w - - 0 1`;
            if (Brain.isLegalEndgameStart(fen)) {
              yield fen;
            }
          }
        }
      }
    }
  }

  static getKnightAndBishopLoopSearchPositionEstimate(): number {
    return 64 * 63 * 62 * 61;
  }

  static getEndgameLoopSearchPercent(
    context: ExhaustiveEndgameLoopSearchContext
  ): number {
    return Math.min(
      99.9,
      (100 * context.seenPositions.size) / context.totalEstimate
    );
  }

  static setEndgameLoopSearchProgress(progress: EndgameLoopSearchProgress) {
    Brain.endgameLoopSearchProgress = progress;
    Brain.endgameLoopSearchProgressListeners.forEach((listener) => listener());
  }

  static subscribeToEndgameLoopSearchProgress(listener: () => void) {
    Brain.endgameLoopSearchProgressListeners.add(listener);
    return () => {
      Brain.endgameLoopSearchProgressListeners.delete(listener);
    };
  }

  static formatEndgameLoopSearchProgressPercent(
    progress = Brain.endgameLoopSearchProgress
  ): string {
    if (progress.isSearching || progress.percent <= 0) {
      return "";
    }
    if (progress.percent > 0 && progress.percent < 0.1) {
      return "<0.1%";
    }
    return `${progress.percent < 10
      ? progress.percent.toFixed(1)
      : Math.round(progress.percent)
    }%`;
  }

  static tryEndgamePathToMate(
    startingFen: string,
    plyLimit = 200,
    random: () => number = Math.random,
  ): EndgamePathSearchResult {
    const chess = Brain.getChess(startingFen);
    const seen = new Set<string>([Brain.boardTurnKey(chess.fen())]);
    const moves: string[] = [];
    let lastWhiteTurnFen: string | undefined;
    let blackReturnTargetFen: string | undefined;

    for (let ply = 0; ply < plyLimit; ply += 1) {
      const terminalOutcome = Brain.getEndgameTerminalOutcome(chess.fen());
      if (terminalOutcome) {
        return {
          result: terminalOutcome === "checkmate" ? "mate" : terminalOutcome,
          plies: ply,
          startingFen,
          finalFen: chess.fen(),
          moves,
        };
      }

      const choices =
        chess.turn() === "w"
          ? Brain.getIdealEndgameWhiteMoves(chess.fen())
          : Brain.getEndgameOpponentCandidates(chess, blackReturnTargetFen)
            .idealMoves;
      const move = choices[Math.floor(random() * choices.length)];
      if (!move) {
        return {
          result: "noMove",
          plies: ply,
          startingFen,
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

      const terminalAfterMove = Brain.getEndgameTerminalOutcome(chess.fen());
      if (terminalAfterMove) {
        return {
          result: terminalAfterMove === "checkmate" ? "mate" : terminalAfterMove,
          plies: ply + 1,
          startingFen,
          finalFen: chess.fen(),
          moves,
        };
      }

      const key = Brain.boardTurnKey(chess.fen());
      if (seen.has(key)) {
        return {
          result: "loop",
          plies: ply + 1,
          startingFen,
          finalFen: chess.fen(),
          moves,
        };
      }
      seen.add(key);
    }

    return {
      result: "limit",
      plies: plyLimit,
      startingFen,
      finalFen: chess.fen(),
      moves,
    };
  }

  static async tryExhaustiveEndgamePathToMate(
    startingFen: string,
    plyLimit = 200,
    context: ExhaustiveEndgameLoopSearchContext = {
      knownNoLoop: new Map(),
      seenPositions: new Set(),
      visitedNodes: 0,
      totalEstimate: Brain.getKnightAndBishopLoopSearchPositionEstimate(),
      yieldEvery: 1000,
    }
  ): Promise<EndgamePathSearchResult> {
    const visit = async (
      fen: string,
      moves: string[],
      visiting: Map<string, number>
    ): Promise<EndgamePathSearchResult> => {
      const terminalOutcome = Brain.getEndgameTerminalOutcome(fen);
      if (terminalOutcome) {
        return {
          result: terminalOutcome === "checkmate" ? "mate" : terminalOutcome,
          plies: moves.length,
          startingFen,
          finalFen: fen,
          moves,
        };
      }

      const key = Brain.boardTurnKey(fen);
      const repeatedAt = visiting.get(key);
      if (repeatedAt !== undefined) {
        return {
          result: "loop",
          plies: moves.length,
          startingFen,
          finalFen: fen,
          moves,
        };
      }

      const remainingPlies = plyLimit - moves.length;
      if (remainingPlies <= 0) {
        return {
          result: "limit",
          plies: moves.length,
          startingFen,
          finalFen: fen,
          moves,
        };
      }

      const knownRemaining = context.knownNoLoop.get(key);
      if (knownRemaining !== undefined && knownRemaining >= remainingPlies) {
        return {
          result: "mate",
          plies: moves.length,
          startingFen,
          finalFen: fen,
          moves,
        };
      }

      context.visitedNodes += 1;
      context.seenPositions.add(key);
      if (context.visitedNodes % context.yieldEvery === 0) {
        context.onProgress?.(context);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const chess = Brain.getChess(fen);
      const choices =
        chess.turn() === "w"
          ? Brain.getIdealEndgameWhiteMoves(fen)
          : chess.moves();
      if (choices.length === 0) {
        return {
          result: "noMove",
          plies: moves.length,
          startingFen,
          finalFen: fen,
          moves,
        };
      }

      visiting.set(key, moves.length);
      let fallback: EndgamePathSearchResult | undefined;
      for (const san of choices) {
        const next = Brain.getChess(fen);
        const move = next.move(san);
        if (!move) {
          continue;
        }
        const result = await visit(
          next.fen(),
          [...moves, move.san],
          visiting
        );
        if (result.result === "loop") {
          return result;
        }
        fallback = Brain.getMoreSevereEndgamePathResult(fallback, result);
      }
      visiting.delete(key);

      context.knownNoLoop.set(
        key,
        Math.max(context.knownNoLoop.get(key) ?? 0, remainingPlies)
      );

      return (
        fallback ?? {
          result: "noMove",
          plies: moves.length,
          startingFen,
          finalFen: fen,
          moves,
        }
      );
    };

    return visit(startingFen, [], new Map());
  }

  static getMoreSevereEndgamePathResult(
    current: EndgamePathSearchResult | undefined,
    candidate: EndgamePathSearchResult
  ): EndgamePathSearchResult {
    if (!current) {
      return candidate;
    }
    const ranks: Record<EndgamePathSearchResult["result"], number> = {
      limit: 5,
      noMove: 4,
      lostPiece: 3,
      stalemate: 2,
      checkmate: 1,
      mate: 1,
      loop: 0,
    };
    const rank = (result: EndgamePathSearchResult["result"]) => ranks[result];
    return rank(candidate.result) > rank(current.result) ? candidate : current;
  }

  static formatEndgameLoopSearchStats(result: EndgameLoopSearchResult): string {
    const averagePlies =
      result.checked === 0 ? 0 : Math.round(result.totalPlies / result.checked);
    return [
      `No loops found in ${result.checked} positions.`,
      `Mates: ${result.mates}`,
      `Limits: ${result.limits}`,
      `No moves: ${result.noMoves}`,
      `Lost pieces: ${result.lostPieces}`,
      `Stalemates: ${result.stalemates}`,
      `Average plies searched: ${averagePlies}`,
    ].join("\n");
  }

  static getIdealEndgameMovesForTurn(
    fen: string,
    previousTurnFen?: string
  ): string[] {
    const chess = Brain.getChess(fen);
    if (chess.turn() === "b") {
      return Brain.getEndgameOpponentCandidates(chess, previousTurnFen)
        .idealMoves;
    }
    return Brain.getIdealEndgameWhiteMoves(fen);
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

  static shouldOpenInNewTab(event?: NavigationEvent) {
    return Boolean(event?.metaKey || event?.ctrlKey || event?.button === 1);
  }

  static navigate(url: string, event?: NavigationEvent) {
    if (Brain.shouldOpenInNewTab(event)) {
      event?.preventDefault?.();
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    window.location.assign(url);
  }

  static traverse(event?: NavigationEvent) {
    Brain.navigate(`/traverse#${Brain.hash()}`, event);
  }

  static speedrun(event?: NavigationEvent) {
    Brain.navigate(`/speedrun#${Brain.hash()}`, event);
  }

  static traps(event?: NavigationEvent) {
    Brain.navigate(`/traps#${Brain.hash()}`, event);
  }

  static endgames(event?: NavigationEvent) {
    Brain.navigate("/endgames", event);
  }

  static selectEndgame(id: EndgameId, event?: NavigationEvent) {
    Brain.navigate(`/endgames/${id}`, event);
  }

  static findMistakes(username: string, event?: NavigationEvent) {
    if (!username) return alert("no username provided");

    Brain.navigate(`/lichess/${username}/mistakes#${Brain.hash()}`, event);
  }

  static playVs(username: string, event?: NavigationEvent) {
    if (!username) return alert("no username provided");

    Brain.navigate(`/lichess/${username}/vs#${Brain.hash()}`, event);
  }

  static importLatestGame(username: string, event?: NavigationEvent) {
    if (!username) return alert("no username provided");

    Brain.navigate(`/lichess/${username}/latest`, event);
  }

  static home(event?: NavigationEvent) {
    if (Brain.showHelp) return Brain.updateShowHelp(false);
    if (Brain.view === View.endgame) {
      Brain.navigate("/", event);
      return;
    }
    const openInNewTab = Brain.shouldOpenInNewTab(event);
    event?.preventDefault?.();
    setTimeout(() => {
      const url = `/#${Brain.hash()}`;
      if (openInNewTab) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      window.location.assign(url);
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
    const previousLog = state.logs[state.logs.length - 1];
    const blackReplyCandidates = shouldReply
      ? Brain.getEndgameOpponentCandidates(chess, previousLog?.fen)
      : { moves: [], idealMoves: [] };
    const opponentSan = shouldReply
      ? Brain.chooseEndgameOpponentMove(blackReplyCandidates.idealMoves)
      : undefined;
    const now = Date.now();
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

  static getEndgameBlackReturnTargetFen(
    logs: LogType[],
    logIndex: number
  ): string | undefined {
    return logs[logIndex - 1]?.fen;
  }

  static getEndgameOpponentCandidates(
    chess: Chess,
    previousTurnFen?: string
  ): {
    moves: string[];
    idealMoves: string[];
  } {
    const moves = chess.moves();
    if (moves.length === 0) {
      return { moves, idealMoves: [] };
    }
    const returnMoves = Brain.getEndgameReturnToPositionMoves(
      chess.fen(),
      previousTurnFen,
      moves
    );
    if (returnMoves.length > 0) {
      return { moves, idealMoves: returnMoves };
    }
    const baseEndgameId = Brain.getSelectedBaseEndgameId();
    if (baseEndgameId === "rook") {
      return {
        moves,
        idealMoves: Brain.getIdealRookBlackMoves(chess, moves),
      };
    }
    if (baseEndgameId === "queen") {
      return {
        moves,
        idealMoves: Brain.getIdealQueenBlackMoves(chess, moves),
      };
    }
    if (baseEndgameId === "knightAndBishop") {
      return Brain.getKnightAndBishopOpponentCandidates(chess, moves);
    }
    if (baseEndgameId === "twoBishops") {
      return {
        moves,
        idealMoves: Brain.getIdealTwoBishopsBlackMoves(chess, moves),
      };
    }
    const idealMoves = Brain.selectBestMovesByComparator(
      moves,
      (san) => {
        const nextChess = Brain.getChess(chess.fen());
        nextChess.move(san);
        return Brain.getEndgamePositionScore(nextChess.fen());
      },
      Brain.compareEndgamePositionScores
    );
    return {
      moves,
      idealMoves,
    };
  }

  static getEndgameReturnToPositionMoves(
    fen: string,
    previousTurnFen: string | undefined,
    moves = Brain.getChess(fen).moves()
  ): string[] {
    if (!previousTurnFen) {
      return [];
    }
    const previousPositionKey = Brain.positionKey(previousTurnFen);
    return moves.filter((san) => {
      const nextChess = Brain.getChess(fen);
      const move = nextChess.move(san);
      return (
        move !== null &&
        Brain.positionKey(nextChess.fen()) === previousPositionKey
      );
    });
  }

  static getIdealRookBlackMoves(chess: Chess, moves: string[]): string[] {
    return Brain.selectBestMovesByComparator(
      moves,
      (san) => Brain.scoreRookBlackMove(chess.fen(), san),
      Brain.compareRookBlackScores
    );
  }

  static scoreRookBlackMove(fen: string, san: string): RookBlackMoveScore {
    const startingBlackKing = Brain.findPiece(fen, "b", "k");
    const startingWhiteRook = Brain.findPiece(fen, "w", "r");
    const startingWhiteKing = Brain.findPiece(fen, "w", "k");
    const rookCutAxis =
      startingBlackKing && startingWhiteRook && startingWhiteKing
        ? Brain.getRookCutAxis(startingWhiteRook, startingWhiteKing, startingBlackKing)
        : null;
    const whiteKingRookDiagonalAdjacent =
      startingWhiteKing && startingWhiteRook
        ? Brain.isDiagonalKingMove(startingWhiteKing.square, startingWhiteRook.square)
        : false;
    const startsWithOpposition =
      startingWhiteKing && startingBlackKing
        ? Brain.hasDirectKingOpposition(startingWhiteKing.square, startingBlackKing.square)
        : false;
    const chess = Brain.getChess(fen);
    const move = chess.move(san);
    const whiteRook = Brain.findPiece(chess.fen(), "w", "r");
    const whiteKing = Brain.findPiece(chess.fen(), "w", "k");
    const blackKing = Brain.findPiece(chess.fen(), "b", "k");
    const rookDistance =
      whiteRook && blackKing
        ? Brain.manhattanDistance(blackKing.square, whiteRook.square)
        : 99;
    const createsOpposition =
      !whiteKingRookDiagonalAdjacent &&
      !startsWithOpposition &&
      whiteKing &&
      blackKing &&
      Brain.hasDirectKingOpposition(whiteKing.square, blackKing.square);
    return {
      captureRookPenalty: move?.captured === "r" ? 0 : 1,
      cutLineDistance:
        rookCutAxis && whiteRook && blackKing
          ? Brain.getAxisDistance(blackKing.square, whiteRook.square, rookCutAxis)
          : 0,
      diagonalAdjacentRookDistance: whiteKingRookDiagonalAdjacent ? rookDistance : 0,
      rookOppositionPenalty: createsOpposition ? 1 : 0,
      rookDistance,
    };
  }

  static compareRookBlackScores(
    a: RookBlackMoveScore,
    b: RookBlackMoveScore
  ): number {
    return (
      a.captureRookPenalty - b.captureRookPenalty ||
      a.cutLineDistance - b.cutLineDistance ||
      a.diagonalAdjacentRookDistance - b.diagonalAdjacentRookDistance ||
      a.rookOppositionPenalty - b.rookOppositionPenalty ||
      a.rookDistance - b.rookDistance
    );
  }

  static getIdealQueenBlackMoves(chess: Chess, moves: string[]): string[] {
    return Brain.selectBestMovesByComparator(
      moves,
      (san) => Brain.scoreQueenBlackMove(chess.fen(), san),
      Brain.compareQueenBlackScores
    );
  }

  static scoreQueenBlackMove(
    fen: string,
    san: string
  ): QueenBlackMoveScore {
    const chess = Brain.getChess(fen);
    const move = chess.move(san);
    const blackKing = Brain.findPiece(chess.fen(), "b", "k");
    return {
      captureQueenPenalty: move?.captured === "q" ? 0 : 1,
      centerDistance: blackKing
        ? Brain.kingWalkCenterDistance(blackKing.square)
        : 99,
    };
  }

  static compareQueenBlackScores(
    a: QueenBlackMoveScore,
    b: QueenBlackMoveScore
  ): number {
    return (
      a.captureQueenPenalty - b.captureQueenPenalty ||
      a.centerDistance - b.centerDistance
    );
  }

  static queenBlackScoresTie(
    a: QueenBlackMoveScore,
    b: QueenBlackMoveScore
  ): boolean {
    return (
      a.captureQueenPenalty === b.captureQueenPenalty &&
      a.centerDistance === b.centerDistance
    );
  }

  static getIdealTwoBishopsBlackMoves(chess: Chess, moves: string[]): string[] {
    return Brain.selectBestMovesByComparator(
      moves,
      (san) => Brain.scoreTwoBishopsBlackMove(chess.fen(), san),
      Brain.compareTwoBishopsBlackScores
    );
  }

  static scoreTwoBishopsBlackMove(
    fen: string,
    san: string
  ): TwoBishopsBlackMoveScore {
    const chess = Brain.getChess(fen);
    const move = chess.move(san);
    const blackKing = Brain.findPiece(chess.fen(), "b", "k");
    return {
      unprotectedBishopDistance:
        move?.captured === "b"
          ? 0
          : Brain.distanceToNearestUnprotectedWhiteBishop(chess.fen()),
      centerDistance: blackKing ? Brain.centerDistance(blackKing.square) : 99,
    };
  }

  static compareTwoBishopsBlackScores(
    a: TwoBishopsBlackMoveScore,
    b: TwoBishopsBlackMoveScore
  ): number {
    return (
      a.centerDistance - b.centerDistance ||
      a.unprotectedBishopDistance - b.unprotectedBishopDistance
    );
  }

  static twoBishopsBlackScoresTie(
    a: TwoBishopsBlackMoveScore,
    b: TwoBishopsBlackMoveScore
  ): boolean {
    return Brain.compareTwoBishopsBlackScores(a, b) === 0;
  }

  static getRookCutAxisPreservingOpponentMoves(
    chess: Chess,
    moves: string[],
    idealMoves: string[]
  ): string[] | null {
    if (
      Brain.getSelectedBaseEndgameId() !== "rook" ||
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
    if (Brain.isKnightAndBishopWManeuverPosition(chess.fen())) {
      return { moves, idealMoves: moves };
    }
    if (Brain.knightAndBishopBlackHasLookupReply(chess.fen(), moves)) {
      return { moves, idealMoves: moves };
    }
    return {
      moves,
      idealMoves: Brain.selectBestMovesByComparator(
        moves,
        (san) => {
          const nextChess = Brain.getChess(chess.fen());
          nextChess.move(san);
          return Brain.scoreKnightAndBishopOpponentPosition(nextChess.fen());
        },
        (a, b) =>
          a.captureMinorPenalty - b.captureMinorPenalty ||
          a.unprotectedMinorDistance - b.unprotectedMinorDistance ||
          a.centerDistance - b.centerDistance ||
          a.mobilityScore - b.mobilityScore ||
          a.whiteKingDistanceScore - b.whiteKingDistanceScore ||
          a.matingCornerManhattanScore - b.matingCornerManhattanScore
      ),
    };
  }

  static knightAndBishopBlackHasLookupReply(
    fen: string,
    moves: string[]
  ): boolean {
    return moves.some((san) => {
      const chess = Brain.getChess(fen);
      chess.move(san);
      return Brain.getKnightAndBishopLookupWhiteMoves(chess.fen()).length > 0;
    });
  }

  static scoreKnightAndBishopOpponentPosition(fen: string) {
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const blackKing = Brain.findPiece(fen, "b", "k");
    return {
      captureMinorPenalty: Brain.knightAndBishopPiecesPresent(fen) ? 1 : 0,
      matingCornerManhattanScore:
        -Brain.manhattanDistanceToNearestBishopCorner(fen),
      unprotectedMinorDistance:
        Brain.distanceToNearestUnprotectedKnightOrBishop(fen),
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

  static distanceToNearestWrongCorner(fen: string): number {
    const bishop = Brain.findPiece(fen, "w", "b");
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (!bishop || !blackKing) {
      return 99;
    }
    const bishopColor = Brain.squareColor(bishop.square);
    return Brain.corners()
      .filter((corner) => Brain.squareColor(corner) !== bishopColor)
      .map((corner) => Brain.kingDistance(blackKing.square, corner))
      .sort((a, b) => a - b)[0];
  }

  static manhattanDistanceToNearestBishopCorner(fen: string): number {
    const bishop = Brain.findPiece(fen, "w", "b");
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (!bishop || !blackKing) {
      return 99;
    }
    const bishopColor = Brain.squareColor(bishop.square);
    return Brain.corners()
      .filter((corner) => Brain.squareColor(corner) === bishopColor)
      .map((corner) => Brain.manhattanDistance(blackKing.square, corner))
      .sort((a, b) => a - b)[0];
  }

  static manhattanDistanceToNearestWrongCorner(fen: string): number {
    const bishop = Brain.findPiece(fen, "w", "b");
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (!bishop || !blackKing) {
      return 99;
    }
    const bishopColor = Brain.squareColor(bishop.square);
    return Brain.corners()
      .filter((corner) => Brain.squareColor(corner) !== bishopColor)
      .map((corner) => Brain.manhattanDistance(blackKing.square, corner))
      .sort((a, b) => a - b)[0];
  }

  static manhattanDistanceToNearestCorner(fen: string): number {
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (!blackKing) {
      return 99;
    }
    return Brain.corners()
      .map((corner) => Brain.manhattanDistance(blackKing.square, corner))
      .sort((a, b) => a - b)[0];
  }

  static blackEscapeMoveCount(fen: string): number {
    const chess = Brain.getChess(fen);
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (chess.turn() !== "b" || !blackKing) {
      return 0;
    }
    const currentEdgeDistance = Brain.edgeDistance(blackKing.square);
    const currentCornerDistance = Brain.manhattanDistanceToNearestCorner(fen);
    return chess.moves().filter((san) => {
      const nextChess = Brain.getChess(fen);
      nextChess.move(san);
      const nextBlackKing = Brain.findPiece(nextChess.fen(), "b", "k");
      if (!nextBlackKing) {
        return false;
      }
      return (
        Brain.edgeDistance(nextBlackKing.square) > currentEdgeDistance ||
        Brain.manhattanDistanceToNearestCorner(nextChess.fen()) >
        currentCornerDistance
      );
    }).length;
  }

  static blackInwardEscapeCount(fen: string): number {
    const chess = Brain.getChess(fen);
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (chess.turn() !== "b" || !blackKing) {
      return 0;
    }
    const currentEdgeDistance = Brain.edgeDistance(blackKing.square);
    if (currentEdgeDistance > 1) {
      return 0;
    }
    return chess.moves().filter((san) => {
      const nextChess = Brain.getChess(fen);
      nextChess.move(san);
      const nextBlackKing = Brain.findPiece(nextChess.fen(), "b", "k");
      return (
        nextBlackKing &&
        Brain.edgeDistance(nextBlackKing.square) > currentEdgeDistance
      );
    }).length;
  }

  static blackCentralEscapeMoveCount(fen: string): number {
    const chess = Brain.getChess(fen);
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (chess.turn() !== "b" || !blackKing) {
      return 0;
    }
    const currentCenterDistance = Brain.centerDistance(blackKing.square);
    return chess.moves().filter((san) => {
      const nextChess = Brain.getChess(fen);
      nextChess.move(san);
      const nextBlackKing = Brain.findPiece(nextChess.fen(), "b", "k");
      return (
        nextBlackKing &&
        Brain.centerDistance(nextBlackKing.square) < currentCenterDistance
      );
    }).length;
  }

  static whiteTriangleCompactness(fen: string): number {
    const chess = Brain.getChess(fen);
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const bishop = Brain.findPiece(fen, "w", "b");
    const knight = Brain.findPiece(fen, "w", "n");
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (!whiteKing || !bishop || !knight || !blackKing) {
      return 99;
    }
    const defenderBonus =
      (chess.isAttacked(bishop.square, "w") ? 1 : 0) +
      (chess.isAttacked(knight.square, "w") ? 1 : 0);
    return (
      Brain.manhattanDistance(whiteKing.square, blackKing.square) +
      Brain.manhattanDistance(bishop.square, blackKing.square) +
      Brain.manhattanDistance(knight.square, blackKing.square) -
      defenderBonus
    );
  }

  static whiteMinorCentralDistance(fen: string): number {
    const bishop = Brain.findPiece(fen, "w", "b");
    const knight = Brain.findPiece(fen, "w", "n");
    if (!bishop || !knight) {
      return 99;
    }
    return (
      Brain.centerDistance(bishop.square) + Brain.centerDistance(knight.square)
    );
  }

  static edgeCageScore(fen: string): number {
    const chess = Brain.getChess(fen);
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (chess.turn() !== "b" || !blackKing) {
      return 0;
    }
    const currentEdgeDistance = Brain.edgeDistance(blackKing.square);
    if (currentEdgeDistance > 1) {
      return 0;
    }
    const inwardMoves = Brain.blackInwardEscapeCount(fen);
    const black = Brain.squareCoords(blackKing.square);
    const controlledInwardSquares = [-1, 0, 1].flatMap((fileOffset) =>
      [-1, 0, 1].map((rankOffset) => ({ fileOffset, rankOffset }))
    ).filter(({ fileOffset, rankOffset }) => {
      if (fileOffset === 0 && rankOffset === 0) {
        return false;
      }
      const square = Brain.squareFromCoords(
        black.file + fileOffset,
        black.rank + rankOffset
      );
      return (
        square &&
        Brain.edgeDistance(square) > currentEdgeDistance &&
        chess.isAttacked(square, "w")
      );
    }).length;
    return controlledInwardSquares - inwardMoves * 2;
  }

  static whiteKingEdgeKeyDistance(fen: string): number {
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const blackKing = Brain.findPiece(fen, "b", "k");
    const bishop = Brain.findPiece(fen, "w", "b");
    if (!whiteKing || !blackKing || !bishop) {
      return 99;
    }
    if (Brain.edgeDistance(blackKing.square) > 1) {
      return 0;
    }
    const black = Brain.squareCoords(blackKing.square);
    const bishopColor = Brain.squareColor(bishop.square);
    const targetCorner = Brain.corners()
      .filter((corner) => Brain.squareColor(corner) === bishopColor)
      .sort(
        (a, b) =>
          Brain.kingDistance(blackKing.square, a) -
          Brain.kingDistance(blackKing.square, b)
      )[0];
    const corner = Brain.squareCoords(targetCorner);
    const towardCornerFile = Math.sign(corner.file - black.file);
    const towardCornerRank = Math.sign(corner.rank - black.rank);
    let keyFile = black.file;
    let keyRank = black.rank;
    if (black.rank === 7) {
      keyRank = 5;
      keyFile =
        black.file +
        (Brain.isCorner(blackKing.square) ? 2 : 1) * towardCornerFile;
    } else if (black.rank === 0) {
      keyRank = 2;
      keyFile =
        black.file +
        (Brain.isCorner(blackKing.square) ? 2 : 1) * towardCornerFile;
    } else if (black.file === 7) {
      keyFile = 5;
      keyRank =
        black.rank +
        (Brain.isCorner(blackKing.square) ? 2 : 1) * towardCornerRank;
    } else if (black.file === 0) {
      keyFile = 2;
      keyRank =
        black.rank +
        (Brain.isCorner(blackKing.square) ? 2 : 1) * towardCornerRank;
    } else {
      const inwardFile =
        black.file <= 1 ? 2 : black.file >= 6 ? 5 : black.file;
      const inwardRank =
        black.rank <= 1 ? 2 : black.rank >= 6 ? 5 : black.rank;
      keyFile =
        inwardFile + (inwardFile === black.file ? towardCornerFile : 0);
      keyRank =
        inwardRank + (inwardRank === black.rank ? towardCornerRank : 0);
    }
    const keySquare = Brain.squareFromCoords(
      Math.max(0, Math.min(7, keyFile)),
      Math.max(0, Math.min(7, keyRank))
    );
    return keySquare
      ? Brain.manhattanDistance(whiteKing.square, keySquare)
      : 99;
  }

  static wManeuverSetupDistance(fen: string): number {
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const blackKing = Brain.findPiece(fen, "b", "k");
    const bishop = Brain.findPiece(fen, "w", "b");
    const knight = Brain.findPiece(fen, "w", "n");
    if (!whiteKing || !blackKing || !bishop || !knight) {
      return 99;
    }
    if (Brain.edgeDistance(blackKing.square) > 1) {
      return 0;
    }
    const canonicalTargetCorner: Square = "a8";
    const canonicalWrongCorner: Square = "h8";
    const canonicalKing: Square = "f6";
    const canonicalBishops: Square[] = ["e4", "f3"];
    const canonicalKnights: Square[] = ["g5", "e5", "f7", "g4"];
    const scores = Brain.SQUARE_TRANSFORMS.map((transform) => {
      const transformedBishop = Brain.transformSquare(bishop.square, transform);
      if (
        Brain.squareColor(transformedBishop) !==
        Brain.squareColor(canonicalTargetCorner)
      ) {
        return null;
      }
      const transformedBlack = Brain.transformSquare(
        blackKing.square,
        transform
      );
      const blackCoords = Brain.squareCoords(transformedBlack);
      if (blackCoords.file < 5 || blackCoords.rank < 6) {
        return null;
      }
      if (
        Brain.kingDistance(transformedBlack, canonicalWrongCorner) >
        Brain.kingDistance(transformedBlack, canonicalTargetCorner)
      ) {
        return null;
      }
      const transformedWhiteKing = Brain.transformSquare(
        whiteKing.square,
        transform
      );
      const transformedKnight = Brain.transformSquare(knight.square, transform);
      const blackDistance = Brain.manhattanDistance(
        transformedBlack,
        canonicalWrongCorner
      );
      const kingDistance = Brain.manhattanDistance(
        transformedWhiteKing,
        canonicalKing
      );
      const bishopDistance = Math.min(
        ...canonicalBishops.map((square) =>
          Brain.manhattanDistance(transformedBishop, square)
        )
      );
      const knightDistance = Math.min(
        ...canonicalKnights.map((square) =>
          Brain.manhattanDistance(transformedKnight, square)
        )
      );
      return blackDistance * 4 + kingDistance * 2 + bishopDistance + knightDistance;
    }).filter((score): score is number => score !== null);
    return scores.length > 0 ? Math.min(...scores) : 99;
  }

  static squareColor(square: Square): number {
    const coords = Brain.squareCoords(square);
    return (coords.file + coords.rank) % 2;
  }

  static corners(): Square[] {
    return ["a1", "a8", "h1", "h8"];
  }

  static getClosestCornerToSquare(square: Square): Square {
    return Brain.corners().sort(
      (a, b) => Brain.kingDistance(square, a) - Brain.kingDistance(square, b)
    )[0];
  }

  static isCorner(square: Square): boolean {
    return Brain.corners().includes(square);
  }

  static getCurrentEdgeCorners(square: Square): Square[] {
    const coords = Brain.squareCoords(square);
    const corners: Square[] = [];
    if (coords.file === 0) {
      corners.push("a1", "a8");
    }
    if (coords.file === 7) {
      corners.push("h1", "h8");
    }
    if (coords.rank === 0) {
      corners.push("a1", "h1");
    }
    if (coords.rank === 7) {
      corners.push("a8", "h8");
    }
    return [...new Set(corners)];
  }

  static sharesAnyEdge(a: Square, b: Square): boolean {
    const first = Brain.squareCoords(a);
    const second = Brain.squareCoords(b);
    return (
      (first.file === 0 && second.file === 0) ||
      (first.file === 7 && second.file === 7) ||
      (first.rank === 0 && second.rank === 0) ||
      (first.rank === 7 && second.rank === 7)
    );
  }

  static sharesRankOrFile(a: Square, b: Square): boolean {
    const first = Brain.squareCoords(a);
    const second = Brain.squareCoords(b);
    return first.file === second.file || first.rank === second.rank;
  }

  static squaresAreContiguousRankOrFileLine(squares: Square[]): boolean {
    if (squares.length < 2) {
      return false;
    }
    const coords = squares.map((square) => Brain.squareCoords(square));
    const files = new Set(coords.map(({ file }) => file));
    const ranks = new Set(coords.map(({ rank }) => rank));
    if (files.size !== 1 && ranks.size !== 1) {
      return false;
    }
    const values =
      files.size === 1
        ? coords.map(({ rank }) => rank)
        : coords.map(({ file }) => file);
    return (
      new Set(values).size === squares.length &&
      Math.max(...values) - Math.min(...values) === squares.length - 1
    );
  }

  static squaresAreTwoDiagonalKingStepsApart(a: Square, b: Square): boolean {
    const first = Brain.squareCoords(a);
    const second = Brain.squareCoords(b);
    return (
      Math.abs(first.file - second.file) === 2 &&
      Math.abs(first.rank - second.rank) === 2
    );
  }

  static getDiagonalNeighborSquares(square: Square): Square[] {
    const coords = Brain.squareCoords(square);
    return [
      Brain.squareFromCoords(coords.file - 1, coords.rank - 1),
      Brain.squareFromCoords(coords.file - 1, coords.rank + 1),
      Brain.squareFromCoords(coords.file + 1, coords.rank - 1),
      Brain.squareFromCoords(coords.file + 1, coords.rank + 1),
    ].filter((target): target is Square => target != null);
  }

  static isLegalMove(fen: string, from: Square, to: Square): boolean {
    try {
      return Brain.getChess(fen).move({ from, to }) != null;
    } catch {
      return false;
    }
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

  static middle2x2Distance(square: Square): number {
    const coords = Brain.squareCoords(square);
    return (
      Brain.distanceToRange(coords.file, 3, 4) +
      Brain.distanceToRange(coords.rank, 3, 4)
    );
  }

  static isMiddle16Square(square: Square): boolean {
    const coords = Brain.squareCoords(square);
    return (
      coords.file >= 2 &&
      coords.file <= 5 &&
      coords.rank >= 2 &&
      coords.rank <= 5
    );
  }

  static middle16Distance(square: Square): number {
    const coords = Brain.squareCoords(square);
    return (
      Brain.distanceToRange(coords.file, 2, 5) +
      Brain.distanceToRange(coords.rank, 2, 5)
    );
  }

  static distanceToRange(value: number, min: number, max: number): number {
    if (value < min) return min - value;
    if (value > max) return value - max;
    return 0;
  }

  static centerDistance(square: Square): number {
    const coords = Brain.squareCoords(square);
    return Math.min(
      Math.abs(coords.file - 3),
      Math.abs(coords.file - 4)
    ) + Math.min(Math.abs(coords.rank - 3), Math.abs(coords.rank - 4));
  }

  static kingWalkCenterDistance(square: Square): number {
    return Math.min(
      ...(["d4", "e4", "d5", "e5"] as Square[]).map((centerSquare) =>
        Brain.kingDistance(square, centerSquare)
      )
    );
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
  ): number | null {
    if (piece === "q" && beforeQueenSquare && afterQueenSquare) {
      return Brain.manhattanDistance(beforeQueenSquare, afterQueenSquare);
    }
    return null;
  }

  static compareQueenMoveDistances(
    a: number | null,
    b: number | null
  ): number {
    if (a === null || b === null) {
      return 0;
    }
    return a - b;
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
      .filter(
        (piece) =>
          piece !== null &&
          piece.square !== square &&
          !(piece.color === "b" && piece.type === "k")
      )
      .map((piece) => ({
        color: piece!.color,
        type: piece!.type,
        isPawn: piece!.type === "p",
        square: piece!.square,
      }));
    placements.push({ color: "b", type: "k", isPawn: false, square });
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

  static getQueenCageKingApproachManhattanDistance(
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
      .map((square) => Brain.manhattanDistance(whiteKingSquare, square));
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

  static getClosestRookBoxAxis(
    whiteRook: { square: Square },
    whiteKing: { square: Square },
    blackKing: { square: Square }
  ): "rank" | "file" | null {
    const rook = Brain.squareCoords(whiteRook.square);
    const white = Brain.squareCoords(whiteKing.square);
    const black = Brain.squareCoords(blackKing.square);
    const closestBetweenRank = black.rank + Math.sign(white.rank - black.rank);
    const closestBetweenFile = black.file + Math.sign(white.file - black.file);
    if (
      Brain.isStrictlyBetween(rook.rank, white.rank, black.rank) &&
      rook.rank === closestBetweenRank
    ) {
      return "rank";
    }
    if (
      Brain.isStrictlyBetween(rook.file, white.file, black.file) &&
      rook.file === closestBetweenFile
    ) {
      return "file";
    }
    return null;
  }

  static getRookEstablishedBoxAxis(fen: string): "rank" | "file" | null {
    const whiteRook = Brain.findPiece(fen, "w", "r");
    const whiteKing = Brain.findPiece(fen, "w", "k");
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (!whiteRook || !whiteKing || !blackKing) {
      return null;
    }
    return Brain.getRookCutAxis(whiteRook, whiteKing, blackKing);
  }

  static getRookBoxSize(
    whiteRook: { square: Square },
    whiteKing: { square: Square },
    blackKing: { square: Square }
  ): number {
    const rook = Brain.squareCoords(whiteRook.square);
    const white = Brain.squareCoords(whiteKing.square);
    const black = Brain.squareCoords(blackKing.square);
    const cutSizes: number[] = [];
    if (Brain.isStrictlyBetween(rook.rank, white.rank, black.rank)) {
      cutSizes.push(
        Brain.getRookOneDimensionalBoxSize(whiteRook.square, blackKing.square, "rank")
      );
    }
    if (Brain.isStrictlyBetween(rook.file, white.file, black.file)) {
      cutSizes.push(
        Brain.getRookOneDimensionalBoxSize(whiteRook.square, blackKing.square, "file")
      );
    }
    return cutSizes.length === 0 ? 99 : Math.min(...cutSizes);
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

  static blackCanAttackUnprotectedKnightOrBishop(fen: string): boolean {
    const chess = Brain.getChess(fen);
    if (chess.turn() !== "b" || !Brain.knightAndBishopPiecesPresent(fen)) {
      return false;
    }
    return chess.moves().some((san) => {
      const nextChess = Brain.getChess(fen);
      const move = nextChess.move(san);
      if (move?.captured === "b" || move?.captured === "n") {
        return false;
      }
      const blackKing = Brain.findPiece(nextChess.fen(), "b", "k");
      if (!blackKing) {
        return false;
      }
      return Brain.getWhiteKnightAndBishopSquares(nextChess.fen()).some(
        (square) =>
          Brain.kingDistance(blackKing.square, square) <= 1 &&
          !nextChess.isAttacked(square, "w")
      );
    });
  }

  static getWhiteKnightAndBishopSquares(fen: string): Square[] {
    return Brain.getChess(fen)
      .board()
      .flat()
      .filter(
        (piece) =>
          piece?.color === "w" && (piece.type === "b" || piece.type === "n")
      )
      .map((piece) => piece!.square);
  }

  static distanceToNearestUnprotectedKnightOrBishop(fen: string): number {
    const chess = Brain.getChess(fen);
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (!blackKing) {
      return 99;
    }
    const unprotectedMinors = Brain.getWhiteKnightAndBishopSquares(fen).filter(
      (square) => !chess.isAttacked(square, "w")
    );
    if (unprotectedMinors.length === 0) {
      return 99;
    }
    return Math.min(
      ...unprotectedMinors.map((square) =>
        Brain.manhattanDistance(blackKing.square, square)
      )
    );
  }

  static blackCanWalkUpToWhiteBishop(fen: string): boolean {
    const chess = Brain.getChess(fen);
    if (chess.turn() !== "b") {
      return false;
    }
    return chess.moves().some((san) => {
      const nextChess = Brain.getChess(fen);
      const move = nextChess.move(san);
      if (move?.captured === "b") {
        return false;
      }
      const blackKing = Brain.findPiece(nextChess.fen(), "b", "k");
      return (
        blackKing != null &&
        Brain.getWhiteBishopSquares(nextChess.fen()).some(
          (square) => Brain.kingDistance(blackKing.square, square) <= 1
        )
      );
    });
  }

  static getWhiteBishopCenterDistance(fen: string): number {
    return Brain.getWhiteBishopSquares(fen).reduce(
      (distance, square) => distance + Brain.centerDistance(square),
      0
    );
  }

  static getWhiteBishopDistanceToSquare(fen: string, target: Square): number {
    return Brain.getWhiteBishopSquares(fen).reduce(
      (distance, square) => distance + Brain.kingWalkDistance(square, target),
      0
    );
  }

  static getWhiteKingBishopScreeningPenalty(fen: string): number {
    const blackKing = Brain.findPiece(fen, "b", "k");
    const whiteKing = Brain.findPiece(fen, "w", "k");
    if (!blackKing || !whiteKing) {
      return 0;
    }
    return Brain.getWhiteBishopSquares(fen).reduce(
      (screening, bishop) =>
        screening +
        (Brain.squareScreensSquareFromSource(
          blackKing.square,
          bishop,
          whiteKing.square
        )
          ? 1
          : 0) +
        (Brain.squareScreensSquareFromSource(
          blackKing.square,
          whiteKing.square,
          bishop
        )
          ? 1
          : 0),
      0
    );
  }

  static squareScreensSquareFromSource(
    source: Square,
    screen: Square,
    target: Square
  ): boolean {
    return (
      screen !== source &&
      screen !== target &&
      Brain.kingWalkDistance(source, screen) +
        Brain.kingWalkDistance(screen, target) ===
        Brain.kingWalkDistance(source, target)
    );
  }

  static getWhiteKingDistanceToBishops(fen: string, whiteKing: Square): number {
    return Brain.getWhiteBishopSquares(fen).reduce(
      (distance, square) => distance + Brain.kingWalkDistance(whiteKing, square),
      0
    );
  }

  static distanceToNearestUnprotectedWhiteBishop(fen: string): number {
    const blackKing = Brain.findPiece(fen, "b", "k");
    if (!blackKing) {
      return 99;
    }
    const unprotectedBishops = Brain.getWhiteBishopSquares(fen).filter(
      (square) => !Brain.whiteBishopIsProtectedByKing(fen, square)
    );
    if (unprotectedBishops.length === 0) {
      return 99;
    }
    return Math.min(
      ...unprotectedBishops.map((square) =>
        Brain.kingDistance(blackKing.square, square)
      )
    );
  }

  static whiteBishopIsProtectedByKing(fen: string, square: Square): boolean {
    const whiteKing = Brain.findPiece(fen, "w", "k");
    return whiteKing != null && Brain.kingDistance(whiteKing.square, square) <= 1;
  }

  static getWhiteBishopSquares(fen: string): Square[] {
    return Brain.getChess(fen)
      .board()
      .flat()
      .filter((piece) => piece?.color === "w" && piece.type === "b")
      .map((piece) => piece!.square);
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

  static kingWalkDistance(a: Square, b: Square): number {
    return Brain.kingDistance(a, b);
  }

  static manhattanDistance(a: Square, b: Square): number {
    const first = Brain.squareCoords(a);
    const second = Brain.squareCoords(b);
    return (
      Math.abs(first.file - second.file) + Math.abs(first.rank - second.rank)
    );
  }

  static squaredEuclideanDistance(a: Square, b: Square): number {
    const first = Brain.squareCoords(a);
    const second = Brain.squareCoords(b);
    const fileDelta = first.file - second.file;
    const rankDelta = first.rank - second.rank;
    return fileDelta * fileDelta + rankDelta * rankDelta;
  }

  static playEndgameOpponentMove(san: string, state: StateType, chess: Chess) {
    if (Brain.getEndgameTerminalOutcome(state.fen)) {
      return;
    }
    const blackReplyCandidates = Brain.getEndgameOpponentCandidates(
      chess,
      Brain.getEndgameBlackReturnTargetFen(state.logs, state.logs.length - 1)
    );
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

  static isEndgameOpponentMoveIdeal(
    log: LogType,
    previousTurnFen?: string
  ): boolean {
    if (!log.opponent_san) {
      return true;
    }
    const chess = Brain.getChess(log.fen);
    if (chess.move(log.san) === null) {
      return true;
    }
    const candidates = Brain.getEndgameOpponentCandidates(chess, previousTurnFen);
    return candidates.idealMoves.includes(log.opponent_san);
  }

  static isEndgameLogOpponentMoveIdeal(logIndex: number): boolean {
    const logs = Brain.getState().logs;
    const log = logs[logIndex];
    if (!log) {
      return true;
    }
    return Brain.isEndgameOpponentMoveIdeal(
      log,
      Brain.getEndgameBlackReturnTargetFen(logs, logIndex)
    );
  }

  static forceDifferentIdealEndgameOpponentMove(logIndex: number) {
    return Brain.forceDifferentEndgameOpponentMove(logIndex, (candidates, currentSan) => {
      if (candidates.idealMoves.length === 0) {
        return undefined;
      }
      const currentIndex = candidates.idealMoves.indexOf(currentSan || "");
      const nextSan =
        currentIndex === -1
          ? candidates.idealMoves[0]
          : candidates.idealMoves[
          (currentIndex + 1) % candidates.idealMoves.length
          ];
      return nextSan === currentSan ? undefined : nextSan;
    });
  }

  static forceDifferentRandomEndgameOpponentMove(logIndex: number) {
    return Brain.forceDifferentEndgameOpponentMove(logIndex, (candidates, currentSan) => {
      const moves = candidates.moves.filter((san) => san !== currentSan);
      if (moves.length === 0) {
        return undefined;
      }
      return moves[Math.floor(Math.random() * moves.length)];
    });
  }

  static forceDifferentEndgameOpponentMove(
    logIndex: number,
    chooseMove: (
      candidates: { moves: string[]; idealMoves: string[] },
      currentSan: string | undefined
    ) => string | undefined
  ) {
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
    const candidates = Brain.getEndgameOpponentCandidates(
      chess,
      Brain.getEndgameBlackReturnTargetFen(state.logs, logIndex)
    );
    const nextSan = chooseMove(candidates, log.opponent_san);
    if (!nextSan) {
      return;
    }
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

  static forceDifferentIdealEndgameMove(logIndex: number) {
    Brain.forceDifferentIdealEndgameOpponentMove(logIndex);
  }

  static forceDifferentIdealEndgameWhiteMove(logIndex: number) {
    const state = Brain.getState();
    const log = state.logs[logIndex];
    if (!log) {
      return;
    }
    const idealMoves = Brain.getIdealEndgameWhiteMoves(log.fen);
    if (idealMoves.length === 0) {
      return;
    }
    const currentIndex = idealMoves.indexOf(log.san);
    const nextSan =
      currentIndex === -1
        ? idealMoves[0]
        : idealMoves[(currentIndex + 1) % idealMoves.length];
    if (nextSan === log.san) {
      return;
    }
    const chess = Brain.getChess(log.fen);
    const whiteMove = chess.move(nextSan);
    if (whiteMove === null) {
      return;
    }
    const afterWhiteFen = chess.fen();
    const whiteTerminalOutcome = Brain.getEndgameTerminalOutcome(afterWhiteFen);
    const candidates = whiteTerminalOutcome
      ? { moves: [], idealMoves: [] }
      : Brain.getEndgameOpponentCandidates(
        chess,
        Brain.getEndgameBlackReturnTargetFen(state.logs, logIndex)
      );
    const opponentSan =
      log.opponent_san && candidates.moves.includes(log.opponent_san)
        ? log.opponent_san
        : Brain.chooseEndgameOpponentMove(candidates.idealMoves);
    const blackMove = opponentSan ? chess.move(opponentSan) : null;
    const logs = state.logs.slice(0, logIndex + 1);
    logs[logIndex] = {
      ...log,
      san: whiteMove.san,
      opponent_san: blackMove?.san,
      ideal_choices:
        candidates.moves.length === 0 ? undefined : candidates.idealMoves.length,
      num_choices: candidates.moves.length === 0 ? undefined : candidates.moves.length,
      ...Brain.getEndgameLogFields(log.fen, whiteMove.san, afterWhiteFen),
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
