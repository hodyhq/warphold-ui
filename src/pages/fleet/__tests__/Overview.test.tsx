import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { Overview } from "../Overview";
import type { Overview as OverviewData, OverviewDevice } from "../../../api/types";

const overview = vi.fn();

vi.mock(import("../../../api/fleet"), async (importOriginal) => ({
  ...(await importOriginal()),
  fleet: {
    overview: () => overview(),
  } as unknown as typeof import("../../../api/fleet").fleet,
}));

/** 30 days of the same tone, the way a healthy device reads. */
function days(tone: OverviewDevice["days"][number]): OverviewDevice["days"] {
  return Array.from({ length: 30 }, () => tone);
}

function buckets() {
  return Array.from({ length: 24 }, (_, i) => ({
    hour: `2026-09-02T${String(i).padStart(2, "0")}:00:00Z`,
    ok: i % 3,
    failed: i === 4 ? 1 : 0,
  }));
}

const DATA: OverviewData = {
  fleet_name: "home-fleet",
  counts: { agents: 7, green: 5, yellow: 1, red: 1, unknown: 0, targets: 2 },
  stored_bytes: 0,
  dedup_ratio: null,
  last24h: { completed: 41, failed: 1, buckets: buckets() },
  offsite: { targets_with_mirror: 0, stale_devices: 0, unknown: false },
  latest_failure: {
    agent_id: "ag_nuc",
    name: "media-nuc",
    finished_at: "2026-09-02T04:12:00Z",
    stderr: "kopia: error: unable to write blob: b2: 503 service_unavailable",
  },
  devices: [
    {
      id: "ag_fw13",
      name: "laptop-1",
      group: "Laptops",
      health: "green",
      last: "2 h ago",
      size_bytes: 0,
      days: days("good"),
    },
    {
      id: "ag_nuc",
      name: "media-nuc",
      group: "Servers",
      health: "red",
      last: "never",
      size_bytes: 0,
      days: days("bad"),
    },
  ],
};

function renderOverview() {
  return render(
    <MemoryRouter initialEntries={["/fleet"]}>
      <Routes>
        <Route path="/fleet" element={<Overview />} />
        <Route path="/fleet/devices/:id" element={<div>device screen</div>} />
        <Route path="/fleet/groups" element={<div>groups screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  overview.mockReset();
});

describe("Overview", () => {
  it("renders the headline, the KPIs and the 24 h timeline", async () => {
    overview.mockResolvedValue(DATA);
    renderOverview();

    const headline = await screen.findByRole("heading", { level: 1 });
    expect(headline.textContent).toContain("5/7");
    expect(headline.textContent).toContain("protected right now");
    expect(screen.getByText(/7 devices/)).toHaveTextContent("2 targets");

    for (const [label, value] of [
      ["Protected", "5"],
      ["Stale", "1"],
      ["Failing", "1"],
    ] as const) {
      expect(screen.getByTestId(`kpi-${label.toLowerCase()}`)).toHaveTextContent(value);
    }
    // stored_bytes/dedup_ratio are placeholders until repository stats exist.
    expect(screen.queryByTestId("kpi-stored")).not.toBeInTheDocument();

    expect(screen.getByText("41 completed · 1 failed")).toBeInTheDocument();
    expect(screen.getAllByTestId("tick")).toHaveLength(24);
  });

  it("shows the Stored tile once repository stats exist", async () => {
    overview.mockResolvedValue({ ...DATA, stored_bytes: 1_840_000_000_000, dedup_ratio: 3.1 });
    renderOverview();

    expect(await screen.findByTestId("kpi-stored")).toHaveTextContent("1.8");
    expect(screen.getByText(/3\.1/)).toHaveTextContent("dedup");
  });

  it("lists the devices with a 30-day strip and opens one on click", async () => {
    overview.mockResolvedValue(DATA);
    renderOverview();

    // Exact names: the attention callout also mentions media-nuc.
    const row = await screen.findByRole("button", { name: "laptop-1" });
    expect(row).toHaveTextContent("2 h ago");
    expect(screen.getByRole("button", { name: "media-nuc" })).toBeInTheDocument();

    await userEvent.click(row);
    expect(await screen.findByText("device screen")).toBeInTheDocument();
  });

  it("opens the failing device from the attention callout", async () => {
    overview.mockResolvedValue(DATA);
    renderOverview();

    const callout = await screen.findByTestId("latest-failure");
    expect(callout).toHaveTextContent("media-nuc");
    expect(callout).toHaveTextContent("unable to write blob");

    await userEvent.click(callout);
    expect(await screen.findByText("device screen")).toBeInTheDocument();
  });

  it("invites the first enrollment when the fleet is empty", async () => {
    overview.mockResolvedValue({
      ...DATA,
      counts: { agents: 0, green: 0, yellow: 0, red: 0, unknown: 0, targets: 0 },
      last24h: { completed: 0, failed: 0, buckets: buckets() },
      latest_failure: null,
      devices: [],
    });
    renderOverview();

    expect(await screen.findByText(/no devices enrolled yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId("latest-failure")).not.toBeInTheDocument();
  });

  it("keeps a gap between the two eyebrows of the devices header", async () => {
    // Without it the row's justify-between lets them meet as the column
    // narrows, and the header reads "DEVICESLAST 30 DAYS".
    overview.mockResolvedValue(DATA);
    renderOverview();

    const head = await screen.findByTestId("devices-head");
    expect(head).toHaveClass("gap-4");
    expect(head).toHaveTextContent(/^Deviceslast 30 days$/);
  });

  it("offers a retry when the server cannot be reached", async () => {
    overview.mockRejectedValueOnce(new Error("network down")).mockResolvedValue(DATA);
    renderOverview();

    const retry = await screen.findByRole("button", { name: /try again/i });
    await userEvent.click(retry);

    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument());
    expect(overview).toHaveBeenCalledTimes(2);
  });
});

describe("the offsite KPI", () => {
  it("stays hidden on a fleet with no mirror", async () => {
    overview.mockResolvedValue(DATA);
    renderOverview();
    await screen.findByTestId("kpi-protected");
    expect(screen.queryByTestId("kpi-offsite")).not.toBeInTheDocument();
  });

  it("counts the devices that are behind, in a warning tone", async () => {
    overview.mockResolvedValue({ ...DATA, offsite: { targets_with_mirror: 1, stale_devices: 3, unknown: false } });
    renderOverview();

    const tile = await screen.findByTestId("kpi-offsite");
    expect(tile).toHaveTextContent("Offsite");
    expect(tile).toHaveTextContent("3");
    expect(tile.querySelector(".text-warn")).not.toBeNull();
  });

  it("reads good once nothing is behind", async () => {
    overview.mockResolvedValue({ ...DATA, offsite: { targets_with_mirror: 2, stale_devices: 0, unknown: false } });
    renderOverview();

    const tile = await screen.findByTestId("kpi-offsite");
    expect(tile).toHaveTextContent("0");
    expect(tile.querySelector(".text-warn")).toBeNull();
    expect(tile.querySelector(".text-good")).not.toBeNull();
  });

  it("goes neutral, never green, when the server could not read the counter", async () => {
    overview.mockResolvedValue({ ...DATA, offsite: { targets_with_mirror: 1, stale_devices: 0, unknown: true } });
    renderOverview();

    const tile = await screen.findByTestId("kpi-offsite");
    expect(tile).toHaveTextContent("—");
    expect(tile).toHaveTextContent("unavailable");
    expect(tile).not.toHaveTextContent("behind");
    expect(tile.querySelector(".text-warn")).toBeNull();
    expect(tile.querySelector(".text-good")).toBeNull();
  });
});
