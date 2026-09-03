// Serves a built WarpHold UI bundle and proxies /api to a running server, so
// the screenshot pipeline shoots the UI in *this* checkout rather than the
// bundle a released server happens to embed.
//
// Two listeners on purpose: the UI picks its mode from the origin it is served
// on (src/mode.ts), and 127.0.0.1 is the agent UI while any other host is the
// single-user "solo" one. Binding 127.0.0.1 and 127.0.0.2 gets both out of one
// server. Loopback only - this is a demo server with no auth in front of it.
import { createServer, request } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? def : process.argv[i + 1];
};

const port = Number(arg("port"));
const api = new URL(arg("api"));
const root = resolve(arg("root"));
const hosts = arg("hosts", "127.0.0.1").split(",");
// The single-machine app is a server with no Fleet routes at all: the agent
// runs Kopia's engine in-process (agent/engine) rather than `server start`, so
// nothing mounts /api/v1/fleet there. `server start` always mounts them, so
// serving the single-machine screens off one means answering those routes the
// way that engine does - 404 - or the UI detects a Fleet and shows the
// activation wizard instead (src/mode.ts).
const noFleet = process.argv.includes("--no-fleet");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

function proxy(req, res) {
  const out = request(
    {
      host: api.hostname,
      port: api.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: api.host },
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  out.on("error", (err) => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`upstream: ${err.message}`);
  });
  req.pipe(out);
}

function sendFile(res, file) {
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}

function handle(req, res) {
  const path = new URL(req.url, "http://x").pathname;
  if (noFleet && path.startsWith("/api/v1/fleet")) {
    res.writeHead(404, { "content-type": "application/json" });
    return res.end('{"error":"not found"}');
  }
  if (path.startsWith("/api/") || path.startsWith("/enroll.sh") || path.startsWith("/dl/")) {
    return proxy(req, res);
  }
  // normalize() before join() is what keeps "/../../etc/passwd" inside root.
  const file = join(root, normalize(path).replace(/^(\.\.[/\\])+/, ""));
  if (file.startsWith(root) && extname(file) !== "") {
    try {
      if (statSync(file).isFile()) {
        return sendFile(res, file);
      }
    } catch {
      /* fall through to the SPA entry point */
    }
  }
  // Every client-side route (/fleet/devices/ag_x, /snapshots/dir/k1) is the
  // same document; the router reads the path.
  return sendFile(res, join(root, "index.html"));
}

for (const host of hosts) {
  createServer(handle).listen(port, host, () => console.log(`ui http://${host}:${port} -> ${api.origin}`));
}
