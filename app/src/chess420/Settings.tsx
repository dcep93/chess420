const settings = {
  CHESSBOARD_WIDTH: "18em",
  REPLY_DELAY_MS: 500,
  LICHESS_PARAMS: `variant=standard&speeds=rapid,classical&ratings=${[
    2000, 2200, 2500,
  ].join(",")}`,
  MAX_LICHESS_PER: 10,
  PREPARE_NEXT_RATIO: 0.01,
  SCORE_X: 10,
  SCORE_Y: 3,
  SCORE_Z: 0.42,
  STORAGE_VERSION: "0.2.1",
  SUMMARY_LEN: 3,
  TRAVERSE_THRESHOLD_ODDS: 0.001,
  SHOULD_UPDATE_HASH: true,
};

export default settings;
