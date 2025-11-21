import Brain, { type StateType, View } from "./Brain";
import lichessF from "./Lichess";
import { getParts } from "./Log";
import settings from "./Settings";

type TraverseState = StateType & {
  opening: string;
  odds: number;
  progressPoints: number;
};
export type TraverseType = {
  results: (TraverseState & {
    bestMoveParts: string[] | undefined;
    familiarity: Familiarity;
  })[];
  originalState: StateType;
  progress: number;
  states: TraverseState[] | undefined;
  messages?: string[];
  assignNovelty?: () => void;
};
export enum Familiarity {
  globalNew,
  best,
  ok,
  bad,
  personalNew,
}

export default function traverseF(
  traverseT: TraverseType,
  traverseMyMoveSan?: string
): Promise<void> {
  console.log({ traverseT });
  Brain.updateIsTraversing(true);
  const states = traverseT.states!.slice();
  const state = states.pop()!;
  if (!state)
    return Promise.resolve()
      .then(() => Brain.updateIsTraversing(false))
      .then(() =>
        Brain.setState({
          ...traverseT.originalState,
          traverse: {
            ...traverseT,
            messages: undefined,
            assignNovelty: undefined,
          },
        })
      );
  if (!Brain.isMyTurn(state.fen, state.orientationIsWhite)) {
    return lichessF(state.fen)
      .then((moves) =>
        moves
          .map((move) =>
            Brain.genState(
              {
                ...state,
                odds: state.odds * move.prob,
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
          .map((o) => ({
            ...o,
            opening: Brain.getOpening(o.fen) || o.opening,
            sort: o.odds * Math.pow(Math.random(), 0.5),
          }))
          .sort((a, b) => a.sort - b.sort)
      )
      .then((moveStates) =>
        moveStates.map((moveState) => ({
          ...moveState,
          progressPoints: state.progressPoints / moveStates.length,
        }))
      )
      .then((moveStates) =>
        moveStates.length > 0
          ? traverseF({
              ...traverseT,
              progress: traverseT.progress,
              states: states.concat(moveStates),
            })
          : Promise.resolve()
              .then(() => Brain.updateIsTraversing(false))
              .then(() =>
                Brain.setState({
                  ...state,
                  traverse: {
                    ...traverseT,
                    progress: traverseT.progress + state.progressPoints,
                    states,
                    messages: ["end of the line"],
                    assignNovelty: undefined,
                  },
                })
              )
      );
  }
  if (Brain.view === View.traverse) {
    if (traverseMyMoveSan === undefined)
      return Promise.resolve({
        ...traverseT,
        messages: ["make a move"],
        assignNovelty: undefined,
      }).then((traverse) =>
        Brain.setState({
          ...state,
          traverse,
        })
      );
  }
  return (
    Brain.view === View.traverse
      ? Promise.resolve(traverseMyMoveSan)
      : lichessF(state.fen, { username: Brain.lichessUsername }).then(
          (moves) => moves.find((move) => move.prob > 0.5)?.san
        )
  )
    .then((myMoveSan) =>
      lichessF(state.fen).then((moves) => ({
        myMoveSan,
        myMove: moves.find((move) => move.san === myMoveSan),
        bestMove: moves.sort((a, b) => b.score - a.score)[0],
        moves,
      }))
    )
    .then(({ myMoveSan, myMove, bestMove, moves }) => {
      const novelty = Brain.getNovelty(state.fen);
      if (novelty !== null) {
        bestMove = moves.find((move) => move.san === novelty)!;
      }
      if (bestMove === undefined)
        return traverseF({
          ...traverseT,
          progress: traverseT.progress + state.progressPoints,
          states,
          results: (traverseT.results || []).concat({
            ...state,
            bestMoveParts: undefined,
            familiarity: Familiarity.globalNew,
          }),
        });
      if (bestMove.san === myMove?.san) {
        return traverseF({
          ...traverseT,
          states: states.concat(Brain.genState(state, myMoveSan!)),
          results: (traverseT.results || []).concat({
            ...state,
            bestMoveParts: getParts(myMoveSan!, moves),
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
      Brain.updateIsTraversing(false);
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
                    .then(() => traverseF(traverseT, traverseMyMoveSan)),
          states,
          results: (t.results || []).concat({
            ...state,
            bestMoveParts: getParts(bestMove.san, moves),
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
  Brain.updateIsTraversing(true);
  const traverseState = {
    odds: 1,
    opening: "",
    progressPoints: 0.5,
    ...startingState,
  };
  traverseF({
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
