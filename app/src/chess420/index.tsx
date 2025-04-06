import { useState } from "react";
import Brain, { StateType, View } from "./Brain";
import settings from "./Settings";
import { DoOnce } from "./utils";

import "bootstrap/dist/css/bootstrap.min.css";
import React from "react";
import Board from "./Board";
import Controls from "./Controls";
import Help from "./Help";
import Log from "./Log";
import Summary from "./Summary";
import "./index.module.css";
import recorded_sha from "./recorded_sha";

function AssignBrainIdkWhyIHaveToDoThis(): boolean {
  const pathParts = window.location.pathname.replace(/\/$/, "").split("/");
  switch (pathParts[1]) {
    case "lichess":
      if (pathParts[3] === "latest") {
        Brain.view = View.lichess_latest;
      } else if (pathParts[3] === "vs") {
        Brain.view = View.lichess_vs;
      } else if (pathParts[3] === "mistakes") {
        Brain.view = View.lichess_mistakes;
      } else if (pathParts.length > 3) {
        return false;
      } else {
        // username is game_id
        Brain.view = View.lichess_id;
      }
      const username = pathParts[2];
      if (username === "") {
        return false;
      }
      Brain.lichessUsername = username;
      break;
    case "speedrun":
      Brain.view = View.speedrun;
      if (pathParts.length > 2) {
        return false;
      }
      break;
    case "traverse":
      Brain.view = View.traverse;
      if (pathParts.length > 2) {
        return false;
      }
      break;
    case undefined:
      if (pathParts.length > 1) {
        return false;
      }
      break;
    default:
      return false;
  }
  return true;
}

export default function App() {
  // TODO router
  console.log(recorded_sha);
  if (!AssignBrainIdkWhyIHaveToDoThis()) {
    alert("invalid path");
    return null;
  }
  return <Main />;
}

function Main() {
  AssignBrainIdkWhyIHaveToDoThis();
  Brain.autoreplyRef = React.useRef<HTMLInputElement>(null);
  [Brain.history, Brain.updateHistory] = useState({
    index: 0,
    states: [] as StateType[],
  });
  [Brain.showHelp, Brain.updateShowHelp] = useState(false);
  [Brain.isTraversing, Brain.updateIsTraversing] = useState(false);
  [Brain.openings, Brain.updateOpenings] = useState<{
    [fen: string]: string;
  } | null>(null);
  DoOnce("Main.brain", () => {
    document.addEventListener("keydown", (e) =>
      Promise.resolve()
        .then(
          () =>
            ({
              ArrowUp: Brain.playBest,
              ArrowDown: Brain.newGame,
              ArrowLeft: Brain.undo,
              ArrowRight: Brain.redo,
              Enter: Brain.startOver,
              KeyW: Brain.playWeighted,
              KeyA: Brain.toggleAutoreply,
              KeyH: Brain.help,
              Escape: Brain.home,
            }[e.code])
        )
        .then((f) => f && f())
    );

    Brain.setInitialState();
  });
  if (Brain.showHelp) return <Help />;
  const fen = Brain.getState()?.fen;
  if (!fen) return null;
  return <SubMain fen={fen} />;
}

function SubMain(props: { fen: string }) {
  // TODO mobile friendly
  if (
    settings.SHOULD_UPDATE_HASH &&
    Brain.view !== View.lichess_id &&
    Brain.view !== View.lichess_latest &&
    Brain.view !== View.lichess_mistakes &&
    Brain.view !== View.traverse
  )
    window.location.hash = Brain.hash(props.fen);
  return (
    <div
      style={{
        minHeight: "100vH",
        minWidth: "100vW",
        backgroundColor: "#212529",
        color: "#f8f9fa",
      }}
      data-bs-theme="dark"
    >
      <div>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignContent: "stretch",
          }}
        >
          <div
            style={{
              minWidth: settings.CHESSBOARD_WIDTH,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Board />
            <Summary />
          </div>
          <div style={{ flexGrow: 1 }}>
            <div>
              <Controls />
            </div>
          </div>
        </div>
        <div>
          <Log />
        </div>
      </div>
    </div>
  );
}
