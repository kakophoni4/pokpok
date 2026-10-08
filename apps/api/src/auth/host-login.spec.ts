import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { hashHostPassword, verifyHostPassword } from "./host-password";

describe("host password login", () => {
  it("salts passwords and rejects missing or malformed credentials", async () => {
    const a = await hashHostPassword("test-password");
    expect(await hashHostPassword("test-password")).not.toBe(a);
    expect(await verifyHostPassword("test-password", a)).toBe(true);
    expect(await verifyHostPassword("wrong-password", a)).toBe(false);
    expect(await verifyHostPassword("test-password", null)).toBe(false);
    expect(await verifyHostPassword("test-password", "bad:hash")).toBe(false);
  });

  it("issues a normal refreshable session only for an active hostess", async () => {
    const credential = { passwordHash: await hashHostPassword("test-password") };
    const user = { id: "host", nickname: "Anna", role: "hostess", status: "active", hostCredential: credential, identities: [], displayName: null, avatarUrl: null, createdAt: new Date() };
    const findUnique = vi.fn().mockResolvedValue(user);
    const issue = vi.fn().mockResolvedValue({ accessToken: "access", refreshToken: "refresh", expiresIn: 900 });
    const auth = new AuthService({ user: { findUnique } } as never, {} as never, { issue } as never, {} as never, {} as never);
    const result = await auth.loginAsHost("Anna", "test-password");
    expect(result.user.role).toBe("hostess");
    expect(result.refreshToken).toBe("refresh");
    expect(JSON.stringify(result)).not.toContain(credential.passwordHash);
    for (const candidate of [null, { ...user, role: "player" }, { ...user, role: "dealer" }, { ...user, role: "admin" }, { ...user, status: "blocked" }, { ...user, hostCredential: null }]) {
      findUnique.mockResolvedValue(candidate);
      await expect(auth.loginAsHost("Anna", "test-password")).rejects.toMatchObject({ status: 401 });
    }
    findUnique.mockResolvedValue(user);
    await expect(auth.loginAsHost("Anna", "wrong-password")).rejects.toMatchObject({ status: 401 });
    expect(issue).toHaveBeenCalledTimes(1);
  });

  it("restricts password setup to admin and revokes old sessions without recording secrets", async () => {
    expect(Reflect.getMetadata("auth:roles", AuthController.prototype.hostPassword)).toEqual(["admin"]);
    const upsert = vi.fn(); const updateMany = vi.fn(); const record = vi.fn();
    const tx = { $queryRaw: vi.fn(), user: { findUnique: vi.fn().mockResolvedValue({ role: "hostess" }) }, hostCredential: { upsert }, session: { updateMany } };
    const auth = new AuthService({ $transaction: (fn: any) => fn(tx) } as never, {} as never, {} as never, { record } as never, {} as never);
    await auth.setHostPassword("admin", "host", "test-password");
    expect(await verifyHostPassword("test-password", upsert.mock.calls[0]![0].create.passwordHash)).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({ where: { userId: "host", revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(JSON.stringify(record.mock.calls)).not.toContain("test-password");
    tx.user.findUnique.mockResolvedValue({ role: "player" });
    await expect(auth.setHostPassword("admin", "player", "test-password")).rejects.toMatchObject({ status: 403 });
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

