import Brain from "./Brain";
import lichessF, { LiMove } from "./Lichess";
import settings from "./Settings";

export type TrapType = {
  ratio: number;
  fen: string;
  score: number;
  sans: string[];
  m: LiMove;
};

export default function Traps(props: { traps: TrapType[] }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <h1>traps</h1>
      <table style={{ margin: "2em" }}>
        <thead>
          <tr>
            <th style={{ paddingRight: "2em" }}>prob</th>
            <th style={{ paddingRight: "2em" }}>ww</th>
            <th style={{ paddingRight: "6em" }}>sans</th>
            <th style={{ paddingRight: "4em" }}>mistake</th>
            <th>opening</th>
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
                <td>{s.ratio.toFixed(2)}</td>
                <td>{s.m.ww.toFixed(2)}</td>
                <td>{s.sans.join(" ")}</td>
                <td>
                  {s.m.prob.toFixed(2)} {s.m.san}
                </td>
                <td>{getOpening(s)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function getOpening(trap: TrapType): string {
  const o = Brain.getOpening(Brain.getFen(trap.fen));
  if (o) return o;
  const fens = trap.sans.concat("").reduce(
    (prev, curr) => ({
      fen: Brain.getFen(prev.fen, curr),
      fens: prev.fens.concat(prev.fen),
    }),
    ((fen: string) => ({
      fen,
      fens: [fen],
    }))(Brain.getState().fen)
  ).fens;
  return (
    fens
      .reverse()
      .map((fen) => Brain.getOpening(fen))
      .find((o) => o) || "?"
  );
}

var key = -1;

export function fetchTraps(updateTraps: (traps: TrapType[]) => void) {
  const numToKeep = 25;
  const now = Date.now();
  key = now;
  const trapsCache: TrapType[] = [];
  return helper(
    now,
    (ts) => {
      ts.forEach((t) => {
        const found = trapsCache.find((tt) => tt.fen === t.fen);
        if (found) {
          found.ratio = Math.max(t.ratio, found.ratio);
        } else {
          trapsCache.push(t);
        }
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

function getTrapScore(ratio: number, m: LiMove, moves: LiMove[]): number {
  const best = moves.sort((a, b) => b.score - a.score)[0];
  return [
    Math.pow(m.prob * ratio, 0.2),
    Math.pow(Brain.getState().orientationIsWhite ? best.ww : 1 - best.ww, 0.2),
    Math.pow(2 * (Brain.getState().orientationIsWhite ? m.ww : 1 - m.ww), 2),
  ].reduce((a, b) => a * b, 1);
}

function helper(
  now: number,
  updateTraps: (traps: TrapType[]) => void,
  fen: string,
  ratio: number,
  sans: string[]
): Promise<TrapType[]> {
  // TODO define TRAPS_THRESHOLD_ODDS
  if (now !== key || ratio < settings.TRAPS_THRESHOLD_ODDS)
    return Promise.resolve([]);
  if (Brain.isMyTurn(fen)) {
    return lichessF(fen)
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
      .then((s) => s.flatMap((ss) => ss));
  } else {
    return lichessF(fen)
      .then((moves) =>
        moves
          .filter((m) => m.total >= 100)
          .map((m) =>
            Promise.resolve()
              .then(() => getTrapScore(ratio, m, moves))
              .then((score) => ({
                ratio,
                fen,
                sans,
                score,
                m,
              }))
              .then((ts) =>
                Promise.resolve()
                  .then(() => updateTraps([ts]))
                  .then(() =>
                    helper(
                      now,
                      updateTraps,
                      Brain.getFen(fen, m.san),
                      ratio * m.prob,
                      sans.concat(m.san)
                    )
                  )
                  .then((hts) => hts.concat(ts))
              )
          )
      )
      .then((ps) => Promise.all(ps))
      .then((s) => s.flatMap((ss) => ss));
  }
}
