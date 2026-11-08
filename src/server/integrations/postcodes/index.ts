import "server-only";
import { assertFakeAllowed } from "../fake-support";

export type PostcodeResult = { postcode: string; lat: number; lng: number; district: string };

export interface PostcodeProvider {
  lookup(normalised: string): Promise<PostcodeResult | null>;
}

const UK_POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/;

/** "nw17jr " → "NW1 7JR"; null when it is not shaped like a UK postcode. */
export function normalisePostcode(input: string): string | null {
  const compact = input.replace(/\s+/g, "").toUpperCase();
  const m = UK_POSTCODE.exec(compact);
  return m ? `${m[1]} ${m[2]}` : null;
}

/** Fixture data for the demo shops' areas (TESTING §6 demo seed). */
const FIXTURES: Record<string, Omit<PostcodeResult, "postcode">> = {
  "NW1 7JR": { lat: 51.5413, lng: -0.1466, district: "Camden" },
  "LE1 5WW": { lat: 52.6349, lng: -1.1316, district: "Leicester" },
  "M1 1AE": { lat: 53.4794, lng: -2.2453, district: "Manchester" },
  "SW1A 1AA": { lat: 51.501, lng: -0.1416, district: "Westminster" },
};

const fixtureProvider: PostcodeProvider = {
  async lookup(postcode) {
    const hit = FIXTURES[postcode];
    return hit ? { postcode, ...hit } : null;
  },
};

/** The real provider arrives with the location task; until then only the fixture fake exists. */
function resolveProvider(): PostcodeProvider {
  assertFakeAllowed("Postcodes");
  return fixtureProvider;
}

export async function lookupPostcode(input: string): Promise<PostcodeResult | null> {
  const provider = resolveProvider();
  const postcode = normalisePostcode(input);
  return postcode ? provider.lookup(postcode) : null;
}
