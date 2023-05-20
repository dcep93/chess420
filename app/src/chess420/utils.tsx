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
