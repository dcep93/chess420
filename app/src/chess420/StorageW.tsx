const version = "0.2.1";

export default class StorageW {
  static get(key: string): any {
    const raw = localStorage.getItem(getKey(key));
    if (raw === null) return null;
    return JSON.parse(raw);
  }

  static set(key: string, content: any) {
    const k = getKey(key);
    const v = JSON.stringify(content);
    setTimeout(() => localStorage.setItem(k, v));
  }
}

function getKey(key: string) {
  return `${version}/${key}`;
}
