const timeSync = 0;

/**
 * Returns time passed from 1 January 1970 passed from 1 January 1970 in milliseconds, UTC
 * @returns number
 */
export function getTimeMilli(): number {
  const now = new Date().getTime();

  return Math.round(now + timeSync);
}

/**
 * Returns time passed from 1 January 1970 in seconds
 * @returns
 */
export function getTimeSec(): number {
  return Math.floor(getTimeMilli() / 1000);
}
