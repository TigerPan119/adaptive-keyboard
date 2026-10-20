import assert from "node:assert/strict";
import {
  buildVistaBackgroundRequestUrl,
  normalizeBackgroundMode,
  normalizeBackgroundApiUrl,
  parseBackgroundApiResponse,
  parseVistaBackgroundResponse,
} from "../src/js/chord-theory/background-presets.js";

assert.equal(normalizeBackgroundMode("nebula"), "nebula");
assert.equal(normalizeBackgroundMode("api"), "api");
assert.equal(normalizeBackgroundMode("custom", true), "custom");
assert.equal(normalizeBackgroundMode("custom", false), "none");
assert.equal(normalizeBackgroundMode("invalid"), "none");

assert.equal(normalizeBackgroundApiUrl("https://example.com/random"), "https://example.com/random");
assert.equal(normalizeBackgroundApiUrl("javascript:alert(1)"), "");
assert.equal(parseBackgroundApiResponse({ url: "https://example.com/image.webp" }), "https://example.com/image.webp");
assert.equal(parseBackgroundApiResponse({ data: { image: "https://example.com/nested.jpg" } }), "https://example.com/nested.jpg");
assert.equal(parseBackgroundApiResponse([{ imgurl: "https://example.com/array.png" }]), "https://example.com/array.png");
assert.throws(() => parseBackgroundApiResponse({ message: "No image" }));

const vistaRequestUrl = new URL(buildVistaBackgroundRequestUrl("misty forest", 42.8));
assert.equal(vistaRequestUrl.hostname, "api.sourcesplash.com");
assert.equal(vistaRequestUrl.searchParams.get("q"), "misty forest");
assert.equal(vistaRequestUrl.searchParams.get("page"), "42");

const vistaPayload = {
  total_results: 8000,
  photos: [
    { id: "portrait", url: "https://www.sourcesplash.com/i/portrait", width: 900, height: 1200 },
    { id: "seen", url: "https://www.sourcesplash.com/i/seen", width: 1920, height: 1080 },
    {
      id: "fresh",
      url: "https://www.sourcesplash.com/i/fresh",
      width: 1800,
      height: 1000,
      source: "pexels",
      author: "Example Artist",
      author_url: "https://example.com/artist",
      description: "A cinematic landscape.",
    },
  ],
};
assert.deepEqual(parseVistaBackgroundResponse(vistaPayload, ["seen"], () => 0), {
  id: "fresh",
  url: "https://www.sourcesplash.com/i/fresh",
  source: "pexels",
  author: "Example Artist",
  authorUrl: "https://example.com/artist",
  description: "A cinematic landscape.",
  totalResults: 8000,
});

console.log("Background preset tests passed.");
