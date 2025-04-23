import { useEffect, useState } from "react";
import Brain from "./Brain";
import lichessF, { stats } from "./Lichess";
import settings from "./Settings";

type SpeedrunType = {
  san: string;
  ratio: number;
  fen: string;
  sans: string[];
};

var key = -1;

export default function Speedrun() {
  const loadingSR = {
    san: "loading",
    ratio: Number.POSITIVE_INFINITY,
    fen: "",
    sans: [],
  };
  const [speedrun, updateSpeedrun] = useState<SpeedrunType[]>([]);
  useEffect(() => {
    const speedrunCache: SpeedrunType[] = [loadingSR];
    updateSpeedrun(speedrunCache);
    const now = Date.now();
    key = now;
    getSpeedrun(
      now,
      (sr) => {
        speedrunCache.push(sr);
        updateSpeedrun(speedrunCache);
      },
      Brain.getState().fen,
      1,
      []
    ).then((s) => key === now && updateSpeedrun(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Brain.history]);
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
      }}
    >
      <SpeedrunHelper speedrun={speedrun} />
    </div>
  );
}

function SpeedrunHelper(props: { speedrun: SpeedrunType[] }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <div>
        <pre>{JSON.stringify(stats, null, 2)}</pre>
      </div>
      <table style={{ margin: "2em" }}>
        <thead>
          <tr>
            <th style={{ paddingRight: "2em" }}>move</th>
            <th style={{ paddingRight: "2em" }}>prob</th>
            <th style={{ paddingRight: "2em" }}>positions</th>
            <th>example</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(groupByF(props.speedrun, (s) => s.san))
            .map(([san, ss]) => ({
              first: ss.sort((a, b) => b.ratio - a.ratio)[0],
              san,
              ratio: ss.map((s) => s.ratio).reduce((a, b) => a + b, 0),
              ss,
            }))
            .sort((a, b) => a.first.sans.length - b.first.sans.length)
            .sort((a, b) => b.ratio - a.ratio)
            .map((s, i) => (
              <tr
                key={i}
                onClick={() => window.open(`/#${Brain.hash(s.first.fen)}`)}
                style={{ cursor: "pointer" }}
                title={s.ss
                  .map(
                    (sss) => `${sss.ratio.toFixed(2)}: ${sss.sans.join(" ")}`
                  )
                  .join("\n")}
              >
                <td>{s.san}</td>
                <td>{s.ratio.toFixed(2)}</td>
                <td>{s.ss.length}</td>
                <td>{s.first.sans.join(" ")}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function getSpeedrun(
  now: number,
  updateSpeedrun: (s: SpeedrunType) => void,
  fen: string,
  ratio: number,
  sans: string[]
): Promise<SpeedrunType[]> {
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
        : Promise.resolve({ san, ratio, fen, sans }).then((s) =>
            Promise.resolve()
              .then(() => updateSpeedrun(s))
              .then(() =>
                getSpeedrun(
                  now,
                  updateSpeedrun,
                  Brain.getFen(fen, san),
                  ratio,
                  sans.concat(san)
                ).then((sub) => sub.concat(s))
              )
          )
    );
  } else {
    return lichessF(fen)
      .then((moves) =>
        moves.map((m) =>
          getSpeedrun(
            now,
            updateSpeedrun,
            Brain.getFen(fen, m.san),
            ratio * m.prob,
            sans.concat(m.san)
          )
        )
      )
      .then((ps) => Promise.all(ps))
      .then((s) => s.flatMap((ss) => ss));
  }
}

export function groupByF<T>(
  ts: T[],
  f: (t: T) => string
): { [key: string]: T[] } {
  return ts.reduce((prev, curr) => {
    const key = f(curr);
    if (!prev[key]) prev[key] = [];
    prev[key]!.push(curr);
    return prev;
  }, {} as { [key: string]: T[] });
}
