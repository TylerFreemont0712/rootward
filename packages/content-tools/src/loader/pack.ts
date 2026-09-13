import path from "node:path";
import {
  AbilitiesFile,
  CardsFile,
  ClassDef,
  Enemy,
  Item,
  OathsFile,
  PackManifest,
  RealmsFile,
  SkillsFile,
} from "@rootward/content-schema";
import type { z } from "zod";
import type { CardRecord, LoadedChallenge, LoadedClass, LoadedPack, Sourced } from "../content-index.ts";
import type { Enemy as EnemyType, Item as ItemType, Oath, Realm, SkillNode } from "@rootward/content-schema";
import { readText, readYamlFile } from "../yaml.ts";
import { loadChallenge } from "./challenge.ts";
import { displayPath, type LoadContext } from "./context.ts";
import { exists, listDirectories, listFiles } from "./files.ts";

/** Everything one pack declares, before packs are merged into a ContentIndex. */
export interface PackContents {
  pack: LoadedPack;
  realms: Sourced<Realm>[];
  skills: Sourced<SkillNode>[];
  oaths: Sourced<Oath>[];
  classes: LoadedClass[];
  enemies: Sourced<EnemyType>[];
  items: Sourced<ItemType>[];
  cards: Sourced<CardRecord>[];
  challenges: LoadedChallenge[];
}

export async function loadPack(ctx: LoadContext, absoluteDir: string): Promise<PackContents | undefined> {
  const dir = displayPath(ctx, absoluteDir);
  const manifest = await readYamlFile(
    path.join(absoluteDir, "pack.yaml"),
    `${dir}/pack.yaml`,
    PackManifest,
    ctx.diagnostics,
  );
  if (!manifest) return undefined;

  const packId = manifest.id;
  const contents: PackContents = {
    pack: { manifest, dir },
    realms: [],
    skills: [],
    oaths: [],
    classes: [],
    enemies: [],
    items: [],
    cards: [],
    challenges: [],
  };
  const sourced = <T>(value: T, file: string): Sourced<T> => ({ value, packId, file });

  // Single optional files at the pack root.
  const realms = await readOptionalYaml(ctx, absoluteDir, dir, "realms.yaml", RealmsFile);
  for (const realm of realms?.value.realms ?? []) contents.realms.push(sourced(realm, realms?.file ?? dir));
  const oaths = await readOptionalYaml(ctx, absoluteDir, dir, "oaths.yaml", OathsFile);
  for (const oath of oaths?.value.oaths ?? []) contents.oaths.push(sourced(oath, oaths?.file ?? dir));

  // Folders of YAML files.
  await eachYaml(ctx, absoluteDir, dir, "skills", SkillsFile, (parsed, file) => {
    for (const node of parsed.nodes) contents.skills.push(sourced(node, file));
  });
  await eachYaml(ctx, absoluteDir, dir, "cards", CardsFile, (parsed, file) => {
    for (const card of parsed.cards) contents.cards.push(sourced({ ...card, node: parsed.node }, file));
  });
  await eachYaml(ctx, absoluteDir, dir, "enemies", Enemy, (enemy, file, name) => {
    if (checkFileName(ctx, enemy.id, name, file)) contents.enemies.push(sourced(enemy, file));
  });
  await eachYaml(ctx, absoluteDir, dir, "items", Item, (item, file, name) => {
    if (checkFileName(ctx, item.id, name, file)) contents.items.push(sourced(item, file));
  });

  for (const classDir of await listDirectories(path.join(absoluteDir, "classes"))) {
    const loaded = await loadClass(ctx, packId, path.join(absoluteDir, "classes", classDir), `${dir}/classes/${classDir}`);
    if (loaded) contents.classes.push(loaded);
  }

  for (const realmDir of await listDirectories(path.join(absoluteDir, "challenges"))) {
    const realmPath = path.join(absoluteDir, "challenges", realmDir);
    for (const challengeDir of await listDirectories(realmPath)) {
      const challenge = await loadChallenge(ctx, packId, path.join(realmPath, challengeDir));
      if (!challenge) continue;
      if (challenge.manifest.realm !== realmDir) {
        ctx.diagnostics.warn(
          "realm-folder",
          `challenge realm "${challenge.manifest.realm}" does not match its folder "${realmDir}"`,
          { file: `${challenge.dir}/challenge.yaml` },
        );
      }
      contents.challenges.push(challenge);
    }
  }
  return contents;
}

async function loadClass(
  ctx: LoadContext,
  packId: string,
  absoluteDir: string,
  dir: string,
): Promise<LoadedClass | undefined> {
  const def = await readYamlFile(path.join(absoluteDir, "class.yaml"), `${dir}/class.yaml`, ClassDef, ctx.diagnostics);
  if (!def) return undefined;
  if (def.id !== path.basename(absoluteDir)) {
    ctx.diagnostics.error("file-name", `class id "${def.id}" must match its folder name`, { file: `${dir}/class.yaml` });
    return undefined;
  }
  const abilities = await readOptionalYaml(ctx, absoluteDir, dir, "abilities.yaml", AbilitiesFile);
  const lore = await readText(path.join(absoluteDir, def.lore), `${dir}/${def.lore}`, ctx.diagnostics);
  if (lore === undefined) return undefined;
  return { def, abilities: abilities?.value.abilities ?? [], lore, packId, dir };
}

async function readOptionalYaml<T extends z.ZodType>(
  ctx: LoadContext,
  absoluteDir: string,
  dir: string,
  name: string,
  schema: T,
): Promise<{ value: z.output<T>; file: string } | undefined> {
  const absolute = path.join(absoluteDir, name);
  if (!(await exists(absolute))) return undefined;
  const file = `${dir}/${name}`;
  const value = await readYamlFile(absolute, file, schema, ctx.diagnostics);
  return value === undefined ? undefined : { value, file };
}

async function eachYaml<T extends z.ZodType>(
  ctx: LoadContext,
  absoluteDir: string,
  dir: string,
  folder: string,
  schema: T,
  onParsed: (value: z.output<T>, file: string, name: string) => void,
): Promise<void> {
  for (const name of await listFiles(path.join(absoluteDir, folder), ".yaml")) {
    const file = `${dir}/${folder}/${name}`;
    const value = await readYamlFile(path.join(absoluteDir, folder, name), file, schema, ctx.diagnostics);
    if (value !== undefined) onParsed(value, file, name);
  }
}

function checkFileName(ctx: LoadContext, id: string, fileName: string, file: string): boolean {
  if (fileName === `${id}.yaml`) return true;
  ctx.diagnostics.error("file-name", `file name must be "${id}.yaml" to match the id inside it`, { file });
  return false;
}
