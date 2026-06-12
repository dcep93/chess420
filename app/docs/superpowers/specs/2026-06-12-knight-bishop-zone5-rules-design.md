# Knight and Bishop Zone 5 Rules Design

## Context

The knight-and-bishop endgame currently uses a long White priority list after mate, stalemate, material safety, and known mating-net entry. This change replaces that broad phase-one heuristic list with a small geometry-driven rule set:

1. Checkmate immediately when mate is available.
2. Avoid stalemate.
3. Keep the bishop and knight safe.
4. `[mate]` Follow the known knight-and-bishop mating net when it is available.
5. `[prepare]` Force Black into zone 5 when it is available.
6. When Black is in zone 5, hold the net and bring White's king to the target square.

After these rules, tied moves use the existing global tie behavior. Later changes can add more rules to reduce fallback frequency.

## Architecture

Keep the change inside the existing endgame structure:

- `Brain.tsx` remains the source of truth for knight-and-bishop move selection and help text.
- Add pure helper methods for zone-5 geometry, escape-square validation, forced-entry checks, target-square derivation, and the final knight handoff.
- Keep the known mating-net lookup system as the implementation of `[mate]`.
- Keep flowchart generation in `FlowchartGenerator.ts`, with additional diagnostic metadata when generated flowchart moves disagree with endgame logic.

This preserves the current flow where endgame pages, logs, tests, and generated flowcharts all consume `Brain` logic.

## Zone 5 Geometry

Zone 5 is derived from the relative geometry of the bishop and knight, not from a fixed board table. In the reference orientation from the example:

- Zone 5 squares are `e8` and `f8`.
- The escape square is `g7`.
- The White king target square is `f6`.
- The final knight handoff route is equivalent to moving through the square behind the bishop, `e5 -> f7`.

Equivalent positions are found by applying board rotations, reflections around the bishop's file, and translations along an edge. Each position has at most one zone 5. Zone 5 exists only when the White king alone can block the equivalent escape square.

## White Move Selection

The old knight-and-bishop priorities are removed:

- Keep the bishop and knight connected diagonally.
- Force Black's king away from the center.
- Limit Black's legal replies.
- Drive Black toward the bishop-colored mating corner.
- Move White's king toward the edge key square.
- Avoid king tempi that do not improve coordination.
- Bring White's king closer to Black's king.
- Keep White's king near the middle.
- Centralize the minor pieces.

The replacement behavior is:

- `[mate]` returns known mating-net lookup moves when available.
- `[prepare]` prefers a White move only if, after that move, every legal Black reply leaves Black's king in the detected zone 5.
- If Black is already in zone 5, prefer moves that keep every legal Black reply in zone 5 while moving White's king toward the derived target square.
- Once the target-square/opposition pattern is present, prefer the derived knight handoff move.
- If none of those rules distinguishes moves, the existing global tie behavior decides.

## Help Text

The "How best moves are chosen" page for knight-and-bishop should list the new concise priorities and remove the old phase-one heuristics. The labels should stay short:

- `[mate] Follow the known knight-and-bishop mating net when it is available.`
- `[prepare] Force Black into zone 5 when it is available.`
- `When Black is in zone 5, hold the net and bring White's king to the target square.`

The `[mate]` and `[prepare]` markers should link to the relevant flowcharts.

## Flowchart Diagnostics

For each White-to-move node in the knight/bishop flowcharts, generation computes `Brain.getIdealEndgameWhiteMoves(node.fen)`.

If a generated outgoing move is not one of those best moves, the node records a mismatch flag and the expected SAN list. The flowchart UI renders that node with a red border. The generated move is not changed; the red border marks a future rule gap.

This applies to `knightBishopPrepare` and can also run on `knightBishop`.

## Testing

Update tests for:

- Knight-and-bishop help text includes `[mate]` and `[prepare]`, and does not include the removed priorities.
- The example geometry detects zone 5 as `e8/f8`, escape square `g7`, target square `f6`, and the equivalent final knight handoff.
- Flowchart mismatch metadata is internally consistent: any flagged White node has a generated move outside `Brain.getIdealEndgameWhiteMoves(node.fen)`.

Avoid asserting a full mate line for the new sparse phase-one rule set. The expected fallback frequency is intentional until more rules are added.
