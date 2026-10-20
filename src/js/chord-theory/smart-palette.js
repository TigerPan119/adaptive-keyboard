const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const NARRATIVE_BACKGROUND_COLORS = Object.freeze({
  // After Rain: fluorescent mint reflected in cold rainwater.
  nebula: [[116, 211, 177], [205, 225, 213]],
  // 5:17 PM: the last coral light meeting green seawater.
  satin: [[255, 139, 115], [111, 207, 190]],
  // Last Train: carriage fluorescents and a restrained sodium platform light.
  halo: [[164, 208, 181], [240, 205, 116]],
});

function rgbToHsl([red, green, blue]) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  const lightness = (max + min) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  return [(hue + 360) % 360, saturation, lightness];
}

function hslToRgb(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = ((hue % 360) + 360) % 360 / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const [r, g, b] = section < 1 ? [chroma, x, 0]
    : section < 2 ? [x, chroma, 0]
      : section < 3 ? [0, chroma, x]
        : section < 4 ? [0, x, chroma]
          : section < 5 ? [x, 0, chroma]
            : [chroma, 0, x];
  const match = lightness - chroma / 2;
  return [r, g, b].map((channel) => Math.round((channel + match) * 255));
}

function relativeLuminance([red, green, blue]) {
  const linear = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(first, second) {
  const light = Math.max(relativeLuminance(first), relativeLuminance(second));
  const dark = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (light + 0.05) / (dark + 0.05);
}

function hueDistance(first, second) {
  const distance = Math.abs(first - second);
  return Math.min(distance, 360 - distance);
}

function colorDistance(first, second) {
  return Math.sqrt(first.reduce((sum, channel, index) => sum + (channel - second[index]) ** 2, 0));
}

function polishSourceColor(source, background, variation = 0) {
  const [hue, sourceSaturation, sourceLightness] = rgbToHsl(source);
  const backgroundIsDark = relativeLuminance(background) < 0.38;
  const neutral = sourceSaturation < 0.12;
  const yellowFamily = hue >= 38 && hue <= 72;
  let saturation = neutral ? 0 : clamp(sourceSaturation * 1.08, 0.5, 0.88);
  let lightness = backgroundIsDark
    ? Math.max(sourceLightness, 0.64 + variation)
    : Math.min(sourceLightness, 0.34 - variation);

  if (neutral) {
    lightness = backgroundIsDark ? 0.74 + variation : 0.28 - variation;
  } else if (yellowFamily) {
    // Keep yellow-derived palettes crisp and luminous instead of olive or ochre.
    saturation = Math.max(saturation, 0.8);
    lightness = backgroundIsDark ? Math.max(lightness, 0.73) : Math.min(lightness, 0.27);
  }

  lightness = clamp(lightness, 0.14, 0.92);
  const direction = backgroundIsDark ? 0.025 : -0.025;
  let color = hslToRgb(hue, saturation, lightness);
  while (contrastRatio(color, background) < 3.5 && lightness > 0.14 && lightness < 0.92) {
    lightness = clamp(lightness + direction, 0.14, 0.92);
    color = hslToRgb(hue, saturation, lightness);
  }
  return color;
}

export function createSmartPalette(imageData, darkness = 0) {
  const clusters = new Map();
  const totals = [0, 0, 0];
  let totalWeight = 0;
  for (let index = 0; index < imageData.data.length; index += 4) {
    const alpha = imageData.data[index + 3] / 255;
    if (alpha < 0.2) continue;
    const color = [imageData.data[index], imageData.data[index + 1], imageData.data[index + 2]];
    const key = color.map((channel) => channel >> 4).join(":");
    const cluster = clusters.get(key) || { totals: [0, 0, 0], weight: 0 };
    color.forEach((channel, channelIndex) => { cluster.totals[channelIndex] += channel * alpha; });
    cluster.weight += alpha;
    clusters.set(key, cluster);
    color.forEach((channel, channelIndex) => { totals[channelIndex] += channel * alpha; });
    totalWeight += alpha;
  }

  const average = totalWeight
    ? totals.map((channel) => Math.round(channel / totalWeight))
    : [24, 24, 26];
  const shade = 1 - clamp(darkness, 0, 0.9);
  const effectiveBackground = average.map((channel) => Math.round(channel * shade));
  const ranked = [...clusters.values()]
    .map((cluster) => {
      const color = cluster.totals.map((channel) => Math.round(channel / cluster.weight));
      const [, saturation] = rgbToHsl(color);
      return {
        color,
        weight: cluster.weight,
        score: cluster.weight * (0.55 + saturation * 0.65),
      };
    })
    .filter((cluster) => cluster.weight >= Math.max(1, totalWeight * 0.003))
    .sort((a, b) => b.score - a.score);
  const selected = [];
  for (const candidate of ranked) {
    const [candidateHue, candidateSaturation] = rgbToHsl(candidate.color);
    const separated = selected.every((item) => {
      const [itemHue, itemSaturation] = rgbToHsl(item.color);
      if (candidateSaturation < 0.12 && itemSaturation < 0.12) return colorDistance(candidate.color, item.color) >= 42;
      return hueDistance(candidateHue, itemHue) >= 24 && colorDistance(candidate.color, item.color) >= 48;
    });
    if (separated) selected.push(candidate);
    if (selected.length === 2) break;
  }

  if (!selected.length) selected.push({ color: average });
  const sources = selected.map((item) => item.color);
  while (sources.length < 2) sources.push(sources[0]);
  const variations = selected.length === 1 ? [-0.04, 0.12] : [-0.02, 0.08];
  const colors = sources.slice(0, 2).map((source, index) => polishSourceColor(source, effectiveBackground, variations[index]));
  return {
    stops: [[0, colors[0]], [1, colors[1]]],
    edge: colors[0],
    glow: colors[1],
  };
}

export async function createSmartPaletteFromBlob(blob, darkness = 0) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return createSmartPalette(context.getImageData(0, 0, canvas.width, canvas.height), darkness);
  } finally {
    bitmap.close();
  }
}

export function createSmartPaletteFromColors(colors, darkness = 0) {
  const samples = colors.length ? colors : [[24, 24, 26]];
  const data = new Uint8ClampedArray(samples.length * 64 * 4);
  let offset = 0;
  for (let repeat = 0; repeat < 64; repeat += 1) {
    for (const color of samples) {
      data.set([color[0], color[1], color[2], 255], offset);
      offset += 4;
    }
  }
  return createSmartPalette({ data }, darkness);
}

export function createNarrativeBackgroundPalette(mode) {
  const colors = NARRATIVE_BACKGROUND_COLORS[mode];
  if (!colors) return null;
  const [edge, glow] = colors.map((color) => [...color]);
  return {
    stops: [[0, edge], [1, glow]],
    edge,
    glow,
  };
}

export function paletteCssGradient(palette) {
  return `linear-gradient(135deg, ${palette.stops.map(([position, color]) => `rgb(${color.join(" ")}) ${Math.round(position * 100)}%`).join(", ")})`;
}
