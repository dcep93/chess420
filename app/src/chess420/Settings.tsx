const settings = {
  IS_DEV: !process.env.NODE_ENV || process.env.NODE_ENV === "development",
  CHESSBOARD_WIDTH: "16em",
  REPLY_DELAY_MS: 500,
  LICHESS_PARAMS: `variant=standard&speeds=rapid,classical&ratings=${[
    2000, 2200, 2500,
  ].join(",")}`,
  MAX_LICHESS_ATTEMPTS: 10,
  PREPARE_NEXT_RATIO: 0.01,
  SCORE_FLUKE_DISCOUNT: 25,
  SCORE_ATAN_FACTOR: 9,
  SCORE_WIN_FACTOR: 8,
  SCORE_TOTAL_FACTOR: 0.2,
  STORAGE_VERSION: "chess420-v1",
  SUMMARY_LEN: 3,
  TRAVERSE_THRESHOLD_ODDS: 0.01,
  TRAPS_THRESHOLD_ODDS: 0.3,
  WEIGHTED_POWER: 1.5,
  SHOULD_UPDATE_HASH: true,
  BOARD_REFRESH_PERIOD_MS: 750,
  UNCOMMON_THRESHOLD: 100000,
};

export default settings;
