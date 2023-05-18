import React, { useEffect, useState } from "react";
import Board from "./Board";
import Brain, { StateType, View } from "./Brain";
import Controls from "./Controls";
import Log from "./Log";
import Summary from "./Summary";
import css from "./index.module.css";

export default function App() {
  const pathParts = window.location.pathname.replace(/\/$/, "").split("/");
  switch (pathParts[1]) {
    case "lichess":
      if (pathParts[3] === "mistakes") {
        Brain.view = View.lichess_mistakes;
      } else if (pathParts.length > 3) {
        alert("invalid path");
        return null;
      } else {
        Brain.view = View.lichess;
      }
      const username = pathParts[2];
      if (username === "") {
        alert("invalid path");
        return null;
      }
      Brain.lichessUsername = username;
      break;
    case "quizlet":
      Brain.view = View.quizlet;
      if (pathParts.length > 2) {
        alert("invalid path");
        return null;
      }
      break;
    case undefined:
      if (pathParts.length > 1) {
        alert("invalid path");
        return null;
      }
      break;
    default:
      alert("invalid path");
      return null;
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
  DoOnce("Main.initBrain", () => {
    document.addEventListener("keydown", (e) => {
      (
        ({
          ArrowUp: Brain.playBest,
          ArrowDown: Brain.newGame,
          Enter: Brain.startOver,
          ArrowLeft: Brain.undo,
          ArrowRight: Brain.redo,
          KeyW: Brain.playWeighted,
          KeyH: Brain.help,
          KeyA: () =>
            (Brain.autoreplyRef.current!.checked =
              !Brain.autoreplyRef.current!.checked),
          Escape: Brain.escape,
        })[e.code] || (() => e.shiftKey && updateIsShift(true))
      )();
    });

    document.addEventListener(
      "keyup",
      (e) => e.shiftKey && updateIsShift(false)
    );

    Brain.setInitialState();
  });
  const fen = Brain.getState()?.fen;
  if (!fen) return null;
  return <SubMain isShift={isShift} fen={fen} />;
}

function SubMain(props: { isShift: boolean; fen: string }) {
  window.location.hash = Brain.hash(props.fen);
  return (
    // TODO c pretty
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

const done: { [k: string]: boolean } = {};

function DoOnce(key: string, f: () => void) {
  useEffect(() => {
    if (done[key]) return;
    done[key] = true;
    f();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
