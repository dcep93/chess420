import to_md5_f from "md5";

import settings from "./Settings";

const MAX_LRU_SIZE = 1000;

export default class StorageW {
  static clear() {
    localStorage.clear();
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
    return JSON.parse(raw);
  }

  static setLichess(fen: string, content: any) {
    StorageW.updateLru(fen);
    const k = getLichessKey(fen);
    const v = JSON.stringify(content);
    setTimeout(() => localStorage.setItem(k, v));
  }

  static updateLru(fen: string) {
    const k = getLruKey();
    const kk = to_md5_f(fen);
    const stored = localStorage.getItem(k);
    if (!stored) {
      StorageW.clear();
    }
    const lru: { [kk: string]: number } =
      stored === null ? {} : JSON.parse(stored);
    if (!lru[kk] && Object.keys(lru).length > MAX_LRU_SIZE) {
      const oldest = Object.entries(lru)
        .map(([kk, timestamp]) => ({
          kk,
          timestamp,
        }))
        .reduce(
          (prev, curr) => (prev.timestamp < curr.timestamp ? prev : curr),
          { kk: "", timestamp: Number.POSITIVE_INFINITY }
        );
      delete lru[oldest.kk];
    }
    lru[kk] = Date.now();
    localStorage.setItem(k, JSON.stringify(lru));
  }
}

function getLruKey() {
  return getKey("lru:v1");
}

function getLichessKey(key: string) {
  return getKey(`lichess:${key}`);
}

function getNoveltyKey(key: string) {
  return getKey(`novelty:${key}`);
}

function getKey(key: string) {
  return `${settings.STORAGE_VERSION}/${key}`;
}
