import "server-only";
import { assertFakeAllowed } from "../fake-support";

export type Place = { placeId: string; name: string; address: string; lat: number; lng: number };

export interface PlacesProvider {
  search(query: string): Promise<Place[]>;
}

const FIXTURES: Place[] = [
  { placeId: "fixture-brew-bloom", name: "Brew & Bloom Café", address: "12 Parkway, London NW1 7JR", lat: 51.5413, lng: -0.1466 },
  { placeId: "fixture-patels", name: "Patel's Corner Store", address: "4 High Street, Leicester LE1 5WW", lat: 52.6349, lng: -1.1316 },
  { placeId: "fixture-glow", name: "Glow Studio", address: "20 Market Street, Manchester M1 1AE", lat: 53.4794, lng: -2.2453 },
];

const fixtureProvider: PlacesProvider = {
  async search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return FIXTURES.filter((p) => p.name.toLowerCase().includes(q));
  },
};

/** Google Places is optional (TESTING §9); the real provider arrives with shop onboarding. */
function resolveProvider(): PlacesProvider {
  assertFakeAllowed("Places");
  return fixtureProvider;
}

export async function searchPlaces(query: string): Promise<Place[]> {
  return resolveProvider().search(query);
}
