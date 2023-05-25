const settings = {
  CHESSBOARD_WIDTH: "18em",
  REPLY_DELAY_MS: 500,
  LICHESS_PARAMS: `variant=standard&speeds=rapid,classical&ratings=${[
    2000, 2200, 2500,
  ].join(",")}`,
  MAX_LICHESS_ATTEMPTS: 10,
  PREPARE_NEXT_RATIO: 0.01,
  SCORE_FLUKE_DISCOUNT: 10,
  SCORE_ATAN_FACTOR: 9,
  SCORE_WIN_FACTOR: 100,
  SCORE_TOTAL_FACTOR: 0.2,
  STORAGE_VERSION: new Date().toDateString(),
  SUMMARY_LEN: 3,
  TRAVERSE_THRESHOLD_ODDS: 0.01,
  WEIGHTED_POWER: 1.5,
  SHOULD_UPDATE_HASH: true,
};

export default settings;
