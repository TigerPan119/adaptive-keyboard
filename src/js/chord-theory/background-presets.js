export const BUILT_IN_BACKGROUND_MODES = Object.freeze([
  "none",
  "studio",
  "atmosphere",
  "stage",
  "solid",
  "nebula",
  "satin",
  "halo",
  "api",
]);

const builtInBackgroundModes = new Set(BUILT_IN_BACKGROUND_MODES);
const VISTA_BACKGROUND_API_URL = "https://api.sourcesplash.com/api/search";

function safeHttpsUrl(value) {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

export function normalizeBackgroundMode(mode, hasCustomBackground = false) {
  if (builtInBackgroundModes.has(mode)) return mode;
  return mode === "custom" && hasCustomBackground ? "custom" : "none";
}

export function normalizeBackgroundApiUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function parseBackgroundApiResponse(payload) {
  const source = Array.isArray(payload) ? payload[0] : payload;
  const candidates = typeof source === "string"
    ? [source]
    : [
      source?.url,
      source?.image,
      source?.imgurl,
      source?.image_url,
      source?.data?.url,
      source?.data?.image,
      source?.data?.imgurl,
      source?.data?.image_url,
    ];
  const imageUrl = candidates.map(normalizeBackgroundApiUrl).find(Boolean);
  if (!imageUrl) throw new Error("The API response does not contain a supported image URL.");
  return imageUrl;
}

export function buildVistaBackgroundRequestUrl(query, page = 1) {
  const url = new URL(VISTA_BACKGROUND_API_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("page", String(Math.max(1, Math.floor(Number(page) || 1))));
  return url.href;
}

export function parseVistaBackgroundResponse(payload, seenIds = [], random = Math.random) {
  const photos = Array.isArray(payload?.photos) ? payload.photos : [];
  const seen = new Set(seenIds.map(String));
  const landscape = photos.filter((photo) => (
    safeHttpsUrl(photo?.url)
    && photo?.id !== null
    && photo?.id !== undefined
    && Number(photo?.width) > Number(photo?.height)
  ));
  const wide = landscape.filter((photo) => Number(photo.width) / Number(photo.height) >= 1.35);
  const preferredPool = wide.length ? wide : landscape;
  const unseen = preferredPool.filter((photo) => !seen.has(String(photo.id)));
  const pool = seen.size ? unseen : preferredPool;
  const photo = pool[Math.min(pool.length - 1, Math.floor(Math.max(0, random()) * pool.length))];
  if (!photo) throw new Error("SourceSplash returned no suitable landscape image.");

  return {
    id: String(photo.id),
    url: safeHttpsUrl(photo.url),
    source: typeof photo.source === "string" ? photo.source : "",
    author: typeof photo.author === "string" ? photo.author : "",
    authorUrl: safeHttpsUrl(photo.author_url),
    description: typeof photo.description === "string" ? photo.description : "",
    totalResults: Math.max(0, Number(payload.total_results) || 0),
  };
}
