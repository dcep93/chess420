import to_md5_f from "md5";

import settings from "./Settings";

const MAX_LICHESS_STORED = 10000;

export default class StorageW {
  static getSizes() {
    const sizes = {
      lichess: 0,
      novelty: 0,
      json_length: JSON.stringify({ ...localStorage }).length,
    };
    Object.keys({ ...localStorage }).forEach(
      (k) =>
        sizes[
          k.split("/").reverse()[0].split(":")[0] as "lichess" | "novelty"
        ]++
    );
    return sizes;
  }

  static clear(maxSize: number) {
    const cached = getCacheEntries();
    for (const { key } of cached.slice(0, Math.max(0, cached.length - maxSize))) {
      localStorage.removeItem(key);
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
    if (content === null) {
      localStorage.removeItem(k);
      return;
    }
    const v = JSON.stringify(content);
    setWithCacheEviction(k, v);
  }

  static getLichess(key: string): any {
    const k = getLichessKey(key);
    const raw = localStorage.getItem(k);
    if (raw === null) return null;
    return JSON.parse(raw).content;
  }

  static setLichess(fen: string, content: any) {
    const k = getLichessKey(fen);
    const v = JSON.stringify({ content, timestamp: Date.now() });
    setTimeout(() => {
      try {
        StorageW.clear(MAX_LICHESS_STORED - 1);
        setWithCacheEviction(k, v);
      } catch {
        // The cache is optional; a failed write must not interrupt play.
      }
    });
  }
}

function getCacheEntries() {
  return Object.keys(localStorage)
    .filter((key) => key.startsWith(getKey("lichess:")))
    .map((key) => {
      let timestamp = 0;
      try {
        const entry = JSON.parse(localStorage.getItem(key)!);
        if (typeof entry?.timestamp === "number" && Number.isFinite(entry.timestamp)) {
          timestamp = entry.timestamp;
        }
      } catch {
        // Malformed cache entries can be discarded, never user novelties.
      }
      return { key, timestamp };
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

function setWithCacheEviction(key: string, value: string) {
  let cached: ReturnType<typeof getCacheEntries> | undefined;
  while (true) {
    try {
      localStorage.setItem(key, value);
      return;
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "QuotaExceededError") {
        throw error;
      }
      cached ??= getCacheEntries();
      const oldest = cached.shift();
      if (!oldest) throw error;
      localStorage.removeItem(oldest.key);
    }
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
