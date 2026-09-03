import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { AgentHome } from "../AgentHome";
import type { SourceStatus, Snapshot, TaskInfo } from "../../../api/engineTypes";

const localInfo = vi.fn();
const sources = vi.fn();
const snapshots = vi.fn();
const tasks = vi.fn();
const taskLog = vi.fn();
const backupNow = vi.fn();
const pause = vi.fn();
const resume = vi.fn();

vi.mock(import("../../../api/engine"), async (importOriginal) => ({
  ...(await importOriginal()),
  engine: {
    localInfo: () => localInfo(),
    sources: () => sources(),
    snapshots: (s: unknown) => snapshots(s),
    tasks: () => tasks(),
    taskLog: (id: string) => taskLog(id),
    backupNow: () => backupNow(),
    pause: () => pause(),
    resume: () => resume(),
  } as unknown as typeof import("../../../api/engine").engine,
}));

const DAY_MS = 86_400_000;

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function source(path: string, totalSize: number, over: Partial<SourceStatus> = {}): SourceStatus {
  return {
    source: { host: "laptop-1", userName: "user", path },
    status: "IDLE",
    schedule: { intervalSeconds: 3600 },
    lastSnapshot: {
      id: `k${path}`,
      source: { host: "laptop-1", userName: "user", path },
      startTime: hoursAgo(1),
      endTime: hoursAgo(1),
      stats: { totalSize, fileCount: 10, errorCount: 0 },
    },
    nextSnapshotTime: new Date(Date.UTC(2030, 0, 1, 21, 0, 0)).toISOString(),
    ...over,
  };
}

/** 300 GB + 112 GB, so the Protected tile has a sum to get wrong. */
const SOURCES: SourceStatus[] = [
  source("/home/user", 300_000_000_000),
  source("/etc", 112_000_000_000, { schedule: { timeOfDay: [{ hour: 3, min: 0 }] } }),
];

function snapshot(endTime: string, over: Partial<Snapshot> = {}): Snapshot {
  return { id: `s${endTime}`, description: "", startTime: endTime, endTime, ...over };
}

/** Three distinct days, one of them only an interrupted run. */
const SNAPSHOTS: Snapshot[] = [
  snapshot(hoursAgo(1)),
  snapshot(daysAgo(1)),
  snapshot(daysAgo(2)),
  snapshot(daysAgo(5), { incomplete: "canceled" }),
];

function task(over: Partial<TaskInfo> & Pick<TaskInfo, "id">): TaskInfo {
  return {
    startTime: hoursAgo(1),
    endTime: hoursAgo(1),
    kind: "Snapshot",
    description: `user@laptop-1:/home/user at ${hoursAgo(1)}`,
    status: "SUCCESS",
    progressInfo: "",
    counters: { "Uploaded Bytes": { value: 38_000_000, units: "bytes" } },
    ...over,
  };
}

const TASKS: TaskInfo[] = [
  task({ id: "t2" }),
  task({
    id: "t1",
    startTime: hoursAgo(3),
    endTime: hoursAgo(3),
    description: "Periodic maintenance",
    kind: "Maintenance",
  }),
];

beforeEach(() => {
  vi.clearAllMocks();
  localInfo.mockResolvedValue({ name: "laptop-1", group: "Laptops" });
  sources.mockResolvedValue({ localUsername: "user", localHost: "laptop-1", multiUser: false, sources: SOURCES });
  snapshots.mockResolvedValue({ snapshots: SNAPSHOTS, unfilteredCount: 4, uniqueCount: 4 });
  tasks.mockResolvedValue({ tasks: TASKS });
  taskLog.mockResolvedValue({ logs: [{ msg: "snapshot completed" }, { msg: "2 files skipped" }] });
  backupNow.mockResolvedValue(undefined);
  pause.mockResolvedValue(undefined);
  resume.mockResolvedValue(undefined);
});

describe("AgentHome", () => {
  it("names the device in the header, not the engine's address", async () => {
    render(<AgentHome />);

    expect(await screen.findByText("agent · laptop-1")).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(window.location.host))).not.toBeInTheDocument();
  });

  it("says OK with the age of the last good backup, and labels the vault", async () => {
    render(<AgentHome />);

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("OK");
    expect(heading).toHaveTextContent("last good backup 1 h ago");
    expect(screen.getByText("Laptops · laptop-1")).toBeInTheDocument();
  });

  it("sums the latest snapshot sizes into Protected", async () => {
    render(<AgentHome />);

    const kpi = await screen.findByTestId("kpi-protected");
    expect(within(kpi).getByText("412.0")).toBeInTheDocument();
    expect(within(kpi).getByText("GB")).toBeInTheDocument();
  });

  it("counts only the days with a complete snapshot in the 30-day strip", async () => {
    render(<AgentHome />);

    // Four snapshots over four days, one of them interrupted.
    expect(await screen.findByText("3 of 30 days with a good backup")).toBeInTheDocument();
  });

  it("lists the sources by path and schedule, and never the target", async () => {
    render(<AgentHome />);

    const list = await screen.findByTestId("sources");
    expect(within(list).getByText("/home/user")).toBeInTheDocument();
    expect(within(list).getByText("/etc")).toBeInTheDocument();
    expect(within(list).getByText("every 1 h")).toBeInTheDocument();
    expect(within(list).getByText("at 03:00")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/bucket|b2:|s3:|secret|key/i);
  });

  it("says ATTENTION when the newest run failed", async () => {
    tasks.mockResolvedValue({
      tasks: [task({ id: "t3", status: "FAILED", errorMessage: "unable to write blob" }), ...TASKS],
    });

    render(<AgentHome />);

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("ATTENTION");
    expect(heading).toHaveTextContent("unable to write blob");
  });

  it("stays OK when a source's latest run was interrupted but an older one is good", async () => {
    sources.mockResolvedValue({
      localUsername: "user",
      localHost: "laptop-1",
      multiUser: false,
      sources: [{ ...SOURCES[0], lastSnapshot: { ...SOURCES[0].lastSnapshot!, incomplete: "canceled" } }],
    });
    snapshots.mockResolvedValue({
      snapshots: [snapshot(hoursAgo(1), { incomplete: "canceled" }), snapshot(hoursAgo(9))],
      unfilteredCount: 2,
      uniqueCount: 2,
    });

    render(<AgentHome />);

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("OK");
    expect(heading).toHaveTextContent("last good backup 9 h ago");
  });

  it("says ATTENTION when a source has never backed up", async () => {
    sources.mockResolvedValue({
      localUsername: "user",
      localHost: "laptop-1",
      multiUser: false,
      sources: [SOURCES[0], { ...SOURCES[1], lastSnapshot: undefined }],
    });
    // The second source has never produced a snapshot, so its query is empty.
    snapshots.mockImplementation((s: { path: string }) =>
      Promise.resolve(
        s.path === "/etc"
          ? { snapshots: [], unfilteredCount: 0, uniqueCount: 0 }
          : { snapshots: SNAPSHOTS, unfilteredCount: 4, uniqueCount: 4 },
      ),
    );

    render(<AgentHome />);

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "1 of 2 sources have no good backup yet",
    );
  });

  it("expands a run to its log and collapses it again", async () => {
    render(<AgentHome />);

    const row = await screen.findByText("/home/user", { selector: "div[data-row] span" });
    expect(screen.queryByTestId("run-log")).not.toBeInTheDocument();

    await userEvent.click(row);

    expect(taskLog).toHaveBeenCalledWith("t2");
    expect(await screen.findByTestId("run-log")).toHaveTextContent("snapshot completed");
    expect(screen.getByTestId("run-log")).toHaveTextContent("2 files skipped");

    await userEvent.click(row);

    expect(screen.queryByTestId("run-log")).not.toBeInTheDocument();
  });

  it("shows no uploaded bytes rather than throwing when a task has no counters", async () => {
    tasks.mockResolvedValue({
      tasks: [task({ id: "t2", counters: undefined as unknown as TaskInfo["counters"] })],
    });

    render(<AgentHome />);

    const row = await screen.findByText("/home/user", { selector: "div[data-row] span" });
    expect(within(row.closest("div[data-row]") as HTMLElement).getByText("—")).toBeInTheDocument();
  });

  it("starts a backup and re-reads the engine", async () => {
    render(<AgentHome />);

    await userEvent.click(await screen.findByRole("button", { name: /back up now/i }));

    expect(backupNow).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("status")).toHaveTextContent("Backup started.");
    await waitFor(() => expect(sources).toHaveBeenCalledTimes(2));
  });

  it("pauses every source, and offers Resume once they are paused", async () => {
    // Only the first read is unpaused: the re-read the action triggers is what
    // flips the toggle, exactly as it would against a live engine.
    sources.mockResolvedValue({
      localUsername: "user",
      localHost: "laptop-1",
      multiUser: false,
      sources: SOURCES.map((s) => ({ ...s, status: "PAUSED" })),
    });
    sources.mockResolvedValueOnce({
      localUsername: "user",
      localHost: "laptop-1",
      multiUser: false,
      sources: SOURCES,
    });

    render(<AgentHome />);

    await userEvent.click(await screen.findByRole("button", { name: /^pause$/i }));

    expect(pause).toHaveBeenCalledTimes(1);
    expect(resume).not.toHaveBeenCalled();

    const resumeButton = await screen.findByRole("button", { name: /resume/i });
    expect(screen.queryByRole("button", { name: /^pause$/i })).not.toBeInTheDocument();
    expect(within(screen.getByTestId("sources")).getAllByText("paused")).toHaveLength(2);

    await userEvent.click(resumeButton);

    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("reports a failed action rather than pretending it worked", async () => {
    backupNow.mockRejectedValue(new Error("boom"));

    render(<AgentHome />);

    await userEvent.click(await screen.findByRole("button", { name: /back up now/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("Could not start a backup.");
  });

  it("says so and retries when the agent cannot be reached", async () => {
    sources.mockRejectedValueOnce(new Error("connection refused"));

    render(<AgentHome />);

    const retry = await screen.findByRole("button", { name: /try again/i });
    expect(screen.getByText(/cannot reach the backup agent/i)).toBeInTheDocument();

    await userEvent.click(retry);

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("OK");
  });

  it("still renders when the device is not enrolled and has no sources", async () => {
    localInfo.mockRejectedValue(new Error("404"));
    sources.mockResolvedValue({ localUsername: "user", localHost: "laptop-1", multiUser: false, sources: [] });
    tasks.mockResolvedValue({ tasks: [] });

    render(<AgentHome />);

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("ATTENTION");
    expect(screen.getByText("WarpHold")).toBeInTheDocument();
    // No name to show, so the eyebrow falls back to the browser's hostname -
    // never the host:port the engine happens to listen on.
    expect(screen.getByText(`agent · ${window.location.hostname}`)).toBeInTheDocument();
    expect(screen.getByText(/no sources are configured for this machine yet/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing has run yet/i)).toBeInTheDocument();
    expect(snapshots).not.toHaveBeenCalled();
  });
});
