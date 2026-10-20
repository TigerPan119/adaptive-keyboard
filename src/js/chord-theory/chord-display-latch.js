export function updateChordDisplayLatch(liveResult, retainedResult, enabled) {
  const nextRetainedResult = liveResult?.primary ? liveResult : retainedResult;
  const shouldRetain = Boolean(enabled && !liveResult?.primary && nextRetainedResult?.primary);
  return {
    displayResult: shouldRetain ? nextRetainedResult : liveResult,
    retainedResult: nextRetainedResult,
    isRetained: shouldRetain,
  };
}
