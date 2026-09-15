import type { ZoneDef } from "../zone-types.ts";
import { FOUNDRY_ZONE } from "./foundry.ts";

/** Realms with a walkable overworld zone. A realm absent here is "locked/coming soon" (ADR-0010) -- nothing else
 * needs to know which realms those are; `OverworldService.realms()` derives `available` from this map alone. */
export const ZONES: Readonly<Record<string, ZoneDef>> = {
  foundry: FOUNDRY_ZONE,
};
