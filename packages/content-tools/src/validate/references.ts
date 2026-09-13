import { z } from "zod";
import type { ContentIndex } from "../content-index.ts";
import { at, type Diagnostics } from "../diagnostics.ts";
import { findCycles } from "./graph.ts";

/**
 * Engine facts that content may reference. They are passed in, so content-tools does not depend on the engine and
 * tests can supply small fakes.
 */
export interface EngineRegistries {
  moves: ReadonlyMap<string, { params: z.ZodType; implemented: boolean }>;
}

/** Check that every id a file mentions exists, and that the skill graph has no prerequisite cycles. */
export function validateReferences(index: ContentIndex, diagnostics: Diagnostics, registries?: EngineRegistries): void {
  const missing = (file: string, field: string, kind: string, id: string) => {
    diagnostics.error("missing-reference", `${field} refers to unknown ${kind} "${id}"`, { file });
  };

  for (const { value: node, file } of index.skills.values()) {
    if (!index.realms.has(node.realm)) missing(file, `skill ${node.id}: realm`, "realm", node.realm);
    for (const prerequisite of node.prerequisites) {
      if (prerequisite === node.id) {
        diagnostics.error("cycle", `skill ${node.id} lists itself as a prerequisite`, { file });
      } else if (!index.skills.has(prerequisite)) {
        missing(file, `skill ${node.id}: prerequisites`, "skill node", prerequisite);
      }
    }
    if (node.transfers_to !== undefined) {
      const target = index.skills.get(node.transfers_to);
      if (!target) {
        missing(file, `skill ${node.id}: transfers_to`, "skill node", node.transfers_to);
      } else if (target.value.transfers_to !== undefined) {
        diagnostics.warn("transfer-chain", `skill ${node.id} transfers to ${target.value.id}, which transfers again`, {
          file,
        });
      }
    }
  }

  const prerequisiteEdges = new Map(
    [...index.skills.values()].map(({ value }) => [
      value.id,
      value.prerequisites.filter((id) => id !== value.id && index.skills.has(id)),
    ]),
  );
  for (const cycle of findCycles(prerequisiteEdges)) {
    const first = cycle[0];
    diagnostics.error("cycle", `prerequisite cycle: ${cycle.join(" -> ")}`, at(first && index.skills.get(first)?.file));
  }

  for (const { value: oath, file } of index.oaths.values()) {
    for (const realm of Object.keys(oath.weights.realms)) {
      if (!index.realms.has(realm)) missing(file, `oath ${oath.id}: weights.realms`, "realm", realm);
    }
  }

  for (const loaded of index.classes.values()) {
    const file = `${loaded.dir}/class.yaml`;
    for (const realm of Object.keys(loaded.def.affinity)) {
      if (!index.realms.has(realm)) missing(file, `class ${loaded.def.id}: affinity`, "realm", realm);
    }
    for (const item of loaded.def.starting_artifacts) {
      if (!index.items.has(item)) missing(file, `class ${loaded.def.id}: starting_artifacts`, "item", item);
    }
  }

  for (const { value: enemy, file } of index.enemies.values()) {
    for (const realm of enemy.realm_affinity) {
      if (!index.realms.has(realm)) missing(file, `enemy ${enemy.id}: realm_affinity`, "realm", realm);
    }
    if (!registries) continue;
    for (const ref of enemy.moves) {
      const move = registries.moves.get(ref.move);
      if (!move) {
        missing(file, `enemy ${enemy.id}: moves`, "enemy move", ref.move);
        continue;
      }
      const params = move.params.safeParse(ref.params);
      if (!params.success) {
        diagnostics.error("move-params", `enemy ${enemy.id}, move ${ref.move}: ${z.prettifyError(params.error)}`, {
          file,
        });
      }
      if (!move.implemented) {
        diagnostics.warn("unimplemented-move", `enemy ${enemy.id} uses "${ref.move}", which falls back to strike`, {
          file,
        });
      }
    }
  }

  for (const { value: card, file } of index.cards.values()) {
    if (!index.skills.has(card.node)) missing(file, `cards for ${card.node}`, "skill node", card.node);
  }

  for (const challenge of index.challenges.values()) {
    const { manifest } = challenge;
    const file = `${challenge.dir}/challenge.yaml`;
    if (!index.realms.has(manifest.realm)) missing(file, "realm", "realm", manifest.realm);
    for (const concept of manifest.concepts) {
      if (!index.skills.has(concept)) missing(file, "concepts", "skill node", concept);
    }
    if (!index.enemies.has(manifest.enemy.template)) missing(file, "enemy.template", "enemy", manifest.enemy.template);
    if (manifest.replaced_by !== undefined && !index.challenges.has(manifest.replaced_by)) {
      missing(file, "replaced_by", "challenge", manifest.replaced_by);
    }
  }
}
