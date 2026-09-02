import axios, { type AxiosError } from "axios";

/**
 * Which UI this build is serving:
 *
 * - `fleet` - a Fleet control plane (its routes answer).
 * - `agent` - the agent-local UI on a device, reached over loopback.
 * - `solo`  - plain single-user WarpHold, the inherited Kopia UI.
 */
export type Mode = "fleet" | "solo" | "agent";

export interface ModeInfo {
  mode: Mode;
  /** Only meaningful in fleet mode; false there means "show the Activate wizard". */
  activated: boolean;
}

/** Hostnames the agent UI is served on. Anything else is a real server. */
const LOOPBACK = new Set(["127.0.0.1", "localhost"]);

async function ok(url: string): Promise<boolean> {
  try {
    await axios.get(url, { withCredentials: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects the mode from the server rather than from build flags: one bundle is
 * served by the Fleet server, the agent and the single-user server alike.
 *
 * A 404 on /fleet/status means the server has no Fleet routes at all, which
 * leaves agent and solo. The agent UI is only ever reached over loopback and
 * only works once the local cookie handoff (/local/session?t=) has run, so a
 * successful /api/v1/sources call from a loopback origin is what separates
 * the two.
 *
 * Only a 404 is an answer. A 5xx or a network failure says nothing about
 * which product this is, so it is thrown rather than guessed at: falling back
 * to solo there would hand a Fleet admin the single-user UI during an outage
 * and make it look like their fleet had vanished.
 */
export async function detectMode(): Promise<ModeInfo> {
  try {
    const { data } = await axios.get<{ activated?: boolean }>("/api/v1/fleet/status", { withCredentials: true });
    return { mode: "fleet", activated: data?.activated === true };
  } catch (err) {
    if ((err as AxiosError).response?.status !== 404) {
      throw err;
    }
  }
  if (LOOPBACK.has(window.location.hostname) && (await ok("/api/v1/sources"))) {
    return { mode: "agent", activated: false };
  }
  return { mode: "solo", activated: false };
}
