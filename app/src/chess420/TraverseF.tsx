import BrainC, { StateType, View } from "./BrainC";
import lichessF from "./LichessF";
import settings from "./Settings";

type TraverseState = StateType & { odds: number };
export type TraverseType = {
  originalState: StateType;
  states: TraverseState[] | undefined;
  san?: string;
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

export default function traverseF(t: TraverseType): Promise<void> {
  const states = t.states!.slice();
  const state = states.pop()!;
  if (!state)
    return Promise.resolve().then(() =>
      BrainC.setState({
        ...t.originalState,
        traverse: { ...t, states: undefined },
      })
    );
  if (!BrainC.isMyTurn(state))
    return lichessF(state.fen)
      .then((moves) => ({
        moves,
        total: moves.map((move) => move.total).reduce((a, b) => a + b, 0),
      }))
      .then(({ moves, total }) =>
        moves
          .map((move) =>
            BrainC.genState(
              {
                ...state,
                odds: (state.odds * move.total) / total,
              },
              move.san
            )
          )
          .filter(
            (moveState) => moveState.odds >= settings.TRAVERSE_THRESHOLD_ODDS
          )
          .sort((a, b) => a.odds - b.odds)
      )
      .then((moveStates) => ({
        ...t,
        san: undefined,
        states: states.concat(moveStates),
      }))
      .then(traverseF);
  if (BrainC.view === View.quizlet && t.san === undefined)
    return Promise.resolve({ ...t }).then((traverse) =>
      BrainC.setState({
        ...state,
        traverse,
      })
    );
  return (
    BrainC.view === View.quizlet
      ? Promise.resolve(t.san)
      : lichessF(state.fen, { username: BrainC.lichessUsername })
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
      lichessF(state.fen).then((moves) => ({
        myMoveSan,
        myMove: moves.find((move) => move.san === myMoveSan),
        bestMove: moves.sort((a, b) => b.score - a.score)[0],
      }))
    )
    .then(({ myMoveSan, myMove, bestMove }) => {
      if (bestMove === undefined)
        return traverseF({
          ...t,
          states,
          results: (t.results || []).concat({
            ...state,
            familiarity: Familiarity.globalNew,
          }),
        });
      const nextState = BrainC.genState(state, bestMove!.san);
      if (
        bestMove.san === myMove?.san ||
        (myMove !== undefined && BrainC.getNovelty(state) === myMove.san)
      ) {
        return traverseF({
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
        BrainC.view === View.lichess_mistakes ? "usually play" : "played";
      return Promise.resolve({
        ...t,
        san: undefined,
        messages: [
          "TODO gen traverse message",
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
      }).then((traverse) =>
        BrainC.setState({
          ...state,
          traverse,
        })
      );
    });
}
