import { useState } from "react";
import Brain from "./Brain";

export default function Help() {
  const topics = [
    {
      title: "What is chess420?",
      content: [
        "Traditional opening trainers often use a combination of engine analysis and human-curated descriptions to guide their users.\nchess420 uses neither, and intends to supplement other study methods, often by suggesting new lines or adding confidence to your existing repetoire.",
        "The primary appeal of chess420 is that outcomes of real lichess games are used to determine the strength of a move, not stockfish analysis or a human's opinion.\nFor example, of non-drawn games above 2000 ELO, the Bishop's Gambit line of the King's Gambit wins 55.7% of the time for white, despite stockfish evaluating at -0.9. Perhaps that opening isn't so bad!",
        "Lichess offers similar tools, but chess420 intends to provide value through quizzing the user, remembering your personal repetoire, and a custom scoring strategy independent of stockfish.",
      ],
    },
    {
      title: "How do I use it?",
      content: [
        "chess420 is a bit nicer on desktop, but should still be useful on mobile.",
        'You can always make a move on the board or click "play best". If you manually play a move, chess420 will remember this as a novelty, whether or not it\'s the best move in a position.\nThen, chess420 will report statistics about your move and automatically play a weighted move for the opponent, preferring to play more common moves.',
        "Personally, I like to idly click \"play best\" over and over again to watch a game play out, and I'll quiz myself in my head along the way.\nIf the best move is different to what I would have played, I'll either undo and manually play my preferred move as a novelty, or I'll look into that opening - perhaps I want to make a change to my repetoire!\nRecently this introduced me to the Benko Gambit as black, which performs quite well!",
        "Additionally, I'll always import my latest Lichess game after finishing so that I can find out where I went wrong!",
        "By the way, you can also play out a game to get to a position you want to practice (perhaps with turning off auto reply). Then refresh the page and watch the best moves repeatedly and press enter to start over against different opponent variations. It's a good way to drill a particular opening.",
      ],
    },
    {
      title: "How is a move's score calculated?",
      content: [
        "chess420 gives every move a raw score based on how often it wins decisive games and how often it's played. More commonly played moves are rewarded, and very uncommon moves are severely punished.",
        "After a raw score is calculated, we provide a final score equal to the ratio of the next-best move's raw score, with a cap at 420.",
        "You can check out the code here!\nhttps://github.com/dcep93/chess420/blob/main/app/src/chess420/getRawScore.tsx",
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
  return (
    <div
      style={{
        backgroundColor: "#212529",
        color: "#f8f9fa",
        height: "100vH",
        width: "100vW",
        padding: "2em",
        whiteSpace: "pre-wrap",
        overflow: "scroll",
      }}
    >
      <div>
        <h1>welcome to chess420 - help page</h1>
        <button onClick={() => Brain.updateShowHelp(false)}>
          close help screen
        </button>
        <div style={{ height: "3em" }}></div>
      </div>
      {topics.map((topic, i) => (
        <div key={i}>
          <div
            style={{
              cursor: "pointer",
              backgroundColor: "black",
              margin: "1em",
              padding: "1em",
              borderRadius: "1em",
            }}
            onClick={() => update(selected === i ? -1 : i)}
          >
            {topic.title}
          </div>
          {selected !== i ? null : (
            <div>
              {topic.content.map((text, j) => (
                <p key={j} style={{ paddingLeft: "5em", maxWidth: "60em" }}>
                  {text}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
