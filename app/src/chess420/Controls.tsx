import Brain from "./Brain";

import css from "./controls.module.css";

export default function Controls(props: { brain: Brain }) {
  return (
    <div className={css.controls}>
      <div>
        <button onClick={props.brain.startOver}>start over</button>
        <button onClick={props.brain.newGame}>new game</button>
        <button onClick={props.brain.undo}>undo</button>
        <button onClick={props.brain.redo}>redo</button>
        <button onClick={props.brain.help}>help</button>
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
        <button onClick={props.brain.playBest}>play best</button>
      </div>
      <div>
        <button onClick={props.brain.differentWeightedMove}>
          different weighted move
        </button>
        <button onClick={props.brain.playWeighted}>play weighted</button>
      </div>
      <div>
        <button
          ref={props.brain.hasNoNovelty}
          onClick={props.brain.clearNovelty}
        >
          clear novelty
        </button>
        <button onClick={props.brain.memorizeWithQuizlet}>
          memorize with Quizlet
        </button>
      </div>
      <div>
        <button onClick={props.brain.findMistakes}>
          find my online mistakes
        </button>
      </div>
    </div>
  );
}
