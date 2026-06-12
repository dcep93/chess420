# Knight and Bishop Zone 5 Path Instance Design

## Context

The previous Zone 5 rule draft treated the edge pair as if it could be detected from a narrow bishop-and-knight arrangement. Visual review showed that this was too loose in one direction and too narrow in another:

- It missed valid entry positions such as the `Nc6+` preparation pattern.
- It accidentally made the edge pair look like it could exist without the knight being on the Zone 5 path.

This spec clarifies Zone 5 as a complete path instance. The playable rules should use this definition before marking flowchart moves as rule gaps.

## Definition

Zone 5 is not a free-standing pair of edge squares. A Zone 5 instance exists only when all of these are true:

- The bishop, knight, Black king, and White king target match one transformed path instance.
- In the reference orientation, the path instance has:
  - Zone pair: `e8`, `f8`
  - Escape square: `g7`
  - White king target: `f6`
  - Allowed knight path squares: `c6`, `e5`, `f7`
- The knight is already on one of the allowed knight path squares for that transformed instance.
- Black's king is on the matching zone pair for that same instance.
- White's king is ready to block the matching escape square by occupying, or being able to move into, the target square as required by the rule state.

The allowed transforms remain rotations, reflections, and translations along the edge. The transformed instance owns its path squares, edge pair, escape square, and target square together.

## Non-Examples

The following are not Zone 5 in the reference orientation:

- Knight on `f5`. This is nearby setup, not Zone 5.
- Knight on `d4`. This is not Zone 5 as a static position, even when White can immediately play `Nc6`.
- Any position where Black's king is near `e8/f8` but the knight is not on the transformed `c6/e5/f7` path.

The UI and diagnostic wording should avoid drawing or describing a Zone 5 edge pair when the full path instance does not exist.

## Rule 5: Prepare

Rule 5 applies from a White-to-move position when a candidate White move forces Black into Zone 5.

A move qualifies only if, after White plays it, every legal Black reply leaves the resulting position as a valid Zone 5 instance. The current position itself does not need to be Zone 5.

Reference examples:

- `Nc6+` from the preparation pattern qualifies when Black's legal replies are only `Ke8` and `Kf8`, and both reply positions have the knight on `c6` in the same path instance.
- A position with the knight on `d4` is not Zone 5, but `Nc6` can qualify as Rule 5 if every legal Black reply after `Nc6` is a Zone 5 instance.

## Rule 6: Hold

Rule 6 applies from a White-to-move position where Zone 5 already exists.

A move qualifies only if every legal Black reply remains in the same Zone 5 instance and the move progresses the hold plan:

- keep Black on the instance's zone pair;
- move White's king toward, or onto, the instance's target square;
- complete the derived knight handoff when the target/opposition pattern is ready.

The rule should not accept a move merely because Black's reply creates some unrelated transformed Zone 5. It should preserve the current instance.

## Flowchart Diagnostics

The red `rule gap` border should mark White-to-move flowchart nodes where the generated move is not chosen by an explicit knight-and-bishop rule under this path-instance definition.

This includes moves chosen only by the global tiebreaker. It should not mark `Nc6+` entry positions as gaps when every Black reply becomes a valid Zone 5 instance.

## Testing

Add tests for the reference orientation and at least one transformed equivalent:

- `c6`, `e5`, and `f7` are valid knight path squares.
- `f5` and `d4` are not Zone 5 squares.
- A White move from `d4` to `c6` can qualify as Rule 5 if every Black reply is Zone 5.
- Rule 5 fails if any Black reply is not a Zone 5 instance.
- Rule 6 fails if any Black reply leaves the current Zone 5 instance.
- The `knightBishopPrepare` `n0` move is not a rule gap once `Nc6+` is recognized as a Rule 5 entry.
