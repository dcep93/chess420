import Brain from "./Brain";

export default function Controls() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div>
        <button onClick={Brain.brain.startOver.bind(Brain.brain)}>
          start over
        </button>
        <button onClick={Brain.brain.newGame.bind(Brain.brain)}>
          new game
        </button>
        <button onClick={Brain.brain.help.bind(Brain.brain)}>help</button>
      </div>
      <div>
        <button onClick={Brain.brain.undo.bind(Brain.brain)}>undo</button>
        <button onClick={Brain.brain.redo.bind(Brain.brain)}>redo</button>
      </div>
      <div>
        <label style={{ paddingRight: "10px" }}>
          <input
            ref={Brain.brain.autoreplyRef}
            type={"checkbox"}
            defaultChecked={true}
          />
          <span>Auto Reply</span>
        </label>
        <button onClick={Brain.brain.playBest.bind(Brain.brain)}>
          play best
        </button>
        <button onClick={Brain.brain.playWeighted.bind(Brain.brain)}>
          play weighted
        </button>
      </div>
      <div>
        <button
          disabled={Brain.brain.getNovelty() === null}
          onClick={Brain.brain.clearNovelty.bind(Brain.brain)}
        >
          clear novelty
        </button>
        <button onClick={Brain.brain.memorizeWithQuizlet.bind(Brain.brain)}>
          memorize with Quizlet
        </button>
      </div>
      <div>
        <span>lichess: </span>
        <input ref={Brain.brain.lichessRef} style={{ width: "4em" }} />
        <span>
          <button onClick={Brain.brain.findMistakes.bind(Brain.brain)}>
            find mistakes
          </button>
          <button onClick={Brain.brain.playVs.bind(Brain.brain)}>
            play vs user
          </button>
        </span>
      </div>
    </div>
  );
}
