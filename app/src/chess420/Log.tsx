import Brain from "./Brain";

export type LogType = {};

export default function Log(props: { brain: Brain }) {
  return <div style={{ backgroundColor: "red", height: "100%" }}>Log</div>;
}
