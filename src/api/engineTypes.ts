/*
 * Wire types for the engine API - Kopia's own server API, which the agent runs
 * headless on loopback. These mirror the Go structs rather than the whole
 * surface: only what the agent page reads is modelled, so an unused field
 * changing upstream cannot break the build.
 *
 * Sources: internal/serverapi/serverapi.go, internal/uitask/uitask.go,
 * snapshot/manifest.go, snapshot/stats.go, snapshot/policy/scheduling_policy.go.
 */

/** snapshot.SourceInfo. */
export interface SourceInfo {
  host: string;
  userName: string;
  path: string;
}

/** snapshot.Stats - the size of the tree a snapshot covered, not what it uploaded. */
export interface SnapshotStats {
  totalSize: number;
  fileCount: number;
  errorCount: number;
}

/** snapshot.Manifest, as embedded in a source's `lastSnapshot`. */
export interface SnapshotManifest {
  id: string;
  source: SourceInfo;
  startTime: string;
  endTime: string;
  stats: SnapshotStats;
  /** Non-empty when the snapshot did not finish; such a run is not "good". */
  incomplete?: string;
}

/** policy.SchedulingPolicy - what the fleet admin told this device to do. */
export interface SchedulingPolicy {
  intervalSeconds?: number;
  timeOfDay?: { hour: number; min: number }[];
  cron?: string[];
  manual?: boolean;
}

/** The status strings sourceManager sets (internal/server/source_manager.go). */
export type SourceState = "IDLE" | "PENDING" | "UPLOADING" | "PAUSED";

/** serverapi.SourceStatus. */
export interface SourceStatus {
  source: SourceInfo;
  status: SourceState | string;
  schedule: SchedulingPolicy;
  lastSnapshot?: SnapshotManifest;
  nextSnapshotTime?: string;
  currentTask?: string;
}

/** serverapi.SourcesResponse. */
export interface SourcesResponse {
  localUsername: string;
  localHost: string;
  multiUser: boolean;
  sources: SourceStatus[];
}

/** serverapi.Snapshot - one entry of GET /snapshots. */
export interface Snapshot {
  id: string;
  description: string;
  startTime: string;
  endTime: string;
  incomplete?: string;
}

/** serverapi.SnapshotsResponse. */
export interface SnapshotsResponse {
  snapshots: Snapshot[];
  unfilteredCount: number;
  uniqueCount: number;
}

/** uitask.Status. */
export type TaskStatus = "RUNNING" | "CANCELING" | "CANCELED" | "SUCCESS" | "FAILED";

/** uitask.CounterValue. */
export interface CounterValue {
  value: number;
  units?: string;
  level?: string;
}

/** uitask.Info. `kind` is "Snapshot", "Maintenance", "Repository", ... */
export interface TaskInfo {
  id: string;
  startTime: string;
  endTime?: string;
  kind: string;
  description: string;
  status: TaskStatus;
  progressInfo: string;
  errorMessage?: string;
  counters: Record<string, CounterValue>;
}

/** serverapi.TaskListResponse. */
export interface TaskListResponse {
  tasks: TaskInfo[];
}

/**
 * One line of a task log. The server stores them as raw JSON written by the
 * logger, so every field is optional and `msg` is the only one worth showing.
 */
export interface TaskLogLine {
  ts?: number;
  level?: string;
  msg?: string;
}

/** serverapi.TaskLogResponse. */
export interface TaskLogResponse {
  logs: TaskLogLine[];
}

/**
 * GET /local/info - the engine's own endpoint (agent/engine/localauth.go), and
 * the only thing on this page that does not come from Kopia's API. Name and
 * group are labels; the target, its bucket and its keys are never served.
 */
export interface LocalInfo {
  name: string;
  group: string;
}
