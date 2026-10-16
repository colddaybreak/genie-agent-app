/** Formats a Unix-seconds timestamp as a compact relative time. */
export function relativeTime(unixSeconds: number): string {
  const delta = Date.now() / 1000 - unixSeconds;
  if (delta < 60) return 'just now';
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86_400) return `${Math.floor(delta / 3600)}h ago`;
  if (delta < 86_400 * 7) return `${Math.floor(delta / 86_400)}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString();
}

export function formatCount(value: number): string {
  return value.toLocaleString();
}
