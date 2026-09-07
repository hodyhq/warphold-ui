import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { Device, offsiteLine } from "../Device";
import type { AgentDetail, Group, Job, Report, Template } from "../../../api/types";

const agent = vi.fn();
const groups = vi.fn();
const templates = vi.fn();
const agentJobs = vi.fn();
const agentCommand = vi.fn();
const revokeAgent = vi.fn();
const ackKit = vi.fn();
const regenerateKit = vi.fn();
const createJob = vi.fn();

vi.mock(import("../../../api/fleet"), async (importOriginal) => ({
  ...(await importOriginal()),
  fleet: {
    agent: (id: string) => agent(id),
    groups: () => groups(),
    templates: () => templates(),
    agentJobs: (id: string) => agentJobs(id),
    agentCommand: (id: string, kind: string, source?: string) => agentCommand(id, kind, source),
    revokeAgent: (id: string) => revokeAgent(id),
    kitURL: (id: string) => `/api/v1/fleet/agents/${id}/kit`,
    ackKit: (id: string) => ackKit(id),
    regenerateKit: (id: string) => regenerateKit(id),
    createJob: (kind: string, agentId?: string) => createJob(kind, agentId),
  } as unknown as typeof import("../../../api/fleet").fleet,
}));

/** An ISO timestamp `hours` before now, so relative labels are deterministic. */
function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function report(over: Partial<Report> & Pick<Report, "id">): Report {
  return {
    agent_id: "ag_nuc",
    task_id: `task-${over.id}`,
    kind: "snapshot",
    source: "/srv/media",
    started_at: hoursAgo(2),
    finished_at: hoursAgo(2),
    status: "ok",
    bytes: 0,
    files: 0,
    snapshot_id: "k123",
    stderr: "",
    ...over,
  };
}

const STDERR = "kopia: error: unable to write blob: b2: 503 service_unavailable";

const DETAIL: AgentDetail = {
  id: "ag_nuc",
  name: "media-nuc",
  hostname: "media-nuc",
  os: "linux",
  arch: "amd64",
  version: "0.1.1",
  scope: "user",
  group_id: 2,
  enrolled_at: "2026-08-01T00:00:00Z",
  last_seen_at: hoursAgo(1),
  revoked_at: null,
  health: "red",
  kit_acked_at: "2026-08-02T00:00:00Z",
  mirror: null,
  reports: [
    report({
      id: 3,
      status: "error",
      started_at: hoursAgo(1),
      finished_at: new Date(Date.now() - 3_600_000 + 72_000).toISOString(),
      stderr: STDERR,
    }),
    report({ id: 2, started_at: hoursAgo(2), finished_at: hoursAgo(2), bytes: 1_200_000_000, files: 4210 }),
  ],
};

const GROUPS: Group[] = [
  { id: 1, name: "Laptops", target_id: 1, template_id: 1 },
  { id: 2, name: "Servers", target_id: 1, template_id: 2 },
];

const TEMPLATES: Template[] = [
  { id: 1, name: "Home default", sources: ["~/"], policy: {} },
  { id: 2, name: "Server default", sources: ["/srv/media", "~/backups"], policy: {} },
];

const JOBS: Job[] = [
  {
    id: 11,
    kind: "verify",
    agent_id: "ag_nuc",
    scheduled_for: hoursAgo(3),
    started_at: hoursAgo(3),
    finished_at: hoursAgo(3),
    status: "ok",
    detail: "no errors found",
  },
  {
    id: 12,
    kind: "test-restore",
    agent_id: "ag_nuc",
    scheduled_for: hoursAgo(1),
    started_at: hoursAgo(1),
    finished_at: null,
    status: "running",
    detail: "",
  },
  {
    id: 13,
    kind: "maintenance",
    agent_id: "ag_nuc",
    scheduled_for: hoursAgo(30),
    started_at: hoursAgo(30),
    finished_at: hoursAgo(30),
    status: "error",
    detail: "kopia: maintenance failed: repository locked by another process for a very long time indeed",
  },
];

function renderDevice() {
  return render(
    <MemoryRouter initialEntries={["/fleet/devices/ag_nuc"]}>
      <Routes>
        <Route path="/fleet/devices/:id" element={<Device />} />
        <Route path="/fleet/devices" element={<div>devices screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  agent.mockReset().mockResolvedValue(DETAIL);
  groups.mockReset().mockResolvedValue(GROUPS);
  templates.mockReset().mockResolvedValue(TEMPLATES);
  agentJobs.mockReset().mockResolvedValue(JOBS);
  agentCommand.mockReset().mockResolvedValue({ id: 1 });
  revokeAgent.mockReset().mockResolvedValue(undefined);
  ackKit.mockReset().mockResolvedValue(undefined);
  regenerateKit.mockReset().mockResolvedValue(undefined);
  createJob.mockReset().mockResolvedValue({ id: 99 });
});

describe("Device", () => {
  it("renders the host facts, the template sources and the recent runs", async () => {
    renderDevice();

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("media-nuc");
    expect(screen.getByTestId("device-facts")).toHaveTextContent("Servers · agent 0.1.1 · linux · user scope");

    // Sources come from the group's template; Fleet has no per-agent list yet.
    const sources = screen.getByTestId("sources");
    expect(sources).toHaveTextContent("/srv/media");
    expect(sources).toHaveTextContent("~/backups");
    expect(sources).toHaveTextContent("expands on the device");

    const run = document.querySelector('[data-row="2"]');
    expect(run).toHaveTextContent("ok");
    expect(run).toHaveTextContent("1.2 GB");
    expect(document.querySelector('[data-row="3"]')).toHaveTextContent("1m 12s");
  });

  it("expands the raw stderr of a failed run", async () => {
    renderDevice();
    await waitFor(() => expect(document.querySelector('[data-row="3"]')).toBeInTheDocument());

    expect(screen.queryByTestId("run-stderr")).not.toBeInTheDocument();
    await userEvent.click(document.querySelector('[data-row="3"]') as HTMLElement);
    expect(screen.getByTestId("run-stderr")).toHaveTextContent("503 service_unavailable");

    await userEvent.click(document.querySelector('[data-row="3"]') as HTMLElement);
    expect(screen.queryByTestId("run-stderr")).not.toBeInTheDocument();
  });

  it("queues a snapshot from the Snapshot now action", async () => {
    renderDevice();

    await userEvent.click(await screen.findByRole("button", { name: /snapshot now/i }));
    expect(agentCommand).toHaveBeenCalledWith("ag_nuc", "snapshot-now", undefined);
    expect(await screen.findByRole("status")).toHaveTextContent(/snapshot/i);
  });

  it("nags until the recovery kit is acknowledged, and clears without a reload", async () => {
    agent.mockResolvedValue({ ...DETAIL, kit_acked_at: null });
    renderDevice();

    expect(await screen.findByTestId("kit-banner")).toHaveTextContent(/no one has confirmed holding/i);

    // The poll would answer with the stale un-acked device; the banner has to
    // go on the ack itself, not on the next refetch.
    agent.mockResolvedValue({ ...DETAIL, kit_acked_at: null });
    await userEvent.click(screen.getByRole("button", { name: /mark as saved/i }));

    expect(ackKit).toHaveBeenCalledWith("ag_nuc");
    await waitFor(() => expect(screen.queryByTestId("kit-banner")).not.toBeInTheDocument());
    expect(await screen.findByRole("status")).toHaveTextContent(/marked as saved/i);
  });

  it("hides the banner for a device whose kit was already acknowledged", async () => {
    renderDevice();

    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByTestId("kit-banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark as saved/i })).not.toBeInTheDocument();
  });

  it("opens the recovery kit in a new tab", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderDevice();

    await userEvent.click(await screen.findByRole("button", { name: /open recovery kit/i }));
    expect(open).toHaveBeenCalledWith("/api/v1/fleet/agents/ag_nuc/kit", "_blank", "noopener,noreferrer");
    open.mockRestore();
  });

  it("warns that a hosted device's printed key stops working before it regenerates the kit", async () => {
    renderDevice();

    await userEvent.click(await screen.findByRole("button", { name: /regenerate kit/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/for devices on a hosted target, the read-only key on the current kit stops working immediately/i);
    expect(regenerateKit).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(regenerateKit).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /regenerate kit/i }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /regenerate kit/i }));
    expect(regenerateKit).toHaveBeenCalledWith("ag_nuc");
    expect(await screen.findByRole("status")).toHaveTextContent(/regenerated/i);
  });

  it("brings the ack banner back once a regenerate succeeds", async () => {
    renderDevice();

    expect(screen.queryByTestId("kit-banner")).not.toBeInTheDocument();

    await userEvent.click(await screen.findByRole("button", { name: /regenerate kit/i }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /regenerate kit/i }));
    await screen.findByRole("status");

    // The old kit's ack no longer covers the new key - the banner has to come
    // straight back, not wait on the next 30 s poll.
    expect(await screen.findByTestId("kit-banner")).toHaveTextContent(/no one has confirmed holding/i);
  });

  it("does not let a poll that started before a regenerate clobber the reset banner when it resolves late", async () => {
    // Only the poll's setInterval needs faking - leave setTimeout/rAF/Date
    // real so userEvent's own click plumbing behaves normally.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const user = userEvent.setup();
    try {
      // Call 1: the initial mount load - kit already acked, banner hidden.
      agent.mockResolvedValueOnce(DETAIL);
      // Call 2: the 30 s poll. It is in flight (unresolved) when the
      // regenerate below fires, and only settles - with stale, still-acked
      // data - after the optimistic reset has already landed. The server
      // never clears kit_acked_at on regenerate, so this is exactly what a
      // real poll would answer with; nothing else re-fetches after the
      // mutation, so no third call is queued.
      let resolveStalePoll: ((v: typeof DETAIL) => void) | undefined;
      agent.mockImplementationOnce(() => new Promise((resolve) => (resolveStalePoll = resolve)));

      renderDevice();
      await act(() => vi.advanceTimersByTimeAsync(0)); // let the initial mount load settle and render
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
      expect(screen.queryByTestId("kit-banner")).not.toBeInTheDocument();

      await act(() => vi.advanceTimersByTimeAsync(30_000)); // fires the poll (call 2, now pending)

      await user.click(screen.getByRole("button", { name: /regenerate kit/i }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /regenerate kit/i }));
      await screen.findByRole("status");
      expect(screen.getByTestId("kit-banner")).toBeInTheDocument();
      expect(agent).toHaveBeenCalledTimes(2); // no extra fetch triggered by the mutation itself

      // The stale poll (call 2) finally resolves with old, acked data - it
      // started before the reset and knows nothing about it, so it must be
      // ignored rather than clobbering the banner.
      resolveStalePoll?.(DETAIL);
      await act(() => vi.advanceTimersByTimeAsync(0));

      expect(screen.getByTestId("kit-banner")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the server's error and leaves the kit unchanged when regenerate is refused for a non-hosted target", async () => {
    regenerateKit.mockRejectedValueOnce(
      Object.assign(new Error("refused"), {
        response: { status: 409, data: { error: "this target has no per-device read-only key to regenerate" } },
      }),
    );
    renderDevice();

    await userEvent.click(await screen.findByRole("button", { name: /regenerate kit/i }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /regenerate kit/i }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/this target has no per-device read-only key to regenerate/i);
    expect(status).not.toHaveTextContent(/regenerated/i);
    // The device's own ack state is untouched by a failed regenerate.
    expect(screen.queryByTestId("kit-banner")).not.toBeInTheDocument();
  });

  it("lists jobs with a status pill per row", async () => {
    renderDevice();
    await waitFor(() => expect(document.querySelector('[data-row="11"]')).toBeInTheDocument());

    const ok = document.querySelector('[data-row="11"]') as HTMLElement;
    expect(ok).toHaveTextContent("verify");
    expect(ok).toHaveTextContent("ok");

    const running = document.querySelector('[data-row="12"]') as HTMLElement;
    expect(running).toHaveTextContent("test-restore");
    expect(running).toHaveTextContent("running");
    expect(running).toHaveTextContent("—"); // finished_at: null renders as an em dash

    const failed = document.querySelector('[data-row="13"]') as HTMLElement;
    expect(failed).toHaveTextContent("maintenance");
    expect(failed).toHaveTextContent("error");
  });

  it("expands a job's detail on click", async () => {
    renderDevice();
    await waitFor(() => expect(document.querySelector('[data-row="13"]')).toBeInTheDocument());

    expect(screen.queryByTestId("job-detail")).not.toBeInTheDocument();
    await userEvent.click(document.querySelector('[data-row="13"]') as HTMLElement);
    expect(screen.getByTestId("job-detail")).toHaveTextContent("repository locked by another process");
  });

  it("queues a verify job for this device from Run verify", async () => {
    renderDevice();

    await userEvent.click(await screen.findByRole("button", { name: /run verify/i }));
    expect(createJob).toHaveBeenCalledWith("verify", "ag_nuc");
    expect(await screen.findByRole("status")).toHaveTextContent(/verify queued/i);
  });

  it("disables the job buttons until the in-flight request settles", async () => {
    let resolveJob: (() => void) | undefined;
    createJob.mockReset().mockImplementation(() => new Promise((resolve) => (resolveJob = () => resolve({ id: 1 }))));
    renderDevice();

    const verifyBtn = await screen.findByRole("button", { name: /run verify/i });
    const restoreBtn = screen.getByRole("button", { name: /run test restore/i });
    await userEvent.click(verifyBtn);

    expect(verifyBtn).toBeDisabled();
    expect(restoreBtn).toBeDisabled();
    expect(createJob).toHaveBeenCalledTimes(1);

    await userEvent.click(verifyBtn);
    expect(createJob).toHaveBeenCalledTimes(1);

    resolveJob?.();
    await waitFor(() => expect(verifyBtn).not.toBeDisabled());
  });

  it("revokes only after the device name is typed", async () => {
    renderDevice();

    await userEvent.click(await screen.findByRole("button", { name: /^revoke$/i }));
    const dialog = screen.getByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: /revoke device/i });
    expect(confirm).toBeDisabled();

    await userEvent.type(within(dialog).getByRole("textbox"), "media-nu");
    expect(confirm).toBeDisabled();
    expect(revokeAgent).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByRole("textbox"), "c");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);

    expect(revokeAgent).toHaveBeenCalledWith("ag_nuc");
    expect(await screen.findByText("devices screen")).toBeInTheDocument();
  });

  it("clears the typed name when the revoke dialog is reopened", async () => {
    renderDevice();

    await userEvent.click(await screen.findByRole("button", { name: /^revoke$/i }));
    await userEvent.type(within(screen.getByRole("dialog")).getByRole("textbox"), "media-nuc");
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: /revoke device/i })).toBeEnabled();

    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /cancel/i }));
    await userEvent.click(screen.getByRole("button", { name: /^revoke$/i }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("textbox")).toHaveValue("");
    expect(within(dialog).getByRole("button", { name: /revoke device/i })).toBeDisabled();
    expect(revokeAgent).not.toHaveBeenCalled();
  });

  it("renders a device that has never reported a run", async () => {
    agent.mockResolvedValue({ ...DETAIL, health: "unknown", last_seen_at: null, reports: null });
    renderDevice();

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("media-nuc");
    expect(screen.getByText(/no runs reported yet/i)).toBeInTheDocument();
    expect(screen.getByTestId("kpi-last")).toHaveTextContent("never");
    expect(screen.getByTestId("kpi-days")).toHaveTextContent("0 of 30 days");
  });

  it("offers a retry when the server cannot be reached", async () => {
    agent.mockRejectedValueOnce(new Error("network down"));
    renderDevice();

    await userEvent.click(await screen.findByRole("button", { name: /try again/i }));
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("media-nuc");
  });

  it("still renders the device when only its jobs fail to load", async () => {
    agentJobs.mockRejectedValueOnce(new Error("jobs down"));
    renderDevice();

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("media-nuc");
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });
});

describe("the device's offsite line", () => {
  const NOW = Date.parse("2026-09-02T12:00:00Z");

  it("says nothing when the device's target keeps no mirror", () => {
    expect(offsiteLine(null, NOW)).toBeNull();
  });

  it("calls a device that has never reached the mirror not mirrored", () => {
    expect(offsiteLine({ mirrored_at: null, mirrored_bytes: 0, stale: true }, NOW)).toEqual({
      text: "Offsite · not mirrored",
      tone: "bad",
    });
  });

  it("flips to stale exactly on the server's flag", () => {
    const at = "2026-09-02T10:00:00Z";
    expect(offsiteLine({ mirrored_at: at, mirrored_bytes: 10, stale: false }, NOW)).toEqual({
      text: "Offsite · mirrored 2 h ago",
      tone: "good",
    });
    expect(offsiteLine({ mirrored_at: at, mirrored_bytes: 10, stale: true }, NOW)).toEqual({
      text: "Offsite · stale, last 2 h ago",
      tone: "warn",
    });
  });

  it("shows the line in the Stored card", async () => {
    agent.mockResolvedValue({
      ...DETAIL,
      mirror: { mirrored_at: new Date(Date.now() - 7_200_000).toISOString(), mirrored_bytes: 4096, stale: false },
    });
    renderDevice();

    expect(await screen.findByTestId("device-offsite")).toHaveTextContent("Offsite · mirrored 2 h ago");
  });

  it("leaves the Stored card alone when the target keeps no mirror", async () => {
    renderDevice();

    expect(await screen.findByTestId("kpi-stored")).toBeInTheDocument();
    expect(screen.queryByTestId("device-offsite")).not.toBeInTheDocument();
  });
});
