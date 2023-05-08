import React from "react";

export type ChessType = any;

export default class Brain {
  autoreply = React.createRef<HTMLInputElement>();
  hasNoNovelty = React.createRef<HTMLButtonElement>();
  initialState = null;
  chess: ChessType;
  updateChess: (chess: ChessType) => void;

  constructor(chess: ChessType, updateChess: (chess: ChessType) => void) {
    this.chess = chess;
    this.updateChess = updateChess;
  }

  // controls
  startOver() {}
  newGame() {}
  differentWeightedMove() {}
  undo() {}
  redo() {}
  playWeighted() {}
  playBest() {}
  clearNovelty() {}
  memorizeWithQuizlet() {}
  findMistakes() {}
  help() {}

  // board
  moveFromTo(from: string, to: string) {
    const copy = { ...this.chess };
    const move = copy.move({ from, to });
    if (move !== null) {
      this.updateChess(copy);
      return true;
    } else {
      return false;
    }
  }
}
