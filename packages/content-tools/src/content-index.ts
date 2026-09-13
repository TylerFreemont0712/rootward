import type {
  Ability,
  ChallengeManifest,
  ClassDef,
  Enemy,
  IoTestFile,
  Item,
  Language,
  Oath,
  PackManifest,
  Realm,
  ReviewCard,
  SkillNode,
} from "@rootward/content-schema";

/** Relative path -> file contents. Runners receive these, never host paths. */
export type FileMap = Record<string, string>;

/** A parsed record plus where it came from, for error messages and pack overrides. */
export interface Sourced<T> {
  value: T;
  packId: string;
  file: string;
}

export interface LoadedPack {
  manifest: PackManifest;
  /** Folder relative to the repository root. */
  dir: string;
}

export interface LoadedClass {
  def: ClassDef;
  abilities: Ability[];
  lore: string;
  packId: string;
  dir: string;
}

/**
 * Every file of one challenge folder. Hidden tests and reference solutions live here too, so a ContentIndex is
 * server-side data and must never be sent to the client as-is.
 */
export interface LoadedChallenge {
  manifest: ChallengeManifest;
  packId: string;
  dir: string;
  prompt: string;
  hints: string[];
  lesson?: string;
  explanation?: string;
  starter: Partial<Record<Language, FileMap>>;
  solution: Partial<Record<Language, FileMap>>;
  visibleTests?: IoTestFile;
  hiddenTests?: IoTestFile;
}

export interface CardRecord extends ReviewCard {
  node: string;
}

/** All packs merged, keyed by id. Built by `loadContent`. */
export interface ContentIndex {
  packs: Map<string, LoadedPack>;
  realms: Map<string, Sourced<Realm>>;
  skills: Map<string, Sourced<SkillNode>>;
  oaths: Map<string, Sourced<Oath>>;
  classes: Map<string, LoadedClass>;
  enemies: Map<string, Sourced<Enemy>>;
  items: Map<string, Sourced<Item>>;
  /** Keyed by `<node>#<card id>`. */
  cards: Map<string, Sourced<CardRecord>>;
  challenges: Map<string, LoadedChallenge>;
}

export function emptyContentIndex(): ContentIndex {
  return {
    packs: new Map(),
    realms: new Map(),
    skills: new Map(),
    oaths: new Map(),
    classes: new Map(),
    enemies: new Map(),
    items: new Map(),
    cards: new Map(),
    challenges: new Map(),
  };
}
