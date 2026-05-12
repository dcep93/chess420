import { Chess, type Square } from "chess.js";
import lichessF, {
  type LiMove,
  getGameById,
  getLatestGame,
  latestGameCache,
} from "./Lichess";
import { DEFAULT_ENDGAME_ID, getEndgame, type EndgameId } from "./Endgames";
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
};

type History = {
  index: number;
  states: StateType[];
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
  static endgameId: EndgameId = DEFAULT_ENDGAME_ID;

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
    return (
      Brain.getPieceCount(fen) ===
      Brain.getPieceCount(getEndgame(Brain.endgameId).fen)
    );
  }

  static getEndgamePhase(fen: string): string {
    const majorPiece = Brain.getMajorEndgamePieceType();
    if (!majorPiece) {
      return "1/2";
    }
    return `${Brain.getMajorEndgamePhase(fen, majorPiece)}/2`;
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

  static isStrictlyBetween(value: number, a: number, b: number): boolean {
    return value > Math.min(a, b) && value < Math.max(a, b);
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

  static getInitialState(): StateType {
    if (Brain.view === View.endgame) {
      return {
        fen: getEndgame(Brain.endgameId).fen,
        startingFen: undefined,
        orientationIsWhite: true,
        logs: [],
      };
    }
    var fen = Brain.getFen();
    var orientationIsWhite = true;
    const hash = window.location.hash.split("#")[1];
    if (hash !== undefined) {
      const parts = hash.split("//");
      if (parts.length === 2) {
        orientationIsWhite = parts[0] === "w";
        fen = Brain.getFen(decodeURI(parts[1]).replaceAll("_", " "));
      }
    }
    return {
      fen,
      startingFen: undefined,
      orientationIsWhite,
      logs: [] as LogType[],
    };
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
    const original = Brain.history.states[Brain.history.states.length - 1];
    Brain.setState(original);
  }

  static newGame() {
    if (Brain.view === View.endgame) {
      Brain.setState(Brain.getInitialState());
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
      return alert("play best is not available in endgame mode");
    }
    Brain.getBest(Brain.getState().fen).then((san) => Brain.playMove(san));
  }

  static getBest(fen: string): Promise<string> {
    if (Brain.view === View.endgame) {
      return Promise.resolve("");
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
    if (
      Brain.view === View.endgame &&
      !Brain.endgamePieceCountMatchesStart(state.fen)
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
    const state = Brain.getState();
    const chess = Brain.getChess(state.fen);
    if (!Brain.endgamePieceCountMatchesStart(state.fen)) {
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
    const blackReplies = shouldReply ? chess.moves() : [];
    const opponentSan = shouldReply
      ? Brain.chooseEndgameOpponentMove(chess)
      : undefined;
    if (opponentSan) {
      chess.move(opponentSan);
    }
    const now = Date.now();
    const previousLog = state.logs[state.logs.length - 1];
    Brain.setState({
      ...state,
      fen: chess.fen(),
      startingFen: state.fen,
      orientationIsWhite: true,
      logs: state.logs.concat({
        fen: state.fen,
        san: whiteMove.san,
        opponent_san: opponentSan,
        num_choices: shouldReply ? blackReplies.length : undefined,
        created_at_ms: now,
        duration_ms:
          previousLog?.created_at_ms === undefined
            ? undefined
            : now - previousLog.created_at_ms,
      }),
    });
  }

  static chooseEndgameOpponentMove(chess: Chess): string | undefined {
    const moves = chess.moves();
    if (moves.length === 0) {
      return undefined;
    }
    const majorPiece = Brain.getMajorEndgamePieceType();
    if (!majorPiece) {
      return moves[Math.floor(Math.random() * moves.length)];
    }
    const scoredMoves = moves.map((san, index) => {
      const nextChess = Brain.getChess(chess.fen());
      nextChess.move(san);
      return {
        san,
        index,
        ...Brain.scoreMajorPieceOpponentPosition(nextChess.fen(), majorPiece),
      };
    });
    scoredMoves.sort(
      (a, b) =>
        a.capturePenalty - b.capturePenalty ||
        a.diagonalDistance - b.diagonalDistance ||
        a.whiteKingDistance - b.whiteKingDistance ||
        a.whiteMajorPieceDistance - b.whiteMajorPieceDistance ||
        a.index - b.index
    );
    return scoredMoves[0]?.san;
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
    const blackReplies = chess.moves();
    const blackMove = chess.move(san);
    if (blackMove === null) {
      return;
    }
    const logs = state.logs.slice();
    const latestLog = logs[logs.length - 1];
    if (latestLog) {
      logs[logs.length - 1] = {
        ...latestLog,
        opponent_san: blackMove.san,
        num_choices: blackReplies.length,
      };
    }
    Brain.setState({
      ...state,
      fen: chess.fen(),
      startingFen: state.fen,
      orientationIsWhite: true,
      logs,
    });
  }
}
