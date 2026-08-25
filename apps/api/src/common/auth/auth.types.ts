import type { UserRole } from "@poker/contracts";

export type RequestUser = {
  id: string;
  role: UserRole;
  nickname: string;
  audience: "web" | "miniapp" | "bot";
};

/** Express request augmented by JwtAuthGuard. */
export type AuthedRequest = {
  user?: RequestUser;
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string>;
  ip?: string;
};
