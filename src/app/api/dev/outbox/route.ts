import { connection, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { devOutbox } from "@/server/integrations/email";

/**
 * Dev/E2E only: latest captured email for an address. 404 everywhere except APP_ENV=local|test,
 * so sign-in tokens can never leak from staging or production.
 */
export async function GET(req: NextRequest) {
  await connection();
  const { APP_ENV } = env();
  if (APP_ENV !== "local" && APP_ENV !== "test") return new Response("Not found", { status: 404 });
  const to = req.nextUrl.searchParams.get("to");
  const message = [...devOutbox()].reverse().find((m) => !to || m.to === to);
  if (!message) return Response.json({ message: null }, { status: 404 });
  return Response.json({
    message: { to: message.to, kind: message.kind, subject: message.subject, text: message.text },
  });
}
