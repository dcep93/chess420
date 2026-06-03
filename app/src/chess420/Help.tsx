import { useState } from "react";
import Brain, { type StateType } from "./Brain";
import { type LogType } from "./Log";

export default function Help() {
  const bishopsGambitMoves = ["e4", "e5", "f4", "exf4", "Bc4"];
  const benkoGambitMoves = ["d4", "Nf6", "c4", "c5", "d5", "b5"];
  const openOpening = (sans: string[], orientationIsWhite = true) => {
    const initialState: StateType = {
      fen: Brain.getFen(),
      startingFen: undefined,
      orientationIsWhite,
      logs: [] as LogType[],
    };
    const states = sans.reduce(
      (acc, san) => acc.concat(Brain.genState(acc[acc.length - 1], san)),
      [initialState],
    );
    const currentState = states[states.length - 1];
    const hash = ["w", currentState.fen.replaceAll(" ", "_")].join("//");

    window.history.pushState({}, "", `/#${hash}`);
    Brain.lichessUsername = undefined;
    // root route is the "home" app state
    Brain.view = undefined as never;
    Brain.updateShowHelp(false);
    clearTimeout(Brain.timeout);
    Brain.updateHistory({
      index: 0,
      states: states
        .slice()
        .reverse()
        .concat(Brain.history.states.slice(Brain.history.index)),
    });
    Brain.maybeReply(currentState);
  };
  const topics = [
    {
      title: "What is chess420?",
      content: [
        "Traditional opening trainers often use engine analysis and human-curated descriptions to guide their users.\nchess420 uses neither. It is meant to supplement other study methods by suggesting new lines and adding confidence to your existing repertoire.",
        <>
          The primary appeal of chess420 is that outcomes of real Lichess games
          are used to determine the strength of a move, not Stockfish analysis
          or a human&apos;s opinion.
          {"\n"}For example, of non-drawn games above 2000 Elo, the{" "}
          <button
            className="help-link"
            onClick={() => openOpening(bishopsGambitMoves, true)}
          >
            Bishop&apos;s Gambit
          </button>{" "}
          line of the King&apos;s Gambit wins 55.7% of the time for White,
          despite Stockfish evaluating at -0.9. Perhaps that opening isn&apos;t
          so bad!
        </>,
        "Lichess offers similar tools, but chess420 adds value through quizzing, remembering your personal repertoire, and using a custom scoring strategy independent of Stockfish.",
      ],
    },
    {
      title: "How do I use it?",
      content: [
        "chess420 is a bit nicer on desktop, but should still be useful on mobile.",
        'You can always make a move on the board or click "play best". If you manually play a move, chess420 will remember it as a novelty, whether or not it is the best move in the position.\nThen chess420 reports statistics about your move and automatically plays a weighted move for the opponent, preferring common moves.',
        <>
          Personally, I like to idly click &quot;play best&quot; over and over
          again to watch a game play out, and I&apos;ll quiz myself in my head
          along the way.
          {"\n"}If the best move is different from what I would have played,
          I&apos;ll either undo and manually play my preferred move as a
          novelty, or I&apos;ll look into that opening - perhaps I want to make
          a change to my repertoire!{"\n"}Recently this introduced me to the{" "}
          <button
            className="help-link"
            onClick={() => openOpening(benkoGambitMoves, false)}
          >
            Benko Gambit
          </button>{" "}
          as Black, which performs quite well!
        </>,
        "After a game, import your latest Lichess game to see where the statistical move choices started going against you.",
        "You can also play out a game to reach a position you want to practice, optionally with auto reply off. Refresh the page, watch the best moves from that position, and press enter to start over against different opponent variations. It is a good way to drill a particular opening.",
      ],
    },
    {
      title: "What is endgame mode?",
      content: [
        "Endgame mode is in beta. It trains you to pick simple human moves that lead to checkmate, instead of asking you to memorize engine-perfect tablebase lines.",
        "There are other endgame tools, and especially many excellent guides. This free combination is meant to sit beside them: it includes a checklist priority guide, a timer, random position starts, and close-to-mate training wheels.",
      ],
    },
    {
      title: "How is a move's score calculated?",
      content: [
        "chess420 gives every move a raw score based on how often it wins decisive games and how often it is played. Common moves are rewarded, and very uncommon moves are heavily discounted.",
        "After a raw score is calculated, chess420 shows a final score equal to the ratio against the next-best move's raw score, with a cap at 420.",
        <>
          You can check out the code here!
          {"\n"}
          <a
            className="help-link"
            href="https://github.com/dcep93/chess420/blob/main/app/src/chess420/getRawScore.tsx"
            target="_blank"
            rel="noreferrer"
          >
            https://github.com/dcep93/chess420/blob/main/app/src/chess420/getRawScore.tsx
          </a>
        </>,
      ],
    },
    {
      title: "What is a novelty?",
      content: [
        'chess420 computes the best move in a position based on its score. But if you prefer your own repertoire, you can manually make a move on the board, and your novelty will be remembered.\nNext time you click "play best" in that position, your novelty will be played.',
        'If you made a mistake or change your mind, click "clear novelty" from that position. Click "clear storage" to remove all saved data from all positions, including cached Lichess data.',
      ],
    },
    {
      title: "What is the speedrun button?",
      content: [
        "Speedrun mode shows the distribution of moves that are determined to be best, along with how often each move is the best move.",
        "When you are starting a new opening, it is a good way to see which moves deserve early attention.",
      ],
    },
    {
      title: "What is traps mode?",
      content: [
        "Traps mode searches forward from the current position and looks for lines where your opponent is likely to choose a move that improves your result.",
        "Your own move probabilities are ignored in the trap probability because those choices are under your control. Opponent move probabilities do count, so the table favors lines your opponent is likely to enter if you steer the game there.",
        "The search is capped at 100 new Lichess requests per run. Within that cap, chess420 prioritizes positions with more recorded games so the search spends time on better-supported lines first.",
      ],
    },
    {
      title: "How do I memorize with traverse manually?",
      content: [
        "Traverse manually is for memorizing the positions that are most likely to matter in your repertoire.",
        "chess420 will traverse likely positions from both sides of the board.\nIf a position has less than 1% chance of being reached from your opponent's moves, that line will be marked as complete, and you will go to the next line.",
        "You can click that you don't know what move to make, or you can play a move on the board.\nIf you didn't play the best move, chess420 will remember that position for you, and you'll go to a new line. Alternatively, you can also save your move as a novelty and keep going.",
        "After going through all positions (usually takes about 15 minutes), chess420 will give you instructions to save this data to your Quizlet account.\nThen you can use Quizlet's tools to help you memorize tricky positions!",
      ],
    },
    {
      title: "Keyboard Shortcuts",
      content: [
        "⬆: play best move",
        "⬇: start a new game",
        "⬅: undo",
        "⮕: redo",
        "enter: go to original position",
        "w: play weighted move",
        "a: toggle autoreply",
        "h: toggle help menu",
        "esc: home",
      ],
    },
  ];
  const [selected, update] = useState(0);
  const activeTopic = topics[selected] ?? topics[0];
  return (
    <div className="help-screen">
      <div className="help-shell">
        <section className="help-hero">
          <div className="help-hero__copy">
            <span className="help-kicker">Guide</span>
            <h1>welcome to chess420</h1>
            <p>
              Learn the philosophy behind the trainer, how the scoring works,
              and the best ways to use it for opening and endgame study.
            </p>
          </div>
          <button
            className="help-close-button"
            onClick={() => Brain.updateShowHelp(false)}
          >
            close help
          </button>
        </section>

        <div className="help-layout">
          <nav className="help-nav" aria-label="Help topics">
            {topics.map((topic, i) => (
              <button
                key={topic.title}
                className={`help-topic ${selected === i ? "help-topic--active" : ""}`}
                onClick={() => update(i)}
              >
                <span className="help-topic__index">{String(i + 1).padStart(2, "0")}</span>
                <span className="help-topic__title">{topic.title}</span>
              </button>
            ))}
          </nav>

          <article className="help-article">
            <div className="help-article__header">
              <span className="help-article__eyebrow">Topic</span>
              <h2>{activeTopic.title}</h2>
            </div>
            <div className="help-article__body">
              {activeTopic.content.map((text, i) => (
                <p key={i}>{text}</p>
              ))}
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
