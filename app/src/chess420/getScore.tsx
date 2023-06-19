import { LiMove } from "./LichessF";
import settings from "./Settings";

export function getScore(isWhite: boolean, move: LiMove): number {
  const winRate =
    (isWhite ? move.white : move.black) /
    (settings.SCORE_FLUKE_DISCOUNT + move.black + move.white);
  const rawScore = Math.atan(settings.SCORE_ATAN_FACTOR * (winRate - 0.5));
  const powerScore = Math.pow(settings.SCORE_WIN_FACTOR, rawScore);
  const score = powerScore * Math.pow(move.total, settings.SCORE_TOTAL_FACTOR);
  return score;
}
