import React from "react";

import Chess, { ChessInstance, Square } from "chess.js";
import lichess, { LiMove } from "./Lichess";
import { LogType } from "./Log";
import StorageW from "./StorageW";

const REPLY_DELAY_MS = 300;

export type StateType = {
  chess: ChessInstance;
  orientationIsWhite: boolean;
  logs: LogType[];
};

type History = {
  index: number;
  states: StateType[];
};

export default class Brain {
  static autoreplyRef = React.useRef<HTMLInputElement>(null);
  static lichessRef = React.useRef<HTMLInputElement>(null);
  static history: History;
  static updateHistory: (history: History) => void;

  static getChess(prevChess: ChessInstance | null = null): ChessInstance {
    // @ts-ignore
    const chess = new Chess();
    if (prevChess !== null) chess.load(prevChess.fen());
    return chess;
  }

  static hash(chess: ChessInstance): string {
    return `${Brain.getState().orientationIsWhite ? "w" : "b"}//${chess
      .fen()
      .replaceAll(" ", "_")}`;
  }

  static setInitialState() {
    const chess = Brain.getChess();
    var orientationIsWhite = true;
    const hash = window.location.hash.split("#")[1];
    if (hash !== undefined) {
      const parts = hash.split("//");
      if (parts.length === 2) {
        orientationIsWhite = parts[0] === "w";
        chess.load(parts[1].replaceAll("_", " "));
      }
    }
    Brain.setState({
      chess,
      orientationIsWhite,
      logs: [] as LogType[],
    });
  }

  static getState(): StateType {
    return Brain.history.states[this.history.index];
  }

  static setState(state: StateType) {
    const states = [state].concat(
      this.history.states.slice(this.history.index)
    );
    this.updateHistory({
      index: 0,
      states,
    });
    if (
      (!this.autoreplyRef.current || this.autoreplyRef.current!.checked) &&
      state.chess.turn() === (state.orientationIsWhite ? "b" : "w")
    ) {
      setTimeout(() => this.reply(states), REPLY_DELAY_MS);
    }
  }

  static reply(states: StateType[]) {
    const state = states[0];
    this._getWeighted(state).then((san) => {
      if (!san) return;
      const chess = Brain.getChess(state.chess);
      chess.move(san);
      const log = {
        chess: state.chess,
        san,
      };
      const logs = state.logs.concat(log);
      this.updateHistory({
        index: 0,
        states: [{ ...state, chess, logs }].concat(states),
      });
    });
  }

  static startOver() {
    const original = this.history.states[this.history.states.length - 1];
    this.setState(original);
  }

  static newGame() {
    const state = this.getState();
    const chess = Brain.getChess();
    chess.reset();
    this.setState({
      chess,
      orientationIsWhite: !state.orientationIsWhite,
      logs: [],
    });
  }

  static undo() {
    if (this.history.index + 1 < this.history.states.length) {
      this.autoreplyRef.current!.checked = false;
      this.updateHistory({
        ...this.history,
        index: this.history.index + 1,
      });
    }
  }

  static redo() {
    if (this.history.index > 0) {
      this.updateHistory({
        ...this.history,
        index: this.history.index - 1,
      });
    }
  }

  static _playMove(san: string) {
    const state = this.getState();
    const chess = Brain.getChess(state.chess);
    chess.move(san);
    const log = {
      chess: state.chess,
      san,
    };
    const logs = state.logs.concat(log);
    this.setState({ ...state, chess, logs });
  }

  static _getWeighted(state: StateType) {
    return lichess(state.chess).then((moves) => {
      const weights = moves.map((move: LiMove) => Math.pow(move.total, 1.5));
      var choice = Math.random() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < weights.length; i++) {
        choice -= weights[i];
        if (choice <= 0) return moves[i].san;
      }
    });
  }

  static playWeighted() {
    this._getWeighted(this.getState()).then(
      (san) => san && this._playMove(san)
    );
  }

  static playBest() {
    const state = this.getState();
    if (state.chess.turn() === (state.orientationIsWhite ? "w" : "b")) {
      const novelty = this.getNovelty();
      if (novelty !== null) {
        return this._playMove(novelty);
      }
    }
    lichess(this.getState().chess)
      .then((moves) => moves.sort((a, b) => b.score - a.score))
      .then((moves) => moves[0]?.san)
      .then((san) => san && this._playMove(san));
  }

  static getNovelty(): string | null {
    return StorageW.get(this.getState().chess.fen());
  }

  static clearNovelty() {
    StorageW.set(this.getState().chess.fen(), null);
  }

  static memorizeWithQuizlet() {
    alert("TODO");
  }

  static findMistakes() {
    alert("TODO");
  }

  static playVs() {
    alert("TODO");
  }

  static help() {
    alert("TODO");
  }

  // board
  static moveFromTo(from: string, to: string, shouldSaveNovelty: boolean) {
    const state = this.getState();
    const chess = Brain.getChess(state.chess);
    const move = chess.move({ from: from as Square, to: to as Square });
    if (move !== null) {
      if (shouldSaveNovelty) StorageW.set(state.chess.fen(), move.san);
      const log = {
        chess: state.chess,
        san: move.san,
      };
      const logs = state.logs.concat(log);
      this.setState({ ...state, chess, logs });
      return true;
    } else {
      return false;
    }
  }
}
