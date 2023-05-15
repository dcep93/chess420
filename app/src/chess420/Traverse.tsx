import Brain, { StateType } from "./Brain";
import lichess, { LiMove } from "./Lichess";
import { LogType } from "./Log";

// todo d stateful instead of promise based
export default function traverse(
  getMyMoveRaw: (state: StateType) => Promise<LiMove | undefined>
) {
  const start = { odds: 1, ...Brain.getState(), logs: [] as LogType[] };
  const states: (StateType & { odds: number })[] = [
    { ...start, orientationIsWhite: !start.orientationIsWhite },
    { ...start },
  ];
  const vars = { bad: 0, ok: 0, best: 0 };
  const thresholdOdds = 0.01;
  function helper(rawStates: (StateType & { odds: number })[]): Promise<void> {
    const states = rawStates.slice();
    const state = states.pop();
    if (!state) {
      return new Promise<void>((resolve) =>
        Brain.setState({
          ...start,
          message: {
            ms: Object.entries(vars).map(([key, value]) => `${key}: ${value}`),
            f: resolve,
          },
        })
      ).then(() => Brain.setState(start));
    }
    if (!Brain.isMyTurn(state)) {
      return lichess(state.fen)
        .then((moves) => ({
          moves,
          total: moves.map((move) => move.total).reduce((a, b) => a + b, 0),
        }))
        .then(({ moves, total }) =>
          moves
            .map((move) =>
              Brain.genState(
                {
                  ...state,
                  odds: (state.odds * move.total) / total,
                },
                move.san
              )
            )
            .filter((moveState) => moveState.odds >= thresholdOdds)
            .sort((a, b) => b.odds - a.odds)
            .forEach((moveState) => states.push(moveState))
        )
        .then(() => helper(states));
    }
    return getMyMoveRaw(state)
      .then((myMoveRaw) =>
        lichess(state.fen).then((moves) => ({
          bestMove: moves.sort((a, b) => b.score - a.score)[0],
          myMoveRaw,
          myMove: moves.find((move) => move.san === myMoveRaw?.san),
        }))
      )
      .then(({ bestMove, myMove, myMoveRaw }) => {
        if (bestMove === undefined) return;
        if (
          bestMove.san === myMove?.san ||
          (myMove !== undefined && Brain.getNovelty(state) === myMove.san)
        ) {
          vars.best++;
          states.push(Brain.genState(state, myMove!.san));
          return;
        }
        const ok =
          myMove !== undefined &&
          (state.orientationIsWhite
            ? myMove.white > myMove.black
            : myMove.black > myMove.white);
        if (ok) {
          vars.ok++;
        } else {
          vars.bad++;
        }
        return new Promise<void>((resolve) =>
          Brain.setState({
            ...state,
            message: {
              ms: [
                ok ? "ok" : "bad",
                `odds: ${(state.odds * 100).toFixed(2)}%`,
                `the best move is ${bestMove.san} s/${bestMove.score.toFixed(
                  2
                )}`,
                myMove === undefined
                  ? myMoveRaw === undefined
                    ? "you don't have a most common move"
                    : `you usually play ${myMoveRaw.san} which isn't popular`
                  : `you usually play ${myMove.san} s/${myMove.score.toFixed(
                      2
                    )}`,
              ],
              f: resolve,
            },
          })
        );
      })
      .then(() => helper(states));
  }
  return helper(states);
}
