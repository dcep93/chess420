import React, { useState } from "react";
import BrainC, { StateType, View } from "./BrainC";
import settings from "./Settings";
import css from "./index.module.css";
import { DoOnce } from "./utils";

import "bootstrap/dist/css/bootstrap.min.css";
import Board from "./Board";
import Controls from "./Controls";
import Help from "./Help";
import Log from "./Log";
import Summary from "./Summary";

export default function App() {
  const pathParts = window.location.pathname.replace(/\/$/, "").split("/");
  switch (pathParts[1]) {
    case "lichess":
      if (pathParts[3] === "mistakes") {
        BrainC.view = View.lichess_mistakes;
      } else if (pathParts.length > 3) {
        alert("invalid path");
        return null;
      } else {
        BrainC.view = View.lichess;
      }
      const username = pathParts[2];
      if (username === "") {
        alert("invalid path");
        return null;
      }
      BrainC.lichessUsername = username;
      break;
    case "quizlet":
      BrainC.view = View.quizlet;
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
  BrainC.autoreplyRef = React.useRef<HTMLInputElement>(null);
  [BrainC.history, BrainC.updateHistory] = useState({
    index: 0,
    states: [] as StateType[],
  });
  [BrainC.showHelp, BrainC.updateShowHelp] = useState(false);
  const [isShift, updateIsShift] = useState(false);
  DoOnce("Main.brain", () => {
    document.addEventListener("keydown", (e) => {
      (
        ({
          ArrowUp: BrainC.playBest,
          ArrowDown: BrainC.newGame,
          Enter: BrainC.startOver,
          ArrowLeft: BrainC.undo,
          ArrowRight: BrainC.redo,
          KeyW: BrainC.playWeighted,
          KeyH: BrainC.help,
          KeyA: () =>
            (BrainC.autoreplyRef.current!.checked =
              !BrainC.autoreplyRef.current!.checked),
          Escape: BrainC.home,
        })[e.code] || (() => e.shiftKey && updateIsShift(true))
      )();
    });

    document.addEventListener(
      "keyup",
      (e) => e.shiftKey && updateIsShift(false)
    );

    BrainC.setInitialState();
  });
  const fen = BrainC.getState()?.fen;
  if (!fen) return null;
  return <SubMain isShift={isShift} fen={fen} />;
}

function SubMain(props: { isShift: boolean; fen: string }) {
  if (settings.SHOULD_UPDATE_HASH && !BrainC.getState().traverse)
    window.location.hash = BrainC.hash(props.fen);
  return (
    // TODO pretty
    <div
      className={css.responsiveFlexDirection}
      style={{
        minHeight: "100vH",
        display: "flex",
        backgroundColor: "#212529",
        color: "#f8f9fa",
      }}
      data-bs-theme="dark"
    >
      {BrainC.showHelp ? (
        <Help />
      ) : (
        <>
          <div
            className={css.responsiveMinWidth}
            style={{
              minWidth: settings.CHESSBOARD_WIDTH,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ opacity: 0.75 }}>
              <div
                style={{
                  margin: "auto",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                  }}
                >
                  <div
                    style={{
                      marginTop: "100%",
                    }}
                  ></div>
                  <div
                    style={{
                      position: "absolute",
                      height: "100%",
                      width: "100%",
                      display: "flex",
                    }}
                  >
                    <Board isShift={props.isShift} />
                  </div>
                </div>
              </div>
            </div>
            <div
              style={{
                display: "flex",
              }}
            >
              <div
                style={{
                  flexGrow: 1,
                  width: 0,
                  margin: "1em",
                  overflow: "scroll",
                }}
              >
                <Summary />
              </div>
            </div>
          </div>
          <div
            className={css.responsiveMaxHeight}
            style={{
              flexGrow: "1",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Controls />
            <div style={{ flexGrow: 1, display: "contents" }}>
              <div style={{ overflow: "scroll" }}>
                <Log />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
