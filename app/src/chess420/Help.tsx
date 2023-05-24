import BrainC from "./BrainC";

export default function Help() {
  return (
    <div
      onClick={() => BrainC.updateShowHelp(false)}
      style={{
        position: "absolute",
        width: "100%",
        height: "100%",
        zIndex: 1,
      }}
    >
      TODO help
    </div>
  );
}
