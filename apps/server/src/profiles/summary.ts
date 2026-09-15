import type { ClassCardView, ProfileSummaryView, StartingClassView } from "@rootward/shared";
import type { GameContent } from "../content.ts";
import type { RunServiceRegistry } from "../runs/registry.ts";
import type { WorldService } from "../world/service.ts";
import type { Profile } from "./service.ts";

export interface SummaryDeps {
  content: GameContent;
  registry: RunServiceRegistry;
  world: WorldService;
}

/** What the title screen shows for a character: class, version, fights, and where they stand in the world. */
export async function profileSummary(profile: Profile, deps: SummaryDeps): Promise<ProfileSummaryView> {
  const [learner, world] = await Promise.all([deps.registry.forProfile(profile.id).learnerView(), deps.world.world(profile.id)]);
  const quests = world?.quests ?? [];
  return {
    className: deps.content.index.classes.get(profile.classId)?.def.name ?? profile.classId,
    version: learner.version,
    fights: learner.fights,
    ...(world ? { zoneName: world.zone.name } : {}),
    questsActive: quests.filter((quest) => quest.status !== "done").length,
    questsDone: quests.filter((quest) => quest.status === "done").length,
  };
}

/** The class new characters start as, so the title screen can introduce it without hardcoding content. */
export function startingClass(content: GameContent, classId: string): StartingClassView | undefined {
  const def = content.index.classes.get(classId)?.def;
  return def && { id: def.id, name: def.name, tagline: def.tagline, discipline: def.discipline };
}

/** Every class for the character creation picker, playable ones first, then in each class's own order. */
export function classCards(content: GameContent): ClassCardView[] {
  return [...content.index.classes.values()]
    .map(({ def }) => def)
    .sort((a, b) => Number(b.status === "playable") - Number(a.status === "playable") || a.order - b.order || a.name.localeCompare(b.name))
    .map((def) => ({
      id: def.id,
      name: def.name,
      tagline: def.tagline,
      discipline: def.discipline,
      subjects: [...def.subjects],
      playable: def.status === "playable",
    }));
}
