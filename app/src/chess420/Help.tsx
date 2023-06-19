import { useState } from "react";
import Brain from "./Brain";

export default function Help() {
  const topics = [
    // TODO chatgpt
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
      ],
    },
    { title: "How is a move's score calculated?", content: ["blah"] },
    { title: "What is a novelty?", content: ["blah"] },
    { title: "How do I memorize with Quizlet?", content: ["blah"] },
    { title: "Keyboard Shortcuts", content: ["blah"] },
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
      }}
    >
      <div>
        <h1>welcome to chess420</h1>
        <button onClick={() => Brain.updateShowHelp(false)}>
          close help screen
        </button>
      </div>
      {topics.map((topic, i) => (
        <div key={i}>
          <div
            style={{ cursor: "pointer" }}
            onClick={() => update(selected === i ? -1 : i)}
          >
            {topic.title}
          </div>
          {selected !== i ? null : (
            <div>
              {topic.content.map((text, j) => (
                <p key={j}>{text}</p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
