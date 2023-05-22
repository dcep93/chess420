import Chess, { ChessInstance, Square } from "chess.js";
import React from "react";
import lichess, { LiMove } from "./Lichess";
import { LogType } from "./Log";
import StorageW from "./StorageW";
import traverse, { TraverseType } from "./Traverse";

const REPLY_DELAY_MS = 500;

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
  lichess,
  lichess_mistakes,
  quizlet,
}

export default class Brain {
  static autoreplyRef = React.useRef<HTMLInputElement>(null);

  static history: History;
  static updateHistory: (history: History) => void;

  static timeout: NodeJS.Timeout;
  static traversePromise?: (san: string) => void;

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
        fen = Brain.getFen(parts[1].replaceAll("_", " "));
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
    switch (Brain.view) {
      case View.lichess_mistakes:
      case View.quizlet:
        const traverseState = { odds: 1, ...startingState };
        traverse({
          states: [
            {
              ...traverseState,
              orientationIsWhite: !traverseState.orientationIsWhite,
            },
            { ...traverseState },
          ],
        })
          .then((traverse) => (startingState.traverse = traverse))
          .then(() => Brain.setState(startingState));
    }
    Brain.setState(startingState);
  }

  //

  static getState(): StateType {
    return Brain.history.states[Brain.history.index];
  }

  static genState<T extends StateType>(
    startingState: T,
    san: string,
    username?: string
  ): T {
    return {
      ...startingState,
      fen: Brain.getFen(startingState.fen, san),
      logs: startingState.logs.concat({
        fen: startingState.fen,
        san,
        username,
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

  static isMyTurn(state: StateType) {
    return (
      Brain.getChess(state.fen).turn() ===
      (state.orientationIsWhite ? "w" : "b")
    );
  }

  //

  static maybeReply(state: StateType) {
    if (Brain.view === View.lichess_mistakes || Brain.view === View.quizlet)
      return;
    if (
      (!Brain.autoreplyRef.current || Brain.autoreplyRef.current!.checked) &&
      !Brain.isMyTurn(state)
    ) {
      Brain.timeout = setTimeout(Brain.playWeighted, REPLY_DELAY_MS);
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
    Brain.autoreplyRef.current!.checked = false;
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

  static playMove(san?: string, username?: string) {
    if (!san) {
      return alert("no move to play");
    }
    Brain.setState(Brain.genState(Brain.getState(), san, username));
  }

  static playWeighted() {
    const username = Brain.isMyTurn(Brain.getState())
      ? undefined
      : Brain.lichessUsername;
    lichess(Brain.getState().fen, { username, prepareNext: true })
      .then((moves) => {
        const weights = moves.map((move: LiMove) => Math.pow(move.total, 1.5));
        var choice = Math.random() * weights.reduce((a, b) => a + b, 0);
        for (let i = 0; i < weights.length; i++) {
          choice -= weights[i];
          if (choice <= 0) return moves[i].san;
        }
      })
      .then((san) => Brain.playMove(san, username));
  }

  static playBest() {
    const state = Brain.getState();
    if (Brain.isMyTurn(state)) {
      const novelty = Brain.getNovelty();
      if (novelty !== null) {
        return Brain.playMove(novelty, undefined);
      }
    }
    const username = Brain.isMyTurn(state) ? undefined : Brain.lichessUsername;
    lichess(Brain.getState().fen, { username, prepareNext: true })
      .then((moves) => moves.sort((a, b) => b.score - a.score))
      .then((moves) => moves[0]?.san)
      .then((san) => Brain.playMove(san, username));
  }

  static getNovelty(state?: StateType): string | null {
    if (!state) state = Brain.getState();
    return StorageW.get(Brain.getState().fen);
  }

  static clearNovelty() {
    StorageW.set(Brain.getState().fen, null);
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

  static escape() {
    setTimeout(() => {
      window.location.assign("/#");
      if (!Brain.view) window.location.reload();
    });
  }

  //

  static help() {
    alert("TODO c help");
  }

  // board
  static moveFromTo(from: string, to: string, shouldSaveNovelty: boolean) {
    const state = Brain.getState();
    const chess = Brain.getChess(state.fen);
    const move = chess.move({ from: from as Square, to: to as Square });
    if (move !== null) {
      if (shouldSaveNovelty) StorageW.set(state.fen, move.san);
      // TODO moveFromTo while traverse
      Brain.traversePromise !== undefined
        ? Brain.traversePromise(move.san)
        : Brain.setState(Brain.genState(Brain.getState(), move.san));
      return true;
    } else {
      return false;
    }
  }
}
