import Brain from "./Brain";

export default function Summary() {
  const message = Brain.getState().message;
  if (message !== undefined) {
    return <pre onClick={message.f}>{message.m}</pre>;
  }
  return <div>TODO</div>;
}
