import { useEffect, useState } from "react";
import Brain, { View } from "./Brain";
import lichessF from "./Lichess";
import { GetLog, LogType } from "./Log";
import quizletF from "./Quizlet";
import traverseF, { Familiarity } from "./Traverse";

export default function Summary() {
  return (
    <div
      style={{
        display: "flex",
      }}
    >
      <div
        style={{
          flexGrow: 1,
          width: 0,
          margin: "1em",
          overflow: "scroll",
        }}
      >
        <SubSummary />
      </div>
    </div>
  );
}

function SubSummary() {
  const state = Brain.getState();
  const [lastOpening, updateLastOpening] = useState<string | null>(null);
  const [odds, updateOdds] = useState(NaN);
  useEffect(() => {
    Promise.resolve()
      .then(() =>
        state.logs
          .filter((log) => !Brain.isMyTurn(log.fen))
          .map((log) =>
            lichessF(log.fen, {
              username:
                !Brain.isMyTurn(log.fen) && Brain.view === View.lichess_vs
                  ? Brain.lichessUsername
                  : undefined,
            }).then(
              (moves) => moves.find((move) => move.san === log.san)?.prob || 0
            )
          )
      )
      .then((promises) => Promise.all(promises))
      .then((move_probabilities) =>
        move_probabilities.reduce((a, b) => a * b, 1)
      )
      .then(updateOdds);
  }, [state.logs]);
  const opening = Brain.getOpening(state.fen);
  if (opening && lastOpening !== opening) {
    updateLastOpening(opening);
  } else if (!opening && state.traverse) {
    // @ts-ignore
    const stateLastOpening: string = state.opening;
    if (stateLastOpening !== lastOpening) updateLastOpening(stateLastOpening);
  }
  return (
    <div>
      <div
        style={{
          paddingLeft: "2em",
          textIndent: "-2em",
        }}
      >
        <div>{(odds * 100).toFixed(2)}%</div>
        <div>{opening || (lastOpening === null ? "" : `* ${lastOpening}`)}</div>
      </div>
      {state.traverse === undefined ? null : (
        <div
          style={{
            marginTop: "1em",
            padding: "0.5em",
            backgroundColor: "rgba(255, 255, 256, 0.2)",
            borderRadius: "1em",
          }}
        >
          <div>progress: {(state.traverse!.progress * 100).toFixed(2)}%</div>
          <div>positions visited: {(state.traverse!.results || []).length}</div>
          {state.traverse!.messages ? (
            <div style={{ height: "5.5em" }}>
              {state.traverse!.messages!.map((m, i) => (
                <div key={i}>{m}</div>
              ))}
            </div>
          ) : (
            <div>
              <div>traverse summary:</div>
              <div style={{ textIndent: "1em" }}>
                {(
                  Object.values(Familiarity).filter(
                    (v: any) => typeof v === "number"
                  ) as Familiarity[]
                ).map((f: Familiarity) => (
                  <div key={f}>
                    {Familiarity[f]}:{" "}
                    {
                      state.traverse!.results.filter((r) => r.familiarity === f)
                        .length
                    }
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <button onClick={() => quizletF(state.traverse!)}>
              download Quizlet csv
            </button>
          </div>
          {Brain.isTraversing ? (
            <div>traversing...</div>
          ) : (
            <>
              {!state.traverse!.messages ? null : (
                <div>
                  <div>
                    <button onClick={() => traverseF(state.traverse!)}>
                      continue
                    </button>
                  </div>
                  <div>
                    <button
                      onClick={() => window.open(`/speedrun#${Brain.hash()}`)}
                    >
                      speedrun
                    </button>
                  </div>
                </div>
              )}
              {state.traverse!.assignNovelty === undefined ? null : (
                <div>
                  <button onClick={state.traverse!.assignNovelty}>
                    assign novelty
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function SummaryMove(props: { log: LogType; length: number }) {
  if (!props.log) return null;
  const chess = Brain.getChess(props.log.fen);
  const cell =
    chess.turn() === "w" ? `${Math.ceil(props.length / 2) + 1}.` : "...";
  return (
    <div style={{ display: "flex" }}>
      <div>{cell}</div>
      <GetLog log={props.log} key={JSON.stringify(props.log)} />
    </div>
  );
}
