import Brain from "./Brain";
import lichessF from "./Lichess";
import settings from "./Settings";
import { groupByF } from "./Speedrun";

export type TrapsType = {
  ratio: number;
  fen: string;
  score: number;
  sans: string[];
}[];

export default function Traps(props: { traps: TrapsType }) {
  return (
    <div>
      <table style={{ margin: "2em" }}>
        <thead>
          <tr>
            <th>score</th>
            <th style={{ padding: "0 2em" }}>prob</th>
            <th>example</th>
          </tr>
        </thead>
        <tbody>
          {props.traps
            .sort((a, b) => b.score - a.score)
            .map((s, i) => (
              <tr
                key={i}
                onClick={() => window.open(`/#${Brain.hash(s.fen)}`)}
                style={{ cursor: "pointer" }}
                title={`${s.ratio.toFixed(2)}: ${s.sans.join(" ")}`}
              >
                <td>{s.score.toFixed(2)}</td>
                <td style={{ padding: "0 2em" }}>{s.ratio.toFixed(2)}</td>
                <td>{s.sans.join(" ")}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

var key = -1;

export function fetchTraps(updateTraps: (traps: TrapsType) => void) {
  const numToKeep = 25;
  const now = Date.now();
  key = now;
  const trapsCache: TrapsType = [];
  return helper(
    now,
    (ts) => {
      ts.map((t) => {
        trapsCache.push(t);
      });
      trapsCache.sort((a, b) => b.score - a.score).splice(numToKeep);
      updateTraps(trapsCache);
    },
    Brain.getState().fen,
    1,
    []
  ).then(
    (ts) =>
      key === now &&
      updateTraps(ts.sort((a, b) => b.score - a.score).slice(0, numToKeep))
  );
}

function getScore(fen: string, ratio: number) {
  return ratio;
}

function helper(
  now: number,
  updateTraps: (traps: TrapsType) => void,
  fen: string,
  ratio: number,
  sans: string[]
): Promise<TrapsType> {
  if (now !== key || ratio < settings.TRAPS_THRESHOLD_ODDS)
    return Promise.resolve([]);
  if (Brain.isMyTurn(fen)) {
    return Promise.resolve({
      ratio,
      fen,
      sans,
      score: getScore(fen, ratio),
    }).then((t) =>
      Promise.resolve()
        .then(() => updateTraps([t]))
        .then(() =>
          lichessF(fen)
            .then((moves) =>
              moves.map((m) =>
                helper(
                  now,
                  updateTraps,
                  Brain.getFen(fen, m.san),
                  ratio,
                  sans.concat(m.san)
                )
              )
            )
            .then((ps) => Promise.all(ps))
            .then((s) => s.flatMap((ss) => ss))
        )
        .then((ts) => ts.concat(t))
    );
  } else {
    return lichessF(fen)
      .then((moves) =>
        ((total) =>
          moves.map((m) =>
            helper(
              now,
              updateTraps,
              Brain.getFen(fen, m.san),
              (ratio * m.total) / total,
              sans.concat(m.san)
            )
          ))(moves.map((m) => m.total).reduce((a, b) => a + b, 0))
      )
      .then((ps) => Promise.all(ps))
      .then((s) => s.flatMap((ss) => ss));
  }
}
