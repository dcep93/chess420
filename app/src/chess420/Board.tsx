import { useEffect, useMemo, useRef, useState } from "react";

import { type Move, type Square } from "chess.js";
import { flushSync } from "react-dom";
import { Chessboard } from "react-chessboard";
import Brain, { View } from "./Brain";
import lichessF from "./Lichess";
import { type LogType } from "./Log";
import settings from "./Settings";

export default function Board() {
  return (
    <div className="board-ratio-frame">
      <div className="board-ratio-spacer"></div>
      <div className="board-absolute-layer">
        <SubBoard />
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
  const [instantFen, updateInstantFen] = useState<string | null>(null);
  const [boardKey, updateBoardKey] = useState(0);
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
    const isOptimisticMove =
      instantFen !== null && state.fen === instantFen;
    if (
      isUndo ||
      !state.startingFen ||
      state.startingFen === fen ||
      wasMyTurn ||
      isOptimisticMove
    ) {
      updateFen(state.fen);
    } else {
      updateFen(state.startingFen);
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
  useEffect(() => {
    if (!instantFen || state.fen !== instantFen) return;
    const frame = requestAnimationFrame(() => updateInstantFen(null));
    return () => cancelAnimationFrame(frame);
  }, [instantFen, state.fen]);
  useEffect(() => {
    updateClicked(null);
  }, [state.fen]);

  const legalTargets = useMemo(
    () => getLegalTargets(fen, prevClicked),
    [fen, prevClicked]
  );
  const lastMoveSquares = useMemo(
    () => getLastMoveSquares(fen, state.logs),
    [fen, state.logs]
  );
  const squareStyles = useMemo(
    () => getSquareStyles(prevClicked, legalTargets, lastMoveSquares),
    [prevClicked, legalTargets, lastMoveSquares]
  );
  const isSelectablePiece = (square: string | null) =>
    square ? canSelectPiece(fen, square) : false;
  const selectSquare = (square: string) => {
    updateClicked(isSelectablePiece(square) ? square : null);
  };
  const resetDragState = () => {
    requestAnimationFrame(() => updateBoardKey((key) => key + 1));
  };
  const moveFromTo = (
    sourceSquare: string,
    targetSquare: string,
    shouldSnap: boolean
  ) => {
    const nextFen = getMoveFen(fen, sourceSquare, targetSquare);
    if (!nextFen) return false;
    const updateOptimisticPosition = () => {
      updateClicked(null);
      if (shouldSnap) updateInstantFen(nextFen);
      updateFen(nextFen);
    };
    if (isEndgame && shouldSnap) {
      flushSync(updateOptimisticPosition);
    } else {
      updateOptimisticPosition();
    }
    const didMove = Brain.moveFromTo(sourceSquare, targetSquare);
    if (!didMove) {
      updateInstantFen(null);
      updateFen(Brain.getState().fen);
    }
    return didMove;
  };
  if (!fen) return null;
  const shouldSnapMove = instantFen === fen;
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
  return (
    <div
      className={[
        "board-shell",
        isPhaseOne ? "board-shell--phase-one" : "",
        isPhaseTwo ? "board-shell--phase-two" : "",
      ].filter(Boolean).join(" ")}
      onPointerUpCapture={blurBoardFocus}
      style={{ borderColor }}
    >
      <Chessboard
        key={boardKey}
        options={{
          showNotation: false,
          animationDurationInMs: shouldSnapMove ? 0 : animationDurationInMs,
          showAnimations: !shouldSnapMove,
          boardOrientation: state.orientationIsWhite ? "white" : "black",
          position,
          squareStyles,
          canDragPiece: ({ square }) => isSelectablePiece(square),
          onPieceDrag: ({ square }) => {
            if (square) selectSquare(square);
          },
          onPieceClick: ({ square }) => {
            if (square) selectSquare(square);
          },
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            updateClicked(null);
            if (!targetSquare || targetSquare === sourceSquare) {
              resetDragState();
              return false;
            }
            const didMove = moveFromTo(sourceSquare, targetSquare, isEndgame);
            if (!didMove) resetDragState();
            return didMove;
          },
          onSquareClick: ({ square }) => {
            if (prevClicked === null) {
              selectSquare(square);
            } else if (prevClicked === square) {
              updateClicked(null);
            } else {
              if (moveFromTo(prevClicked, square, true)) return;
              selectSquare(square);
            }
          },
        }}
      />
    </div>
  );
}

function canSelectPiece(fen: string, square: string): boolean {
  if (!fen) return false;
  if (Brain.view === View.endgame && !Brain.hasSelectedEndgame()) return false;
  const chess = Brain.getChess(fen);
  const piece = chess.get(square as Square);
  return piece !== undefined && piece.color === chess.turn();
}

function getLegalTargets(fen: string, square: string | null) {
  const targets = new Map<string, { isCapture: boolean }>();
  if (!square || !canSelectPiece(fen, square)) return targets;
  Brain.getChess(fen)
    .moves({ square: square as Square, verbose: true })
    .forEach((move) => {
      targets.set(move.to, { isCapture: move.captured !== undefined });
    });
  return targets;
}

function getMoveFen(
  fen: string,
  sourceSquare: string,
  targetSquare: string
): string | null {
  const chess = Brain.getChess(fen);
  const move = safeMove(chess, sourceSquare, targetSquare);
  return move ? chess.fen() : null;
}

function safeMove(
  chess: ReturnType<typeof Brain.getChess>,
  sourceSquare: string,
  targetSquare: string
) {
  try {
    return chess.move({
      from: sourceSquare as Square,
      to: targetSquare as Square,
    });
  } catch {
    return null;
  }
}

export function getLastMoveSquares(
  fen: string,
  logs: LogType[]
): { from: Square; to: Square } | null {
  const fenKey = Brain.boardTurnKey(fen);
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const log = logs[index];
    const chess = Brain.getChess(log.fen);
    const whiteMove = chess.move(log.san);
    if (!whiteMove) {
      continue;
    }
    if (Brain.boardTurnKey(chess.fen()) === fenKey) {
      return getMoveSquares(whiteMove);
    }
    if (!log.opponent_san) {
      continue;
    }
    const opponentMove = chess.move(log.opponent_san);
    if (opponentMove && Brain.boardTurnKey(chess.fen()) === fenKey) {
      return getMoveSquares(opponentMove);
    }
  }
  return null;
}

function getMoveSquares(move: Move): { from: Square; to: Square } {
  return {
    from: move.from,
    to: move.to,
  };
}

function blurBoardFocus() {
  const activeElement = document.activeElement;
  if (
    activeElement instanceof HTMLElement &&
    activeElement.closest(".board-shell")
  ) {
    activeElement.blur();
  }
}

function getSquareStyles(
  selectedSquare: string | null,
  legalTargets: Map<string, { isCapture: boolean }>,
  lastMoveSquares: { from: Square; to: Square } | null
): Record<string, React.CSSProperties> {
  const styles: Record<string, React.CSSProperties> = {};
  if (lastMoveSquares) {
    styles[lastMoveSquares.from] = getLastMoveSquareStyle();
    styles[lastMoveSquares.to] = getLastMoveSquareStyle();
  }
  if (selectedSquare) {
    styles[selectedSquare] = {
      background: "rgba(255, 255, 0, 0.42)",
    };
  }
  legalTargets.forEach(({ isCapture }, square) => {
    const lastMoveBackground = styles[square]?.background;
    styles[square] = isCapture
      ? {
          ...styles[square],
          boxShadow: "inset 0 0 0 0.34rem rgba(20, 15, 12, 0.26)",
          borderRadius: "50%",
        }
      : {
          ...styles[square],
          background:
            `radial-gradient(circle, rgba(20, 15, 12, 0.32) 0 18%, transparent 19%)${
              lastMoveBackground ? `, ${lastMoveBackground}` : ""
            }`,
        };
  });
  return styles;
}

function getLastMoveSquareStyle(): React.CSSProperties {
  return {
    background: "rgba(205, 170, 72, 0.5)",
  };
}

function getBorderColor(total: number, winOdds: number | null): string {
  if (Brain.view === View.endgame) return "#c99c6b";
  if (Brain.isTraversing && winOdds !== null) {
    if (winOdds > 0.875) return "#ff9fb0";
    if (winOdds > 0.75) return "#d8b38a";
  }
  return total <= settings.RARE_THRESHOLD
    ? "#b98d63"
    : total <= settings.UNCOMMON_THRESHOLD
    ? "#8f7865"
    : total <= settings.INFREQUENT_THRESHOLD
    ? "#6f6258"
    : "#c99c6b";
}
