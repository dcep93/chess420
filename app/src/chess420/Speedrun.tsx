import { useEffect, useState } from "react";
import Brain from "./Brain";
import lichessF from "./Lichess";
import settings from "./Settings";

type SpeedrunType = {
  san: string;
  ratio: number;
  fen: string;
}[];

export default function Speedrun() {
  const [speedrun, updateSpeedrun] = useState<SpeedrunType | null>(null);
  useEffect(() => {
    updateSpeedrun(null);
    getSpeedrun(Brain.getState().fen, 1, []).then(updateSpeedrun);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Brain.history]);
  if (speedrun === null) {
    return <div>loading...</div>;
  }
  return (
    <div>
      {speedrun.map((s, i) => (
        <div key={i}>
          <pre>{JSON.stringify(s)}</pre>
        </div>
      ))}
    </div>
  );
}

function getSpeedrun(
  fen: string,
  ratio: number,
  sans: string[]
): Promise<SpeedrunType> {
  if (sans.length >= 8 || ratio < settings.TRAVERSE_THRESHOLD_ODDS)
    return Promise.resolve([]);
  if (Brain.isMyTurn(fen)) {
    return Brain.getBest(fen).then((san) =>
      san === undefined
        ? []
        : getSpeedrun(Brain.getFen(fen, san), ratio, sans.concat(san)).then(
            (sub) => sub.concat({ san, ratio, fen })
          )
    );
  } else {
    return lichessF(fen)
      .then((moves) =>
        moves.filter((m) => m.total >= settings.UNCOMMON_THRESHOLD)
      )
      .then((moves) =>
        ((total) =>
          moves.map((m) =>
            getSpeedrun(
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
