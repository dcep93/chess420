import React from "react";
import Brain, { View } from "./Brain";
import { ENDGAME_OPTIONS, type EndgameId } from "./Endgames";
import StorageW from "./StorageW";

export function Header() {
  return (
    <div className="controls__header">
      <h1>♟ chess420 ♟</h1>
      <span className="controls__subtitle">opening trainer</span>
      {Brain.view === View.endgame ? (
        <div className="controls__endgame-tools">
          <select
            className="controls__endgame-select"
            value={Brain.endgameId ?? ""}
            onChange={(e) => {
              if (e.target.value === "") {
                Brain.endgames();
              } else {
                Brain.selectEndgame(e.target.value as EndgameId);
              }
            }}
          >
            <option value="">select endgame</option>
            {ENDGAME_OPTIONS.map((endgame) => (
              <option
                key={endgame.id}
                value={endgame.id}
                disabled={"disabled" in endgame && endgame.disabled}
              >
                {endgame.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

export default function Controls() {
  const lichessRef = React.useRef<HTMLInputElement>(null);
  const noveltyRef = React.useRef<HTMLButtonElement>(null);
  return (
    <div className="controls">
      <div className="controls__grid">
        <section className="controls__section controls__section--title">
          <Header />
        </section>

        <section className="controls__section">
          <div className="controls__section-top">
            <h2>Modes</h2>
          </div>
          <div className="controls__buttons controls__buttons--modes">
            <button onClick={Brain.help}>help</button>
            <button onClick={Brain.home}>home</button>
            <button onClick={Brain.speedrun}>cram</button>
            <button onClick={Brain.endgames}>endgames</button>
            <button className="controls__button--wide" onClick={Brain.traverse}>
              traverse manually
            </button>
          </div>
        </section>

        <section className="controls__section">
          <div className="controls__section-top">
            <h2>Board Actions</h2>
            <label className="controls__checkbox controls__checkbox--header">
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
          </div>
          <div className="controls__buttons">
            <button onClick={Brain.newGame}>new game</button>
            <button onClick={Brain.undo}>undo</button>
            <button onClick={Brain.playBest}>play best</button>
            <button onClick={Brain.redo}>redo</button>
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
        </section>

        <section className="controls__section">
          <div className="controls__section-top">
            <h2>Lichess</h2>
          </div>
          <div className="controls__buttons controls__buttons--lichess">
            <form
              className="controls__lichess-form"
              onSubmit={(e) => {
                e.preventDefault();
                Brain.playVs(lichessRef.current!.value);
              }}
            >
              <input
                id="lichess-username"
                name={"lichessRef"}
                ref={lichessRef}
                defaultValue={Brain.lichessUsername || ""}
                onKeyDown={(e) => e.stopPropagation()}
                autoComplete={"on"}
                placeholder="username"
                title="username"
              />
            </form>
            <button onClick={() => Brain.playVs(lichessRef.current!.value)}>
              play vs user
            </button>
            <button
              onClick={() => Brain.findMistakes(lichessRef.current!.value)}
            >
              find mistakes
            </button>
            <button
              onClick={() => Brain.importLatestGame(lichessRef.current!.value)}
            >
              import latest
            </button>
            <button
              title={JSON.stringify(StorageW.getSizes(), null, 2)}
              onClick={Brain.clearStorage}
            >
              clear storage
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
