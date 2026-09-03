# How these screenshots are made

`scripts/screenshots.sh` builds the UI in this checkout, stands up throwaway
WarpHold servers, seeds them with invented demo data, captures every screen at
1440 px and 412 px into this directory, and writes [`index.md`](index.md).

```bash
scripts/screenshots.sh                # everything
scripts/screenshots.sh --plan-only    # just write PLAN.json (no servers, no browser)
scripts/screenshots.sh --only fleet-overview
scripts/screenshots.sh --keep         # leave the demo servers up afterwards
```

It needs `node`, `go` (to build the server, once) and a headless
`chromium`/`google-chrome`. It adds **no npm dependency** - no Playwright, no
Puppeteer. Useful environment variables:

| Variable             | Default                        | What it is                                     |
| -------------------- | ------------------------------ | ---------------------------------------------- |
| `WARPHOLD_SRC`       | `../warphold`                  | the server repo to build from                  |
| `WARPHOLD_BIN`       | `$WARPHOLD_SHOTS_DIR/warphold` | a prebuilt server binary to use instead        |
| `WARPHOLD_SHOTS_DIR` | `/tmp/warphold-demo`           | scratch state; wiped at the start of every run |

## PLAN.json is the contract

Every run writes [`PLAN.json`](PLAN.json): each screen's name, URL, viewport,
caption and the clicks needed to reach it. Two drivers follow the same file, so
a capture taken either way lands on the same `<screen>@<width>.png`:

- **`scripts/shots/capture.mjs`** - headless Chrome over CDP, which is what the
  script runs by default. It speaks the DevTools protocol over the WebSocket
  that is already in Node; there is no browser-automation library here.
- **The chrome-devtools MCP driver.** Run `scripts/screenshots.sh --keep`, then
  for each screen: `new_page` with an `isolatedContext`, `emulate` with
  `1440x900x1` or `412x915x1,mobile,touch`, `navigate_page` to the screen's URL,
  sign in on the Fleet origin (`admin@example.com` / `testpassword1`) with
  `take_snapshot` + `fill_form` + `click`, replay the screen's `actions`, then
  `take_screenshot` with `filePath` set to `docs/screenshots/<name>@<width>.png`.

The committed `PLAN.json` carries placeholder ids (`ag_example01`,
`kexampleobjectid`); a real run rewrites them with the ids the seed just made.

## What is in the demo data

`scripts/shots/seed.sh` refuses to run against a non-empty state directory -
the seed is the only data any capture can contain. It makes: two storage
targets, two policy templates, two groups, and three devices - `laptop-1`
(green, a full 30-day strip), `media-nuc` (red, with the error it reported) and
`office-desktop` (enrolled, never run) - plus a single-machine repository with a
few snapshots of `/home/user/Documents` and `/home/user/Pictures`.

No real hostname, address, account or device name appears anywhere. The check is
a case-insensitive recursive `grep` over this directory for the maintainer's own
account name, the homelab subnet prefix and the templated fleet-host placeholder; it
must find nothing, PNG metadata included.

Three servers are involved, because the UI picks its product from what the
server answers (`src/mode.ts`):

| Origin           | What it is                                                            |
| ---------------- | --------------------------------------------------------------------- |
| `127.0.0.1:5411` | the seeded Fleet server                                               |
| `127.0.0.1:5412` | a second Fleet server, deliberately **not** activated, for the wizard |
| `127.0.0.2:5413` | the single-machine app                                                |
| `127.0.0.1:5413` | the same server on loopback, which is the agent UI                    |

`scripts/shots/serve.mjs` serves the built bundle and proxies `/api`; for the
single-machine origins it answers `/api/v1/fleet/*` with 404, the way the
agent's in-process engine does, since `server start` always mounts the Fleet
routes.

## Optimisation

If `oxipng` or `pngquant` is on `PATH`, the PNGs are optimised in place after
capture. Neither is required.
