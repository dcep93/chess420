import { useState } from "react";
import Brain from "./Brain";

export default function Help() {
  const bishopsGambitMoves = ["e4", "e5", "f4", "exf4", "Bc4"];
  const benkoGambitMoves = ["d4", "Nf6", "c4", "c5", "d5", "b5"];
  const openOpening = (sans: string[]) => {
    const fen = sans.reduce((currentFen, san) => Brain.getFen(currentFen, san), Brain.getFen());
    const hash = `w//${encodeURI(fen.replaceAll(" ", "_"))}`;
    Brain.updateShowHelp(false);
    window.location.assign(`/#${hash}`);
  };
  const topics = [
    {
      title: "What is chess420?",
      content: [
        "Traditional opening trainers often use a combination of engine analysis and human-curated descriptions to guide their users.\nchess420 uses neither, and intends to supplement other study methods, often by suggesting new lines or adding confidence to your existing repetoire.",
        <>
          The primary appeal of chess420 is that outcomes of real lichess games
          are used to determine the strength of a move, not stockfish analysis
          or a human&apos;s opinion.
          {"\n"}For example, of non-drawn games above 2000 ELO, the{" "}
          <button
            className="help-link"
            onClick={() => openOpening(bishopsGambitMoves)}
          >
            Bishop&apos;s Gambit
          </button>{" "}
          line of the King&apos;s Gambit wins 55.7% of the time for white,
          despite stockfish evaluating at -0.9. Perhaps that opening isn&apos;t
          so bad!
        </>,
        "Lichess offers similar tools, but chess420 intends to provide value through quizzing the user, remembering your personal repetoire, and a custom scoring strategy independent of stockfish.",
      ],
    },
    {
      title: "How do I use it?",
      content: [
        "chess420 is a bit nicer on desktop, but should still be useful on mobile.",
        'You can always make a move on the board or click "play best". If you manually play a move, chess420 will remember this as a novelty, whether or not it\'s the best move in a position.\nThen, chess420 will report statistics about your move and automatically play a weighted move for the opponent, preferring to play more common moves.',
        <>
          Personally, I like to idly click &quot;play best&quot; over and over
          again to watch a game play out, and I&apos;ll quiz myself in my head
          along the way.
          {"\n"}If the best move is different to what I would have played,
          I&apos;ll either undo and manually play my preferred move as a
          novelty, or I&apos;ll look into that opening - perhaps I want to make
          a change to my repetoire!{"\n"}Recently this introduced me to the{" "}
          <button
            className="help-link"
            onClick={() => openOpening(benkoGambitMoves)}
          >
            Benko Gambit
          </button>{" "}
          as black, which performs quite well!
        </>,
        "Additionally, I'll always import my latest Lichess game after finishing so that I can find out where I went wrong!",
        "By the way, you can also play out a game to get to a position you want to practice (perhaps with turning off auto reply). Then refresh the page and watch the best moves repeatedly and press enter to start over against different opponent variations. It's a good way to drill a particular opening.",
      ],
    },
    {
      title: "How is a move's score calculated?",
      content: [
        "chess420 gives every move a raw score based on how often it wins decisive games and how often it's played. More commonly played moves are rewarded, and very uncommon moves are severely punished.",
        "After a raw score is calculated, we provide a final score equal to the ratio of the next-best move's raw score, with a cap at 420.",
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
        'chess420 computes the best move in a position based on its score. But if you prefer your own repetoire, you can manually make a move on the board, and your novelty will be remembered.\nNext time you click "best move" in that position, your novelty will be played.',
        'If you made a mistake or change your mind, you can click "clear novelty" from a position, or click "clear storage" to remove all saved data from all positions (and cached lichess data too).',
      ],
    },
    {
      title: "What is the speedrun button?",
      content: [
        "In speedrunning mode, you can see the distribution of moves the are determined to be best, along with how often it is the best move.",
        "When just starting a new opening, it's a good idea to check these moves.",
      ],
    },
    {
      title: "How do I memorize with traverse manually?",
      content: [
        "Try it out!",
        "chess420 will traverse all likely positions from both sides of the board.\nIf a position has less than 1% chance of being reached from your opponent's moves, that line will be marked as complete, and you will go to the next line.",
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
              and the best ways to use it for opening study.
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
