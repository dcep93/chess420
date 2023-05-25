import Chess, { ChessInstance, Square } from "chess.js";
import React from "react";
import lichessF, { LiMove } from "./LichessF";
import { LogType } from "./Log";
import settings from "./Settings";
import StorageW from "./StorageW";
import traverseF, { TraverseType, startTraverseF } from "./TraverseF";

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

export default class BrainC {
  static autoreplyRef: React.RefObject<HTMLInputElement>;

  static history: History;
  static updateHistory: (history: History) => void;
  static showHelp: boolean;
  static updateShowHelp: (showHelp: boolean) => void;

  static timeout: NodeJS.Timeout;

  //

  static view?: View;
  static lichessUsername?: string;

  //

  static getFen(start?: string, san?: string): string {
    const chess = BrainC.getChess(start);
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
      BrainC.getState().orientationIsWhite ? "w" : "b",
      fen.replaceAll(" ", "_"),
    ].join("//");
  }

  static getInitialState(): StateType {
    var fen = BrainC.getFen();
    var orientationIsWhite = true;
    const hash = window.location.hash.split("#")[1];
    if (hash !== undefined) {
      const parts = hash.split("//");
      if (parts.length === 2) {
        orientationIsWhite = parts[0] === "w";
        fen = BrainC.getFen(parts[1].replaceAll("_", " "));
      }
    }
    return {
      fen,
      orientationIsWhite,
      logs: [] as LogType[],
    };
  }

  static setInitialState() {
    const startingState = BrainC.getInitialState();
    switch (BrainC.view) {
      case View.lichess_mistakes:
      case View.quizlet:
        startTraverseF(startingState);
        return;
    }
    BrainC.setState(startingState);
  }

  //

  static getState(): StateType {
    return BrainC.history.states[BrainC.history.index];
  }

  static genState<T extends StateType>(startingState: T, san: string): T {
    return {
      ...startingState,
      fen: BrainC.getFen(startingState.fen, san),
      logs: startingState.logs.concat({
        fen: startingState.fen,
        san,
      }),
    };
  }

  static setState(state: StateType) {
    clearTimeout(BrainC.timeout);
    const states = [state].concat(
      BrainC.history.states.slice(BrainC.history.index)
    );
    BrainC.updateHistory({
      index: 0,
      states,
    });
    BrainC.maybeReply(state);
  }

  static isMyTurn(fen: string) {
    return (
      BrainC.getChess(fen).turn() ===
      (BrainC.getState().orientationIsWhite ? "w" : "b")
    );
  }

  //

  static maybeReply(state: StateType) {
    if (BrainC.view === View.lichess_mistakes || BrainC.view === View.quizlet)
      return;
    if (
      (!BrainC.autoreplyRef.current || BrainC.autoreplyRef.current!.checked) &&
      BrainC.getState() &&
      !BrainC.isMyTurn(state.fen)
    ) {
      BrainC.timeout = setTimeout(BrainC.playWeighted, settings.REPLY_DELAY_MS);
    }
  }

  //

  static startOver() {
    const original = BrainC.history.states[BrainC.history.states.length - 1];
    BrainC.setState(original);
  }

  static newGame() {
    BrainC.setState({
      fen: BrainC.getFen(),
      orientationIsWhite: !BrainC.getState().orientationIsWhite,
      logs: [],
    });
  }

  static undo() {
    if (BrainC.history.index + 1 >= BrainC.history.states.length) {
      return alert("no undo available");
    }
    if (BrainC.autoreplyRef.current)
      BrainC.autoreplyRef.current!.checked = false;
    BrainC.updateHistory({
      ...BrainC.history,
      index: BrainC.history.index + 1,
    });
  }

  static redo() {
    if (BrainC.history.index <= 0) {
      return alert("no redo available");
    }
    BrainC.updateHistory({
      ...BrainC.history,
      index: BrainC.history.index - 1,
    });
  }

  //

  static playMove(san?: string) {
    if (!san) {
      return alert("no move to play");
    }
    BrainC.setState(BrainC.genState(BrainC.getState(), san));
  }

  static playWeighted() {
    lichessF(BrainC.getState().fen, { prepareNext: true })
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
      .then((san) => BrainC.playMove(san));
  }

  static playBest() {
    const state = BrainC.getState();
    if (BrainC.isMyTurn(state.fen)) {
      const novelty = BrainC.getNovelty();
      if (novelty !== null) {
        return BrainC.playMove(novelty);
      }
    }
    lichessF(BrainC.getState().fen, { prepareNext: true })
      .then((moves) => moves.sort((a, b) => b.score - a.score))
      .then((moves) => moves[0]?.san)
      .then((san) => BrainC.playMove(san));
  }

  static getNovelty(state?: StateType): string | null {
    if (!state) state = BrainC.getState();
    return StorageW.get(BrainC.getState().fen);
  }

  static clearNovelty() {
    StorageW.set(BrainC.getState().fen, null);
  }

  //

  static memorizeWithQuizlet() {
    window.location.href = `/quizlet#${BrainC.hash(BrainC.getState().fen)}`;
  }

  static findMistakes(username: string) {
    if (!username) return alert("no username provided");

    window.location.href = `/lichess/${username}/mistakes#${BrainC.hash(
      BrainC.getState().fen
    )}`;
  }

  static playVs(username: string) {
    if (!username) return alert("no username provided");

    window.location.href = `/lichess/${username}#${BrainC.hash(
      BrainC.getState().fen
    )}`;
  }

  static home() {
    setTimeout(() => {
      window.location.assign("/#");
      if (BrainC.view === undefined) window.location.reload();
    });
  }

  //

  static help() {
    BrainC.updateShowHelp(!BrainC.showHelp);
  }

  // board
  static moveFromTo(from: string, to: string, shouldSaveNovelty: boolean) {
    const state = BrainC.getState();
    const chess = BrainC.getChess(state.fen);
    const move = chess.move({ from: from as Square, to: to as Square });
    if (move !== null) {
      if (shouldSaveNovelty) StorageW.set(state.fen, move.san);
      if (state.traverse?.states?.slice(-1)[0].fen === state.fen) {
        traverseF(state.traverse, move.san);
      } else {
        BrainC.setState(BrainC.genState(BrainC.getState(), move.san));
      }
      return true;
    } else {
      return false;
    }
  }
}
