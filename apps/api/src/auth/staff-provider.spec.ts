import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";

describe("password-only staff access", () => {
  it.each(["admin", "dealer", "floor", "hostess"])("rejects provider login for %s before issuing a session", async role => {
    const issue = vi.fn(); const identityUpdate = vi.fn();
    const auth = new AuthService({ identity: { findUnique: vi.fn().mockResolvedValue({ user: { role, status: "active" } }), update: identityUpdate } } as never, {} as never, { issue } as never, {} as never, {} as never);
    await expect(auth.loginWithProvider({ provider: "telegram", providerUserId: "tg" } as never, "web", {})).rejects.toMatchObject({ status: 403 });
    expect(issue).not.toHaveBeenCalled(); expect(identityUpdate).not.toHaveBeenCalled();
  });
  it("rejects an already-confirmed provider ticket for staff", async () => {
    const issue = vi.fn();
    const db = { loginTicket: { findUnique: vi.fn().mockResolvedValue({ id: "ticket", state: "confirmed", userId: "admin", expiresAt: new Date(Date.now()+60000) }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, user: { findUnique: vi.fn().mockResolvedValue({ id: "admin", role: "admin" }) } };
    const auth = new AuthService(db as never, {} as never, { issue } as never, {} as never, {} as never);
    await expect(auth.loginTicketStatus("ticket")).rejects.toMatchObject({ status: 403 });expect(issue).not.toHaveBeenCalled();
  });
  it("rejects legacy staff refresh and closes the admin transition once a password exists", async () => {
    const row = { id: "session", audience: "web", expiresAt: new Date(Date.now()+60000), staffPassword: false, user: { id: "staff", role: "hostess", status: "active" } };
    const db = { session: { findUnique: vi.fn().mockResolvedValue(row) }, adminCredential: { findUnique: vi.fn().mockResolvedValue({ passwordHash: "hash" }) } };
    const tokens = new TokenService(db as never, {} as never, {} as never);
    await expect(tokens.rotate("old")).rejects.toMatchObject({ status: 401 });
    row.user.role="admin";
    await expect(tokens.rotate("old")).rejects.toMatchObject({ status: 401 });
  });
});
