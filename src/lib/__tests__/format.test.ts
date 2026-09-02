import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, relativeTime, splitBytes } from "../format";

const NOW = Date.parse("2026-09-02T12:00:00Z");

/** An ISO timestamp `ms` before NOW. */
function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

describe("splitBytes", () => {
  it("keeps whole bytes and switches unit at 1000", () => {
    expect(splitBytes(0)).toEqual(["0", "B"]);
    expect(splitBytes(999)).toEqual(["999", "B"]);
    expect(splitBytes(1000)).toEqual(["1.0", "KB"]);
    expect(formatBytes(1_200_000_000)).toBe("1.2 GB");
  });

  it("promotes a value that only rounds up to 1000", () => {
    // 999.95 GB would otherwise print as "1000.0 GB".
    expect(splitBytes(999_950_000_000)).toEqual(["1.0", "TB"]);
  });

  it("stops at the largest unit it knows", () => {
    expect(splitBytes(5e18)).toEqual(["5000.0", "PB"]);
  });
});

describe("relativeTime", () => {
  it("uses the server's wording and thresholds", () => {
    expect(relativeTime(ago(30_000), NOW)).toBe("just now");
    expect(relativeTime(ago(5 * 60_000), NOW)).toBe("5 min ago");
    expect(relativeTime(ago(3 * 3_600_000), NOW)).toBe("3 h ago");
    expect(relativeTime(ago(47 * 3_600_000), NOW)).toBe("47 h ago");
    expect(relativeTime(ago(72 * 3_600_000), NOW)).toBe("3 d ago");
  });

  it("never reads as a negative age", () => {
    expect(relativeTime(ago(-60 * 60_000), NOW)).toBe("just now");
  });
});

describe("formatDuration", () => {
  it("scales from seconds to hours", () => {
    expect(formatDuration(ago(12_000), ago(0))).toBe("12s");
    expect(formatDuration(ago(72_000), ago(0))).toBe("1m 12s");
    expect(formatDuration(ago(7_500_000), ago(0))).toBe("2h 5m");
  });

  it("clamps a run that finished before it started", () => {
    expect(formatDuration(ago(0), ago(5_000))).toBe("0s");
  });
});
