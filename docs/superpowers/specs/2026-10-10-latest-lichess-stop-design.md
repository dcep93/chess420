# Latest Lichess import stopping conditions

Approved via `yesi` on 2026-10-10.

## Behavior

Advance the imported game until the earliest of these conditions:

- White is about to play a move different from the existing novelty-first,
  otherwise highest-statistical-score recommendation. Show the position before
  that move, regardless of the imported player's color.
- The current position has at most `settings.RARE_THRESHOLD` recorded games
  (currently 25), summing the explorer moves exactly as the summary does. Stop
  on that position, whether White or Black just moved.
- The imported game ends.

Rarity is checked before considering the next move, including at the final
position. Empty explorer results follow the existing summary behavior and count
as zero games. The existing Lichess request/error behavior remains in place.

## Approach

Extend the existing sequential fast-forward scan in Brain. Reuse `lichessF` and
its promise/cache sharing to fetch position counts, and use the existing
recommendation helper with White explicitly selected. Preserve the imported
board orientation, full history, and a single history update at the target.
Check cancellation after each asynchronous lookup so a superseded scan or a
changed view cannot load stale history.

Alternatives considered: a separate rarity threshold would disagree with the
displayed rare label; loading all positions in parallel would request positions
beyond the first stopping point. Neither is needed.

## Verification

Cover mistake-first and rare-first ordering, rarity after either color's move,
the inclusive threshold, Black-oriented imports, novelty recommendations,
zero-game results, full-game completion, and cancellation during lookups.
Run the app test suite and production build before committing and pushing main.
