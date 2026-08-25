import type { Prisma } from "../../generated/prisma/client";

/** The Prisma client handed to a `$transaction` callback. */
export type TxClient = Prisma.TransactionClient;
