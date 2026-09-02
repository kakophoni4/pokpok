import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../common/prisma/prisma.service";
import { AvatarService } from "./avatar.service";

const PHOTO = "https://t.me/i/userpic/320/abc.svg";

function prismaWith(avatarUrl: string | null): PrismaService {
  return {
    user: { findUnique: vi.fn().mockResolvedValue({ avatarUrl }) },
  } as unknown as PrismaService;
}

function imageResponse(body = "png-bytes", contentType = "image/png"): Response {
  return new Response(body, { status: 200, headers: { "content-type": contentType } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AvatarService", () => {
  it("hands out the photo it fetched from Telegram", async () => {
    fetchMock.mockResolvedValue(imageResponse());
    const avatars = new AvatarService(prismaWith(PHOTO));

    const image = await avatars.forUser("u1");

    expect(image?.contentType).toBe("image/png");
    expect(image?.body.toString()).toBe("png-bytes");
    expect(fetchMock).toHaveBeenCalledWith(PHOTO, expect.anything());
  });

  it("fetches a given player's photo once, however many rosters show them", async () => {
    fetchMock.mockResolvedValue(imageResponse());
    const avatars = new AvatarService(prismaWith(PHOTO));

    await avatars.forUser("u1");
    await avatars.forUser("u1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // A roster of ten players renders ten <img> tags at once. Without this, the
  // first paint of a busy evening would open one upstream request per tag.
  it("collapses simultaneous requests for the same player into one download", async () => {
    fetchMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(imageResponse()), 10)),
    );
    const avatars = new AvatarService(prismaWith(PHOTO));

    const all = await Promise.all([
      avatars.forUser("u1"),
      avatars.forUser("u1"),
      avatars.forUser("u1"),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(all.every((image) => image?.body.toString() === "png-bytes")).toBe(true);
  });

  it("says nothing rather than something wrong when the player has no photo", async () => {
    const avatars = new AvatarService(prismaWith(null));

    expect(await avatars.forUser("u1")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a response that is not an image", async () => {
    fetchMock.mockResolvedValue(new Response("<html>blocked</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }));
    const avatars = new AvatarService(prismaWith(PHOTO));

    expect(await avatars.forUser("u1")).toBeNull();
  });

  it("survives Telegram being unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("ETIMEDOUT"));
    const avatars = new AvatarService(prismaWith(PHOTO));

    expect(await avatars.forUser("u1")).toBeNull();
  });

  it("retries a player whose photo could not be fetched, once the miss goes stale", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ETIMEDOUT"));
    const avatars = new AvatarService(prismaWith(PHOTO));
    expect(await avatars.forUser("u1")).toBeNull();

    fetchMock.mockResolvedValue(imageResponse());
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);

    expect((await avatars.forUser("u1"))?.body.toString()).toBe("png-bytes");
    vi.useRealTimers();
  });
});
