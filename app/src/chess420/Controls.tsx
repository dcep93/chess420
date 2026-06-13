import React from "react";
import Brain, { View } from "./Brain";
import { ENDGAME_OPTIONS, type EndgameId } from "./Endgames";
import { stats, subscribeToLichessStats } from "./Lichess";
import StorageW from "./StorageW";

export function hasDebugQueryParam(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).has("debug");
}

export function shouldShowEndgameLoopFinder(): boolean {
  return (
    Brain.view === View.endgame &&
    Brain.hasSelectedEndgame() &&
    hasDebugQueryParam()
  );
}

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
          {shouldShowEndgameLoopFinder() ? (
            <button onClick={Brain.findEndgameLoop}>find a loop</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function Controls() {
  const lichessRef = React.useRef<HTMLInputElement>(null);
  const fen = Brain.getState().fen;
  const [lichessRequests, updateLichessRequests] = React.useState(
    stats.requests
  );
  const [noveltyVersion, updateNoveltyVersion] = React.useState(0);
  const novelty = React.useMemo(() => {
    void noveltyVersion;
    return Brain.getNovelty(fen);
  }, [fen, noveltyVersion]);
  const refreshNovelty = () => updateNoveltyVersion((version) => version + 1);

  React.useEffect(() => {
    const unsubscribe = subscribeToLichessStats(() =>
      updateLichessRequests(stats.requests)
    );
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <div className="controls">
      <div className="controls__grid">
        <section className="controls__section controls__section--title">
          <Header />
        </section>

        <section className="controls__section">
          <div className="controls__section-top">
            <div className="controls__section-heading">
              <h2>Modes</h2>
              <button
                className="controls__help-button"
                onClick={Brain.help}
                aria-label="help"
                title="help"
              >
                ⓘ
              </button>
            </div>
          </div>
          <div className="controls__buttons controls__buttons--modes">
            <button onClick={Brain.traps}>traps</button>
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
              disabled={novelty === null}
              onClick={() => {
                Brain.clearNovelty();
                refreshNovelty();
              }}
            >
              clear novelty
            </button>
          </div>
        </section>

        <section className="controls__section">
          <div className="controls__section-top">
            <h2>Lichess</h2>
            <span className="controls__request-count">
              {lichessRequests} req
            </span>
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
            <button
              onClick={(event) =>
                Brain.playVs(lichessRef.current!.value, event)
              }
            >
              play vs user
            </button>
            <button
              onClick={(event) =>
                Brain.findMistakes(lichessRef.current!.value, event)
              }
            >
              find mistakes
            </button>
            <button
              onClick={(event) =>
                Brain.importLatestGame(lichessRef.current!.value, event)
              }
            >
              import latest
            </button>
            <button
              title={JSON.stringify(StorageW.getSizes(), null, 2)}
              onClick={() => {
                Brain.clearStorage();
                refreshNovelty();
              }}
            >
              clear storage
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
