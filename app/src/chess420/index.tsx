import { useState } from "react";
import Brain, { type StateType, View } from "./Brain";
import settings from "./Settings";
import { DoOnce } from "./utils";

import "bootstrap/dist/css/bootstrap.min.css";
import React from "react";
import Board from "./Board";
import Controls from "./Controls";
import Help from "./Help";
import Log from "./Log";
import { assignBrainRoute } from "./Routing";
import Summary from "./Summary";
import "./index.css";
import recorded_sha from "./recorded_sha";

export function AssignBrainIdkWhyIHaveToDoThis(): boolean {
  return assignBrainRoute(window.location.pathname);
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
    document.addEventListener("keydown", (e) => {
      const shortcut = {
        ArrowUp: Brain.playBest,
        ArrowDown: Brain.newGame,
        ArrowLeft: Brain.undo,
        ArrowRight: Brain.redo,
        Enter: Brain.startOver,
        KeyW: Brain.playWeighted,
        KeyA: Brain.toggleAutoreply,
        KeyH: Brain.help,
        Escape: Brain.home,
      }[e.code];

      if (!shortcut) return;

      if (e.code.startsWith("Arrow")) {
        e.preventDefault();
      }

      Promise.resolve().then(() => shortcut());
    });

    Brain.setInitialState();
  });
  if (Brain.showHelp) return <Help />;
  const fen = Brain.getState()?.fen;
  if (!fen) return null;
  return <SubMain fen={fen} />;
}

function SubMain(props: { fen: string }) {
  if (
    settings.SHOULD_UPDATE_HASH &&
    Brain.view !== View.lichess_id &&
    Brain.view !== View.lichess_latest &&
    Brain.view !== View.lichess_mistakes &&
    Brain.view !== View.traverse &&
    (Brain.view !== View.endgame || Brain.hasSelectedEndgame())
  )
    window.location.hash = Brain.hash(props.fen);
  return (
    <div className="chess420-app" data-bs-theme="dark">
      <div className="chess420-shell">
        <section className="chess420-board-column">
          <div className="chess420-board-card">
            <Board />
          </div>
          <div className="chess420-summary-card">
            <Summary />
          </div>
        </section>
        <section className="chess420-info-column">
          <div className="chess420-controls-card">
            <Controls />
          </div>
          <div className="chess420-log-card">
            <Log />
          </div>
        </section>
      </div>
    </div>
  );
}
