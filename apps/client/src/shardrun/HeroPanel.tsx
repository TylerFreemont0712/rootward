import type { ElementView, ShardrunLogView, ShardrunView } from "@rootward/shared";
import type { CSSProperties, ReactNode } from "react";
import { battlePortraitUrl, type BattlePose } from "../assets/AssetRegistry.ts";
import { useT } from "../i18n/index.ts";
import { LOOKS } from "./fx/looks.ts";

type Battle = NonNullable<ShardrunView["battle"]>;

/**
 * The Maintainer in the corner of the fight (ADR-0019): a high-detail portrait of the class being played, with the
 * numbers that belong to them beside it — Integrity, block, and mana — then the turn, End turn, and the battle log.
 * The portrait answers the stage: it lights up in the spell's color while casting and flinches when hit.
 */
export function HeroPanel(props: {
  classId: string;
  name: string;
  className: string | undefined;
  integrity: number;
  integrityMax: number;
  battle: Battle;
  pose: BattlePose;
  element: ElementView;
  history: readonly ShardrunLogView[];
  children: ReactNode;
}) {
  const t = useT();
  const { battle, integrity, integrityMax, pose } = props;
  const portrait = battlePortraitUrl(props.classId);
  const share = integrityMax > 0 ? integrity / integrityMax : 0;
  const mood = pose === "hurt" ? " hurt" : pose === "windup" || pose === "cast" || pose === "channel" ? " casting" : pose === "ward" ? " warding" : "";
  const style = { "--cast": LOOKS[props.element].main } as CSSProperties;
  return (
    <aside className={`shr-self shr-hero-panel${mood}${share <= 0.3 ? " low" : ""}`} style={style}>
      <figure className="shr-portrait">
        {portrait !== undefined ? <img src={portrait} alt="" draggable={false} /> : <span className="shr-portrait-glyph">@</span>}
        <figcaption>
          <b>{props.name}</b>
          {props.className !== undefined && <span>{props.className}</span>}
        </figcaption>
      </figure>
      <div className="shr-vitals">
        <div className="shr-vital" aria-label={`${t("battle.integrity")} ${integrity}/${integrityMax}`}>
          <span>{t("battle.integrity")}</span>
          <span className="shr-meter">
            <i style={{ width: `${share * 100}%` }} />
          </span>
          <b>
            {integrity}/{integrityMax}
          </b>
        </div>
        <div className={`shr-block-line${battle.block > 0 ? " up" : ""}`} title={t("battle.blockHint")}>
          ⛨ {t("battle.block", { amount: battle.block })}
        </div>
        <div className="shr-mana-orbs" aria-label={t("battle.mana", { mana: battle.mana, max: battle.manaMax })}>
          {Array.from({ length: battle.manaMax }, (_, index) => (
            <i key={index} className={index < battle.mana ? "full" : ""} />
          ))}
          <span>{t("battle.mana", { mana: battle.mana, max: battle.manaMax })}</span>
        </div>
      </div>
      <div className="meta">
        {t("battle.turn", { turn: battle.turn })} · {t(`battle.kind.${battle.kind}`)}
      </div>
      {props.children}
      <ul className="shr-log" aria-label={t("battle.log")}>
        {props.history.slice(-14).map((entry, index) => (
          <li key={index} className={`log-${entry.kind}`}>
            {entry.text}
          </li>
        ))}
      </ul>
    </aside>
  );
}
