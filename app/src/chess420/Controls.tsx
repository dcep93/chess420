import React from "react";
import Brain, { View } from "./Brain";
import StorageW from "./StorageW";

export default function Controls() {
  const lichessRef = React.useRef<HTMLInputElement>(null);
  const noveltyRef = React.useRef<HTMLButtonElement>(null);
  const viewLabel =
    Brain.view === View.lichess_vs
      ? `playing vs ${Brain.lichessUsername}`
      : Brain.view === View.lichess_mistakes
        ? `finding mistakes of ${Brain.lichessUsername}`
        : Brain.view === View.speedrun
          ? "speedrunning common moves"
          : Brain.view === View.traps
            ? "discovering potential traps"
            : Brain.view === View.traverse
              ? "traversing manually"
                            : "home";

  return (
    <div className="controls">
      <div className="controls__header">
        <h1>♟ chess420</h1>
        <span className="controls__subtitle">opening trainer</span>
        <div className="controls__status">{viewLabel}</div>
      </div>

      <div className="controls__grid">
        <section className="controls__section">
          <h2>Board Actions</h2>
          <div className="controls__buttons">
            <button onClick={Brain.newGame}>new game</button>
            <button onClick={Brain.undo}>undo</button>
            <button onClick={Brain.redo}>redo</button>
            <button onClick={Brain.playBest}>play best</button>
            <button onClick={Brain.playWeighted}>play weighted</button>
            <button
              ref={noveltyRef}
              disabled={Brain.getNovelty() === null}
              onClick={() =>
                Promise.resolve()
                  .then(Brain.clearNovelty)
                  .then(() => (noveltyRef.current!.disabled = true))
              }
            >
              clear novelty
            </button>
          </div>
          <label className="controls__checkbox">
            <input
              ref={Brain.autoreplyRef}
              type={"checkbox"}
              defaultChecked={
                ![
                  View.lichess_mistakes,
                  View.lichess_id,
                  View.traverse,
                  View.speedrun,
                ].includes(Brain.view)
              }
            />
            <span>Auto Reply</span>
          </label>
        </section>

        <section className="controls__section">
          <h2>Modes</h2>
          <div className="controls__buttons">
            <button onClick={Brain.traverse}>traverse manually</button>
            <button onClick={Brain.speedrun}>speedrun</button>
            <button onClick={Brain.traps}>traps</button>
            <button onClick={Brain.home}>home</button>
            <button onClick={Brain.help}>help</button>
            <button
              title={JSON.stringify(StorageW.getSizes(), null, 2)}
              onClick={Brain.clearStorage}
            >
              clear storage
            </button>
          </div>
        </section>

        <section className="controls__section">
          <h2>Lichess</h2>
          <div className="controls__field-group">
            <label htmlFor="lichess-username">username</label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                Brain.playVs(lichessRef.current!.value);
              }}
            >
              <input
                id="lichess-username"
                name={"lichessRef"}
                ref={lichessRef}
                onKeyDown={(e) => e.stopPropagation()}
                autoComplete={"on"}
                placeholder="lichess"
              />
            </form>
          </div>
          <div className="controls__buttons">
            <button onClick={() => Brain.playVs(lichessRef.current!.value)}>
              play vs user
            </button>
            <button onClick={() => Brain.findMistakes(lichessRef.current!.value)}>
              find mistakes
            </button>
            <button
              onClick={() => Brain.importLatestGame(lichessRef.current!.value)}
            >
              import latest
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
