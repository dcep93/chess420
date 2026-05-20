import { useEffect, useRef, useState } from "react";

import { Chessboard } from "react-chessboard";
import Brain, { View } from "./Brain";
import lichessF from "./Lichess";
import settings from "./Settings";

export default function Board() {
  return (
    <div className="board-wrap">
      <div className="board-ratio-frame">
        <div className="board-ratio-spacer"></div>
        <div className="board-absolute-layer">
          <SubBoard />
        </div>
      </div>
    </div>
  );
}

const vars = { release: Date.now(), last: 0 };

function SubBoard() {
  const [prevClicked, updateClicked] = useState<string | null>(null);
  const [total, updateTotal] = useState(-1);
  const [winOdds, updateWinOdds] = useState<number | null>(null);
  const [fen, updateFen] = useState("");
  const [key, updateKey] = useState(0);
  const lastLogCount = useRef<number | null>(null);
  const state = Brain.getState();
  const now = Date.now();
  const isEndgame = Brain.view === View.endgame;
  const animationDurationInMs = isEndgame
    ? settings.ENDGAME_BOARD_ANIMATION_DURATION_MS
    : settings.BOARD_ANIMATION_DURATION_MS;
  const replyDelayMs = isEndgame
    ? settings.ENDGAME_REPLY_DELAY_MS
    : settings.REPLY_DELAY_MS;
  useEffect(() => {
    if (vars.last === now) return;
    vars.last = now;
    const isUndo =
      lastLogCount.current !== null &&
      state.logs.length < lastLogCount.current;
    lastLogCount.current = state.logs.length;
    const wasMyTurn =
      state.startingFen !== undefined &&
      Brain.isMyTurn(state.startingFen, state.orientationIsWhite);
    if (
      isUndo ||
      !state.startingFen ||
      state.startingFen === fen ||
      wasMyTurn
    ) {
      updateFen(state.fen);
    } else {
      updateFen(state.startingFen);
      updateKey((prevKey) => prevKey + 1);
      setTimeout(() => updateFen(state.fen), replyDelayMs);
    }
    if (isEndgame) {
      updateTotal(-1);
      updateWinOdds(null);
      return;
    }
    lichessF(state.fen)
      .then((moves) => {
        const total = moves
          .map((move) => move.total)
          .reduce((a, b) => a + b, 0);
        updateTotal(total);
        const totals = moves.reduce(
          (acc, move) => ({
            white: acc.white + move.white,
            black: acc.black + move.black,
          }),
          { white: 0, black: 0 }
        );
        const totalDecisive = totals.white + totals.black;
        if (totalDecisive === 0) {
          updateWinOdds(null);
        } else {
          updateWinOdds(
            state.orientationIsWhite
              ? totals.white / totalDecisive
              : totals.black / totalDecisive
          );
        }
      })
      .catch(() => {
        updateTotal(-1);
        updateWinOdds(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isEndgame,
    replyDelayMs,
    state.fen,
    state.startingFen,
    state.logs.length,
    state.orientationIsWhite,
  ]);
  if (!fen) return null;
  const position =
    Brain.view === View.endgame && !Brain.hasSelectedEndgame() ? {} : fen;
  const isPhaseTwo =
    isEndgame &&
    Brain.hasSelectedEndgame() &&
    Brain.shouldShowPhaseTwoBoardBorder(fen);
  const isPhaseOne = isEndgame && Brain.hasSelectedEndgame() && !isPhaseTwo;
  const borderColor = isPhaseTwo
    ? "var(--board-phase-two-border)"
    : getBorderColor(total, winOdds);
  const clearDragState = () => {
    setTimeout(() => updateKey((prevKey) => prevKey + 1));
  };
  return (
    <div
      className={[
        "board-shell",
        isPhaseOne ? "board-shell--phase-one" : "",
        isPhaseTwo ? "board-shell--phase-two" : "",
      ].filter(Boolean).join(" ")}
      style={{ borderColor }}
    >
      <Chessboard
        key={key}
        options={{
          showNotation: false,
          animationDurationInMs,
          boardOrientation: state.orientationIsWhite ? "white" : "black",
          position,
          squareStyles: {
            [prevClicked || ""]: {
              background: "rgba(255, 255, 0)",
            },
          },
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            clearDragState();
            if (!targetSquare) return false;
            updateClicked(null);
            return Brain.moveFromTo(sourceSquare, targetSquare);
          },
          onSquareClick: ({ square }) => {
            if (prevClicked === null) {
              updateClicked(square);
            } else if (prevClicked === square) {
              updateClicked(null);
            } else {
              if (Brain.moveFromTo(prevClicked, square)) {
                updateClicked(null);
              } else {
                updateClicked(square);
              }
            }
          },
        }}
      />
    </div>
  );
}

function getBorderColor(total: number, winOdds: number | null): string {
  if (Brain.view === View.endgame) return "#c99c6b";
  if (Brain.isTraversing && winOdds !== null) {
    if (winOdds > 0.875) return "#ff9fb0";
    if (winOdds > 0.75) return "#d8b38a";
  }
  return total <= settings.SCORE_FLUKE_DISCOUNT
    ? "#b98d63"
    : total <= settings.UNCOMMON_THRESHOLD
    ? "#8f7865"
    : "#c99c6b";
}
