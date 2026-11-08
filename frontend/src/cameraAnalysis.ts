// Select only the observation belonging to the current five-second playback window.
// Never fill a missing sample using a future frame or an old whole-clip estimate.
export function playbackAnalysis(analysis: any, timeS: number, durationS?: number) {
  if (!analysis || analysis.status !== "done" || !analysis.result) return analysis;
  const samples = analysis.result.samples;
  if (!Array.isArray(samples) || !samples.length) return { ...analysis, clip_summary_only: true };
  const end = Number.isFinite(durationS) && durationS! > 0 ? durationS! - 0.001 : Infinity;
  const offset = Math.floor(Math.max(0, Math.min(timeS, end)) / 5) * 5;
  const sample = samples.find((s: any) => s.offset_s === offset);
  if (!sample) return {
    ...analysis, status: "unavailable", result: null, proposed_effect: null,
    sample_offset_s: offset, error: `No analysis saved for ${offset}s in this recording.`,
  };
  return { ...analysis, result: sample.result, proposed_effect: sample.proposed_effect,
    sample_offset_s: offset, clip_summary_only: false };
}

export function cameraDecisionKey(frame: any, analysis: any) {
  const offset = analysis.sample_offset_s ?? (analysis.result?.samples?.length ? 0 : undefined);
  return `${frame.frame_id}@${analysis.version}${offset !== undefined ? `:${offset}` : ""}`;
}
