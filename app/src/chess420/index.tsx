import Brain from "./Brain";

import Board from "./Board";
import Controls from "./Controls";
import Log from "./Log";

export default function main() {
  const brain = new Brain();
  return (
    <div>
      <Board brain={brain} />
      <Controls brain={brain} />
      <Log brain={brain} />
    </div>
  );
}
