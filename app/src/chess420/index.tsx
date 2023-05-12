import { useEffect, useState } from "react";
import Board from "./Board";
import Brain, { StateType } from "./Brain";
import Controls from "./Controls";
import Log from "./Log";
import Summary from "./Summary";
import css from "./index.module.css";

export default function Main() {
  const [history, updateHistory] = useState({
    index: 0,
    states: [] as StateType[],
  });
  const brain = new Brain(history, updateHistory);
  const [isShift, updateIsShift] = useState(false);
  const state: { [k: string]: boolean } = {};
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

    brain.setInitialState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!brain.getState()) return null;
  return <SubMain brain={brain} isShift={isShift} />;
}

function SubMain(props: { brain: Brain; isShift: boolean }) {
  window.location.hash = Brain.hash(props.brain.getState().chess);
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
        <Board brain={props.brain} isShift={props.isShift} />
        <Summary brain={props.brain} />
      </div>
      <div
        style={{
          flexGrow: "1",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Controls brain={props.brain} />
        <div style={{ flexGrow: 1, display: "grid" }}>
          <Log brain={props.brain} />
        </div>
      </div>
    </div>
  );
}
