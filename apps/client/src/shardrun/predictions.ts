import type { ShardrunView, SpellRunView } from "@rootward/shared";

/**
 * A run with its spells' predictions taken out, shaped exactly as the server sends them on a difficulty that predicts
 * nothing (ADR-0022): each spell keeps its cost, whether it can be cast, and any misfire or printed output, but not the
 * bolts, damage, or block its steps would come to. A cast still shows what its code did as it runs; that is the cast's
 * replay, which is kept apart from the spells and left alone.
 */
export function withoutPredictions<Run extends Pick<ShardrunView, "spells">>(run: Run): Run {
  return {
    ...run,
    spells: run.spells.map((spell) => (spell.preview ? { ...spell, preview: hidePrediction(spell.preview) } : spell)),
  };
}

export function hidePrediction(preview: SpellRunView): SpellRunView {
  const { result: _result, steps: _steps, base, ...kept } = preview;
  return { ...kept, base: { bolts: base.bolts }, steps: [] };
}
