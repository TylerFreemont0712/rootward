import type { ElementView, ShardrunLogView } from "@rootward/shared";

// Replaying what a command did (ADR-0019). The server answers with the new state and a log of every hit, ward, and
// enemy move in order. This file turns that log into a timeline of cues: when each one starts and how long it holds the
// stage. It is pure, so the whole rhythm of a volley can be tested without a browser, and the arena, the effects canvas
// and the store all read the same timings.

export type BoltTarget = NonNullable<ShardrunLogView["target"]>;

/** What a bolt looks like in flight, decided by what it actually does (not by the spell's name). */
export type Flight = "missile" | "lance" | "rain" | "seeker";

export interface ImpactCue {
  kind: "impact";
  at: number;
  duration: number;
  outcome: "hit" | "absorb" | "glance";
  foe: string;
  element: ElementView;
  amount: number;
  /** The hit against the foe's maximum HP, 0 to 1: how hard it should feel. */
  weight: number;
  affinity: "weak" | "resist" | undefined;
  blocked: number;
  pierce: boolean;
  mult: number;
  flight: Flight;
  /** The bolt's place in its volley, for spreading numbers apart. */
  bolt: number;
}

export interface LaunchCue {
  kind: "launch";
  at: number;
  /** Flight time: the impacts of this bolt land at `at + duration`. */
  duration: number;
  element: ElementView;
  flight: Flight;
  targets: string[];
  pierce: boolean;
  mult: number;
  bolt: number;
}

export type Cue =
  | { kind: "enter"; at: number; duration: number }
  | { kind: "turn"; at: number; duration: number; turn: number }
  | { kind: "charge"; at: number; duration: number; element: ElementView; spell: string | undefined; bolts: number }
  | LaunchCue
  | ImpactCue
  | { kind: "ward"; at: number; duration: number; amount: number; element: ElementView }
  | { kind: "defeat"; at: number; duration: number; foe: string }
  | { kind: "fizzle"; at: number; duration: number; amount: number }
  | { kind: "curse"; at: number; duration: number; amount: number }
  /** A foe winds up and lunges; its `blow` lands a moment later. */
  | { kind: "enemy"; at: number; duration: number; foe: string }
  | { kind: "blow"; at: number; duration: number; foe: string; amount: number; blocked: number }
  | { kind: "shield"; at: number; duration: number; foe: string; amount: number }
  | { kind: "stoke"; at: number; duration: number; foe: string }
  | { kind: "heal"; at: number; duration: number; foe: string | undefined; amount: number }
  | { kind: "victory"; at: number; duration: number }
  | { kind: "loss"; at: number; duration: number };

export interface Timeline {
  cues: Cue[];
  /** When the last cue has finished. */
  durationMs: number;
}

export interface TimelineContext {
  /** Each foe's maximum HP by uid, to weigh a hit; unknown foes weigh by amount alone. */
  maxHp?: Readonly<Record<string, number>>;
  /** A guardian's entrance holds the stage longer. */
  boss?: boolean;
}

/** The pauses and flights a timeline is built from, in milliseconds. */
export const TIMING = {
  enter: 520,
  bossEnter: 1900,
  /** The Maintainer gathers the spell before the first bolt leaves. */
  charge: 420,
  /** A volley spreads its launches over about this long, however many bolts it has... */
  volley: 1300,
  /** ...one bolt every `maxGap` at most, and never closer than `minGap`, */
  maxGap: 190,
  minGap: 45,
  /** ...and past this long, several bolts leave on the same beat instead. */
  volleyMax: 1900,
  flight: { missile: 250, lance: 140, rain: 380, seeker: 320 } satisfies Record<Flight, number>,
  /** A heavier bolt travels a little slower, so it reads as heavier. */
  heavyFlight: 70,
  impact: 700,
  defeatAfterHit: 90,
  defeat: 1100,
  recover: 260,
  ward: 620,
  fizzle: 520,
  curse: 520,
  /** A foe's blow: the lunge, then the hit lands on the Maintainer. */
  enemy: 560,
  enemyStrikeAt: 200,
  /** The second and later blows of a flurry come quicker. */
  enemyRepeat: 320,
  foeAction: 460,
  turn: 700,
  ending: 1000,
} as const;

const BOLT_KINDS = new Set(["hit", "absorb", "glance", "ward"]);

/** How a bolt flies, from the facts the engine logged about it. Piercing wins, then spread, then aim. */
export function flightOf(entry: Pick<ShardrunLogView, "target" | "pierce">): Flight {
  if (entry.pierce) return "lance";
  if (entry.target === "all") return "rain";
  if (entry.target === "weakest" || entry.target === "strongest" || entry.target === "back") return "seeker";
  return "missile";
}

/** Milliseconds between launches for a volley of `bolts`, and how many leave on each beat. */
export function cadence(bolts: number): { gap: number; perBeat: number } {
  if (bolts <= 1) return { gap: TIMING.maxGap, perBeat: 1 };
  const gap = Math.min(TIMING.maxGap, Math.max(TIMING.minGap, TIMING.volley / bolts));
  const perBeat = Math.max(1, Math.ceil((bolts * gap) / TIMING.volleyMax));
  return { gap, perBeat };
}

function weigh(amount: number, max: number | undefined): number {
  // Against a known foe, a hit's share of its HP. Otherwise a gentle curve: 10 feels light, 100 feels heavy.
  if (max !== undefined && max > 0) return Math.min(1, amount / max);
  return Math.min(1, amount / (amount + 40));
}

/** One cast: its charge, then every bolt of its volley in the order the engine resolved them. */
function planCast(
  entries: readonly ShardrunLogView[],
  start: number,
  context: TimelineContext,
  spell: string | undefined,
): { cues: Cue[]; end: number } {
  const cues: Cue[] = [];
  // Group by bolt: a bolt aimed at every foe is one launch with several impacts. Older logs have no bolt index, so each
  // bolt entry then stands alone.
  const groups: ShardrunLogView[][] = [];
  let previous: number | undefined;
  for (const entry of entries) {
    if (!BOLT_KINDS.has(entry.kind)) continue;
    const last = groups.at(-1);
    if (last && entry.bolt !== undefined && entry.bolt === previous && entry.kind !== "ward") last.push(entry);
    else groups.push([entry]);
    previous = entry.bolt;
  }
  const elements = groups.flat().map((entry) => entry.element ?? "none");
  cues.push({ kind: "charge", at: start, duration: TIMING.charge, element: dominant(elements), spell, bolts: groups.length });

  const { gap, perBeat } = cadence(groups.length);
  let end = start + TIMING.charge;
  const landedAt = new Map<string, number>();
  groups.forEach((group, index) => {
    const first = group[0];
    if (!first) return;
    const at = start + TIMING.charge + Math.floor(index / perBeat) * gap;
    const element = first.element ?? "none";
    const mult = first.mult ?? 1;
    if (first.kind === "ward") {
      cues.push({ kind: "ward", at, duration: TIMING.ward, amount: first.amount ?? 0, element });
      end = Math.max(end, at + TIMING.ward * 0.6);
      return;
    }
    const flight = flightOf(first);
    const travel = TIMING.flight[flight] + (mult >= 2 ? TIMING.heavyFlight : 0);
    const targets = group.flatMap((entry) => (entry.foe === undefined ? [] : [entry.foe]));
    const bolt = first.bolt ?? index;
    cues.push({ kind: "launch", at, duration: travel, element, flight, targets, pierce: first.pierce === true, mult, bolt });
    for (const entry of group) {
      if (entry.foe === undefined) continue;
      const amount = entry.amount ?? 0;
      const landed = at + travel;
      cues.push({
        kind: "impact",
        at: landed,
        duration: TIMING.impact,
        outcome: entry.kind === "absorb" ? "absorb" : entry.kind === "glance" ? "glance" : "hit",
        foe: entry.foe,
        element,
        amount,
        weight: entry.kind === "hit" ? weigh(amount, context.maxHp?.[entry.foe]) : 0,
        affinity: entry.affinity,
        blocked: entry.blocked ?? 0,
        pierce: entry.pierce === true,
        mult,
        flight,
        bolt,
      });
      landedAt.set(entry.foe, landed);
      end = Math.max(end, landed);
    }
  });

  // A defeat follows the hit that caused it; the log puts it right after that hit.
  for (const entry of entries) {
    if (entry.kind !== "defeat" || entry.foe === undefined) continue;
    const at = (landedAt.get(entry.foe) ?? end) + TIMING.defeatAfterHit;
    cues.push({ kind: "defeat", at, duration: TIMING.defeat, foe: entry.foe });
    end = Math.max(end, at + TIMING.defeatAfterHit);
  }
  for (const entry of entries) {
    if (entry.kind === "fizzle") cues.push({ kind: "fizzle", at: start + TIMING.charge, duration: TIMING.fizzle, amount: entry.amount ?? 0 });
    if (entry.kind === "curse") cues.push({ kind: "curse", at: start + TIMING.charge, duration: TIMING.curse, amount: entry.amount ?? 0 });
  }
  return { cues, end: end + TIMING.recover };
}

/** The element most of a volley is made of; plain when it is a tie or there is none. */
export function dominant(elements: readonly ElementView[]): ElementView {
  const counts = new Map<ElementView, number>();
  for (const element of elements) counts.set(element, (counts.get(element) ?? 0) + 1);
  let best: ElementView = "none";
  let most = 0;
  for (const [element, count] of counts) {
    if (count > most || (count === most && element === "none")) {
      best = element;
      most = count;
    }
  }
  return best;
}

/** The whole log of one command as a timeline. */
export function planTimeline(log: readonly ShardrunLogView[], context: TimelineContext = {}): Timeline {
  const cues: Cue[] = [];
  let cursor = 0;
  let index = 0;
  let lastEnemy: string | undefined;
  const push = (cue: Cue) => {
    cues.push(cue);
  };
  while (index < log.length) {
    const entry = log[index];
    if (!entry) break;
    // A cast owns every bolt, defeat, fizzle, and curse that follows it, up to the next thing that is not part of it.
    const opensCast = entry.kind === "cast" || (entry.kind === "fizzle" && entry.spell !== undefined && log[index - 1]?.kind !== "cast");
    if (opensCast) {
      let stop = index + 1;
      while (stop < log.length && ["hit", "absorb", "glance", "ward", "defeat", "fizzle", "curse"].includes(log[stop]?.kind ?? "")) stop += 1;
      const owned = entry.kind === "cast" ? log.slice(index + 1, stop) : [entry, ...log.slice(index + 1, stop)];
      const cast = planCast(owned, cursor, context, entry.spell);
      cues.push(...cast.cues);
      cursor = cast.end;
      index = stop;
      lastEnemy = undefined;
      continue;
    }
    switch (entry.kind) {
      case "enter": {
        const duration = context.boss ? TIMING.bossEnter : TIMING.enter;
        push({ kind: "enter", at: cursor, duration });
        cursor += duration;
        break;
      }
      case "hit":
      case "absorb":
      case "glance":
      case "ward":
      case "defeat": {
        // Bolts with no cast before them (an older log, or a trimmed one): play them as a cast of their own.
        let stop = index;
        while (stop < log.length && ["hit", "absorb", "glance", "ward", "defeat"].includes(log[stop]?.kind ?? "")) stop += 1;
        const cast = planCast(log.slice(index, stop), cursor, context, undefined);
        cues.push(...cast.cues);
        cursor = cast.end;
        index = stop;
        continue;
      }
      case "enemy": {
        if (entry.foe === undefined) break;
        const repeat = lastEnemy === entry.foe;
        const strikeAt = repeat ? Math.round(TIMING.enemyStrikeAt * 0.6) : TIMING.enemyStrikeAt;
        push({ kind: "enemy", at: cursor, duration: strikeAt + 160, foe: entry.foe });
        push({ kind: "blow", at: cursor + strikeAt, duration: TIMING.impact, foe: entry.foe, amount: entry.amount ?? 0, blocked: entry.blocked ?? 0 });
        cursor += repeat ? TIMING.enemyRepeat : TIMING.enemy;
        lastEnemy = entry.foe;
        index += 1;
        continue;
      }
      case "shield":
        if (entry.foe !== undefined) push({ kind: "shield", at: cursor, duration: TIMING.foeAction, foe: entry.foe, amount: entry.amount ?? 0 });
        cursor += TIMING.foeAction;
        break;
      case "stoke":
        if (entry.foe !== undefined) push({ kind: "stoke", at: cursor, duration: TIMING.foeAction, foe: entry.foe });
        cursor += TIMING.foeAction;
        break;
      case "heal":
        push({ kind: "heal", at: cursor, duration: TIMING.foeAction, foe: entry.foe, amount: entry.amount ?? 0 });
        cursor += TIMING.foeAction;
        break;
      case "fizzle":
        push({ kind: "fizzle", at: cursor, duration: TIMING.fizzle, amount: entry.amount ?? 0 });
        cursor += TIMING.fizzle;
        break;
      case "curse":
        push({ kind: "curse", at: cursor, duration: TIMING.curse, amount: entry.amount ?? 0 });
        cursor += TIMING.curse;
        break;
      case "turn":
        push({ kind: "turn", at: cursor, duration: TIMING.turn, turn: entry.amount ?? 0 });
        cursor += TIMING.turn;
        break;
      case "victory":
        push({ kind: "victory", at: cursor, duration: TIMING.ending });
        cursor += TIMING.ending;
        break;
      case "loss":
        push({ kind: "loss", at: cursor, duration: TIMING.ending });
        cursor += TIMING.ending;
        break;
      default:
        break;
    }
    if (entry.kind !== "enemy") lastEnemy = undefined;
    index += 1;
  }
  cues.sort((a, b) => a.at - b.at);
  const durationMs = cues.reduce((latest, cue) => Math.max(latest, cue.at + cue.duration), 0);
  return { cues, durationMs };
}

/** How long a log takes to play, so the arena can stay up until the last hit lands. */
export function playbackMs(log: readonly ShardrunLogView[]): number {
  return planTimeline(log).durationMs;
}
