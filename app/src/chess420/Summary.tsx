import Brain from "./Brain";

export default function Summary() {
  const message = Brain.getState().message;
  if (message !== undefined) {
    return (
      <div style={{ position: "relative" }}>
        <pre onClick={message.f} style={{ position: "absolute" }}>
          {message.ms.join("\n")}
        </pre>
      </div>
    );
  }
  return (
    <div>TODO b summary {Brain.traversing ? "traversing" : "default"}</div>
  );
}
