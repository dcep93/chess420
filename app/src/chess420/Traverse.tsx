import Brain, { StateType, View } from "./Brain";
import lichess from "./Lichess";
import settings from "./Settings";

type TraverseState = StateType & { odds: number; progressPoints: number };
export type TraverseType = {
  results: (TraverseState & { familiarity: Familiarity })[];
  originalState: StateType;
  progress: number;
  states: TraverseState[] | undefined;
  messages?: string[];
  assignNovelty?: () => void;
};
enum Familiarity {
  globalNew,
  best,
  ok,
  bad,
  personalNew,
}

export default function traverse(
  traverseT: TraverseType,
  traverseMyMoveSan?: string
): Promise<void> {
  const states = traverseT.states!.slice();
  const state = states.pop()!;
  if (!state)
    return Promise.resolve().then(() =>
      Brain.setState({
        ...traverseT.originalState,
        traverse: { ...traverseT, states: undefined },
      })
    );
  if (!Brain.isMyTurn(state.fen, state.orientationIsWhite))
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
          .filter(
            (moveState) =>
              (traverseT.results || []).find(
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
        ...traverseT,
        progress:
          moveStates.length > 0
            ? traverseT.progress
            : traverseT.progress + state.progressPoints,
        states: states.concat(moveStates),
      }))
      .then(traverse);
  if (Brain.view === View.quizlet) {
    if (traverseMyMoveSan === undefined)
      return Promise.resolve({
        ...traverseT,
      }).then((traverse) =>
        Brain.setState({
          ...state,
          traverse,
        })
      );
  }
  return (
    Brain.view === View.quizlet
      ? Promise.resolve(traverseMyMoveSan)
      : lichess(state.fen, { username: Brain.lichessUsername })
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
      lichess(state.fen).then((moves) => ({
        myMoveSan,
        myMove: moves.find((move) => move.san === myMoveSan),
        bestMove: moves.sort((a, b) => b.score - a.score)[0],
      }))
    )
    .then(({ myMoveSan, myMove, bestMove }) => {
      if (bestMove === undefined)
        return traverse({
          ...traverseT,
          progress: traverseT.progress + state.progressPoints,
          states,
          results: (traverseT.results || []).concat({
            ...state,
            familiarity: Familiarity.globalNew,
          }),
        });
      if (
        bestMove.san === myMove?.san ||
        (myMoveSan !== undefined && Brain.getNovelty(state) === myMoveSan)
      ) {
        return traverse({
          ...traverseT,
          states: states.concat(Brain.genState(state, myMoveSan!)),
          results: (traverseT.results || []).concat({
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
        ...traverseT,
        progress: traverseT.progress + state.progressPoints,
      })
        .then((t) => ({
          ...t,
          messages: [
            `the best move is ${bestMove.san} s/${bestMove.score.toFixed(2)}`,
            myMoveSan === undefined
              ? "you don't have a most common move"
              : myMove === undefined
              ? `you ${verb} ${myMoveSan} which isn't popular`
              : `you ${verb} ${myMove.san} s/${myMove.score.toFixed(2)}`,
          ],
          assignNovelty:
            myMoveSan === undefined
              ? undefined
              : () =>
                  Promise.resolve()
                    .then(() => Brain.setNovelty(state.fen, myMoveSan))
                    .then(() => traverse(traverseT, traverseMyMoveSan)),
          states,
          results: (t.results || []).concat({
            ...state,
            familiarity,
          }),
        }))
        .then((traverse) =>
          Brain.setState({
            ...state,
            traverse,
          })
        );
    });
}

export function startTraverseF(startingState: StateType) {
  const traverseState = {
    odds: 1,
    progressPoints: 0.5,
    ...startingState,
  };
  traverse({
    results: [],
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
