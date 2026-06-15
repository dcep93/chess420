# Knight Bishop Pivot Prereq Design

## Context

The knight-and-bishop phase-one rule ordering currently evaluates Zone X/key-square progress, then ordinary king progress, then bishop-front geometry, then knight placement. In the position `8/8/3k4/8/3BK3/8/3N4/8 w - - 22 12`, the current scoring already allows `Kd3` because it brings White's king closer and leaves the bishop on the color opposite White's king. The underlying lesson, though, is more specific than ordinary king progress: White pivots the king so the bishop already sitting on `d4` becomes the front square between the kings.

The approved visual pattern is:

- Black king on `d6`.
- White king on `e4`.
- Bishop on `d4`.
- The kings are a knight move apart.
- The bishop is orthogonally adjacent to White's king.
- The bishop opposes Black's king on the same file or rank.
- The king pivot `Ke4-d3` makes `d4` the square in front of White's king between the kings.

## Goal

Add a narrow bishop-pivot prereq immediately before rule 7, so this specific K-K-B relationship is explained and selected as its own logical rule before the general "bring White's king closer" rule.

## Rule Definition

Add a new White move scoring stage with reason `bishop pivot`.

It triggers only when all of these are true in the starting position:

- The kings are a knight move apart: one coordinate differs by 1 and the other differs by 2.
- The bishop is orthogonally adjacent to White's king.
- The bishop shares a file or rank with Black's king.

A candidate move satisfies the pivot when:

- The move is a legal White king move.
- White's king remains in the middle 16 squares.
- White's king lands on the color opposite the bishop.
- After the move, the bishop's current square equals `getSquareInFrontOfWhiteKingBetweenKings(afterWhiteKing, blackKing)`.

If more than one move satisfies the pivot, tie-break with the same squared Euclidean king distance used by rule 7. Non-pivot moves receive a high score.

## User-Facing Text

Rule text:

> Pivot White's king when the kings are a knight move apart and the bishop is adjacent to White's king while opposing Black's king, so the bishop becomes the square in front of White's king.

Short reason hint:

> Bishop pivot

## Architecture

The implementation should stay in `Brain.tsx`, following the existing score-helper pattern:

- Add a helper that detects the starting geometry.
- Add a score field to `scoreKnightAndBishopWhiteMove`, for example `bishopPivotScore`.
- Insert the score stage before `kingCloserOppositeBishopScore` in:
  - `getKnightAndBishopExplicitWhiteMoveReason`
  - `compareKnightAndBishopWhiteScores`
  - `getKnightAndBishopWhiteScoreReasons`
- Add the new reason label to the endgame reason display map.

The helper should reuse existing square utilities where possible: `squareCoords`, `kingDistance`, `sameSquareColor`, `isMiddle16Square`, and `getSquareInFrontOfWhiteKingBetweenKings`.

## Boundaries

This change should not alter Zone X, key-square, bishop-front, or knight-placement semantics. It should only explain and prioritize a specific king pivot before ordinary rule 7.

Do not regenerate flowchart data as part of the rule helper itself unless tests or rendering explicitly require cached reason updates later. The rule should be deterministic from the current FEN and legal move.

## Testing

Add focused tests for:

- The discussed FEN returns `Kd3` with explicit reason `bishop pivot`.
- A move such as `Nf3` does not satisfy the pivot because it is not a king move.
- The helper requires kings to be a knight move apart.
- The helper requires bishop opposition to Black's king.
- The helper preserves rule 7 constraints: middle 16 and opposite bishop color.

Run `npm test` from `app` after implementation.
