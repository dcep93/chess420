# Knight and Bishop Zone X Prepare Boundary Design

## Context

The `knightBishopPrepare` flowchart was generated from an optimal prepare-search path, but the endgame rule logic is being rewritten as a small set of named geometry rules. The visual review showed a boundary mistake:

- `n6` and `n7` should be covered by `[prepare]`.
- `n74`, `n75`, `n79`, and `n91` should be covered by the pre-`[prepare]` handoff/key-square rule, like `n41`.
- `n72` should remain a rule gap for now; it is one ply before the clarified handoff/key-square geometry.
- A separate hand-authored `prepare triangulation` table is the wrong abstraction.

This spec supersedes the earlier "Rule 6" framing. There is one `[prepare]` rule for Zone X preparation, and a separate pre-`[prepare]` rule for the key-square handoff pattern.

## Rule Boundary

The rule order for knight-and-bishop White moves should be:

1. Checkmate immediately when mate is available.
2. Avoid stalemate.
3. Keep the bishop and knight safe.
4. `[mate]` Follow the known knight-and-bishop mating net when it is available.
5. Pre-`[prepare]` key-square/handoff rule.
6. `[prepare]` Use Zone X when it is available.
7. Existing global tie behavior.

The pre-`[prepare]` rule is intentionally before `[prepare]`. If the handoff/key-square geometry is available, it should win before Zone X continuation.

## `[prepare]` Scope

`[prepare]` covers the full Zone X preparation phase, not only entry from outside the zone.

In the reference orientation:

- Zone X edge pair: `e8`, `f8`
- Escape square: `g7`
- White king target: `f6`
- Stable knight square: `c6`
- Bishop anchor: `e6`

`[prepare]` should choose moves that do one of these, derived from the current Zone X geometry:

- enter Zone X when every legal Black reply remains in the same Zone X instance;
- if Zone X already exists, move White's king to the target square when legal;
- if the king is already using the target geometry, continue the derived king triangulation that preserves the cage and returns with the desired parity.

Reference nodes that should be explained by `[prepare]`:

- `n0`: `Nc6+`
- `n6`: `Kf6`
- `n7`: `Kf6`
- `n23`: `Kf5`
- `n42`: `Kg6`
- `n69`: `Kf6`

These should not be explained by an extra table-only reason such as `prepare triangulation`.

## Pre-`[prepare]` Handoff Scope

The pre-`[prepare]` rule covers the key-square/handoff geometry that happens after the preparation route has reached the handoff shape.

The geometry is:

- Black's king is on an edge.
- White's king is two squares away from that same edge.
- The key square is the square between White's king and Black's edge; it must also be one king move from Black.
- If the kings are not in direct opposition, White's knight occupies the key square and White's bishop controls the escape square diagonal to Black's king and away from White's king.
- If the kings are in direct opposition, White's knight occupies the key square or attacks it from a non-edge route square.

Reference nodes that should be explained by the pre-`[prepare]` rule:

- `n41`: `Nf7`
- `n74`: `Kf6`
- `n75`: `Ne5`
- `n79`: `Ng6`
- `n91`: `Kf6`

These positions are not `[prepare]` even when they visually remain near Zone X. They are the transition into the handoff/key-square pattern.

## Implementation Shape

Do not grow a list of node-specific table rows for this behavior. Implement geometry helpers that derive the relevant squares from a detected transformed Zone X instance:

- zone pair;
- escape square;
- White king target;
- stable knight square;
- key square;
- handoff/route squares.

The move selector should ask the helpers for candidate SAN moves. Tests may use flowchart node IDs as fixtures, but production logic should not.

## Flowchart Diagnostics

Rule-gap borders are computed in memory when the flowchart page loads. A White node should be a rule gap when the generated move is not selected by an explicit knight-and-bishop rule and is therefore only chosen by global tie behavior or not chosen at all.

After this change:

- `n0`, `n6`, `n7`, `n23`, `n42`, and `n69` should not be rule gaps because `[prepare]` explains them.
- `n41`, `n74`, `n75`, `n79`, and `n91` should not be rule gaps because the pre-`[prepare]` handoff rule explains them.
- `n72` should be a rule gap until we add a rule for the preceding move into this geometry.

## Testing

Add or update tests so each reference node has exactly one ideal White move matching the generated flowchart move. The tests should also assert the explicit rule reason:

- `[prepare]` for `n0`, `n6`, `n7`, `n23`, `n42`, `n69`;
- the pre-`[prepare]` reason for `n41`, `n74`, `n75`, `n79`, `n91`;
- no explicit knight-and-bishop reason for `n72`.

Keep the runtime flowchart audit test that verifies generated JSON does not serialize rule-gap annotations.
