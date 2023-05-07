import React from "react";

export default class Brain {
  autoreply = React.createRef<HTMLInputElement>();
  hasNoNovelty = React.createRef<HTMLButtonElement>();
  initialState = null;
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
}
