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
      }}
    >
      <div>
        <button onClick={Brain.startOver}>start over</button>
        <button onClick={Brain.newGame}>new game</button>
        <button onClick={Brain.help}>help</button>
      </div>
      <div>
        <button onClick={Brain.undo}>undo</button>
        <button onClick={Brain.redo}>redo</button>
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
      {Brain.view === undefined ? (
        <>
          <div>
            <label style={{ paddingRight: "10px" }}>
              <input
                ref={Brain.autoreplyRef}
                type={"checkbox"}
                defaultChecked={true}
              />
              <span>Auto Reply</span>
            </label>
            <button onClick={Brain.playBest}>play best</button>
            <button onClick={Brain.playWeighted}>play weighted</button>
          </div>
          <div>
            <span>lichess: </span>
            <input ref={lichessRef} style={{ width: "4em" }} />
            <span>
              <button onClick={() => Brain.playVs(lichessRef.current!.value)}>
                play vs user
              </button>
              <button
                onClick={() => Brain.findMistakes(lichessRef.current!.value)}
              >
                find mistakes
              </button>
            </span>
          </div>
          <div>
            <button onClick={Brain.memorizeWithQuizlet}>
              memorize with Quizlet
            </button>
          </div>
        </>
      ) : (
        <>
          <div>
            {Brain.view === View.lichess ? (
              <span>playing vs {Brain.lichessUsername}</span>
            ) : Brain.view === View.lichess_mistakes ? (
              <span>finding mistakes of {Brain.lichessUsername}</span>
            ) : Brain.view === View.quizlet ? (
              <span>building Quizlet data</span>
            ) : null}
          </div>
          <div>
            <button onClick={Brain.escape}>escape</button>
          </div>
        </>
      )}
    </div>
  );
}
