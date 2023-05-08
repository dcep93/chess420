import Brain from "./Brain";
import StorageW from "./StorageW";

type Move = {
  san: string;
  total: number;
  white: number;
  black: number;
  draws: number;
  averageRating: number;
};

export default async function lichess(
  fen: string,
  ratings: number[] = [2000, 2200, 2500],
  attempt: number = 1,
  is_original: boolean = true
): Promise<Move[]> {
  const url = `https://explorer.lichess.ovh/lichess?variant=standard&speeds=rapid,classical&ratings=${ratings.join(
    ","
  )}&fen=${fen}`;
  const storedMoves = StorageW.getLichess(url);
  if (storedMoves !== null) return Promise.resolve(JSON.parse(storedMoves));

  console.log("fetching", attempt, url);
  const response = await fetch(url);
  if (!response.ok)
    return new Promise((resolve, reject) =>
      setTimeout(
        () =>
          lichess(fen, ratings, attempt + 1).then((moves) => resolve(moves)),
        1000
      )
    );
  const json = await response.json();
  StorageW.setLichess(url, json);
  const moves = json.moves.map((m: any) => ({
    total: m.black + m.white + m.draws,
    ...m,
  }));
  if (is_original)
    setTimeout(() =>
      moves.forEach((move: Move) => {
        const chess = Brain.getChess();
        chess.load(fen);
        chess.move(move.san);
        const new_fen = chess.fen();
        lichess(new_fen, ratings, attempt + 1, false);
      })
    );
  return Promise.resolve(moves);
}
