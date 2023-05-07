import Brain from "./Brain";

export default function Board(props: { brain: Brain }) {
  return (
    <div style={{ backgroundColor: "goldenrod" }}>
      <div style={{ margin: "auto", width: "80%" }}>
        <div
          style={{
            position: "relative",
            display: "flex",
          }}
        >
          <div
            style={{
              marginTop: "100%",
            }}
          ></div>
          <div
            style={{
              position: "absolute",
              height: "100%",
              width: "100%",
              display: "flex",
            }}
          >
            <SubBoard />
          </div>
        </div>
      </div>
    </div>
  );
}

function SubBoard() {
  return (
    <div style={{ border: "10px black solid", width: "100%" }}>subboard</div>
  );
}
