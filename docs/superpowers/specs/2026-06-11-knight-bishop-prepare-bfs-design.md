# Knight Bishop Prepare BFS Design

## Context

The `knightBishopPrepare` flowchart currently starts from three knight-and-bishop preparation positions and uses a prepare heuristic for White's move choice. The requested change is to find more optimal preparation paths with BFS-style search while ignoring the `knightAndBishop` mate/endgame logic.

Success for this flowchart is the prepared handoff shape only: the side to move is White, the black king is on the edge, the knight is not on the edge, the knight is side-adjacent to both kings, and the knight is on the same square color as the bishop. This is represented today by `getKnightBishopPrepareSuccess`.

## Goal

Make `knightBishopPrepare` choose shortest forced preparation lines:

- White chooses the move that minimizes distance to the prepared handoff shape.
- Black chooses replies that maximize White's remaining distance.
- A White candidate is valid only when every legal Black reply still has a forced path to success.
- The prepare solver must not call or depend on `knightAndBishop` mate heuristics.

## Proposed Approach

Add a dedicated prepare-search selector in `FlowchartGenerator.ts` and configure `knightBishopPrepare` to use it instead of `prepareHeuristic`.

The selector should compute forced distances in increasing ply-depth order so the first solved White choice is the shortest forced route. It should memoize normalized board-turn keys at each depth. At a White node, it evaluates all legal moves and chooses the move with the smallest child distance plus one. At a Black node, it evaluates all legal replies; if any reply has no forced distance, the Black node is unsolved at that depth, otherwise its distance is the maximum child distance plus one.

This gives the flowchart the intended adversarial behavior: White minimizes, Black maximizes, and only forced lines survive.

## Boundaries

The change should stay inside flowchart generation and generated flowchart data. It should not alter `Brain.getIdealEndgameWhiteMoves`, the playable `knightAndBishop` endgame, or the mate flowchart's checkmate success logic.

Existing failure behavior for `knightBishopPrepare` should remain in place: black king reaching the fifth rank, premature checkmate, and premature stalemate are terminal failures.

## Data Flow

1. `generateFlowchart("knightBishopPrepare")` selects the new prepare-search move selector.
2. The selector normalizes FENs with existing `normalizeFen`.
3. Terminal detection uses the prepare flowchart's `success` and `failure` callbacks.
4. White nodes expose at most one outgoing generated move, the shortest forced move.
5. Black nodes continue to expose all legal replies.
6. Existing distance annotation, transposition handling, bishop-anchor dedupe, layout assignment, and JSON generation run after expansion.

## Error Handling

If a node cannot force preparation within the configured search horizon, the selector returns no White move for that node. The generator should keep the existing `maxNodes` guard so unexpected graph growth fails loudly.

The solver should use the existing `maxSearchPlies` config value for `knightBishopPrepare` as the explicit search horizon.

## Testing

Update tests around generated flowchart data to verify the prepare flowchart follows adversarial distance semantics:

- Success nodes remain `terminal: "success"` with reason `prepared`.
- White prepare nodes with `movesToSuccess` choose a child whose worst Black reply distance matches the optimal forced distance.
- Black nodes sort or annotate replies by the known distance to success without assuming Black cooperates.
- The generated cached `knightBishopPrepare.json` remains renderable and route/play URLs continue to point at the playable `knightAndBishop` endgame.

Run `npm test` from `app`, and regenerate flowcharts with `npm run generate:flowcharts` when implementing.
