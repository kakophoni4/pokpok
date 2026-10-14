import { describe, expect, it, vi } from "vitest";
import { castConnection, CAST_NAMESPACE, prepareCast, sendCastScreen } from "../lib/google-cast";

describe("Chromecast hall screen", () => {
  const connection = { id: "event123", token: "53267fb7-c614-4d93-a7d7-f8dfa12a79d5" };
  it("accepts only a tournament and read-only display token, never navigation or extra credentials", () => {
    expect(castConnection({ ...connection, accessToken: "staff-secret", url: "https://evil.test" })).toEqual(connection);
    expect(castConnection({ id: "https://evil.test", token: connection.token })).toBeNull();
    expect(castConnection({ id: connection.id, token: "" })).toBeNull();
    expect(castConnection(null)).toBeNull();
  });
  it("requires a registered application ID instead of launching a fake media receiver", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ applicationId: null }) }));
    await expect(prepareCast()).rejects.toThrow("Chromecast ещё не настроен");
  });
  it("launches the chosen receiver and sends only display access", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const context = { setOptions: vi.fn(), requestSession: vi.fn().mockResolvedValue(undefined), getCurrentSession: () => ({ sendMessage }) };
    await sendCastScreen(context, connection);
    expect(context.requestSession).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith(CAST_NAMESPACE, connection);
  });
  it("does not send a screen when device selection is cancelled or no session exists", async () => {
    const sendMessage = vi.fn();
    await expect(sendCastScreen({ setOptions: vi.fn(), requestSession: vi.fn().mockRejectedValue(new Error("cancelled")), getCurrentSession: () => ({ sendMessage }) }, connection)).rejects.toThrow("cancelled");
    expect(sendMessage).not.toHaveBeenCalled();
    await expect(sendCastScreen({ setOptions: vi.fn(), requestSession: vi.fn().mockResolvedValue(undefined), getCurrentSession: () => null }, connection)).rejects.toThrow("Телевизор не подключён");
  });
});
