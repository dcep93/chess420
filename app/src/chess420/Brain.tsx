import Chess, { ChessInstance, Square } from "chess.js";
import lichessF, { LiMove, getLatestGame } from "./Lichess";
import { LogType } from "./Log";
import settings from "./Settings";
import StorageW from "./StorageW";
import traverseF, { TraverseType, startTraverseF } from "./Traverse";

export type StateType = {
  fen: string;
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
  quizlet,
}

export default class Brain {
  static autoreplyRef: React.RefObject<HTMLInputElement>;
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

  static timeout: NodeJS.Timeout;

  //

  static view?: View;
  static lichessUsername?: string;

  //

  static getFen(start?: string, san?: string): string {
    const chess = Brain.getChess(start);
    if (san) chess.move(san);
    return chess.fen();
  }

  static getChess(fen?: string): ChessInstance {
    // @ts-ignore
    const chess = new Chess();
    if (fen !== undefined) chess.load(fen);
    return chess;
  }

  //

  static hash(fen: string): string {
    return [
      Brain.getState().orientationIsWhite ? "w" : "b",
      fen.replaceAll(" ", "_"),
    ].join("//");
  }

  static getInitialState(): StateType {
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
      orientationIsWhite,
      logs: [] as LogType[],
    };
  }

  static setInitialState() {
    const startingState = Brain.getInitialState();
    Brain.setState(startingState);
    Promise.resolve()
      .then(Brain.fetchOpenings)
      .then(
        () =>
          (Brain.view === View.lichess_mistakes ||
            Brain.view === View.quizlet) &&
          startTraverseF(startingState)
      );
  }

  static fetchOpenings() {
    return Promise.all(
      ["a.tsv", "b.tsv", "c.tsv", "d.tsv", "e.tsv"].map((f) =>
        fetch(`${process.env.PUBLIC_URL}/eco/dist/${f}`)
          .then((response) => response.text())
          .then((text) =>
            text
              .split("\n")
              .slice(1)
              .filter((l) => l)
              .map((l) => l.split("\t"))
              .map(([eco, name, pgn, uci, epd]) => [
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
    if (Brain.view === View.lichess_mistakes || Brain.view === View.quizlet)
      return;
    if (
      (!Brain.autoreplyRef.current || Brain.autoreplyRef.current!.checked) &&
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
    Brain.setState({
      fen: Brain.getFen(),
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
    Brain.setState(Brain.genState(Brain.getState(), san));
  }

  static playWeighted() {
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
    const state = Brain.getState();
    if (Brain.isMyTurn(state.fen)) {
      const novelty = Brain.getNovelty();
      if (novelty !== null) {
        return Brain.playMove(novelty);
      }
    }
    lichessF(Brain.getState().fen, { prepareNext: true })
      .then((moves) => moves.sort((a, b) => b.score - a.score))
      .then((moves) => moves[0]?.san)
      .then((san) => Brain.playMove(san));
  }

  static getNovelty(state?: StateType): string | null {
    if (!state) state = Brain.getState();
    return StorageW.get(state.fen);
  }

  static clearNovelty() {
    StorageW.set(Brain.getState().fen, null);
  }

  static clearStorage() {
    StorageW.clear();
  }

  //

  static memorizeWithQuizlet() {
    window.location.href = `/quizlet#${Brain.hash(Brain.getState().fen)}`;
  }

  static findMistakes(username: string) {
    if (!username) return alert("no username provided");

    window.location.href = `/lichess/${username}/mistakes#${Brain.hash(
      Brain.getState().fen
    )}`;
  }

  static playVs(username: string) {
    if (!username) return alert("no username provided");

    window.location.href = `/lichess/${username}#${Brain.hash(
      Brain.getState().fen
    )}`;
  }

  static importLatestGame(username: string) {
    if (!username) return alert("no username provided");

    localStorage.setItem("lichess_username", username);

    getLatestGame(username)
      .then(({ sans, orientationIsWhite }) => {
        const chess = Brain.getChess();
        clearTimeout(Brain.timeout);
        const logs: LogType[] = [];
        return sans.map((san) => {
          const fen = chess.fen();
          chess.move(san);
          logs.push({ fen, san });
          return { fen: chess.fen(), orientationIsWhite, logs: logs.slice() };
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

  static home() {
    if (Brain.showHelp) return Brain.updateShowHelp(false);
    setTimeout(() => {
      window.location.assign("/#");
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
    StorageW.set(fen, san);
    return new Promise<void>((resolve) => {
      function helper() {
        if (StorageW.get(fen) === san) return resolve();
        setTimeout(helper, 100);
      }
      helper();
    });
  }

  // board
  static moveFromTo(from: string, to: string) {
    const state = Brain.getState();
    const chess = Brain.getChess(state.fen);
    const move = chess.move({ from: from as Square, to: to as Square });
    if (move !== null) {
      if (state.traverse?.states?.slice(-1)[0].fen === state.fen) {
        traverseF(state.traverse, move.san);
      } else {
        Promise.resolve()
          .then(() => Brain.setNovelty(state.fen, move.san))
          .then(() =>
            Brain.setState(Brain.genState(Brain.getState(), move.san))
          );
      }
      return true;
    } else {
      return false;
    }
  }
}
