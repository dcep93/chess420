import Brain from "./Brain";
import { Familiarity, TraverseType } from "./Traverse";

export default function quizletF(t: TraverseType) {
  console.log(JSON.stringify(t));
  const headers = ["set_name", "term_word", "term_def", "term_def_image_url"];
  const rows = t.results
    .filter(
      (r) =>
        r.familiarity === Familiarity.ok || r.familiarity === Familiarity.bad
    )
    .sort((a, b) => b.odds - a.odds)
    .map((r) => {
      const fen = r.fen.split(" ")[0];
      const moveSans = r.logs.map((log) => log.san);
      if (r.logs.length > 0 && Brain.getChess(r.logs[0].fen).turn() === "b") {
        moveSans.unshift("...");
      }
      const movePairs = Array.from(
        new Array(Math.ceil(moveSans.length / 2))
      ).map((_, i) => [moveSans[2 * i], moveSans[2 * i + 1] || ""]);
      return {
        set_name: `chess ${new Date().toLocaleDateString()}`,
        term_word: `${movePairs.map((ms) => ms.join(" ")).join("\n")}\n${
          r.opening
        }`,
        term_def: `${r.bestMoveParts![0]}\n(${r.bestMoveParts!.join(" ")})`,
        term_def_image_url: `http://fen-to-image.com/image/${
          r.orientationIsWhite ? fen : fen.split("/").reverse().join("/")
        }`,
      } as { [k: string]: string };
    });
  const csv = [headers]
    .concat(rows.map((row) => headers.map((h) => row[h])))
    .map((csvRow) =>
      csvRow
        .map((csvCell) => JSON.stringify(csvCell).replaceAll("\\n", "\n"))
        .join(",")
    )
    .join("\n");
  console.log(csv);
  return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "chess420.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
