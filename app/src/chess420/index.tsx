import Brain from "./Brain";

import Board from "./Board";
import Controls from "./Controls";
import Log from "./Log";

import css from "./index.module.css";
import Summary from "./Summary";

export default function main() {
  const brain = new Brain();
  return (
    <div
      className={css.responsiveFlexDirection}
      style={{ minHeight: "100vH", display: "flex" }}
    >
      <div style={{ minWidth: "20em" }}>
        <Board brain={brain} />
        <Summary brain={brain} />
      </div>
      <div
        style={{
          flexGrow: "1",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Controls brain={brain} />
        <div style={{ flexGrow: 1, display: "grid" }}>
          <Log brain={brain} />
        </div>
      </div>
    </div>
  );
}
