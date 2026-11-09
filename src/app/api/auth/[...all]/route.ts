import { getAuth } from "@/server/auth/auth";

// Resolved per request so `next build` never needs runtime secrets (P0-14; see getAuth).
const handler = (request: Request): Promise<Response> => getAuth().handler(request);

export { handler as GET, handler as POST };
