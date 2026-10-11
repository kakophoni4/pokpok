import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";

describe("provider tickets do not grant staff access", () => {
  it("opens the same admin account as a player after Telegram confirmation", async () => {
    const user = { id: "admin", nickname: "Owner", role: "admin", status: "active", identities: [], createdAt: new Date() };
    const issue = vi.fn().mockResolvedValue({ accessToken: "access", refreshToken: "refresh", expiresIn: 900 });
    const db = {
      loginTicket: {
        findUnique: vi.fn().mockResolvedValue({ id: "ticket", state: "confirmed", userId: user.id, expiresAt: new Date(Date.now() + 60000) }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: { findUnique: vi.fn().mockResolvedValue(user) },
    };
    const auth = new AuthService(db as never, {} as never, { issue } as never, {} as never, {} as never);
    const result = await auth.loginTicketStatus("ticket");
    expect(result.state).toBe("confirmed");
    expect(result.session?.user).toMatchObject({ id: user.id, role: "player" });
    expect(issue).toHaveBeenCalledWith({ id: user.id, nickname: user.nickname, role: "player" }, "web", {}, false);
  });
});
