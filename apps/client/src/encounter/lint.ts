import type { EncounterView } from "@rootward/shared";

// What Lint says without any AI configured: short, deterministic lines chosen from the fight's state, in the voice
// from ideas/game-content/lore-and-narrative.md (terse, fussy, secretly warm; jokes at the bug's expense).
// The Tutor role (M2) will add real Socratic answers alongside these.

export function lintSays(view: EncounterView): string[] {
  const enemy = view.enemy.name;
  switch (view.status) {
    case "won":
      return ["All green. I have nothing to say, which is high praise."];
    case "retreated":
      return ["Retreat is not defeat. It is a checkpoint. Read the reference slowly, then try it again from memory."];
    case "exhausted":
      return ["Out of Focus. Study the reference; this concept will come back for review."];
    case "kernel-panic":
      return ["Kernel panic. The run is over, but everything you learned stays learned."];
    case "active":
      break;
  }

  const lines: string[] = [];
  const visible = view.tests.filter((t) => t.visibility === "visible");
  const failingVisible = visible.filter((t) => t.status === "fail");
  const probed = visible.some((t) => t.status !== "idle");
  const failingHidden = view.tests.filter((t) => t.visibility === "hidden" && t.status === "fail");

  if (!probed && view.casts === 0) {
    lines.push(
      `${enemy}. Read the task, then Probe before you Cast. Probing is free; Casting costs Focus, and you have ${view.player.focus}.`,
    );
  } else if (failingVisible.length > 0) {
    const names = failingVisible.map((t) => `"${t.label}"`).join(", ");
    lines.push(`${failingVisible.length === 1 ? "That test" : "Those tests"}: ${names}. Expected and actual. Line by line.`);
  } else if (view.casts === 0) {
    lines.push("Visible tests green. Hidden tests are where bugs live. Cast when you are ready; Focus is not free.");
  }

  if (failingHidden.length > 0) {
    lines.push(`Still standing: ${failingHidden.map((t) => t.label).join(", ")}. The category is the hint.`);
    if (failingHidden.some((t) => t.label.startsWith("empty-input"))) lines.push("Empty input. Always empty input.");
    if (failingHidden.some((t) => t.runStatus === "timeout")) {
      lines.push("Something timed out. How many times does your code walk over the same data?");
    }
  }
  if (view.enemy.lastAction?.move === "edge-case") {
    lines.push(`The ${enemy} added a hidden ${view.enemy.lastAction.category ?? ""} test. Same bug, different clothes.`);
  }
  if (view.retreatSuggested) {
    lines.push(`${view.casts} Casts. Retreat is not defeat. It is a checkpoint.`);
  }
  return lines;
}
