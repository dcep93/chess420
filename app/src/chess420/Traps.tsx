import Brain from "./Brain";
import lichessF from "./Lichess";
import settings from "./Settings";

export type TrapsType = {
  ratio: number;
  fen: string;
  score: number;
}[];

export default function Traps(props: { traps: TrapsType }) {
  return (
    <div>
      <pre>{JSON.stringify(props.traps)}</pre>
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
    1
  ).then(
    (ts) =>
      key === now &&
      updateTraps(ts.sort((a, b) => b.score - a.score).slice(0, numToKeep))
  );
}

function getScore(fen: string, ratio: number) {
  return 0;
}

function helper(
  now: number,
  updateTraps: (traps: TrapsType) => void,
  fen: string,
  ratio: number
): Promise<TrapsType> {
  if (now !== key || ratio < settings.TRAVERSE_THRESHOLD_ODDS)
    return Promise.resolve([]);
  if (Brain.isMyTurn(fen)) {
    return Promise.resolve({ ratio, fen, score: getScore(fen, ratio) })
      .then((t) => Promise.resolve().then(() => updateTraps([t])))
      .then(() =>
        lichessF(fen)
          .then((moves) =>
            moves.map((m) =>
              helper(now, updateTraps, Brain.getFen(fen, m.san), ratio)
            )
          )
          .then((ps) => Promise.all(ps))
          .then((s) => s.flatMap((ss) => ss))
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
              (ratio * m.total) / total
            )
          ))(moves.map((m) => m.total).reduce((a, b) => a + b, 0))
      )
      .then((ps) => Promise.all(ps))
      .then((s) => s.flatMap((ss) => ss));
  }
}
