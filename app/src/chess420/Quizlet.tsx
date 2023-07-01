import { Familiarity, TraverseType } from "./Traverse";

export default function quizletF(t: TraverseType) {
  console.log(JSON.stringify(t));
  const results = t.results
    .filter(
      (r) =>
        r.familiarity === Familiarity.ok || r.familiarity === Familiarity.bad
    )
    .map((r) => {
      const fen = r.fen.split(" ")[0];
      return {
        img_url: `http://fen-to-image.com/image/${
          r.orientationIsWhite ? fen : fen.split("/").reverse().join("/")
        }`,
      };
    });
}
