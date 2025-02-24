var tickets = 8;
const queue: (() => void)[] = [];
export function getTicket(): Promise<void> {
  if (tickets > 0) {
    tickets -= 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(resolve));
}

export function releaseTicket<T>(t: T) {
  const p = queue.shift();
  if (p) {
    p();
  } else {
    tickets += 1;
  }
  return t;
}
