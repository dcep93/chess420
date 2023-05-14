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
        <button onClick={Brain.startOver}>start over</button>
        <button onClick={Brain.newGame}>new game</button>
        <button onClick={Brain.help}>help</button>
      </div>
      <div>
        <button onClick={Brain.undo}>undo</button>
        <button onClick={Brain.redo}>redo</button>
      </div>
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
        <button
          disabled={Brain.getNovelty() === null}
          onClick={Brain.clearNovelty}
        >
          clear novelty
        </button>
        <button onClick={Brain.memorizeWithQuizlet}>
          memorize with Quizlet
        </button>
      </div>
      <div>
        <span>lichess: </span>
        <input
          defaultValue={Brain.getInitialState().lichessUsername}
          ref={Brain.lichessRef}
          style={{ width: "4em" }}
        />
        <span>
          <button onClick={Brain.findMistakes}>find mistakes</button>
          <button onClick={Brain.playVs}>play vs user</button>
        </span>
      </div>
    </div>
  );
}
