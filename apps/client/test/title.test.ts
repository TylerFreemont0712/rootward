import type { ProfileSummaryView, ProfileView } from "@rootward/shared";
import { describe, expect, it } from "vitest";
import { type MessageKey, translate } from "../src/i18n/index.ts";
import { orderProfiles, whereabouts } from "../src/screens/title.ts";

// The real catalogs rather than a stub, so this also checks that the keys the line asks for exist in both locales.
const en = (key: MessageKey, params?: Readonly<Record<string, string | number>>) => translate("en", key, params);
const ja = (key: MessageKey, params?: Readonly<Record<string, string | number>>) => translate("ja", key, params);

const profile = (id: string, createdAt: string): ProfileView => ({ id, name: id, classId: "artificer", createdAt });

describe("title screen", () => {
  it("puts the last-played character first, then the newest", () => {
    const profiles = [profile("old", "2026-09-01"), profile("new", "2026-09-10"), profile("mid", "2026-09-05")];
    expect(orderProfiles(profiles, "old").map((p) => p.id)).toEqual(["old", "new", "mid"]);
    expect(orderProfiles(profiles, undefined).map((p) => p.id)).toEqual(["new", "mid", "old"]);
  });

  it("describes where a character is", () => {
    const summary: ProfileSummaryView = { className: "Artificer", version: "1.0.0", fights: 1, questsActive: 0, questsDone: 0 };
    expect(whereabouts(summary, en)).toBe("1 fight · has not arrived in the Bastion yet");
    expect(whereabouts({ ...summary, fights: 4, zoneName: "The Foundry", questsActive: 2 }, en)).toBe(
      "In The Foundry · 2 quests under way · 4 fights",
    );
    expect(whereabouts(undefined, en)).toBe("");
  });

  it("describes it in Japanese too, with the counts still in place", () => {
    const summary: ProfileSummaryView = { className: "Artificer", version: "1.0.0", fights: 4, questsActive: 2, questsDone: 0, zoneName: "鋳造所" };
    // Japanese has one form where English has two, which is exactly why the plural choice is the caller's.
    expect(whereabouts(summary, ja)).toBe("鋳造所にて・依頼 2 件が進行中・戦闘 4 回");
    expect(whereabouts({ ...summary, fights: 1, questsActive: 0, zoneName: undefined }, ja)).toBe("戦闘 1 回・まだ城塞に到着していません");
  });
});
