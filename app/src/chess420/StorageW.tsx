const version = "0.0.1";

export default class StorageW {
  static get(key: string): any {
    const raw = localStorage.getItem(getKey(key));
    if (raw === null) return null;
    return JSON.parse(raw);
  }

  static set(key: string, content: any) {
    localStorage.setItem(getKey(key), JSON.stringify(content));
  }
}

function getKey(key: string) {
  return `${version}/${key}`;
}
