import Brain, { View } from "./Brain";
import { isEndgameId } from "./Endgames";

export function assignBrainRoute(pathname: string): boolean {
  const pathParts = pathname.replace(/\/$/, "").split("/");
  switch (pathParts[1]) {
    case "lichess": {
      if (pathParts[3] === "latest") {
        Brain.view = View.lichess_latest;
      } else if (pathParts[3] === "vs") {
        Brain.view = View.lichess_vs;
      } else if (pathParts[3] === "mistakes") {
        Brain.view = View.lichess_mistakes;
      } else if (pathParts.length > 3) {
        return false;
      } else {
        // username is game_id
        Brain.view = View.lichess_id;
      }
      const username = pathParts[2];
      if (username === "") {
        return false;
      }
      Brain.lichessUsername = username;
      break;
    }
    case "speedrun":
      Brain.view = View.speedrun;
      if (pathParts.length > 2) {
        return false;
      }
      break;
    case "traps":
      Brain.view = View.traps;
      if (pathParts.length > 2) {
        return false;
      }
      break;
    case "traverse":
      Brain.view = View.traverse;
      if (pathParts.length > 2) {
        return false;
      }
      break;
    case "endgames": {
      Brain.view = View.endgame;
      if (pathParts.length === 2) {
        Brain.endgameId = undefined;
        break;
      }
      if (pathParts.length > 3) {
        return false;
      }
      if (pathParts[2] !== undefined && !isEndgameId(pathParts[2])) {
        return false;
      }
      Brain.endgameId = pathParts[2];
      break;
    }
    case undefined:
      if (pathParts.length > 1) {
        return false;
      }
      break;
    default:
      return false;
  }
  return true;
}
