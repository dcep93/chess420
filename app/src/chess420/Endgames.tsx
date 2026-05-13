export type BaseEndgameId =
  | "knightAndBishop"
  | "twoBishops"
  | "twoKnightsVsPawn"
  | "rook"
  | "queen";

export type EndgameId =
  | BaseEndgameId
  | "knightAndBishop+"
  | "twoBishops+"
  | "rook+"
  | "queen+";

export type EndgameType = {
  id: EndgameId;
  label: string;
  fen: string;
  baseId?: BaseEndgameId;
  disabled?: true;
  plusFen?: string;
  plusFens?: string[];
  study?: {
    id: string;
    name: string;
    source: string;
    initialFen: string;
  };
};

export type EndgameOptionType =
  | EndgameType
  | {
      id: "twoKnightsVsPawn+";
      label: string;
      disabled: true;
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
    id: "knightAndBishop+",
    label: "Knight and Bishop +",
    baseId: "knightAndBishop",
    fen: "7k/8/5K2/6N1/4B3/8/8/8 w - - 42 22",
    plusFen: "7k/8/5K2/6N1/4B3/8/8/8 w - - 42 22",
  },
  {
    id: "twoBishops",
    label: "Two Bishops",
    fen: "4k3/8/8/8/8/8/8/2B1KB2 w - - 0 1",
  },
  {
    id: "twoBishops+",
    label: "Two Bishops +",
    baseId: "twoBishops",
    fen: "4k3/8/4K3/3BB3/8/8/8/8 w - - 38 20",
    plusFen: "4k3/8/4K3/3BB3/8/8/8/8 w - - 38 20",
    plusFens: [
      "4k3/8/4K3/3BB3/8/8/8/8 w - - 38 20",
      "3k4/8/4K3/3BB3/8/8/8/8 w - - 44 23",
    ],
  },
  {
    id: "twoKnightsVsPawn",
    label: "Two Knights vs Pawn",
    disabled: true,
    fen: "4k3/p7/8/8/8/8/8/1N2K1N1 w - - 0 1",
  },
  {
    id: "rook",
    label: "Rook",
    fen: "8/8/8/8/4k3/8/8/R3K3 w - - 0 1",
  },
  {
    id: "rook+",
    label: "Rook +",
    baseId: "rook",
    fen: "8/8/8/8/5k2/R7/5K2/8 w - - 0 1",
    plusFen: "8/8/8/8/5k2/R7/5K2/8 w - - 0 1",
  },
  {
    id: "queen",
    label: "Queen",
    fen: "8/8/8/8/4k3/8/8/3QK3 w - - 0 1",
  },
  {
    id: "queen+",
    label: "Queen +",
    baseId: "queen",
    fen: "8/2K5/8/8/1Q6/4k3/8/8 w - - 30 16",
    plusFen: "8/2K5/8/8/1Q6/4k3/8/8 w - - 30 16",
  },
];

export const ENDGAME_OPTIONS: EndgameOptionType[] = ENDGAMES.flatMap((endgame) =>
  endgame.id === "twoKnightsVsPawn"
    ? [
        endgame,
        {
          id: "twoKnightsVsPawn+",
          label: "Two Knights vs Pawn +",
          disabled: true,
        },
      ]
    : [endgame],
);

export const DEFAULT_ENDGAME_ID = ENDGAMES[0].id;

export function isEndgameId(id?: string): id is EndgameId {
  return ENDGAMES.some((endgame) => endgame.id === id && !endgame.disabled);
}

export function getBaseEndgameId(id?: EndgameId): BaseEndgameId {
  return getEndgame(id).baseId || (getEndgame(id).id as BaseEndgameId);
}

export function getBaseEndgame(id?: EndgameId): EndgameType {
  return getEndgame(getBaseEndgameId(id));
}

export function getEndgame(id?: string): EndgameType {
  return (
    ENDGAMES.find((endgame) => endgame.id === id) ||
    ENDGAMES.find((endgame) => endgame.id === DEFAULT_ENDGAME_ID)!
  );
}
