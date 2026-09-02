import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { Device } from "../Device";
import type { AgentDetail, Group, Report, Template } from "../../../api/types";

const agent = vi.fn();
const groups = vi.fn();
const templates = vi.fn();
const agentCommand = vi.fn();
const revokeAgent = vi.fn();

vi.mock(import("../../../api/fleet"), async (importOriginal) => ({
  ...(await importOriginal()),
  fleet: {
    agent: (id: string) => agent(id),
    groups: () => groups(),
    templates: () => templates(),
    agentCommand: (id: string, kind: string, source?: string) => agentCommand(id, kind, source),
    revokeAgent: (id: string) => revokeAgent(id),
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
  agentCommand.mockReset().mockResolvedValue({ id: 1 });
  revokeAgent.mockReset().mockResolvedValue(undefined);
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

  it("keeps Verify and Recovery kit disabled until a later plan", async () => {
    renderDevice();

    expect(await screen.findByRole("button", { name: /verify/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /recovery kit/i })).toBeDisabled();
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
});
