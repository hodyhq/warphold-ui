import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { AppShell } from "../AppShell";
import { detectMode } from "../mode";
import { fleet } from "../api/fleet";

vi.mock("../mode", () => ({ detectMode: vi.fn() }));
vi.mock("../App.jsx", () => ({ default: () => <div>single-user app</div> }));
vi.mock(import("../api/fleet"), async (importOriginal) => ({
  ...(await importOriginal()),
  fleet: { settings: vi.fn() } as unknown as typeof import("../api/fleet").fleet,
}));

const mockedDetect = vi.mocked(detectMode);
const mockedSettings = vi.mocked(fleet.settings);

beforeEach(() => {
  vi.clearAllMocks();
  mockedSettings.mockResolvedValue({ fleet_name: "moinzadeh-home" });
  window.history.pushState({}, "", "/");
});

describe("AppShell", () => {
  it("renders the fleet shell with its nav once activated", async () => {
    mockedDetect.mockResolvedValue({ mode: "fleet", activated: true });

    render(<AppShell />);

    expect(await screen.findByText("WARPHOLD")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Devices" })).toHaveAttribute("href", "/fleet/devices");
    expect(await screen.findByText("moinzadeh-home")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
  });

  it("sends an unactivated fleet to the activation wizard", async () => {
    mockedDetect.mockResolvedValue({ mode: "fleet", activated: false });

    render(<AppShell />);

    expect(await screen.findByRole("heading", { name: "Activate Fleet" })).toBeInTheDocument();
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

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
  });

  it("renders the agent placeholder in agent mode", async () => {
    mockedDetect.mockResolvedValue({ mode: "agent", activated: false });

    render(<AppShell />);

    expect(await screen.findByRole("heading", { name: "This device" })).toBeInTheDocument();
  });
});
