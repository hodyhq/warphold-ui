import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fleet, fleetClient } from "../api/fleet";

let mock: MockAdapter;
const realLocation = window.location;
let assign: ReturnType<typeof vi.fn>;

function setPathname(pathname: string) {
  assign = vi.fn();
  Object.defineProperty(window, "location", {
    value: { hostname: "fleet.example.com", pathname, assign },
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  mock = new MockAdapter(fleetClient);
  setPathname("/fleet/devices");
  document.cookie = "wh_csrf=csrf-token-value";
});

afterEach(() => {
  mock.restore();
  document.cookie = "wh_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  Object.defineProperty(window, "location", { value: realLocation, writable: true, configurable: true });
});

describe("fleet API client", () => {
  it("sends credentials and no CSRF header on GET", async () => {
    mock.onGet("/agents").reply(200, []);

    await fleet.agents();

    const req = mock.history.get[0];
    expect(req.withCredentials).toBe(true);
    expect(req.headers?.["X-WarpHold-CSRF"]).toBeUndefined();
  });

  it("adds the CSRF header from the wh_csrf cookie on non-GET requests", async () => {
    mock.onPost("/session").reply(204);

    await fleet.login("admin@example.com", "correct horse battery");

    const req = mock.history.post[0];
    expect(req.url).toBe("/session");
    expect(req.headers?.["X-WarpHold-CSRF"]).toBe("csrf-token-value");
    expect(JSON.parse(req.data)).toEqual({ email: "admin@example.com", password: "correct horse battery" });
  });

  it("adds the CSRF header on DELETE too", async () => {
    mock.onDelete("/session").reply(204);

    await fleet.logout();

    expect(mock.history.delete[0].headers?.["X-WarpHold-CSRF"]).toBe("csrf-token-value");
  });

  it("returns typed rows straight from the endpoint", async () => {
    mock.onGet("/agents").reply(200, [
      {
        id: "ag_1",
        name: "media-nuc",
        hostname: "media-nuc",
        os: "linux",
        arch: "amd64",
        version: "0.1.0",
        scope: "user",
        group_id: 1,
        enrolled_at: "2026-09-01T00:00:00Z",
        last_seen_at: null,
        revoked_at: null,
        health: "green",
      },
    ]);

    const agents = await fleet.agents();

    expect(agents).toHaveLength(1);
    expect(agents[0].group_id).toBe(1);
    expect(agents[0].health).toBe("green");
  });

  it("carries the setup token in its header, never in the activation body", async () => {
    mock.onPost("/activate").reply(201, { admin_id: 1 });

    await fleet.activate("setup-token-value", "seal me please", "admin@example.com", "pw12345678");

    const req = mock.history.post[0];
    expect(req.headers?.["X-WarpHold-Setup-Token"]).toBe("setup-token-value");
    expect(JSON.parse(req.data)).toEqual({
      passphrase: "seal me please",
      email: "admin@example.com",
      password: "pw12345678",
    });
  });

  it("puts one changed setting in a partial PUT and returns the merged result", async () => {
    mock.onPut("/settings").reply(200, { fleet_name: "home-fleet", poll_interval: 900 });

    const merged = await fleet.setSetting("poll_interval", 900);

    expect(JSON.parse(mock.history.put[0].data)).toEqual({ poll_interval: 900 });
    expect(merged).toEqual({ fleet_name: "home-fleet", poll_interval: 900 });
  });

  it("redirects to the login page on 401", async () => {
    mock.onGet("/agents").reply(401, { error: "unauthorized" });

    await expect(fleet.agents()).rejects.toThrow();

    expect(assign).toHaveBeenCalledWith("/fleet/login");
  });

  it("does not redirect when the 401 came from the login page itself", async () => {
    setPathname("/fleet/login");
    mock.onPost("/session").reply(401, { error: "wrong email or password" });

    await expect(fleet.login("a@b.co", "nope")).rejects.toThrow();

    expect(assign).not.toHaveBeenCalled();
  });
});
