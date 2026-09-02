/*
 * Display formatting shared by the Fleet screens.
 *
 * Sizes are decimal (1 kB = 1000 B), the unit Kopia's own CLI prints, and
 * `relativeTime` deliberately mirrors the server's `relativeSince` thresholds
 * so a client-computed age never reads differently from a server-computed one.
 */

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

/** Bytes split into value and unit, the way a KPI tile shows them. */
export function splitBytes(n: number): [string, string] {
  let value = n;
  let i = 0;
  while (value >= 1000 && i < UNITS.length - 1) {
    value /= 1000;
    i++;
  }
  // 999.95 GB rounds to "1000.0" at one decimal, which belongs in the next
  // unit up; the loop cannot see it because it compares before rounding.
  if (i > 0 && i < UNITS.length - 1 && value.toFixed(1) === "1000.0") {
    value /= 1000;
    i++;
  }
  return [i === 0 ? String(Math.round(value)) : value.toFixed(1), UNITS[i]];
}

export function formatBytes(n: number): string {
  const [value, unit] = splitBytes(n);
  return `${value} ${unit}`;
}

/** Age of an ISO timestamp, in the server's wording (see fleet/api/overview.go). */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) {
    // A timestamp ahead of the browser's clock reads as "just now" rather than
    // a negative age; an unparseable one is not worth a special case.
    return "just now";
  }
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(ms / 3_600_000);
  return hours < 48 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
}

/**
 * Time left until an ISO timestamp, e.g. "41 min", "6 d"; "expired" once it is
 * past. The mirror of relativeTime, for deadlines rather than ages.
 */
export function relativeUntil(iso: string, now: number = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) {
    return "expired";
  }
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(ms / 3_600_000);
  return hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} d`;
}

/** How long a run took, e.g. "12s", "1m 12s", "2h 5m". */
export function formatDuration(startISO: string, endISO: string): string {
  const seconds = Math.max(0, Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 1000));
  if (!Number.isFinite(seconds)) {
    return "—";
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
