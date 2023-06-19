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
    </div>
  );
}
