import React from "react";

import Chess, { ChessInstance, Square } from "chess.js";
import lichess, { Move } from "./Lichess";
import { LogType } from "./Log";
import score from "./Score";
import StorageW from "./StorageW";

type StateType = {
  chess: ChessInstance;
  orientationIsWhite: boolean;
  logs: LogType[];
};

type History = {
  index: number;
  states: StateType[];
  different: string | null;
};

export default class Brain {
  autoreply = React.createRef<HTMLInputElement>();
  history: History;
  updateHistory: (history: History) => void;
  static getChess(): ChessInstance {
    // @ts-ignore
    return new Chess();
  }

  constructor(history: History, updateHistory: (history: History) => void) {
    this.history = history;
    this.updateHistory = updateHistory;

    if (this.history.index === 0) {
      if (this.history.different !== null) {
        this.playWeighted(this.history.different);
      } else if (this.autoreply.current!.checked && !this._isMyTurn()) {
        this.playWeighted(null);
      }
    }
  }

  _isMyTurn(): boolean {
    const state = this.getState();
    return state.chess.turn() === (state.orientationIsWhite ? "w" : "b");
  }

  getState(): StateType {
    return this.history.states[this.history.index];
  }

  setState(state: StateType) {
    this.updateHistory({
      index: 0,
      states: [state].concat(this.history.states.slice(this.history.index)),
      different: null,
    });
  }

  startOver() {
    const original = this.history.states[this.history.states.length - 1];
    this.setState(original);
  }

  newGame() {
    const state = this.getState();
    const chess = { ...state.chess };
    chess.reset();
    this.setState({
      chess,
      orientationIsWhite: !state.orientationIsWhite,
      logs: [],
    });
  }

  undo() {
    if (this.history.index - 1 < this.history.states.length) {
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
    const chess = { ...state.chess };
    const move = chess.move(san);
    const log = { chess: state.chess, san: move!.san };
    const logs = state.logs.concat(log);
    this.setState({ ...state, chess, logs });
  }

  _getLichess() {
    return lichess(this.getState().chess);
  }

  differentWeightedMove() {
    const logs = this.getState().logs;
    const san = logs[logs.length - 1]?.san;
    if (san !== undefined) {
      this.updateHistory({
        ...this.history,
        different: san,
      });
    }
  }

  playWeighted(different: string | null) {
    this._getLichess().then((moves) => {
      const weights = moves
        .filter((move: Move) => move.san !== different)
        .map((move: Move) => Math.pow(move.total, 1.5));
      var choice = Math.random() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < weights.length; i++) {
        choice -= weights[i];
        if (choice <= 0) return this._playMove(moves[i].san);
      }
      if (different !== null) this._playMove(different);
    });
  }

  playBest() {
    if (this._isMyTurn()) {
      const novelty = this.getNovelty();
      if (novelty !== null) {
        return this._playMove(novelty);
      }
    }
    this._getLichess()
      .then((moves) =>
        moves
          .map((move: Move) => ({
            move,
            score: score(this.getState().chess, move),
          }))
          .sort((a, b) => b.score - a.score)
      )
      .then((moves) => moves[0].move.san)
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
    const chess = { ...state.chess };
    const move = chess.move({ from: from as Square, to: to as Square });
    if (move !== null) {
      if (shouldSaveNovelty) StorageW.set(state.chess.fen(), move);
      const log = { chess, san: move.san };
      const logs = state.logs.concat(log);
      this.setState({ ...state, chess, logs });
      return true;
    } else {
      return false;
    }
  }
}
