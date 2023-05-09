import { useState } from "react";
import Board from "./Board";
import Brain from "./Brain";
import Controls from "./Controls";
import Log, { LogType } from "./Log";
import Summary from "./Summary";
import css from "./index.module.css";

export default function Main() {
  const [history, updateHistory] = useState({
    different: null as string | null,
    index: 0,
    states: [
      {
        chess: Brain.getChess(),
        orientationIsWhite: true,
        logs: [] as LogType[],
      },
    ],
  });
  const brain = new Brain(history, updateHistory);
  const [isShift, updateIsShift] = useState(false);
  return (
    <div
      className={css.responsiveFlexDirection}
      style={{ minHeight: "100vH", display: "flex" }}
      onKeyDown={(e) => e.shiftKey && updateIsShift(true)}
      onKeyUp={(e) => e.shiftKey && updateIsShift(false)}
    >
      <div style={{ minWidth: "20em" }}>
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
