import { config } from "dotenv";

// Local: .env.local wins over .env; CI/servers inject real env vars (never overwritten).
config({ path: ".env.local", quiet: true });
config({ quiet: true });
