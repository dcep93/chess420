import Brain from "./Brain";
import StorageW from "./StorageW";

export type Move = {
  san: string;
  total: number;
  white: number;
  black: number;
  draws: number;
  averageRating: number;
};

export default async function lichess(
  fen: string,
  attempt: number = 1,
  is_original: boolean = true,
  ratings: number[] = [2000, 2200, 2500]
): Promise<Move[]> {
  const url = `https://explorer.lichess.ovh/lichess?variant=standard&speeds=rapid,classical&ratings=${ratings.join(
    ","
  )}&fen=${fen}`;
  const storedMoves = StorageW.get(url);
  if (storedMoves !== null) return Promise.resolve(storedMoves);

  console.log("fetching", attempt, url);
  const response = await fetch(url);
  if (!response.ok)
    return new Promise((resolve, reject) =>
      setTimeout(
        () => lichess(fen, attempt + 1).then((moves) => resolve(moves)),
        1000
      )
    );
  const json = await response.json();
  StorageW.set(url, json);
  const moves = json.moves.map((m: any) => ({
    total: m.black + m.white + m.draws,
    ...m,
  }));
  const total = moves
    .map((move: Move) => move.total)
    .reduce((a: number, b: number) => a + b, 0);
  if (is_original)
    setTimeout(() =>
      moves
        .filter((move: Move) => move.total >= total * 0.01)
        .forEach((move: Move) => {
          const chess = Brain.getChess();
          chess.load(fen);
          chess.move(move.san);
          const new_fen = chess.fen();
          lichess(new_fen, attempt + 1, false);
        })
    );
  return Promise.resolve(moves);
}
