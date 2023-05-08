import React from "react";

import { ChessInstance, Square } from "chess.js";
import { LogType } from "./Log";

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
  autoreply = React.createRef<HTMLInputElement>();
  hasNoNovelty = React.createRef<HTMLButtonElement>();
  history: History;
  updateHistory: (history: History) => void;

  constructor(history: History, updateHistory: (history: History) => void) {
    this.history = history;
    this.updateHistory = updateHistory;
  }

  getState(): StateType {
    return this.history.states[this.history.index];
  }

  setState(state: StateType) {
    this.updateHistory({
      index: 0,
      states: [state].concat(this.history.states.slice(this.history.index)),
    });
  }

  // controls
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

  differentWeightedMove() {}
  playWeighted() {}
  playBest() {}
  clearNovelty() {}
  memorizeWithQuizlet() {}
  findMistakes() {}
  help() {}

  // board
  moveFromTo(from: string, to: string) {
    const state = this.getState();
    const chess = { ...state.chess };
    const move = chess.move({ from: from as Square, to: to as Square });
    if (move !== null) {
      const log = { chess: state.chess, san: move.san };
      const logs = state.logs.concat(log);
      this.setState({ ...state, chess, logs });
      return true;
    } else {
      return false;
    }
  }
}
