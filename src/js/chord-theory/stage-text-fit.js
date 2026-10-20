export function fittedFontSize(baseFontSize, naturalWidth, availableWidth) {
  if (![baseFontSize, naturalWidth, availableWidth].every(Number.isFinite)) return null;
  if (baseFontSize <= 0 || naturalWidth <= 0 || availableWidth <= 0) return null;
  if (naturalWidth <= availableWidth) return null;
  return Math.max(12, Math.floor(baseFontSize * (availableWidth / naturalWidth) * 0.98));
}
