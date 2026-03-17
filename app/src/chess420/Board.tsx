import { useEffect, useRef, useState } from "react";

import { Chessboard } from "react-chessboard";
import Brain from "./Brain";
import lichessF from "./Lichess";
import settings from "./Settings";

export default function Board() {
  return (
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
            <SubBoard />
          </div>
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
      setTimeout(() => updateFen(state.fen), settings.REPLY_DELAY_MS);
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
  }, [state.fen, state.startingFen, state.logs.length, state.orientationIsWhite]);
  if (!fen) return null;
  return (
    <div
      style={{
        border: `1em ${getBorderColor(total, winOdds)} solid`,
        width: "100%",
      }}
    >
      <Chessboard
        key={key}
        options={{
          showNotation: false,
          boardOrientation: state.orientationIsWhite ? "white" : "black",
          position: fen,
          squareStyles: {
            [prevClicked || ""]: {
              background: "rgba(255, 255, 0)",
            },
          },
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
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
  if (Brain.isTraversing && winOdds !== null) {
    if (winOdds > 0.875) return "pink";
    if (winOdds > 0.75) return "gold";
  }
  return total <= settings.SCORE_FLUKE_DISCOUNT
    ? "red"
    : total <= settings.UNCOMMON_THRESHOLD
    ? "#aaaaaa"
    : "black";
}
