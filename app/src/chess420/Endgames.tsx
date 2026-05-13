export type EndgameId =
  | "knightAndBishop"
  | "twoBishops"
  | "twoKnightsVsPawn"
  | "rook"
  | "queen";

export type EndgameType = {
  id: EndgameId;
  label: string;
  fen: string;
  study?: {
    id: string;
    name: string;
    source: string;
    initialFen: string;
  };
};

export const ENDGAMES: EndgameType[] = [
  {
    id: "knightAndBishop",
    label: "Knight and Bishop",
    fen: "8/8/8/3k4/8/8/8/4KBN1 w - - 0 1",
    study: {
      id: "Swsb2uYm",
      name: "Knight +  Bishop mate - Easy Guide",
      source: "./studies/knight-and-bishop-mate-easy-guide.json",
      initialFen: "8/8/8/3k4/8/8/8/4KBN1 w - - 0 1",
    },
  },
  {
    id: "twoBishops",
    label: "Two Bishops",
    fen: "4k3/8/8/8/8/8/8/2B1KB2 w - - 0 1",
  },
  {
    id: "twoKnightsVsPawn",
    label: "Two Knights vs Pawn",
    fen: "4k3/p7/8/8/8/8/8/1N2K1N1 w - - 0 1",
  },
  {
    id: "rook",
    label: "Rook",
    fen: "8/8/8/8/4k3/8/8/R3K3 w - - 0 1",
  },
  {
    id: "queen",
    label: "Queen",
    fen: "8/8/8/8/4k3/8/8/3QK3 w - - 0 1",
  },
];

export const DEFAULT_ENDGAME_ID = ENDGAMES[0].id;

export function isEndgameId(id?: string): id is EndgameId {
  return ENDGAMES.some((endgame) => endgame.id === id);
}

export function getEndgame(id?: string): EndgameType {
  return (
    ENDGAMES.find((endgame) => endgame.id === id) ||
    ENDGAMES.find((endgame) => endgame.id === DEFAULT_ENDGAME_ID)!
  );
}
