import { useEffect, useState } from "react";
import Brain from "./Brain";

type SpeedrunType = {
  san: string;
  positions: number;
  reference: string;
}[];

export default function Speedrun() {
  const [speedrun, updateSpeedrun] = useState<SpeedrunType | null>(null);
  const fen = Brain.getFen();
  useEffect(() => {
    getSpeedrun().then(updateSpeedrun);
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

function getSpeedrun(): Promise<SpeedrunType> {
  return Promise.resolve([]);
}
