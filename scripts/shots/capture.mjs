// Headless-Chrome driver for docs/screenshots/PLAN.json.
//
// The plan is the contract: the chrome-devtools MCP driver and this script
// follow the same screen list, so a capture taken either way lands on the same
// file. This one exists so the pipeline runs on a machine with nothing but
// chromium - no MCP, no Playwright, no Puppeteer, no new npm dependency. It
// speaks CDP over the WebSocket that is already in Node.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? def : process.argv[i + 1];
};

const plan = JSON.parse(readFileSync(arg("plan"), "utf8"));
const outDir = arg("out");
const only = arg("only");
// One-shot screens change the server they are shot against (the activation
// wizard really activates it), so they are captured on their own, against a
// freshly rebuilt server, one viewport at a time.
const onlyViewport = arg("viewport");
const browsers = ["chromium", "google-chrome", "chromium-browser", "google-chrome-stable"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits for the DevTools endpoint to answer; Chrome writes the port late. */
async function endpoint(port) {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      return (await r.json()).webSocketDebuggerUrl;
    } catch {
      await sleep(200);
    }
  }
  throw new Error("chrome devtools endpoint never answered");
}

/** The thinnest CDP client that does the job: one socket, id -> resolver. */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener("message", (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? p?.reject(new Error(JSON.stringify(msg.error))) : p?.resolve(msg.result);
      } else {
        this.events.push(msg);
      }
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", rej, { once: true });
    });
    return new CDP(ws);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
}

/**
 * Page-side helpers the plan's actions compile to. React ignores a plain
 * `input.value = x`, so the value is written through the prototype's setter
 * and an input event is dispatched, which is what its onChange listens for.
 */
const HELPERS = `
window.__shot = {
  fill(sel, value, index) {
    const el = document.querySelectorAll(sel)[index || 0];
    if (!el) throw new Error('no element: ' + sel);
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  },
  click(sel, text, index) {
    const els = [...document.querySelectorAll(sel)];
    const el = text ? els.filter((e) => e.textContent.trim().includes(text))[index || 0] : els[index || 0];
    if (!el) throw new Error('no element: ' + sel + (text ? ' with text ' + text : ''));
    el.click();
  },
};`;

async function main() {
  const port = 9333 + Math.floor(Math.random() * 400);
  const profile = mkdtempSync(join(tmpdir(), "warphold-shots-"));
  const bin = browsers.find((b) => spawnSync(b, ["--version"], { stdio: "ignore" }).error === undefined);
  if (!bin) {
    throw new Error(`no headless browser found (tried ${browsers.join(", ")})`);
  }
  const chrome = spawn(
    bin,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      // The plan's origins are generic names so no loopback literal is baked
      // into a screenshot; nothing leaves this machine.
      "--host-resolver-rules=MAP fleet.example.com 127.0.0.1,MAP backup.example.com 127.0.0.1",
      "--force-color-profile=srgb",
      "--force-device-scale-factor=1",
      "--disable-lcd-text",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const cdp = await CDP.connect(await endpoint(port));
  const written = [];
  try {
    for (const screen of plan.screens) {
      if (only ? screen.name !== only : screen.oneShot) {
        continue;
      }
      for (const [label, vp] of Object.entries(plan.viewports)) {
        if (onlyViewport && label !== onlyViewport) {
          continue;
        }
        const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
        const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
        try {
          await cdp.send("Emulation.setDeviceMetricsOverride", vp, sessionId);
          if (vp.mobile) {
            await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);
          }
          // The session cookie is set by calling the API from the page's own
          // origin - cheaper and steadier than typing into the login form,
          // and it is the same request the form makes.
          if (screen.auth) {
            await cdp.send("Page.navigate", { url: new URL("/", screen.url).href }, sessionId);
            await sleep(400);
            await cdp.send(
              "Runtime.evaluate",
              {
                expression: `fetch('/api/v1/fleet/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(${JSON.stringify(plan.auth[screen.auth])})}).then(r=>r.status)`,
                awaitPromise: true,
              },
              sessionId,
            );
          }
          await cdp.send("Page.navigate", { url: screen.url }, sessionId);
          await sleep(screen.settleMs ?? 1200);
          await cdp.send("Runtime.evaluate", { expression: HELPERS }, sessionId);
          for (const step of screen.actions ?? []) {
            if (step.wait) {
              await sleep(step.wait);
              continue;
            }
            const [fn, a] = step.fill ? ["fill", step.fill] : ["click", step.click];
            const expr = `window.__shot.${fn}(${JSON.stringify(a[0])},${JSON.stringify(a[1] ?? null)},${a[2] ?? 0})`;
            const r = await cdp.send("Runtime.evaluate", { expression: expr }, sessionId);
            if (r.exceptionDetails) {
              throw new Error(`${screen.name}: ${expr}: ${r.exceptionDetails.exception?.description}`);
            }
            await sleep(step.after ?? 400);
          }
          const { data } = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
          const file = join(outDir, `${screen.name}@${label}.png`);
          writeFileSync(file, Buffer.from(data, "base64"));
          written.push(file);
          console.log(`shot ${screen.name}@${label}`);
        } finally {
          await cdp.send("Target.closeTarget", { targetId });
        }
      }
    }
  } finally {
    cdp.ws.close();
    chrome.kill();
    // Chrome is still flushing its profile as it dies; retry rather than fail
    // a finished capture on a leftover lock file.
    rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 });
  }
  console.log(`captured ${written.length} images`);
}

await main();
