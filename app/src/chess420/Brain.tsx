import React from "react";

import Chess, { ChessInstance, Square } from "chess.js";
import lichess, { LiMove } from "./Lichess";
import { LogType } from "./Log";
import StorageW from "./StorageW";

type StateType = {
  chess: ChessInstance;
  orientationIsWhite: boolean;
  logs: LogType[];
};

type History = {
  index: number;
  states: StateType[];
};

export default class Brain {
  autoreply = React.useRef<HTMLInputElement>(null);
  history: History;
  updateHistory: (history: History) => void;

  static getChess(prevChess: ChessInstance | null = null): ChessInstance {
    // @ts-ignore
    const chess = new Chess();
    if (prevChess !== null) chess.load(prevChess.fen());
    return chess;
  }

  constructor(history: History, updateHistory: (history: History) => void) {
    this.history = history;
    this.updateHistory = updateHistory;
  }

  _isMyTurn(): boolean {
    const state = this.getState();
    return state.chess.turn() === (state.orientationIsWhite ? "w" : "b");
  }

  getState(): StateType {
    return this.history.states[this.history.index];
  }

  setState(state: StateType) {
    const states = [state].concat(
      this.history.states.slice(this.history.index)
    );
    this.updateHistory({
      index: 0,
      states,
    });
    if (
      this.autoreply.current?.checked &&
      state.chess.turn() === (state.orientationIsWhite ? "b" : "w")
    ) {
      this._getWeighted(state).then((san) => {
        if (!san) return;
        const chess = Brain.getChess(state.chess);
        chess.move(san);
        const log = { chess: state.chess, san };
        const logs = state.logs.concat(log);
        this.updateHistory({
          index: 0,
          states: [{ ...state, chess, logs }].concat(states),
        });
      });
    }
  }

  startOver() {
    const original = this.history.states[this.history.states.length - 1];
    this.setState(original);
  }

  newGame() {
    const state = this.getState();
    const chess = Brain.getChess(state.chess);
    chess.reset();
    this.setState({
      chess,
      orientationIsWhite: !state.orientationIsWhite,
      logs: [],
    });
  }

  undo() {
    if (this.history.index + 1 < this.history.states.length) {
      this.autoreply.current!.checked = false;
      this.updateHistory({
        ...this.history,
        index: this.history.index + 1,
      });
    }
  }

  redo() {
    if (this.history.index > 0) {
      this.updateHistory({
        ...this.history,
        index: this.history.index - 1,
      });
    }
  }

  _playMove(san: string) {
    const state = this.getState();
    const chess = Brain.getChess(state.chess);
    chess.move(san);
    const log = { chess: state.chess, san };
    const logs = state.logs.concat(log);
    this.setState({ ...state, chess, logs });
  }

  _getWeighted(state: StateType) {
    return lichess(state.chess).then((moves) => {
      const weights = moves.map((move: LiMove) => Math.pow(move.total, 1.5));
      var choice = Math.random() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < weights.length; i++) {
        choice -= weights[i];
        if (choice <= 0) return moves[i].san;
      }
    });
  }

  playWeighted() {
    this._getWeighted(this.getState()).then(
      (san) => san && this._playMove(san)
    );
  }

  playBest() {
    if (this._isMyTurn()) {
      const novelty = this.getNovelty();
      if (novelty !== null) {
        return this._playMove(novelty);
      }
    }
    lichess(this.getState().chess)
      .then((moves) => moves.sort((a, b) => b.score - a.score))
      .then((moves) => moves[0].san)
      .then((san) => this._playMove(san));
  }

  getNovelty(): string | null {
    return StorageW.get(this.getState().chess.fen());
  }

  clearNovelty() {
    StorageW.set(this.getState().chess.fen(), null);
  }

  memorizeWithQuizlet() {
    alert("TODO");
  }

  findMistakes() {
    alert("TODO");
  }

  help() {
    alert("TODO");
  }

  // board
  moveFromTo(from: string, to: string, shouldSaveNovelty: boolean) {
    const state = this.getState();
    const chess = Brain.getChess(state.chess);
    const move = chess.move({ from: from as Square, to: to as Square });
    if (move !== null) {
      if (shouldSaveNovelty) StorageW.set(state.chess.fen(), move.san);
      const log = { chess: state.chess, san: move.san };
      const logs = state.logs.concat(log);
      this.setState({ ...state, chess, logs });
      return true;
    } else {
      return false;
    }
  }
}
