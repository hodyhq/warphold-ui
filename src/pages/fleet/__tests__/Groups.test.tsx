import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { Groups } from "../Groups";
import type { AgentOut, Group, Target, Template, TokenOut } from "../../../api/types";

const groups = vi.fn();
const targets = vi.fn();
const templates = vi.fn();
const agents = vi.fn();
const tokens = vi.fn();
const createGroup = vi.fn();
const createToken = vi.fn();
const revokeToken = vi.fn();

vi.mock(import("../../../api/fleet"), async (importOriginal) => ({
  ...(await importOriginal()),
  fleet: {
    groups: () => groups(),
    targets: () => targets(),
    templates: () => templates(),
    agents: () => agents(),
    tokens: (id: number) => tokens(id),
    createGroup: (name: string, targetID: number, templateID: number) => createGroup(name, targetID, templateID),
    createToken: (groupID: number, ttl: number, uses: number) => createToken(groupID, ttl, uses),
    revokeToken: (id: number) => revokeToken(id),
  } as unknown as typeof import("../../../api/fleet").fleet,
}));

const GROUPS: Group[] = [
  { id: 1, name: "Laptops", target_id: 1, template_id: 1 },
  { id: 2, name: "Servers", target_id: 2, template_id: 2 },
];

const TARGETS: Target[] = [
  { id: 1, name: "fleet-backups", kind: "b2", bucket: "fleet-backups", region: "us-west-004" },
  { id: 2, name: "tank", kind: "filesystem", path: "/tank/warphold" },
];

const TEMPLATES: Template[] = [
  { id: 1, name: "Home default", sources: ["~"], policy: {} },
  { id: 2, name: "Server · system scope", sources: ["/srv"], policy: {} },
];

function agent(id: string, groupID: number): AgentOut {
  return {
    id,
    name: id,
    hostname: id,
    os: "linux",
    arch: "amd64",
    version: "0.1.1",
    scope: "user",
    group_id: groupID,
    enrolled_at: "2026-08-01T00:00:00Z",
    last_seen_at: null,
    revoked_at: null,
    health: "green",
  };
}

const AGENTS: AgentOut[] = [agent("laptop-1", 1), agent("office-desktop", 1), agent("node-a", 2)];

/** One live token for Laptops, none for Servers. */
function tokensFor(groupID: number): TokenOut[] {
  if (groupID !== 1) {
    return [];
  }
  return [
    {
      id: 7,
      expires_at: new Date(Date.now() + 6 * 86_400_000 + 3_600_000).toISOString(),
      max_uses: 5,
      uses: 2,
      revoked_at: null,
    },
  ];
}

const NEW_TOKEN = "wh_7Kq2deadbeefdeadbeef";

function renderGroups() {
  return render(
    <MemoryRouter>
      <Groups />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  groups.mockReset().mockResolvedValue(GROUPS);
  targets.mockReset().mockResolvedValue(TARGETS);
  templates.mockReset().mockResolvedValue(TEMPLATES);
  agents.mockReset().mockResolvedValue(AGENTS);
  tokens.mockReset().mockImplementation((id: number) => Promise.resolve(tokensFor(id)));
  createGroup.mockReset().mockResolvedValue({ id: 3 });
  createToken.mockReset().mockResolvedValue({
    id: 9,
    token: NEW_TOKEN,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    max_uses: 1,
  });
  revokeToken.mockReset().mockResolvedValue(undefined);
});

/** The card for one group, once the screen has loaded. */
function card(name: string): Promise<HTMLElement> {
  return screen.findByTestId(`group-${name}`);
}

describe("Groups", () => {
  it("renders a card per group with its target, template, devices and tokens", async () => {
    renderGroups();

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("2 groups");

    const laptops = await card("Laptops");
    expect(laptops).toHaveTextContent("B2 · fleet-backups");
    expect(laptops).toHaveTextContent("Home default");
    expect(laptops).toHaveTextContent("2 devices");
    expect(laptops).toHaveTextContent("1 token · expires in 6 d · 3 uses left");

    const servers = await card("Servers");
    expect(servers).toHaveTextContent("Filesystem · /tank/warphold");
    expect(servers).toHaveTextContent("1 device");
    expect(servers).toHaveTextContent("no active tokens");
  });

  it("creates a group from the New group dialog", async () => {
    renderGroups();
    await userEvent.click(await screen.findByRole("button", { name: /new group/i }));

    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/name/i), "Family");
    await userEvent.selectOptions(within(dialog).getByLabelText(/target/i), "2");
    await userEvent.selectOptions(within(dialog).getByLabelText(/policy template/i), "2");
    await userEvent.click(within(dialog).getByRole("button", { name: /create group/i }));

    await waitFor(() => expect(createGroup).toHaveBeenCalledWith("Family", 2, 2));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("issues a token and never puts it in the copied command", async () => {
    renderGroups();
    await userEvent.click(within(await card("Laptops")).getByRole("button", { name: /download installer/i }));

    const dialog = screen.getByRole("dialog");
    await userEvent.selectOptions(within(dialog).getByLabelText(/token lasts/i), "86400");
    await userEvent.selectOptions(within(dialog).getByLabelText(/uses/i), "-1");
    await userEvent.click(within(dialog).getByRole("button", { name: /create token/i }));

    await waitFor(() => expect(createToken).toHaveBeenCalledWith(1, 86_400, -1));

    const command = await screen.findByLabelText(/run on the machine/i);
    expect(command).toHaveValue(`curl -fsSL ${window.location.origin}/enroll.sh | sh`);
    expect((command as HTMLInputElement).value).not.toContain(NEW_TOKEN);
    expect(screen.getByLabelText(/^enrollment token$/i)).toHaveValue(NEW_TOKEN);

    // The token-on-the-command-line form exists, but only behind a disclosure
    // that says what it costs.
    const unattended = screen.getByLabelText(/unattended command/i);
    expect(unattended).toHaveValue(
      `WARPHOLD_ENROLL_TOKEN=${NEW_TOKEN} sh -c "$(curl -fsSL ${window.location.origin}/enroll.sh)"`,
    );
    expect(screen.getByText(/kept in the shell history of the machine that runs it/i)).toBeInTheDocument();
  });

  it("lists and revokes tokens from the Tokens dialog", async () => {
    renderGroups();
    await userEvent.click(within(await card("Laptops")).getByRole("button", { name: /^tokens$/i }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/3 uses left/i)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: /revoke/i }));
    await waitFor(() => expect(revokeToken).toHaveBeenCalledWith(7));
  });

  it("shows the server's message when a group cannot be created", async () => {
    createGroup.mockRejectedValue({ response: { data: { error: "unknown target_id" } } });
    renderGroups();
    await userEvent.click(await screen.findByRole("button", { name: /new group/i }));

    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/name/i), "Family");
    await userEvent.click(within(dialog).getByRole("button", { name: /create group/i }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("unknown target_id");
  });

  it("offers a first group when the fleet has none", async () => {
    groups.mockResolvedValue([]);
    renderGroups();

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("No groups yet");
    expect(screen.getByRole("button", { name: /new group/i })).toBeInTheDocument();
  });
});
