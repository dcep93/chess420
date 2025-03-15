import { useEffect, useState } from "react";
import Brain from "./Brain";
import lichessF, { stats } from "./Lichess";
import settings from "./Settings";

type SpeedrunType = {
  san: string;
  ratio: number;
  fen: string;
  sans: string[];
}[];

var key = -1;

export default function Speedrun() {
  const [speedrun, updateSpeedrun] = useState<SpeedrunType | null>(null);
  useEffect(() => {
    updateSpeedrun(null);
    const now = Date.now();
    key = now;
    getSpeedrun(key, Brain.getState().fen, 1, []).then(
      (s) => key === now && updateSpeedrun(s)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Brain.history]);
  if (speedrun === null) {
    return <div>loading...</div>;
  }
  return (
    <div>
      <div>
        <pre>{JSON.stringify(stats, null, 2)}</pre>
      </div>
      <table style={{ margin: "2em" }}>
        <thead>
          <tr>
            <th>move</th>
            <th style={{ padding: "0 2em" }}>prob</th>
            <th style={{ padding: "0 2em" }}>positions</th>
            <th>example</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(groupByF(speedrun, (s) => s.san))
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
                <td style={{ padding: "0 2em" }}>{s.ratio.toFixed(2)}</td>
                <td style={{ padding: "0 2em" }}>{s.ss.length}</td>
                <td>{s.first.sans.join(" ")}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function getSpeedrun(
  speedrunKey: number,
  fen: string,
  ratio: number,
  sans: string[]
): Promise<SpeedrunType> {
  if (
    key !== speedrunKey ||
    sans.length >= 8 ||
    ratio < settings.TRAVERSE_THRESHOLD_ODDS
  )
    return Promise.resolve([]);
  if (Brain.isMyTurn(fen)) {
    return Brain.getBest(fen).then((san) =>
      san === undefined
        ? []
        : getSpeedrun(
            speedrunKey,
            Brain.getFen(fen, san),
            ratio,
            sans.concat(san)
          ).then((sub) => sub.concat({ san, ratio, fen, sans }))
    );
  } else {
    return lichessF(fen)
      .then((moves) =>
        ((total) =>
          moves.map((m) =>
            getSpeedrun(
              speedrunKey,
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

function groupByF<T>(ts: T[], f: (t: T) => string): { [key: string]: T[] } {
  return ts.reduce((prev, curr) => {
    const key = f(curr);
    if (!prev[key]) prev[key] = [];
    prev[key]!.push(curr);
    return prev;
  }, {} as { [key: string]: T[] });
}
