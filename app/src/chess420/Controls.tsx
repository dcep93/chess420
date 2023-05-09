import Brain from "./Brain";

export default function Controls(props: { brain: Brain }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div>
        <button onClick={props.brain.startOver.bind(props.brain)}>
          start over
        </button>
        <button onClick={props.brain.newGame.bind(props.brain)}>
          new game
        </button>
        <button onClick={props.brain.undo.bind(props.brain)}>undo</button>
        <button onClick={props.brain.redo.bind(props.brain)}>redo</button>
        <button onClick={props.brain.help.bind(props.brain)}>help</button>
      </div>
      <div>
        <label style={{ paddingRight: "10px" }}>
          <input
            ref={props.brain.autoreply}
            type={"checkbox"}
            defaultChecked={true}
          />
          <span>Auto Reply</span>
        </label>
        <button onClick={props.brain.playBest.bind(props.brain)}>
          play best
        </button>
        <button onClick={props.brain.playWeighted.bind(props.brain)}>
          play weighted
        </button>
      </div>
      <div>
        <button
          disabled={props.brain.getNovelty() === null}
          onClick={props.brain.clearNovelty.bind(props.brain)}
        >
          clear novelty
        </button>
        <button onClick={props.brain.memorizeWithQuizlet.bind(props.brain)}>
          memorize with Quizlet
        </button>
      </div>
      <div>
        <button onClick={props.brain.findMistakes.bind(props.brain)}>
          find my online mistakes
        </button>
      </div>
    </div>
  );
}
