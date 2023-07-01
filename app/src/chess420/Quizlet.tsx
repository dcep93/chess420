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
      return {
        set_name: `chess ${new Date().toLocaleDateString()}`,
        term_word: `${r.movePairs.map((ms) => ms.join(" ")).join("\n")}\n${
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
    .map((csvRow) => csvRow.join(",").replaceAll("\n", "\\n"))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "test.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
