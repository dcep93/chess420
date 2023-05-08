import React from "react";

import { ChessInstance, Square } from "chess.js";

export default class Brain {
  autoreply = React.createRef<HTMLInputElement>();
  hasNoNovelty = React.createRef<HTMLButtonElement>();
  startOverState: { chess: ChessInstance; orientationIsWhite: boolean };
  props: {
    chess: ChessInstance;
    updateChess: (chess: ChessInstance) => void;
    orientationIsWhite: boolean;
    updateOrientationIsWhite: (orientationIsWhite: boolean) => void;
  };

  constructor(
    startOverState: { chess: ChessInstance; orientationIsWhite: boolean },
    chess: ChessInstance,
    updateChess: (chess: ChessInstance) => void,
    orientationIsWhite: boolean,
    updateOrientationIsWhite: (orientationIsWhite: boolean) => void
  ) {
    this.startOverState = startOverState;
    this.props = {
      chess,
      updateChess,
      orientationIsWhite,
      updateOrientationIsWhite,
    };
  }

  // controls
  startOver() {
    const copy = { ...this.props.chess };
    copy.load(this.startOverState.chess.fen());
    this.props.updateChess(copy);
    this.props.updateOrientationIsWhite(this.startOverState.orientationIsWhite);
  }
  newGame() {
    const copy = { ...this.props.chess };
    copy.reset();
    this.props.updateChess(copy);
    this.props.updateOrientationIsWhite(!this.props.orientationIsWhite);
  }
  differentWeightedMove() {}
  undo() {
    console.log(this.props.chess.history());
  }
  redo() {}
  playWeighted() {}
  playBest() {}
  clearNovelty() {}
  memorizeWithQuizlet() {}
  findMistakes() {}
  help() {}

  // board
  moveFromTo(from: string, to: string) {
    const copy = { ...this.props.chess };
    const move = copy.move({ from: from as Square, to: to as Square });
    if (move !== null) {
      this.props.updateChess(copy);
      return true;
    } else {
      return false;
    }
  }
}
