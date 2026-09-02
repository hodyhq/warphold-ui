import axios from "axios";
import type {
  LocalInfo,
  SourceInfo,
  SourcesResponse,
  SnapshotsResponse,
  TaskListResponse,
  TaskLogResponse,
} from "./engineTypes";

/*
 * The agent page talks to the engine, not to Fleet: Kopia's own server API on
 * loopback, plus the engine's own /local/info. It gets its own client rather
 * than reusing fleetClient because the two share nothing - different base
 * path, no CSRF double-submit (the engine has CSRF checks disabled and mints
 * no token), and a 401 here means "the local session cookie is gone", which
 * must not send the browser to the Fleet login page.
 */
export const engineClient = axios.create({
  // The session is the HttpOnly wh_local cookie the tray's /local/session
  // handoff sets; nothing about it is ever read by script.
  withCredentials: true,
});

async function get<T>(url: string): Promise<T> {
  return (await engineClient.get<T>(url)).data;
}

/** The query that names one source, as Kopia's handlers filter on it. */
function sourceQuery(source: SourceInfo): string {
  return new URLSearchParams({
    userName: source.userName,
    host: source.host,
    path: source.path,
  }).toString();
}

export const engine = {
  localInfo: () => get<LocalInfo>("/local/info"),

  sources: () => get<SourcesResponse>("/api/v1/sources"),
  snapshots: (source: SourceInfo) => get<SnapshotsResponse>(`/api/v1/snapshots?${sourceQuery(source)}`),
  tasks: () => get<TaskListResponse>("/api/v1/tasks"),
  taskLog: (id: string) => get<TaskLogResponse>(`/api/v1/tasks/${encodeURIComponent(id)}/logs`),

  /*
   * The three actions. Kopia filters each by the same query as above, and an
   * empty query means "every source", which is what this page offers: it acts
   * on the machine, not on one path.
   */
  async backupNow(): Promise<void> {
    await engineClient.post("/api/v1/sources/upload");
  },
  async pause(): Promise<void> {
    await engineClient.post("/api/v1/control/pause-source");
  },
  async resume(): Promise<void> {
    await engineClient.post("/api/v1/control/resume-source");
  },
};

/** A task log as text, one message per line. */
export function logText(response: TaskLogResponse): string {
  return response.logs.map((l) => l.msg ?? JSON.stringify(l)).join("\n");
}
