import Brain, { StateType } from "./Brain";
import lichess from "./Lichess";

type TraverseState = StateType & { odds: number };
export type TraverseType = {
  message: string;
  states?: TraverseState[];
  fens: string[];
};

// traverse(startingState, (state) =>
//   lichess(state.fen, { username: Brain.lichessUsername })
//     .then((moves) => ({
//       moves,
//       total: moves.map((move) => move.total).reduce((a, b) => a + b, 0),
//     }))
//     .then(
//       ({ moves, total }) => moves.find((move) => move.total > total / 2)?.san
//     )
// );
// traverse(startingState, (state) =>
//   new Promise<string>((resolve) => {
//     Brain.traversePromise = resolve;
//     Brain.setState(state);
//   }).then((san) => {
//     Brain.traversePromise = undefined;
//     return san;
//   })
// ).then(({ bad, ok, best }) => alert("TODO bad ok best"));

export default function traverse(
  t: TraverseType
): Promise<TraverseType | undefined> {
  const thresholdOdds = 0.01;
  if (t.states === undefined) {
    Brain.setState({});
  }
  const states = t.states.slice();
  while (states.length !== 0) {
    const state = states.pop();
  }
  function helper(rawStates: (StateType & { odds: number })[]): Promise<void> {
    const states = rawStates.slice();
    const state = states.pop();
    if (!state) {
      return new Promise<void>((resolve) =>
        Brain.setState({
          ...init,
          message: {
            ms: Object.entries(vars).map(([key, value]) => `${key}: ${value}`),
            f: resolve,
          },
        })
      ).then(() => Brain.setState({ ...init, traversing: false }));
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
            .sort((a, b) => a.odds - b.odds)
            .forEach((moveState) => states.push(moveState))
        )
        .then(() => helper(states));
    }
    return getMyMoveRaw(state)
      .then((myMoveRaw) =>
        lichess(state.fen).then((moves) => ({
          bestMove: moves.sort((a, b) => b.score - a.score)[0],
          myMoveRaw,
          myMove: moves.find((move) => move.san === myMoveRaw),
        }))
      )
      .then(({ bestMove, myMove, myMoveRaw }) => {
        if (bestMove === undefined) return;
        const nextState = Brain.genState(state, bestMove!.san);
        if (
          bestMove.san === myMove?.san ||
          (myMove !== undefined && Brain.getNovelty(state) === myMove.san)
        ) {
          vars.best.push(nextState);
          states.push(nextState);
          return;
        }
        const ok =
          myMove !== undefined &&
          (state.orientationIsWhite
            ? myMove.white > myMove.black
            : myMove.black > myMove.white);
        if (ok) {
          vars.ok.push(nextState);
        } else {
          vars.bad.push(nextState);
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
                    : `you usually play ${myMoveRaw} which isn't popular`
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
}
