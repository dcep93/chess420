import Brain, { StateType, View } from "./Brain";
import lichessF from "./LichessF";
import settings from "./Settings";

type TraverseState = StateType & { odds: number; progressPoints: number };
export type TraverseType = {
  originalState: StateType;
  progress: number;
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

export default function traverseF(
  t: TraverseType,
  myMoveSan?: string
): Promise<void> {
  const states = t.states!.slice();
  const state = states.pop()!;
  if (!state)
    return Promise.resolve().then(() =>
      Brain.setState({
        ...t.originalState,
        traverse: { ...t, states: undefined },
      })
    );
  if (!Brain.isMyTurn(state.fen))
    return lichessF(state.fen)
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
          .filter(
            (moveState) =>
              (t.results || []).find(
                (result) => result.fen === moveState.fen
              ) === undefined
          )
          .filter(
            (moveState) => moveState.odds >= settings.TRAVERSE_THRESHOLD_ODDS
          )
          .sort((a, b) => a.odds - b.odds)
      )
      .then((moveStates) =>
        moveStates.map((moveState) => ({
          ...moveState,
          progressPoints: state.progressPoints / moveStates.length,
        }))
      )
      .then((moveStates) => ({
        ...t,
        progress:
          moveStates.length > 0
            ? t.progress
            : t.progress + state.progressPoints,
        states: states.concat(moveStates),
      }))
      .then(traverseF);
  if (Brain.view === View.quizlet) {
    if (myMoveSan === undefined)
      return Promise.resolve({
        ...t,
        messages: [
          `progress: ${(t.progress * 100).toFixed(2)}%`,
          `seen: ${(state.odds * 100).toFixed(2)}%`,
        ],
      }).then((traverse) =>
        Brain.setState({
          ...state,
          traverse,
        })
      );
  }
  return (
    Brain.view === View.quizlet
      ? Promise.resolve(myMoveSan)
      : lichessF(state.fen)
          .then((moves) => ({
            moves,
            total: moves.map((move) => move.total).reduce((a, b) => a + b, 0),
          }))
          .then(
            ({ moves, total }) =>
              moves.find((move) => move.total > total / 2)?.san
          )
  )
    .then((myMoveSan) =>
      lichessF(state.fen, { ignoreUsername: true }).then((moves) => ({
        myMoveSan,
        myMove: moves.find((move) => move.san === myMoveSan),
        bestMove: moves.sort((a, b) => b.score - a.score)[0],
      }))
    )
    .then(({ myMoveSan, myMove, bestMove }) => {
      if (bestMove === undefined)
        return traverseF({
          ...t,
          progress: t.progress + state.progressPoints,
          states,
          results: (t.results || []).concat({
            ...state,
            familiarity: Familiarity.globalNew,
          }),
        });
      if (
        bestMove.san === myMove?.san ||
        (myMoveSan !== undefined && Brain.getNovelty(state) === myMoveSan)
      ) {
        return traverseF({
          ...t,
          states: states.concat(Brain.genState(state, myMoveSan!)),
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
      return Promise.resolve({
        ...t,
        progress: t.progress + state.progressPoints,
      })
        .then((t) => ({
          ...t,
          messages: [
            `progress: ${(t.progress * 100).toFixed(2)}%`,
            `seen: ${(state.odds * 100).toFixed(2)}%`,
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
        }))
        .then((traverse) =>
          Brain.setState({
            ...Brain.genState(state, bestMove.san),
            traverse,
          })
        );
    });
}

export function startTraverseF(startingState: StateType) {
  const traverseState = { odds: 1, progressPoints: 0.5, ...startingState };
  traverseF({
    originalState: startingState,
    progress: 0,
    states: [
      {
        ...traverseState,
        orientationIsWhite: !traverseState.orientationIsWhite,
      },
      { ...traverseState },
    ],
  });
}
