import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { AppShell } from "../AppShell";
import { detectMode } from "../mode";
import { fleet } from "../api/fleet";
import { engine } from "../api/engine";
import type { Overview } from "../api/types";

vi.mock("../mode", () => ({ detectMode: vi.fn() }));
vi.mock("../App.jsx", () => ({ default: () => <div>single-user app</div> }));
vi.mock(import("../api/fleet"), async (importOriginal) => ({
  ...(await importOriginal()),
  fleet: { settings: vi.fn(), overview: vi.fn() } as unknown as typeof import("../api/fleet").fleet,
}));
vi.mock(import("../api/engine"), async (importOriginal) => ({
  ...(await importOriginal()),
  engine: {
    localInfo: vi.fn(),
    sources: vi.fn(),
    snapshots: vi.fn(),
    tasks: vi.fn(),
  } as unknown as typeof import("../api/engine").engine,
}));

const mockedDetect = vi.mocked(detectMode);
const mockedSettings = vi.mocked(fleet.settings);
const mockedOverview = vi.mocked(fleet.overview);

/** Enough of GET /overview for the shell's default route to render. */
const EMPTY_OVERVIEW: Overview = {
  fleet_name: "home-fleet",
  counts: { agents: 0, green: 0, yellow: 0, red: 0, unknown: 0, targets: 0 },
  stored_bytes: 0,
  dedup_ratio: null,
  last24h: { completed: 0, failed: 0, buckets: [] },
  latest_failure: null,
  devices: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedSettings.mockResolvedValue({ fleet_name: "home-fleet", poll_interval: 300 });
  mockedOverview.mockResolvedValue(EMPTY_OVERVIEW);
  vi.mocked(engine.localInfo).mockResolvedValue({ name: "laptop-1", group: "" });
  vi.mocked(engine.sources).mockResolvedValue({
    localUsername: "user",
    localHost: "laptop-1",
    multiUser: false,
    sources: [],
  });
  vi.mocked(engine.tasks).mockResolvedValue({ tasks: [] });
  window.history.pushState({}, "", "/");
});

describe("AppShell", () => {
  it("renders the fleet shell with its nav once activated", async () => {
    mockedDetect.mockResolvedValue({ mode: "fleet", activated: true });

    render(<AppShell />);

    expect(await screen.findByText("WARPHOLD")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Devices" })).toHaveAttribute("href", "/fleet/devices");
    expect(await screen.findByText("home-fleet")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("protected right now");
  });

  it("sends an activated fleet away from the wizard", async () => {
    mockedDetect.mockResolvedValue({ mode: "fleet", activated: true });
    window.history.pushState({}, "", "/fleet/activate");

    render(<AppShell />);

    expect(await screen.findByRole("link", { name: "Devices" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /choose the sealing passphrase/i })).not.toBeInTheDocument();
  });

  it("sends an unactivated fleet to the activation wizard", async () => {
    mockedDetect.mockResolvedValue({ mode: "fleet", activated: false });

    render(<AppShell />);

    expect(await screen.findByRole("heading", { name: /choose the sealing passphrase/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Devices" })).not.toBeInTheDocument();
  });

  it("hands solo mode to the untouched single-user app", async () => {
    mockedDetect.mockResolvedValue({ mode: "solo", activated: false });

    render(<AppShell />);

    expect(await screen.findByText("single-user app")).toBeInTheDocument();
    expect(mockedSettings).not.toHaveBeenCalled();
  });

  it("says so and retries when the server cannot be reached", async () => {
    mockedDetect.mockRejectedValueOnce(new Error("network error"));
    mockedDetect.mockResolvedValueOnce({ mode: "fleet", activated: true });

    render(<AppShell />);

    const retry = await screen.findByRole("button", { name: /try again/i });
    expect(screen.getByText(/cannot reach the warphold server/i)).toBeInTheDocument();

    await userEvent.click(retry);

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("protected right now");
  });

  it("renders the agent screen in agent mode", async () => {
    mockedDetect.mockResolvedValue({ mode: "agent", activated: false });

    render(<AppShell />);

    expect(await screen.findByText("This machine")).toBeInTheDocument();
    expect(screen.getByText("laptop-1")).toBeInTheDocument();
    expect(mockedSettings).not.toHaveBeenCalled();
  });
});
