import type { Api } from "./api.js";
import { setTimezone } from "./format.js";

type PublicClubInfo = { infoText: string; timezone: string };

const TTL_MS = 60_000;

/**
 * Club description and timezone, cached briefly.
 *
 * Both are edited by admins and read on almost every screen, so the bot keeps a
 * short-lived copy: an edit shows up within a minute, and a busy evening does not
 * turn into one API call per button press.
 */
export class ClubInfo {
  private cached: PublicClubInfo | null = null;
  private fetchedAt = 0;

  constructor(private readonly api: Api) {}

  async get(): Promise<PublicClubInfo> {
    if (this.cached && Date.now() - this.fetchedAt < TTL_MS) return this.cached;

    try {
      const info = await this.api.public<PublicClubInfo>("/club/info");
      this.cached = info;
      this.fetchedAt = Date.now();
      setTimezone(info.timezone);
      return info;
    } catch (error) {
      // Falling back to the last known copy keeps the bot answering while the
      // API is restarting, which is exactly when people press buttons anyway.
      if (this.cached) return this.cached;
      throw error;
    }
  }
}
