import Brain, { StateType } from "./Brain";
import lichess from "./Lichess";
import { LogType } from "./Log";

type TraverseState = StateType & { odds: number };

export default function traverse(
  getMyMoveRaw: (state: StateType) => Promise<string | undefined>
) {
  const init = {
    ...Brain.getState(),
    traversing: true,
    logs: [] as LogType[],
  };
  Brain.setState(init);
  const start = { odds: 1, ...init };
  const states: TraverseState[] = [
    { ...start, orientationIsWhite: !start.orientationIsWhite },
    { ...start },
  ];
  const vars = {
    bad: [] as TraverseState[],
    ok: [] as TraverseState[],
    best: [] as TraverseState[],
  };
  const thresholdOdds = 0.01;
  function helper(rawStates: (StateType & { odds: number })[]): Promise<void> {
    const states = rawStates.slice();
    const state = states.pop();
    if (!state) {
      return new Promise<void>((resolve) =>
        Brain.setState(
          {
            ...init,
            message: {
              ms: Object.entries(vars).map(
                ([key, value]) => `${key}: ${value}`
              ),
              f: resolve,
            },
          },
          true
        )
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
          Brain.setState(
            {
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
            },
            true
          )
        );
      })
      .then(() => helper(states));
  }
  return helper(states).then(() => vars);
}
