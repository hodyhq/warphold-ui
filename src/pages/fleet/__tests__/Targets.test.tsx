import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { storageChips, Targets } from "../Targets";
import type { AgentOut, Group, Target } from "../../../api/types";

const targets = vi.fn();
const groups = vi.fn();
const agents = vi.fn();
const createTarget = vi.fn();

vi.mock(import("../../../api/fleet"), async (importOriginal) => ({
  ...(await importOriginal()),
  fleet: {
    targets: () => targets(),
    groups: () => groups(),
    agents: () => agents(),
    createTarget: (t: unknown) => createTarget(t),
  } as unknown as typeof import("../../../api/fleet").fleet,
}));

const TARGETS: Target[] = [
  {
    id: 1,
    name: "fleet-backups",
    kind: "b2",
    bucket: "fleet-backups",
    region: "us-west-004",
    object_lock_verified_at: "2026-08-30T03:00:00Z",
  },
  { id: 2, name: "tank", kind: "filesystem", path: "/tank/warphold" },
];

const GROUPS: Group[] = [
  { id: 1, name: "Laptops", target_id: 1, template_id: 1 },
  { id: 2, name: "Servers", target_id: 2, template_id: 1 },
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

beforeEach(() => {
  targets.mockReset().mockResolvedValue(TARGETS);
  groups.mockReset().mockResolvedValue(GROUPS);
  agents.mockReset().mockResolvedValue([agent("a", 1), agent("b", 1), agent("c", 2)]);
  createTarget.mockReset().mockResolvedValue({ id: 3, object_lock_verified: true });
});

describe("Targets", () => {
  it("renders a card per target with its Object Lock state and device count", async () => {
    render(<Targets />);

    const b2 = await screen.findByTestId("target-1");
    expect(b2).toHaveTextContent("Backblaze B2 · fleet-backups");
    expect(b2).toHaveTextContent("Object Lock verified");
    expect(b2).toHaveTextContent("us-west-004");
    expect(b2).toHaveTextContent("2 devices");

    const fs = screen.getByTestId("target-2");
    expect(fs).toHaveTextContent("Filesystem · /tank/warphold");
    expect(fs).toHaveTextContent("Local");
    expect(fs).toHaveTextContent("No immutability");
  });

  it("creates a filesystem target from the path alone", async () => {
    render(<Targets />);
    await userEvent.click(await screen.findByRole("button", { name: /add target/i }));

    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: /folder on this server/i }));
    await userEvent.type(within(dialog).getByLabelText(/name/i), "spare");
    await userEvent.type(within(dialog).getByLabelText(/path/i), "/mnt/spare");
    await userEvent.click(within(dialog).getByRole("button", { name: /add target/i }));

    await waitFor(() =>
      expect(createTarget).toHaveBeenCalledWith({ name: "spare", kind: "filesystem", path: "/mnt/spare" }),
    );
  });

  it("sends the B2 credentials once and never renders them back", async () => {
    render(<Targets />);
    await userEvent.click(await screen.findByRole("button", { name: /add target/i }));

    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/name/i), "offsite");
    await userEvent.type(within(dialog).getByLabelText(/bucket/i), "offsite-backups");
    await userEvent.type(within(dialog).getByLabelText(/region/i), "us-west-004");
    await userEvent.type(within(dialog).getByLabelText(/key id/i), "004abc");
    await userEvent.type(within(dialog).getByLabelText(/^application key$/i), "SECRETKEY");
    await userEvent.click(within(dialog).getByRole("button", { name: /add target/i }));

    await waitFor(() =>
      expect(createTarget).toHaveBeenCalledWith({
        name: "offsite",
        kind: "b2",
        bucket: "offsite-backups",
        region: "us-west-004",
        key_id: "004abc",
        key: "SECRETKEY",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // The list endpoint never returns credentials, and nothing keeps a copy.
    expect(document.body.textContent).not.toContain("SECRETKEY");
  });

  it("surfaces the server's B2 rejection", async () => {
    createTarget.mockRejectedValue({ response: { data: { error: "b2: bucket not found" } } });
    render(<Targets />);
    await userEvent.click(await screen.findByRole("button", { name: /add target/i }));

    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/name/i), "offsite");
    await userEvent.type(within(dialog).getByLabelText(/bucket/i), "nope");
    await userEvent.type(within(dialog).getByLabelText(/key id/i), "004abc");
    await userEvent.type(within(dialog).getByLabelText(/^application key$/i), "SECRETKEY");
    await userEvent.click(within(dialog).getByRole("button", { name: /add target/i }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("bucket not found");
  });

  it("warns when a new B2 bucket has no Object Lock", async () => {
    createTarget.mockResolvedValue({ id: 3, object_lock_verified: false });
    render(<Targets />);
    await userEvent.click(await screen.findByRole("button", { name: /add target/i }));

    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/name/i), "offsite");
    await userEvent.type(within(dialog).getByLabelText(/bucket/i), "offsite-backups");
    await userEvent.type(within(dialog).getByLabelText(/key id/i), "004abc");
    await userEvent.type(within(dialog).getByLabelText(/^application key$/i), "SECRETKEY");
    await userEvent.click(within(dialog).getByRole("button", { name: /add target/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/object lock/i);
  });
});

describe("offsite state on a target row", () => {
  const NOW = Date.parse("2026-09-02T12:00:00Z");
  const hosted = (over: Partial<Target> = {}): Target => ({
    id: 9,
    name: "fleet-disk",
    kind: "hosted",
    storage_mode: "disk",
    path: "/srv/warphold/hosted",
    ...over,
  });

  it("says nothing about offsite when the target keeps no mirror", () => {
    expect(storageChips(hosted(), NOW)).toEqual([{ text: "local ✓", tone: "good" }]);
    expect(storageChips({ id: 2, name: "tank", kind: "filesystem", path: "/tank" }, NOW)).toEqual([]);
  });

  it("gives a mirroring filesystem target the same local chip as a hosted one", () => {
    const chips = storageChips(
      {
        id: 2,
        name: "tank",
        kind: "filesystem",
        path: "/tank",
        mirror_kind: "b2",
        mirror_lock_verified_at: "2026-09-01T00:00:00Z",
        mirrored_at: "2026-09-02T10:00:00Z",
      },
      NOW,
    );
    expect(chips).toEqual([
      { text: "local ✓", tone: "good" },
      { text: "offsite ✓ 2 h ago", tone: "good" },
    ]);
  });

  it("calls a verified mirror that has never run bad, not stale", () => {
    // No mirrored_at: there is no offsite copy to have gone old.
    expect(
      storageChips(hosted({ mirror_kind: "b2", mirror_lock_verified_at: "2026-09-01T00:00:00Z" }), NOW)[1],
    ).toEqual({ text: "offsite never run", tone: "bad" });
  });

  it("shows the age of the newest mirror when it is current", () => {
    const chips = storageChips(
      hosted({
        mirror_kind: "b2",
        mirror_lock_verified_at: "2026-09-01T00:00:00Z",
        mirrored_at: "2026-09-02T10:00:00Z",
      }),
      NOW,
    );
    expect(chips).toEqual([
      { text: "local ✓", tone: "good" },
      { text: "offsite ✓ 2 h ago", tone: "good" },
    ]);
  });

  it("flips to a warning exactly when the server calls the mirror stale", () => {
    const t = hosted({
      mirror_kind: "b2",
      mirror_lock_verified_at: "2026-09-01T00:00:00Z",
      mirrored_at: "2026-09-02T10:00:00Z",
    });
    // Same timestamp either side of the boundary: staleness is the server's
    // 3x-interval call (see fleet/api mirrorStale), never a second one here.
    expect(storageChips({ ...t, mirror_stale: false }, NOW)[1]).toEqual({ text: "offsite ✓ 2 h ago", tone: "good" });
    expect(storageChips({ ...t, mirror_stale: true }, NOW)[1]).toEqual({ text: "offsite stale", tone: "warn" });
  });

  it("calls an unverified mirror bad, ahead of any staleness", () => {
    expect(
      storageChips(hosted({ mirror_kind: "b2", mirrored_at: "2026-09-02T10:00:00Z", mirror_stale: true }), NOW)[1],
    ).toEqual({
      text: "offsite unverified",
      tone: "bad",
    });
  });

  it("says cloud-direct once, with its Object Lock", () => {
    const cloud = hosted({ storage_mode: "cloud", bucket: "fleet", object_lock_verified_at: "2026-09-01T00:00:00Z" });
    expect(storageChips(cloud, NOW)).toEqual([{ text: "cloud ✓ (Object Lock)", tone: "good" }]);
    expect(storageChips({ ...cloud, object_lock_verified_at: null }, NOW)).toEqual([{ text: "cloud ✓", tone: "good" }]);
  });

  it("renders the chips on the card", async () => {
    targets.mockResolvedValue([
      hosted({
        mirror_kind: "b2",
        mirror_bucket: "hody-offsite",
        mirror_lock_verified_at: "2026-09-01T00:00:00Z",
        mirrored_at: "2026-08-30T00:00:00Z",
        mirror_stale: true,
      }),
    ]);
    render(<Targets />);

    const card = await screen.findByTestId("target-9");
    expect(card).toHaveTextContent("Fleet disk · /srv/warphold/hosted");
    expect(card).toHaveTextContent("local ✓");
    expect(card).toHaveTextContent("offsite stale");
    expect(card).toHaveTextContent("Mirrored to B2 · hody-offsite");
  });
});
