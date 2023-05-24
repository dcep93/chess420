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
      }}
    >
      <div>
        <button onClick={BrainC.startOver}>start over</button>
        <button onClick={BrainC.help}>help</button>
        {BrainC.view !== undefined ? null : (
          <button onClick={BrainC.newGame}>new game</button>
        )}
      </div>
      <div>
        <button onClick={BrainC.undo}>undo</button>
        <button onClick={BrainC.redo}>redo</button>
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
      {BrainC.view === undefined ? (
        <>
          <div>
            <label style={{ paddingRight: "10px" }}>
              <input
                ref={BrainC.autoreplyRef}
                type={"checkbox"}
                defaultChecked={true}
              />
              <span>Auto Reply</span>
            </label>
            <button onClick={BrainC.playBest}>play best</button>
            <button onClick={BrainC.playWeighted}>play weighted</button>
          </div>
          <div>
            <button onClick={BrainC.memorizeWithQuizlet}>
              memorize with Quizlet
            </button>
          </div>
          <div>
            <span>lichess: </span>
            <input
              ref={lichessRef}
              style={{ width: "4em" }}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <span>
              <button onClick={() => BrainC.playVs(lichessRef.current!.value)}>
                play vs user
              </button>
              <button
                onClick={() => BrainC.findMistakes(lichessRef.current!.value)}
              >
                find mistakes
              </button>
            </span>
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
              <span>building Quizlet data</span>
            ) : null}
          </div>
          <div>
            <button onClick={BrainC.escape}>escape</button>
          </div>
        </>
      )}
    </div>
  );
}
