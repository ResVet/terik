/**
 * Keeps our own requests under Open-Meteo's free limit of 600 weighted calls
 * per minute. Each archive request declares its weight; when the last 60
 * seconds would go over budget, the caller waits and is told for how long.
 */

const WINDOW_MS = 60_000;
const BUDGET = 540; // leave headroom for forecast calls from the same browser

const spent: { at: number; weight: number }[] = [];

function used(now: number): number {
  while (spent.length && now - spent[0]!.at > WINDOW_MS) spent.shift();
  return spent.reduce((sum, s) => sum + s.weight, 0);
}

/** Milliseconds until `weight` fits in the window (0 if it fits now). */
export function waitFor(weight: number, now = Date.now()): number {
  let total = used(now);
  if (total + weight <= BUDGET) return 0;
  for (const s of spent) {
    total -= s.weight;
    if (total + weight <= BUDGET) return s.at + WINDOW_MS - now + 250;
  }
  return WINDOW_MS;
}

export function record(weight: number, now = Date.now()): void {
  spent.push({ at: now, weight });
}

/** Push the window back after the server says we went too fast. */
export function penalise(seconds: number, now = Date.now()): void {
  spent.push({ at: now + seconds * 1000 - WINDOW_MS, weight: BUDGET });
}
