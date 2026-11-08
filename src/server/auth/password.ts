import { hash, verify } from "@node-rs/argon2";

// Argon2id with OWASP-recommended parameters (19 MiB, t=2, p=1). SECURITY.md §2.
const OPTIONS = {
  algorithm: 2 /* Argon2id */,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const hashPassword = (password: string): Promise<string> => hash(password, OPTIONS);

export const verifyPassword = async ({
  hash: stored,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> => {
  try {
    return await verify(stored, password);
  } catch {
    return false; // malformed hash → treat as mismatch, never throw details
  }
};
