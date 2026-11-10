/** Buzz where supported (Android Chrome and friends). Silently does nothing elsewhere. */
export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Some browsers throw when vibration is blocked by policy.
  }
}
