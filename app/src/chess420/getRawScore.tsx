import { LiMove } from "./LichessF";
import settings from "./Settings";

// the final score is the ratio compared to other moves' rawScore
export function getRawScore(isWhite: boolean, move: LiMove): number {
  // ignore draws
  // SCORE_FLUKE_DISCOUNT = 100 discounts positions
  // that are very rare
  const winRate =
    (isWhite ? move.white : move.black) /
    (settings.SCORE_FLUKE_DISCOUNT + move.black + move.white);
  // use atan around 0.5 because the difference between a
  // 50-60% win rate is larger than the difference
  // between a 70-80% win rate
  // SCORE_ATAN_FACTOR = 9 normalizes this window, but
  // perhaps a different value would be better :shrug:
  const winScore = Math.atan(settings.SCORE_ATAN_FACTOR * (winRate - 0.5));
  // SCORE_WIN_FACTOR = 8 puts the winScore as an exponent
  // so that ratios will do nice things
  const powerScore = Math.pow(settings.SCORE_WIN_FACTOR, winScore);
  // SCORE_TOTAL_FACTOR = 0.2 rewards more common moves, but not too much
  const rawScore =
    powerScore * Math.pow(move.total, settings.SCORE_TOTAL_FACTOR);
  return rawScore;
}
