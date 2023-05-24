import BrainC from "./BrainC";

export default function Help() {
  return (
    <div
      onClick={() => BrainC.updateShowHelp(false)}
      style={{
        position: "absolute",
        width: "100%",
        height: "100%",
        overflow: "scroll",
        zIndex: 1,
        padding: "2em",
        cursor: "pointer",
      }}
    >
      <h1>welcome to chess420</h1>
      <ol style={{ maxWidth: "40em" }}>
        <li>
          chess420 is an opening trainer that will play moves probabilistically
          based on common moves from the lichess database
        </li>
        <li>
          most opening explorers will train you against an engine like
          stockfish, but this one will train you against human moves
        </li>
        <li>
          the log has lots of information you can use to analyze your moves
          <ul>
            <li>
              s/score: this is a score out of a possible 420 representing the
              strength of the move (how often it wins)
            </li>
            <li>
              p/probability: this shows the probability this move will be played
            </li>
            <li>
              ww/white_win: this shows the probability that white wins (excludes
              drawn games)
            </li>
            <li>
              d/draws: this shows the probability that the game ends in a draw
            </li>
            <li>
              t/total: this shows the total number of games that reached this
              position
            </li>
          </ul>
        </li>
        <li>
          if you're on portrait view, you'll see additional logs for recent
          moves played, so you don't need to scroll so much
        </li>

        <li>
          when traversing through all positions, chess420 will tell you your
          progress as well as the odds of reaching a particular position
        </li>
        <ul>
          <li>
            if chess420 finds a wrong move, it will tell you its recommendation
            - click that message to continue the traversal
          </li>
        </ul>
        <li>chess420 has several dank features - try them out!</li>
        <ul>
          <li>
            start over (enter): this will return you to the original state for
            this chess420 page
          </li>
          <li>help (h): toggles this help screen</li>
          <li>new game (↓): switches colors and starts a new game</li>
          <li>undo (←): walks the previous action backwards</li>
          <li>redo (→): walks the undone action forwards</li>
          <li>
            clear novelty: you can tell chess420 your favorite move in a given
            position by holding shift while making your move - press "clear
            novelty" to remove this selection
          </li>
          <li>
            auto reply (a): toggles if your opponent should play
            probabilistically automatically
          </li>
          <li>
            play best (↑): plays the "best" move in a position, rewarding moves
            that frequently win and popular moves
          </li>
          <li>
            play weighted (w): plays a random move, weighted by popularity
          </li>
          <li>
            memorize with Quizlet: traverses through all positions that you're
            likely to see in a game - chess420 records all inferior moves and
            exports JSON to be saved to Quizlet and studied
          </li>
          <li>
            play vs user: enter a lichess username, and chess420 will play
            weighted random moves based on that user's account - try vs
            EricRosen
          </li>
          <li>
            find mistakes: enter your own lichess username - chess420 will
            traverse your games and show you common mistakes
          </li>
        </ul>
      </ol>
    </div>
  );
}
