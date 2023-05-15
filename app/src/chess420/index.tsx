import React, { useEffect, useState } from "react";
import Board from "./Board";
import Brain, { StateType } from "./Brain";
import Controls from "./Controls";
import Log from "./Log";
import Summary from "./Summary";
import css from "./index.module.css";

export default function App() {
  const pathParts = window.location.pathname.split("/");
  if (pathParts[1] === "quizlet") {
    console.log("TODO", "quizlet");
  } else if (pathParts[1] === "lichess") {
    const username = pathParts[2];
    if (pathParts[2] === "mistakes") {
      console.log("TODO", "mistakes", username);
    } else {
      console.log("TODO", "play vs", username);
    }
  } else if (pathParts.length > 1) {
    alert("invalid path");
    return null;
  } else {
    console.log("main");
  }
  return <Main />;
}

function Main() {
  Brain.autoreplyRef = React.useRef<HTMLInputElement>(null);
  [Brain.history, Brain.updateHistory] = useState({
    index: 0,
    states: [] as StateType[],
  });
  const [isShift, updateIsShift] = useState(false);
  const state: { [k: string]: boolean } = {};
  useEffect(() => {
    if (state.initialized) return;
    state.initialized = true;
    document.addEventListener("keydown", (e) => {
      (
        ({
          ArrowUp: Brain.playBest,
          ArrowDown: Brain.newGame,
          Enter: Brain.startOver,
          ArrowLeft: Brain.undo,
          ArrowRight: Brain.redo,
          KewW: Brain.playWeighted,
          KeyH: Brain.help,
          KeyA: () =>
            (Brain.autoreplyRef.current!.checked =
              !Brain.autoreplyRef.current!.checked),
        })[e.code] || (() => e.shiftKey && updateIsShift(true))
      )();
    });

    document.addEventListener(
      "keyup",
      (e) => e.shiftKey && updateIsShift(false)
    );

    Brain.setInitialState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!Brain.getState()) return null;
  return <SubMain isShift={isShift} />;
}

function SubMain(props: { isShift: boolean }) {
  window.location.hash = Brain.hash(Brain.getState().chess);
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
        <Board isShift={props.isShift} />
        <Summary />
      </div>
      <div
        style={{
          flexGrow: "1",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Controls />
        <div style={{ flexGrow: 1, display: "grid" }}>
          <Log />
        </div>
      </div>
    </div>
  );
}
