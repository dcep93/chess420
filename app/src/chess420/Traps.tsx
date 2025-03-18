import Brain from "./Brain";
import lichessF from "./Lichess";
import settings from "./Settings";

export type TrapsType = {}[];

export default function Traps(props: { traps: TrapsType }) {
  return (
    <div>
      <pre>{JSON.stringify(props.traps)}</pre>
    </div>
  );
}

var key = -1;

export function fetchTraps(updateTraps: (traps: TrapsType) => void) {
  const now = Date.now();
  key = now;
  const trapsCache: TrapsType = [];
  return helper(
    now,
    (sr) =>
      sr.map((t) => {
        trapsCache.push(t);
        updateTraps(trapsCache);
      }),
    Brain.getState().fen,
    1,
    []
  ).then((s) => key === now && updateTraps(s));
}

function helper(
  now: number,
  updateTraps: (traps: TrapsType) => void,
  fen: string,
  ratio: number,
  sans: string[]
): Promise<TrapsType> {
  if (
    now !== key ||
    sans.length >= 8 ||
    ratio < settings.TRAVERSE_THRESHOLD_ODDS
  )
    return Promise.resolve([]);
  if (Brain.isMyTurn(fen)) {
    return Brain.getBest(fen).then((san) =>
      san === undefined
        ? []
        : Promise.resolve({}).then((t) =>
            Promise.resolve()
              .then(() => updateTraps([t]))
              .then(() =>
                helper(
                  now,
                  updateTraps,
                  Brain.getFen(fen, san),
                  ratio,
                  sans.concat(san)
                ).then((sub) => sub.concat(t))
              )
          )
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
