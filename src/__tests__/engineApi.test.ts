import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { engine, engineClient, logText } from "../api/engine";

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(engineClient);
  document.cookie = "wh_csrf=csrf-token-value";
});

afterEach(() => {
  mock.restore();
  document.cookie = "wh_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});

describe("engine API client", () => {
  it("reads the vault label from the engine's own endpoint", async () => {
    mock.onGet("/local/info").reply(200, { name: "laptop-1", group: "Laptops" });

    expect(await engine.localInfo()).toEqual({ name: "laptop-1", group: "Laptops" });
    expect(mock.history.get[0].withCredentials).toBe(true);
  });

  it("names one source in the snapshots query, escaping what needs it", async () => {
    mock.onGet(/\/api\/v1\/snapshots/).reply(200, { snapshots: [], unfilteredCount: 0, uniqueCount: 0 });

    await engine.snapshots({ host: "laptop-1", userName: "user", path: "/home/user/My Files" });

    const url = new URL(mock.history.get[0].url as string, "http://127.0.0.1");
    expect(url.pathname).toBe("/api/v1/snapshots");
    expect(url.searchParams.get("userName")).toBe("user");
    expect(url.searchParams.get("host")).toBe("laptop-1");
    expect(url.searchParams.get("path")).toBe("/home/user/My Files");
  });

  it("escapes a task id into the log path", async () => {
    mock.onGet(/\/api\/v1\/tasks\//).reply(200, { logs: [] });

    await engine.taskLog("a/b");

    expect(mock.history.get[0].url).toBe("/api/v1/tasks/a%2Fb/logs");
  });

  it("posts the three actions unfiltered, so they act on the whole machine", async () => {
    mock.onPost(/\/api\/v1\//).reply(200, { sources: {} });

    await engine.backupNow();
    await engine.pause();
    await engine.resume();

    expect(mock.history.post.map((r) => r.url)).toEqual([
      "/api/v1/sources/upload",
      "/api/v1/control/pause-source",
      "/api/v1/control/resume-source",
    ]);
    // The engine mints no CSRF token and checks none; sending the Fleet
    // server's would be noise on a client that shares nothing with it.
    expect(mock.history.post[0].headers?.["X-WarpHold-CSRF"]).toBeUndefined();
  });

  it("joins a task log into text, keeping lines it cannot read", () => {
    expect(logText({ logs: [{ msg: "started" }, { level: "warn" }, { msg: "done" }] })).toBe(
      'started\n{"level":"warn"}\ndone',
    );
    expect(logText({ logs: [] })).toBe("");
  });
});
