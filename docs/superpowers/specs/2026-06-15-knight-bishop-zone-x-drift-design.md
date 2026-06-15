# Knight Bishop Zone X Drift Design

## Context

Rule 5 currently says:

> Prepare * is true when the bishop is on its Zone X square: move White's king toward Black's king, otherwise move the knight by the shortest path to its Zone X square.

In the position `8/8/8/3N4/8/1BK5/8/1k6 w - - 6 4`, the bishop on `b3` and Black king on `b1` identify a Zone X preparation geometry, but the existing `getKnightAndBishopZoneXSetup` helper returns `undefined`. Because rule 5 does not activate, the position falls through to rule 8 and currently prefers `Bc2+` and `Kb4` with reason `bishop front`.

The intended lesson is simpler: the relevant knight Zone X square is `d3`. White should drift the knight toward `d3` before later bishop-front rules decide the move.

## Goal

Add a narrow Zone X drift case to rule 5 so the engine recognizes this bishop/black-king geometry and prefers knight moves that reduce shortest knight distance to the knight Zone X square.

## Rule Definition

Add a helper that can return a Zone X knight drift target when the full `getKnightAndBishopZoneXSetup(fen)` is not active.

For the approved case:

- Bishop is on `b3`.
- Black king is on `b1`.
- The knight Zone X drift target is `d3`.

The implementation should support transformed equivalents of that geometry, using the same square-transform style as the existing Zone X helpers.

When a drift target exists:

- Only knight moves receive drift credit.
- Score candidate knight moves by shortest knight distance from the resulting knight square to the drift target.
- Moves that do not improve or match the best drift distance should lose before rule 8.
- The reason remains `prepare zone x`.

For the discussed FEN, `Nb4` and `Nf4` should both be ideal because both reduce shortest knight distance to `d3` from 2 to 1. The rule should not use the eventual `c2` target as a tie-break yet.

## Architecture

Keep the change inside `Brain.tsx` and the existing rule-5 scoring path:

- Add a drift-target helper, for example `getKnightAndBishopZoneXKnightDriftTarget(fen): Square | undefined`.
- Check the drift target in `getKnightAndBishopZoneXPrepareScore` after the full setup branch and before falling through to `99`.
- Reuse `getKnightDistanceToAnySquare` for scoring.
- Keep the public reason key as `prepare zone x`; no new reason label is needed.

The helper should be independent enough to test directly, but should not broaden the existing full Zone X setup definition.

## Boundaries

Do not add the eventual `c2` target as a tie-break in this change.

Do not change rule 8 ordering. This is specifically a rule-5 recognition gap: when Zone X drift is available, it should decide before bishop-front logic.

Do not regenerate the full flowchart graph unless a later implementation step proves cached metadata must be refreshed. If cached best-move mismatch metadata changes, refresh only that metadata.

## Testing

Add focused tests for:

- The discussed FEN has drift target `d3`.
- `Nb4` and `Nf4` have the best `prepare zone x` scores and are the only ideal moves.
- `Bc2+` and `Kb4` no longer win by rule 8 in this position.
- The explicit reason for `Nb4` and `Nf4` is `prepare zone x`.
- A transformed equivalent of the geometry returns the corresponding transformed drift target.

Run `npm test` from `app` after implementation.
