import type { LinkedIdentity, MeUser, PublicUser } from "@poker/contracts";
import type { Identity, User } from "../generated/prisma/client";

export type UserWithIdentities = User & { identities: Identity[] };

export function toPublicUser(
  user: Pick<User, "id" | "nickname" | "displayName" | "avatarUrl" | "role">,
): PublicUser {
  return {
    id: user.id,
    nickname: user.nickname,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
  };
}

export function toMeUser(user: UserWithIdentities): MeUser {
  return {
    ...toPublicUser(user),
    displayName: user.displayName,
    status: user.status,
    identities: user.identities.map(toLinkedIdentity),
    createdAt: user.createdAt.toISOString(),
  };
}

function toLinkedIdentity(identity: Identity): LinkedIdentity {
  return {
    provider: identity.provider,
    username: identity.providerUsername,
    linkedAt: identity.createdAt.toISOString(),
  };
}
