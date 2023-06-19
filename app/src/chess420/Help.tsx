import Brain from "./Brain";

export default function Help() {
  return (
    <div
      onClick={() => Brain.updateShowHelp(false)}
      style={{
        backgroundColor: "#212529",
        color: "#f8f9fa",
        height: "100vH",
        width: "100vW",
        padding: "2em",
        cursor: "pointer",
      }}
    >
      <h1>welcome to chess420</h1>
    </div>
  );
}
