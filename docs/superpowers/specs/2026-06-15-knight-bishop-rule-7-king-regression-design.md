# Knight Bishop Rule 7 King Regression Design

## Context

In the position `8/8/8/2N1B3/4K3/8/2k5/8 w - - 18 10`, the current engine accepts both `Bd4` and `Kf5` with reason `bishop front`.

`Bd4` is correct because it establishes the bishop on an edge-adjacent front square without moving White's king away from Black's king.

`Kf5` should be wrong. It also makes the bishop a front-square bishop, but it increases White king distance from Black king. Rule 7's king-proximity goal should deprioritize that regression before rule 8 rewards bishop-front geometry.

## Goal

Make rule 7 treat king-distance regression as worse than non-regression, so later rules do not choose a White king move that increases distance when a non-regressing move is available.

## Rule Definition

Add a king-regression score for knight-and-bishop White moves:

- Non-king moves are neutral.
- King moves that reduce or preserve White king distance from Black king are neutral.
- King moves that increase White king distance from Black king are penalized.

Place this score after the existing rule-7 "bring king closer" score and before rule 8's bishop-front score.

Use the same squared Euclidean king distance already used by rule 7, so diagonal and straight moves are compared consistently.

## Expected Behavior

For `8/8/8/2N1B3/4K3/8/2k5/8 w - - 18 10`:

- `Bd4` should be the only ideal move.
- `Kf5` should lose because it increases White king distance.
- The final reason should remain `bishop front`, because the winning move is selected by rule 8 after the regressing king move is filtered out.

## Architecture

Keep the change in `Brain.tsx`:

- Add a score field such as `kingDistanceRegressionScore`.
- Compute it from the pre-move and post-move White king distance to Black king.
- Insert it in:
  - `getKnightAndBishopExplicitWhiteMoveReason`
  - `compareKnightAndBishopWhiteScores`
  - `getKnightAndBishopWhiteScoreReasons`

This should not change the meaning of `kingCloserOppositeBishopScore`; it only prevents later rules from preferring king-distance regression.

## Testing

Add focused tests for:

- The discussed FEN returns only `Bd4`.
- `Kf5` has a worse king-regression score than `Bd4`.
- The explicit reason for `Bd4` remains `bishop front`.

Run `npm test` from `app` after implementation.
