import { useEffect, useState } from "react";
import Brain from "./Brain";
import lichessF, { type LiMove, type LichessRequestBudget } from "./Lichess";
import settings from "./Settings";

type TrapType = {
  ratio: number;
  fen: string;
  score: number;
  sans: string[];
  m: LiMove;
};

export default function Traps() {
  const [traps, updateTraps] = useState<TrapType[]>([]);
  const fen = Brain.getState().fen;

  useEffect(() => {
    let isActive = true;
    updateTraps([]);
    fetchTraps((nextTraps) => {
      if (isActive) {
        updateTraps(nextTraps);
      }
    }, fen);

    return () => {
      isActive = false;
      key = -1;
    };
  }, [fen]);

  return <SubTraps traps={traps} />;
}

function SubTraps(props: { traps: TrapType[] }) {
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
var nextKey = 0;

export function fetchTraps(
  updateTraps: (traps: TrapType[]) => void,
  fen = Brain.getState().fen
) {
  const numToKeep = 25;
  const now = ++nextKey;
  key = now;
  const trapsCache: TrapType[] = [];
  const requestBudget = { remaining: 100 };
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
      updateTraps(trapsCache.slice());
    },
    fen,
    1,
    [],
    requestBudget
  ).then(
    (ts) =>
      key === now &&
      updateTraps(ts.sort((a, b) => b.score - a.score).slice(0, numToKeep))
  );
}

function getTrapScore(ratio: number, m: LiMove, moves: LiMove[]): number {
  const isWhite = Brain.getState().orientationIsWhite;
  const getMyWinPercentage = (move: LiMove) => (isWhite ? move.ww : 1 - move.ww);
  const opponentBestMove = moves
    .filter((move) => move.total >= 100)
    .sort((a, b) => getMyWinPercentage(a) - getMyWinPercentage(b))[0];
  const opponentLineProbability = ratio * m.prob;
  const winPercentage = getMyWinPercentage(m);
  const mistakeGain = opponentBestMove
    ? Math.max(0, winPercentage - getMyWinPercentage(opponentBestMove))
    : 0;
  if (winPercentage <= 0.5 || mistakeGain <= 0) return 0;
  return (
    Math.pow(opponentLineProbability, 0.5) *
    Math.pow(mistakeGain, 2) *
    Math.pow(winPercentage, 0.5)
  );
}

async function helper(
  now: number,
  updateTraps: (traps: TrapType[]) => void,
  fen: string,
  ratio: number,
  sans: string[],
  requestBudget: LichessRequestBudget
): Promise<TrapType[]> {
  // TODO define TRAPS_THRESHOLD_ODDS
  if (now !== key || ratio < settings.TRAPS_THRESHOLD_ODDS)
    return Promise.resolve([]);
  const moves = (await lichessF(fen, { requestBudget }))
    .slice()
    .sort((a, b) => b.total - a.total);
  const traps: TrapType[] = [];
  if (Brain.isMyTurn(fen)) {
    for (const m of moves) {
      traps.push(
        ...(await helper(
          now,
          updateTraps,
          Brain.getFen(fen, m.san),
          ratio,
          sans.concat(m.san),
          requestBudget
        ))
      );
    }
    return traps;
  }

  for (const m of moves.filter((move) => move.total >= 100)) {
    const score = getTrapScore(ratio, m, moves);
    const trap = {
      ratio,
      fen,
      sans,
      score,
      m,
    };
    const scoredTraps = trap.score > 0 ? [trap] : [];
    if (scoredTraps.length > 0) updateTraps(scoredTraps);
    traps.push(
      ...(await helper(
        now,
        updateTraps,
        Brain.getFen(fen, m.san),
        ratio * m.prob,
        sans.concat(m.san),
        requestBudget
      )),
      ...scoredTraps
    );
  }
  return traps;
}
