import React from "react";

import Chess from "chess.js";

export default class Brain {
  autoreply = React.createRef<HTMLInputElement>();
  hasNoNovelty = React.createRef<HTMLButtonElement>();
  initialState = null;
  position = "start";
  chess = new Chess();

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
  onPieceDrop(s: any, target: any) {
    return true;
  }
}
