# Knight and Bishop Flowchart Loop Path Design

## Goal

When the dev-only `find a loop` button is used in knight-and-bishop endgame modes, it should load a concrete path that starts from a flowchart initial position and ends at the first detected cycle or failure. The search should be deterministic and biased toward branches likely to expose problems quickly.

## Scope

This change applies only to selected knight-and-bishop endgames:

- `knightAndBishop` searches only `FLOWCHART_DATA.knightBishopPrepare.starts`.
- `knightAndBishop+` searches only `FLOWCHART_DATA.knightBishop.starts`.
- Other endgames keep the current random loop search behavior.

The feature does not change move-generation rules, flowchart generation, visual flowchart layout, or normal endgame play.

## Recommended Approach

Add a path-oriented DFS search beside the existing aggregate cycle detector in `KnBCycleDetector.ts`.

The existing `findKnbCycles` summary API should remain available for scripts and tests that count reachable nodes, failures, and strongly connected components. The new API should return a single line that the UI can load:

- starting FEN
- SAN move list
- final result: `cycle`, `failure`, or `none`
- optional final FEN and failure reason
- small search stats such as expanded node count

This keeps the current detector stable while giving `Brain.findEndgameLoop()` the path-shaped result it needs.

## Start Selection

`Brain.findEndgameLoop()` should branch by selected endgame:

- `knightAndBishop`: call the new flowchart path search in prepare mode.
- `knightAndBishop+`: call the new flowchart path search in mate mode.
- everything else: keep `searchRandomEndgameLoops()`.

The path search should normalize starts with `Brain.boardTurnKey` so transpositions and FEN counters do not create false distinctions.

## Search Behavior

Use depth-first search from each selected flowchart start. Track both:

- a global discovered set to avoid repeatedly expanding the same position across branches
- a current stack index map to detect cycles on the active path

On each edge:

1. Apply the SAN move to produce the next board-turn key.
2. If the next key is already on the active stack, return a `cycle` result containing the full path including the closing move.
3. If the next key is outside the selected flowchart node set, return a `failure` result.
4. If the next position is a flowchart terminal failure, return a `failure` result.
5. Otherwise continue DFS.

Terminal success positions should stop that branch without reporting an issue.

## Move Ordering

White should use the existing knight-and-bishop ideal move policy, matching normal endgame behavior. When there is more than one ideal white move, order the resulting black-turn positions by descending black legal reply count so DFS enters high-branching positions first.

Black should search through legal replies in an order designed to expose issues quickly:

1. Prioritize replies whose resulting position has already appeared on the current DFS stack.
2. Then prioritize replies whose resulting position has been globally discovered.
3. Preserve the engine/library order as the final tie-breaker for deterministic behavior.

This applies the "many black options" heuristic before choosing which black-turn position to recurse into, while the seen-before bias applies inside Black's reply list. Together, those priorities make DFS explore broad defensive branches early and surface repeated positions as soon as possible.

## UI Behavior

The `find a loop` button remains dev-only and keeps the same label.

When a knight-and-bishop path is found, `Brain.loadEndgameLine(startingFen, moves)` loads it into the endgame history/log. The user lands at the start of the line and can step through the path with existing history controls.

If no cycle or failure is found, show an alert with concise stats and the selected flowchart mode.

## Error Handling

If a selected SAN cannot be applied or no policy move exists for a non-terminal branch, report that as a failure-like search result with the current path, because it indicates the path cannot be validated through the existing move rules.

Search should have a practical expansion cap to protect the UI thread. Hitting the cap returns `none` with stats instead of freezing the app.

## Tests

Add focused tests for:

- `knightAndBishop` uses prepare starts and `knightAndBishop+` uses mate starts.
- The DFS result can return a concrete path ending in a repeated board-turn key.
- Leaving the allowed flowchart node set returns a failure path.
- Black move ordering puts seen-before positions ahead of unseen positions.
- Existing `analyzeDirectedCycles` and `findKnbCycles` behavior remains intact.

## Non-Goals

- Do not rewrite flowchart generation.
- Do not change the normal endgame move policy.
- Do not expose this button outside dev mode.
- Do not alter behavior for non-knight-and-bishop endgames.
