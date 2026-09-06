import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { Devices } from "../Devices";
import type { AgentOut, Group, Overview, OverviewDevice } from "../../../api/types";

const overview = vi.fn();
const agents = vi.fn();
const groups = vi.fn();

vi.mock(import("../../../api/fleet"), async (importOriginal) => ({
  ...(await importOriginal()),
  fleet: {
    overview: () => overview(),
    agents: () => agents(),
    groups: () => groups(),
  } as unknown as typeof import("../../../api/fleet").fleet,
}));

function days(tone: OverviewDevice["days"][number]): OverviewDevice["days"] {
  return Array.from({ length: 30 }, () => tone);
}

function agent(over: Partial<AgentOut> & Pick<AgentOut, "id" | "name">): AgentOut {
  return {
    hostname: over.name,
    os: "linux",
    arch: "amd64",
    version: "0.1.0",
    scope: "user",
    group_id: 1,
    enrolled_at: "2026-08-01T00:00:00Z",
    last_seen_at: "2026-09-02T09:00:00Z",
    revoked_at: null,
    health: "green",
    ...over,
  };
}

const AGENTS: AgentOut[] = [
  agent({ id: "ag_fw13", name: "laptop-1", group_id: 1 }),
  agent({ id: "ag_nuc", name: "media-nuc", group_id: 2, health: "red", version: "0.1.1" }),
  agent({ id: "ag_mom", name: "mom-laptop", group_id: 1, health: "yellow" }),
  agent({ id: "ag_old", name: "old-tower", group_id: 2, health: "revoked", revoked_at: "2026-08-20T00:00:00Z" }),
];

const GROUPS: Group[] = [
  { id: 1, name: "Laptops", target_id: 1, template_id: 1 },
  { id: 2, name: "Servers", target_id: 1, template_id: 2 },
];

const OVERVIEW: Overview = {
  fleet_name: "home-fleet",
  counts: { agents: 3, green: 1, yellow: 1, red: 1, unknown: 0, targets: 1 },
  stored_bytes: 0,
  dedup_ratio: null,
  last24h: { completed: 4, failed: 1, buckets: [] },
  latest_failure: null,
  offsite: { targets_with_mirror: 0, stale_devices: 0, unknown: false },
  devices: [
    {
      id: "ag_fw13",
      name: "laptop-1",
      group: "Laptops",
      health: "green",
      last: "2 h ago",
      size_bytes: 1_200_000_000,
      days: days("good"),
    },
    {
      id: "ag_nuc",
      name: "media-nuc",
      group: "Servers",
      health: "red",
      last: "3 d ago",
      size_bytes: 0,
      days: days("bad"),
    },
    {
      id: "ag_mom",
      name: "mom-laptop",
      group: "Laptops",
      health: "yellow",
      last: "4 d ago",
      size_bytes: 0,
      days: days("warn"),
    },
  ],
};

function renderDevices() {
  return render(
    <MemoryRouter initialEntries={["/fleet/devices"]}>
      <Routes>
        <Route path="/fleet/devices" element={<Devices />} />
        <Route path="/fleet/devices/:id" element={<div>device screen</div>} />
        <Route path="/fleet/groups" element={<div>groups screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function rowNames(): string[] {
  return Array.from(document.querySelectorAll("[data-row]")).map((r) => r.getAttribute("data-row") ?? "");
}

beforeEach(() => {
  overview.mockReset().mockResolvedValue(OVERVIEW);
  agents.mockReset().mockResolvedValue(AGENTS);
  groups.mockReset().mockResolvedValue(GROUPS);
});

describe("Devices", () => {
  it("lists the live devices with group, strip, last snapshot, size and agent version", async () => {
    renderDevices();

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("3 enrolled");
    await waitFor(() => expect(rowNames()).toEqual(["ag_fw13", "ag_nuc", "ag_mom"]));

    const row = document.querySelector('[data-row="ag_fw13"]');
    expect(row).toHaveTextContent("laptop-1");
    expect(row).toHaveTextContent("Laptops");
    expect(row).toHaveTextContent("2 h ago");
    expect(row).toHaveTextContent("1.2 GB");
    expect(row).toHaveTextContent("0.1.0");
  });

  it("filters by health and by group, and hides revoked devices until asked", async () => {
    renderDevices();
    await waitFor(() => expect(rowNames()).toHaveLength(3));

    await userEvent.click(screen.getByRole("button", { name: /^Failing/ }));
    expect(rowNames()).toEqual(["ag_nuc"]);

    await userEvent.click(screen.getByRole("button", { name: /^Stale/ }));
    expect(rowNames()).toEqual(["ag_mom"]);

    await userEvent.click(screen.getByRole("button", { name: "Servers" }));
    expect(rowNames()).toEqual(["ag_nuc"]);

    await userEvent.click(screen.getByRole("button", { name: /^Revoked/ }));
    expect(rowNames()).toEqual(["ag_old"]);
    expect(document.querySelector('[data-row="ag_old"]')).toHaveTextContent("old-tower");

    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(rowNames()).toEqual(["ag_fw13", "ag_nuc", "ag_mom"]);
  });

  it("opens a device when its row is clicked", async () => {
    renderDevices();
    await waitFor(() => expect(rowNames()).toHaveLength(3));

    await userEvent.click(document.querySelector('[data-row="ag_nuc"]') as HTMLElement);
    expect(await screen.findByText("device screen")).toBeInTheDocument();
  });

  it("invites the first enrollment when the fleet is empty", async () => {
    agents.mockResolvedValue([]);
    groups.mockResolvedValue([]);
    overview.mockResolvedValue({ ...OVERVIEW, devices: [] });
    renderDevices();

    expect(await screen.findByText(/no devices enrolled yet/i)).toBeInTheDocument();
    expect(rowNames()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /^Revoked/ })).not.toBeInTheDocument();
  });

  it("offers a retry when the server cannot be reached", async () => {
    agents.mockRejectedValueOnce(new Error("network down"));
    renderDevices();

    await userEvent.click(await screen.findByRole("button", { name: /try again/i }));
    await waitFor(() => expect(rowNames()).toHaveLength(3));
  });
});
