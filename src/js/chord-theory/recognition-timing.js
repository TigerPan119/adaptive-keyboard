export function shouldCaptureBeforeNoteReduction(enabled, beforeCount, afterCount) {
  return Boolean(enabled && beforeCount >= 3 && afterCount < beforeCount);
}

export function remainingHighlightMs(startedAt, now, minimumDuration) {
  return Math.max(0, minimumDuration - Math.max(0, now - startedAt));
}
