import React from "react";
import BrainC, { View } from "./BrainC";

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
            {BrainC.view !== undefined ? null : (
              <button onClick={BrainC.newGame}>new game</button>
            )}
            <button onClick={BrainC.undo}>undo</button>
            <button onClick={BrainC.redo}>redo</button>
          </div>
          {BrainC.view !== undefined ? null : (
            <>
              <div>
                <button onClick={BrainC.playBest}>play best</button>
                <button
                  ref={noveltyRef}
                  disabled={BrainC.getNovelty() === null}
                  onClick={() =>
                    Promise.resolve()
                      .then(BrainC.clearNovelty)
                      .then(() => (noveltyRef.current!.disabled = true))
                  }
                >
                  clear novelty
                </button>
              </div>
              <div>
                <button onClick={BrainC.playWeighted}>play weighted</button>
                <label style={{ paddingLeft: "10px" }}>
                  <input
                    ref={BrainC.autoreplyRef}
                    type={"checkbox"}
                    defaultChecked={true}
                  />
                  &nbsp;
                  <span>Auto Reply</span>
                </label>
              </div>
              <div>
                <button onClick={BrainC.memorizeWithQuizlet}>
                  memorize with Quizlet
                </button>
              </div>
            </>
          )}
        </div>
        <div>
          {BrainC.view === undefined ? (
            <>
              <div style={{ height: "1em" }}></div>
              <div>
                <span>lichess username: </span>
                <input
                  ref={lichessRef}
                  style={{ width: "4em" }}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <button
                  onClick={() => BrainC.playVs(lichessRef.current!.value)}
                >
                  play vs user
                </button>
                <button
                  onClick={() => BrainC.findMistakes(lichessRef.current!.value)}
                >
                  find mistakes
                </button>
                <button
                  onClick={() =>
                    BrainC.importLatestGame(lichessRef.current!.value)
                  }
                >
                  import latest
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                {BrainC.view === View.lichess ? (
                  <span>playing vs {BrainC.lichessUsername}</span>
                ) : BrainC.view === View.lichess_mistakes ? (
                  <span>finding mistakes of {BrainC.lichessUsername}</span>
                ) : BrainC.view === View.quizlet ? (
                  <span>building Quizlet data TODO progress</span>
                ) : null}
              </div>
              <div>
                <button onClick={BrainC.home}>home</button>
              </div>
            </>
          )}
        </div>
        <div style={{ height: "1em" }}></div>
      </div>
    </div>
  );
}
