import type { ShardrunLogView } from "@rootward/shared";
import type { Cue } from "./timeline.ts";

/**
 * What the newest log has decided but the stage has not shown yet (ADR-0019). The view already holds the numbers after
 * the command; adding these back gives the numbers the stage should show, and each cue moves its share onto the bars as
 * it lands. Without it an HP bar empties while the bolt that empties it is still in the air.
 *
 * Losses and gains are kept apart and never go below zero, so a cue settled twice (a replayed log) cannot push a bar
 * past the true number: the worst it can do is show the true number early.
 */
export interface Pending {
  integrityLoss: number;
  integrityGain: number;
  /** Per foe uid. */
  damage: Readonly<Record<string, number>>;
  mending: Readonly<Record<string, number>>;
  /** Foes whose breaking apart is still to play. */
  defeats: readonly string[];
}

export const NOTHING_PENDING: Pending = { integrityLoss: 0, integrityGain: 0, damage: {}, mending: {}, defeats: [] };

export function pendingOf(log: readonly ShardrunLogView[]): Pending {
  let integrityLoss = 0;
  let integrityGain = 0;
  const damage: Record<string, number> = {};
  const mending: Record<string, number> = {};
  const defeats: string[] = [];
  for (const entry of log) {
    const amount = entry.amount ?? 0;
    if (entry.kind === "enemy" || entry.kind === "curse") integrityLoss += amount;
    else if (entry.kind === "heal" && entry.foe === undefined) integrityGain += amount;
    else if (entry.kind === "hit" && entry.foe !== undefined) damage[entry.foe] = (damage[entry.foe] ?? 0) + amount;
    else if (entry.kind === "heal" && entry.foe !== undefined) mending[entry.foe] = (mending[entry.foe] ?? 0) + amount;
    else if (entry.kind === "defeat" && entry.foe !== undefined) defeats.push(entry.foe);
  }
  return { integrityLoss, integrityGain, damage, mending, defeats };
}

const less = (record: Readonly<Record<string, number>>, uid: string, amount: number) => ({
  ...record,
  [uid]: Math.max(0, (record[uid] ?? 0) - amount),
});

/** The pending ledger once `cue` has played. */
export function settled(pending: Pending, cue: Cue): Pending {
  switch (cue.kind) {
    case "impact":
      return cue.outcome === "hit" ? { ...pending, damage: less(pending.damage, cue.foe, cue.amount) } : pending;
    case "heal":
      return cue.foe === undefined
        ? { ...pending, integrityGain: Math.max(0, pending.integrityGain - cue.amount) }
        : { ...pending, mending: less(pending.mending, cue.foe, cue.amount) };
    case "blow":
    case "curse":
      return { ...pending, integrityLoss: Math.max(0, pending.integrityLoss - cue.amount) };
    case "defeat":
      return { ...pending, defeats: pending.defeats.filter((uid) => uid !== cue.foe) };
    default:
      return pending;
  }
}

/** A foe's HP as the stage should show it now. */
export function shownHp(pending: Pending | undefined, foe: { uid: string; hp: number; max: number }): number {
  const owed = pending ? (pending.damage[foe.uid] ?? 0) - (pending.mending[foe.uid] ?? 0) : 0;
  return Math.max(0, Math.min(foe.max, foe.hp + owed));
}

/** Whether the stage should show a foe broken apart: once its defeat has played, not when the response that killed it
 * arrives. */
export function shownFallen(pending: Pending | undefined, foe: { uid: string; hp: number; max: number }): boolean {
  return shownHp(pending, foe) === 0 && !(pending?.defeats.includes(foe.uid) ?? false);
}

/** The Maintainer's Integrity as the stage should show it now. */
export function shownIntegrity(pending: Pending, integrity: number, max: number): number {
  return Math.max(0, Math.min(max, integrity + pending.integrityLoss - pending.integrityGain));
}
