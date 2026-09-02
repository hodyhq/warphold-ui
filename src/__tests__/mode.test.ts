import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectMode } from "../mode";

let mock: MockAdapter;
const realLocation = window.location;

function setHostname(hostname: string) {
  Object.defineProperty(window, "location", {
    value: { hostname, pathname: "/", assign: vi.fn() },
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  mock = new MockAdapter(axios);
});

afterEach(() => {
  mock.restore();
  Object.defineProperty(window, "location", { value: realLocation, writable: true, configurable: true });
});

describe("detectMode", () => {
  it("reports fleet mode when the fleet is activated", async () => {
    mock.onGet("/api/v1/fleet/status").reply(200, { activated: true });

    await expect(detectMode()).resolves.toEqual({ mode: "fleet", activated: true });
  });

  it("reports fleet mode but not activated so the wizard can show", async () => {
    mock.onGet("/api/v1/fleet/status").reply(200, { activated: false });

    await expect(detectMode()).resolves.toEqual({ mode: "fleet", activated: false });
  });

  it("reports agent mode on a loopback host whose sources endpoint answers", async () => {
    setHostname("127.0.0.1");
    mock.onGet("/api/v1/fleet/status").reply(404);
    mock.onGet("/api/v1/sources").reply(200, { sources: [] });

    await expect(detectMode()).resolves.toEqual({ mode: "agent", activated: false });
  });

  it("reports solo mode on a loopback host without the local session cookie", async () => {
    setHostname("localhost");
    mock.onGet("/api/v1/fleet/status").reply(404);
    mock.onGet("/api/v1/sources").reply(401);

    await expect(detectMode()).resolves.toEqual({ mode: "solo", activated: false });
  });

  it("reports solo mode on a remote host without probing sources", async () => {
    setHostname("backup.example.com");
    mock.onGet("/api/v1/fleet/status").reply(404);
    const sources = mock.onGet("/api/v1/sources").reply(200, { sources: [] });

    await expect(detectMode()).resolves.toEqual({ mode: "solo", activated: false });
    expect(sources.history.get.some((r) => r.url === "/api/v1/sources")).toBe(false);
  });

  it("rejects rather than guessing when the status probe cannot be reached", async () => {
    setHostname("backup.example.com");
    mock.onGet("/api/v1/fleet/status").networkError();

    await expect(detectMode()).rejects.toBeTruthy();
  });

  it("rejects on a server error instead of demoting a fleet to solo", async () => {
    setHostname("backup.example.com");
    mock.onGet("/api/v1/fleet/status").reply(502);

    await expect(detectMode()).rejects.toBeTruthy();
  });
});
