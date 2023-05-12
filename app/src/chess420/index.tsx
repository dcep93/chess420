import { useEffect, useState } from "react";
import Board from "./Board";
import Brain from "./Brain";
import Controls from "./Controls";
import Log, { LogType } from "./Log";
import Summary from "./Summary";
import css from "./index.module.css";

export default function Main() {
  const state: { [k: string]: boolean } = {};
  const chess = Brain.getChess();
  // TODO set up initial
  const [history, updateHistory] = useState({
    index: 0,
    states: [
      {
        chess,
        orientationIsWhite: true,
        logs: [] as LogType[],
      },
    ],
  });
  const brain = new Brain(history, updateHistory);
  // TODO update hash
  const [isShift, updateIsShift] = useState(false);
  useEffect(() => {
    if (state.initialized) return;
    state.initialized = true;
    document.addEventListener("keydown", (e) => {
      const brain = Brain.brain;
      (
        ({
          ArrowUp: brain.playBest.bind(brain),
          ArrowDown: brain.newGame.bind(brain),
          Enter: brain.startOver.bind(brain),
          ArrowLeft: brain.undo.bind(brain),
          ArrowRight: brain.redo.bind(brain),
          KewW: brain.playWeighted.bind(brain),
          KeyM: brain.findMistakes.bind(brain),
          KeyH: brain.help.bind(brain),
          KeyQ: brain.memorizeWithQuizlet.bind(brain),
          KeyA: () =>
            (brain.autoreplyRef.current!.checked =
              !brain.autoreplyRef.current!.checked),
        })[e.code] || (() => e.shiftKey && updateIsShift(true))
      )();
    });

    document.addEventListener(
      "keyup",
      (e) => e.shiftKey && updateIsShift(false)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    // TODO pretty
    <div
      className={css.responsiveFlexDirection}
      style={{ minHeight: "100vH", display: "flex" }}
    >
      <div
        style={{
          minWidth: "18em",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Board brain={brain} isShift={isShift} />
        <Summary brain={brain} />
      </div>
      <div
        style={{
          flexGrow: "1",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Controls brain={brain} />
        <div style={{ flexGrow: 1, display: "grid" }}>
          <Log brain={brain} />
        </div>
      </div>
    </div>
  );
}
