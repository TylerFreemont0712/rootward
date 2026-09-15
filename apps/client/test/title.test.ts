import type { ProfileSummaryView, ProfileView } from "@rootward/shared";
import { describe, expect, it } from "vitest";
import { orderProfiles, whereabouts } from "../src/screens/title.ts";

const profile = (id: string, createdAt: string): ProfileView => ({ id, name: id, classId: "artificer", createdAt });

describe("title screen", () => {
  it("puts the last-played character first, then the newest", () => {
    const profiles = [profile("old", "2026-09-01"), profile("new", "2026-09-10"), profile("mid", "2026-09-05")];
    expect(orderProfiles(profiles, "old").map((p) => p.id)).toEqual(["old", "new", "mid"]);
    expect(orderProfiles(profiles, undefined).map((p) => p.id)).toEqual(["new", "mid", "old"]);
  });

  it("describes where a character is", () => {
    const summary: ProfileSummaryView = { className: "Artificer", version: "1.0.0", fights: 1, questsActive: 0, questsDone: 0 };
    expect(whereabouts(summary)).toBe("1 fight · has not arrived in the Bastion yet");
    expect(whereabouts({ ...summary, fights: 4, zoneName: "The Foundry", questsActive: 2 })).toBe(
      "In The Foundry · 2 quests under way · 4 fights",
    );
    expect(whereabouts(undefined)).toBe("");
  });
});
