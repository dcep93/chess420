import React from "react";
import Brain, { View } from "./Brain";

export default function Controls() {
  const lichessRef = React.useRef<HTMLInputElement>(null);
  const noveltyRef = React.useRef<HTMLButtonElement>(null);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "1em",
      }}
    >
      <div>
        <h1>♟ chess420: opening trainer ♟</h1>
      </div>
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-around",
        }}
      >
        <div>
          <div>
            {Brain.view !== undefined ? null : (
              <button onClick={Brain.newGame}>new game</button>
            )}
            <button onClick={Brain.undo}>undo</button>
            <button onClick={Brain.redo}>redo</button>
          </div>
          {Brain.view !== undefined ? null : (
            <>
              <div>
                <button onClick={Brain.playBest}>play best</button>
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
              <div>
                <button onClick={Brain.playWeighted}>play weighted</button>
                <label style={{ paddingLeft: "10px" }}>
                  <input
                    ref={Brain.autoreplyRef}
                    type={"checkbox"}
                    defaultChecked={true}
                  />
                  &nbsp;
                  <span>Auto Reply</span>
                </label>
              </div>
              <div>
                <button onClick={Brain.help}>help</button>
                <button onClick={Brain.clearStorage}>clear storage</button>
              </div>
            </>
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-around",
          }}
        >
          {Brain.view === undefined ? (
            <>
              <div>
                <button onClick={Brain.memorizeWithQuizlet}>
                  memorize with Quizlet
                </button>
              </div>
              <div>
                <div>
                  <span>lichess username: </span>
                  <input
                    defaultValue={
                      localStorage.getItem("lichess_username") || undefined
                    }
                    ref={lichessRef}
                    style={{ width: "4em" }}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
                <div>
                  <button
                    onClick={() => Brain.playVs(lichessRef.current!.value)}
                  >
                    play vs user
                  </button>
                  <button
                    onClick={() =>
                      Brain.findMistakes(lichessRef.current!.value)
                    }
                  >
                    find mistakes
                  </button>
                  <button
                    onClick={() =>
                      Brain.importLatestGame(lichessRef.current!.value)
                    }
                  >
                    import latest
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <button onClick={Brain.home}>home</button>
              </div>
              <div>
                {Brain.view === View.lichess ? (
                  <span>playing vs {Brain.lichessUsername}</span>
                ) : Brain.view === View.lichess_mistakes ? (
                  <span>finding mistakes of {Brain.lichessUsername}</span>
                ) : Brain.view === View.quizlet ? (
                  <span>building Quizlet data</span>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
