import path from "node:path";
import { ENGINE_VERSION } from "@rootward/content-schema";
import { type ContentIndex, emptyContentIndex, type Sourced } from "../content-index.ts";
import { Diagnostics } from "../diagnostics.ts";
import { mergeOverlays } from "../locale/overlay.ts";
import { warnAboutStaleTranslations } from "../locale/report.ts";
import { satisfies } from "../semver.ts";
import type { LoadContext } from "./context.ts";
import { exists, listDirectories } from "./files.ts";
import { loadPack, type PackContents } from "./pack.ts";

export interface LoadContentOptions {
  /** The `content/` directory. */
  contentDir: string;
  /** Repository root used to print relative paths; defaults to the parent of `contentDir`. */
  rootDir?: string;
}

export interface LoadContentResult {
  index: ContentIndex;
  diagnostics: Diagnostics;
}

/** Load every pack under `content/packs`, check compatibility, and merge them in dependency order. */
export async function loadContent(options: LoadContentOptions): Promise<LoadContentResult> {
  const diagnostics = new Diagnostics();
  const ctx: LoadContext = { diagnostics, rootDir: options.rootDir ?? path.dirname(options.contentDir) };
  const packsDir = path.join(options.contentDir, "packs");

  const loaded: PackContents[] = [];
  for (const name of await listDirectories(packsDir)) {
    const dir = path.join(packsDir, name);
    if (!(await exists(path.join(dir, "pack.yaml")))) {
      diagnostics.warn("not-a-pack", `skipping content/packs/${name}: it has no pack.yaml`);
      continue;
    }
    const contents = await loadPack(ctx, dir);
    if (contents) loaded.push(contents);
  }

  const index = emptyContentIndex();
  const ordered = orderPacks(loaded, diagnostics);
  for (const contents of ordered) mergePack(index, contents, diagnostics);
  // Translations are keyed by English text, so they merge across packs rather than being scoped to one: the same
  // English sentence should read the same however many packs are installed.
  index.locales = mergeOverlays(ordered.map((contents) => contents.locales));
  warnAboutStaleTranslations(index, diagnostics);
  return { index, diagnostics };
}

/**
 * Drop incompatible or broken packs and return the rest so that every pack comes after its dependencies.
 * LEARN: this is Kahn's algorithm for topological sorting; whatever is left over at the end is part of a cycle.
 */
function orderPacks(packs: PackContents[], diagnostics: Diagnostics): PackContents[] {
  const byId = new Map<string, PackContents>();
  for (const contents of packs) {
    const { manifest, dir } = contents.pack;
    const file = `${dir}/pack.yaml`;
    if (!satisfies(ENGINE_VERSION, manifest.engine_range)) {
      diagnostics.error(
        "engine-range",
        `pack "${manifest.id}" needs engine ${manifest.engine_range}, this is ${ENGINE_VERSION}`,
        { file },
      );
    } else if (byId.has(manifest.id)) {
      diagnostics.error("duplicate-pack", `pack id "${manifest.id}" is already used by another folder`, { file });
    } else {
      byId.set(manifest.id, contents);
    }
  }

  for (const [id, contents] of byId) {
    for (const dependency of contents.pack.manifest.dependencies) {
      const target = byId.get(dependency.id);
      const file = `${contents.pack.dir}/pack.yaml`;
      if (!target) {
        diagnostics.error("missing-dependency", `pack "${id}" depends on missing pack "${dependency.id}"`, { file });
        byId.delete(id);
      } else if (!satisfies(target.pack.manifest.version, dependency.range)) {
        diagnostics.error(
          "dependency-version",
          `pack "${id}" needs ${dependency.id} ${dependency.range}, found ${target.pack.manifest.version}`,
          { file },
        );
        byId.delete(id);
      }
    }
  }

  const ordered: PackContents[] = [];
  const remaining = new Map(byId);
  let progress = true;
  while (remaining.size > 0 && progress) {
    progress = false;
    for (const [id, contents] of remaining) {
      const ready = contents.pack.manifest.dependencies.every((d) => !remaining.has(d.id) && byId.has(d.id));
      if (ready) {
        ordered.push(contents);
        remaining.delete(id);
        progress = true;
      }
    }
  }
  for (const [id, contents] of remaining) {
    diagnostics.error("pack-cycle", `pack "${id}" is part of a dependency cycle or depends on a skipped pack`, {
      file: `${contents.pack.dir}/pack.yaml`,
    });
  }
  return ordered;
}

function mergePack(index: ContentIndex, contents: PackContents, diagnostics: Diagnostics): void {
  index.packs.set(contents.pack.manifest.id, contents.pack);
  const addSourced = <T extends { id: string }>(kind: string, map: Map<string, Sourced<T>>, items: Sourced<T>[]) => {
    for (const item of items) {
      const existing = map.get(item.value.id);
      if (existing) {
        diagnostics.error("duplicate-id", `${kind} "${item.value.id}" is already defined in ${existing.file}`, {
          file: item.file,
        });
      } else {
        map.set(item.value.id, item);
      }
    }
  };
  addSourced("realm", index.realms, contents.realms);
  addSourced("skill node", index.skills, contents.skills);
  addSourced("oath", index.oaths, contents.oaths);
  addSourced("enemy", index.enemies, contents.enemies);
  addSourced("item", index.items, contents.items);
  addSourced("terrain", index.terrain, contents.terrain);
  addSourced("prop", index.props, contents.props);
  addSourced("npc", index.npcs, contents.npcs);
  addSourced("quest", index.quests, contents.quests);
  addSourced("zone", index.zones, contents.zones);
  addSourced("shard", index.shards, contents.shards);
  addSourced("shardrun foe", index.shardrunFoes, contents.shardrunFoes);
  addSourced("shardrun relic", index.shardrunRelics, contents.shardrunRelics);
  if (contents.shardrun) {
    if (index.shardrun) {
      diagnostics.error("duplicate-id", `the Shardrun run is already defined in ${index.shardrun.file}`, {
        file: contents.shardrun.file,
      });
    } else {
      index.shardrun = contents.shardrun;
    }
  }

  for (const card of contents.cards) {
    const key = `${card.value.node}#${card.value.id}`;
    const existing = index.cards.get(key);
    if (existing) {
      diagnostics.error("duplicate-id", `card "${key}" is already defined in ${existing.file}`, { file: card.file });
    } else {
      index.cards.set(key, card);
    }
  }
  for (const loadedClass of contents.classes) {
    const existing = index.classes.get(loadedClass.def.id);
    if (existing) {
      diagnostics.error("duplicate-id", `class "${loadedClass.def.id}" is already defined in ${existing.dir}`, {
        file: `${loadedClass.dir}/class.yaml`,
      });
    } else {
      index.classes.set(loadedClass.def.id, loadedClass);
    }
  }
  for (const challenge of contents.challenges) {
    const existing = index.challenges.get(challenge.manifest.id);
    if (existing) {
      diagnostics.error("duplicate-id", `challenge "${challenge.manifest.id}" is already defined in ${existing.dir}`, {
        file: `${challenge.dir}/challenge.yaml`,
      });
    } else {
      index.challenges.set(challenge.manifest.id, challenge);
    }
  }
}
