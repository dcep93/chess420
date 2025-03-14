import to_md5_f from "md5";

import settings from "./Settings";

const MAX_LICHESS_STORED = 10000000;

export default class StorageW {
  static clear(maxSize: number) {
    while (true) {
      const lichessStored = Object.entries({ ...localStorage })
        .map(([kk, { timestamp }]) => ({
          kk,
          timestamp,
        }))
        .filter(({ timestamp }) => timestamp);
      if (lichessStored.length <= maxSize) {
        break;
      }
      const oldest = lichessStored.reduce(
        (prev, curr) => (prev.timestamp < curr.timestamp ? prev : curr),
        { kk: "", timestamp: Number.POSITIVE_INFINITY }
      );
      localStorage.removeItem(oldest.kk);
    }
  }

  static getNovelty(key: string): any {
    const k = getNoveltyKey(key);
    const raw = localStorage.getItem(k);
    if (raw === null) return null;
    return JSON.parse(raw);
  }

  static setNovelty(fen: string, content: any) {
    const k = getNoveltyKey(fen);
    const v = JSON.stringify(content);
    setTimeout(() => localStorage.setItem(k, v));
  }

  static getLichess(key: string): any {
    const k = getLichessKey(key);
    const raw = localStorage.getItem(k);
    if (raw === null) return null;
    return JSON.parse(raw).content;
  }

  static setLichess(fen: string, content: any) {
    StorageW.clear(MAX_LICHESS_STORED);
    const k = getLichessKey(fen);
    const v = JSON.stringify({ content, timestamp: Date.now() });
    setTimeout(() => localStorage.setItem(k, v));
  }
}

function getLichessKey(key: string) {
  const k = to_md5_f(key);
  return getKey(`lichess:${k}`);
}

function getNoveltyKey(key: string) {
  const k = to_md5_f(key);
  return getKey(`novelty:${k}`);
}

function getKey(key: string) {
  return `${settings.STORAGE_VERSION}/${key}`;
}
