import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import type {
  Activated,
  Admin,
  AgentDetail,
  AgentOut,
  Created,
  CreatedTarget,
  CreatedToken,
  FleetStatus,
  Group,
  Overview,
  Settings,
  Target,
  TargetInput,
  Template,
  TemplateInput,
  TokenOut,
} from "./types";

/** Path the browser is sent to when a session has expired. */
export const LOGIN_PATH = "/fleet/login";

const CSRF_COOKIE = "wh_csrf";
const CSRF_HEADER = "X-WarpHold-CSRF";
const SETUP_TOKEN_HEADER = "X-WarpHold-Setup-Token";

/** Methods the server exempts from the CSRF double submit (`requireCSRF`). */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Commands `handleAgentCommand` accepts. */
export type CommandKind = "snapshot-now" | "pause" | "resume" | "verify";

export const fleetClient = axios.create({
  baseURL: "/api/v1/fleet",
  // The session lives in the HttpOnly wh_session cookie; nothing about the
  // session is ever put in localStorage, where a script could read it.
  withCredentials: true,
});

function readCookie(name: string): string {
  for (const part of document.cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) {
      continue;
    }
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return "";
}

// Double-submit CSRF: the server compares this header against the wh_csrf
// cookie on every state-changing request. Safe methods must not carry it -
// they are exempt server-side, and sending it anyway would fail preflight-free
// requests for nothing.
fleetClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (!SAFE_METHODS.has((config.method ?? "get").toUpperCase())) {
    const token = readCookie(CSRF_COOKIE);
    if (token) {
      config.headers.set(CSRF_HEADER, token);
    }
  }
  return config;
});

// A 401 means the session cookie is gone or was revoked server-side. Sending
// the browser to the login page from the login page itself would loop, and
// Login shows the "wrong email or password" error instead.
fleetClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && window.location.pathname !== LOGIN_PATH) {
      window.location.assign(LOGIN_PATH);
    }
    return Promise.reject(error);
  },
);

async function get<T>(url: string): Promise<T> {
  return (await fleetClient.get<T>(url)).data;
}

export const fleet = {
  status: () => get<FleetStatus>("/status"),

  /**
   * First-run activation. The setup token is the one-time secret the server
   * writes to <state dir>/setup-token; it is passed per call and never stored.
   */
  async activate(setupToken: string, passphrase: string, email: string, password: string): Promise<Activated> {
    const r = await fleetClient.post<Activated>(
      "/activate",
      { passphrase, email, password },
      { headers: { [SETUP_TOKEN_HEADER]: setupToken } },
    );
    return r.data;
  },

  // Sessions: POST /session signs in, DELETE /session signs out. Both set or
  // clear the wh_session and wh_csrf cookies; neither returns a body.
  async login(email: string, password: string): Promise<void> {
    await fleetClient.post("/session", { email, password });
  },
  async logout(): Promise<void> {
    await fleetClient.delete("/session");
  },

  admins: () => get<Admin[]>("/admins"),
  async inviteAdmin(email: string, password: string): Promise<Created> {
    return (await fleetClient.post<Created>("/admins", { email, password })).data;
  },
  async deleteAdmin(id: number): Promise<void> {
    await fleetClient.delete(`/admins/${id}`);
  },
  async changePassword(current: string, next: string): Promise<void> {
    await fleetClient.post("/admins/me/password", { current, new: next });
  },

  overview: () => get<Overview>("/overview"),

  agents: () => get<AgentOut[]>("/agents"),
  agent: (id: string) => get<AgentDetail>(`/agents/${encodeURIComponent(id)}`),
  async agentCommand(id: string, kind: CommandKind, source = ""): Promise<Created> {
    const r = await fleetClient.post<Created>(`/agents/${encodeURIComponent(id)}/commands`, { kind, source });
    return r.data;
  },
  async revokeAgent(id: string): Promise<void> {
    await fleetClient.post(`/agents/${encodeURIComponent(id)}/revoke`);
  },

  groups: () => get<Group[]>("/groups"),
  async createGroup(name: string, targetID: number, templateID: number): Promise<Created> {
    const r = await fleetClient.post<Created>("/groups", {
      name,
      target_id: targetID,
      template_id: templateID,
    });
    return r.data;
  },

  tokens: (groupID: number) => get<TokenOut[]>(`/groups/${groupID}/tokens`),
  /** `uses` of -1 means unlimited, matching the server's default. */
  async createToken(groupID: number, ttlSeconds: number, uses: number): Promise<CreatedToken> {
    const r = await fleetClient.post<CreatedToken>("/tokens", {
      group_id: groupID,
      ttl_seconds: ttlSeconds,
      max_uses: uses,
    });
    return r.data;
  },
  async revokeToken(id: number): Promise<void> {
    await fleetClient.post(`/tokens/${id}/revoke`);
  },

  templates: () => get<Template[]>("/templates"),
  async createTemplate(t: TemplateInput): Promise<Created> {
    return (await fleetClient.post<Created>("/templates", t)).data;
  },
  async updateTemplate(id: number, t: TemplateInput): Promise<void> {
    await fleetClient.put(`/templates/${id}`, t);
  },

  targets: () => get<Target[]>("/targets"),
  async createTarget(t: TargetInput): Promise<CreatedTarget> {
    return (await fleetClient.post<CreatedTarget>("/targets", t)).data;
  },

  settings: () => get<Settings>("/settings"),
  async setSetting(key: string, value: string): Promise<void> {
    await fleetClient.put("/settings", { key, value });
  },
};

/** Message the server sent with an error response, or a fallback. */
export function apiError(err: unknown, fallback: string): string {
  const data = (err as AxiosError<{ error?: string }>)?.response?.data;
  return typeof data?.error === "string" && data.error !== "" ? data.error : fallback;
}
