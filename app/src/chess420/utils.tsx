import { useEffect } from "react";

const done: { [k: string]: boolean } = {};

export function DoOnce(key: string, f: () => void) {
  useEffect(() => {
    if (done[key]) return;
    done[key] = true;
    f();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function clog<T>(t: T): T {
  console.log(t);
  return t;
}

export function sleep<T>(t: T, duration: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(t), duration));
}
