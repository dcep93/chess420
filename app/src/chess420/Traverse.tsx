import Brain, { StateType, View } from "./Brain";
import lichess from "./Lichess";

type TraverseState = StateType & { odds: number };
export type TraverseType = {
  states: TraverseState[] | undefined;
  messages?: string[];
  results?: (TraverseState & { familiarity: Familiarity })[];
};
enum Familiarity {
  globalNew,
  best,
  ok,
  bad,
  personalNew,
}

export default function traverse(
  t: TraverseType
): Promise<TraverseType | undefined> {
  const thresholdOdds = 0.01;
  if (t.states === undefined) {
    return Promise.resolve(undefined);
  }
  if (t.states.length === 0) {
    return Promise.resolve({ ...t, message: "TODO", states: undefined });
  }
  const states = t.states.slice();
  const state = states.pop()!;
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
      )
      .then((moves) => ({
        ...t,
        states: states.concat(moves),
      }))
      .then(traverse);
  }
  return Promise.resolve()
    .then(() => getMyMoveSan(state))
    .then((myMoveSan) =>
      lichess(state.fen).then((moves) => ({
        myMoveSan,
        myMove: moves.find((move) => move.san === myMoveSan),
        bestMove: moves.sort((a, b) => b.score - a.score)[0],
      }))
    )
    .then(({ myMoveSan, myMove, bestMove }) => {
      if (bestMove === undefined)
        return traverse({
          ...t,
          states,
          results: (t.results || []).concat({
            ...state,
            familiarity: Familiarity.globalNew,
          }),
        });
      const nextState = Brain.genState(state, bestMove!.san);
      if (
        bestMove.san === myMove?.san ||
        (myMove !== undefined && Brain.getNovelty(state) === myMove.san)
      ) {
        return traverse({
          ...t,
          states: states.concat(nextState),
          results: (t.results || []).concat({
            ...state,
            familiarity: Familiarity.best,
          }),
        });
      }
      const familiarity =
        myMoveSan === undefined
          ? Familiarity.personalNew
          : myMove !== undefined &&
            (state.orientationIsWhite
              ? myMove.white > myMove.black
              : myMove.black > myMove.white)
          ? Familiarity.ok
          : Familiarity.bad;
      const verb =
        Brain.view === View.lichess_mistakes ? "usually play" : "played";
      return {
        ...t,
        messages: [
          "TODO traverse message",
          `odds: ${(state.odds * 100).toFixed(2)}%`,
          `the best move is ${bestMove.san} s/${bestMove.score.toFixed(2)}`,
          myMoveSan === undefined
            ? "you don't have a most common move"
            : myMove === undefined
            ? `you ${verb} ${myMoveSan} which isn't popular`
            : `you ${verb} ${myMove.san} s/${myMove.score.toFixed(2)}`,
        ],
        states,
        results: (t.results || []).concat({
          ...state,
          familiarity,
        }),
      };
    });
}

function getMyMoveSan(
  state: TraverseState
): Promise<string | undefined> | undefined {
  switch (Brain.view) {
    case View.lichess_mistakes:
      return lichess(state.fen, { username: Brain.lichessUsername })
        .then((moves) => ({
          moves,
          total: moves.map((move) => move.total).reduce((a, b) => a + b, 0),
        }))
        .then(
          ({ moves, total }) =>
            moves.find((move) => move.total > total / 2)?.san
        );
    case View.quizlet:
      return new Promise<string>((resolve) => {
        Brain.traversePromise = resolve;
      }).then((san) => {
        Brain.traversePromise = undefined;
        return san;
      });
  }
}
