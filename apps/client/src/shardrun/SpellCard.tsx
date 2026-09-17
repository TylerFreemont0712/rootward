import type { ElementView, ShardrunView, SpellView } from "@rootward/shared";
import { Fragment } from "react";
import { dominant } from "./fx/timeline.ts";
import type { SpellSlots } from "./Hand.tsx";
import { ManaCost, ShardIcon } from "./parts.tsx";

/** The element a spell's bolts mostly end up as, from its preview; plain when the preview does not say. */
export function spellElement(spell: SpellView): ElementView {
  const preview = spell.preview;
  const bolts = preview?.steps.at(-1)?.bolts ?? preview?.base.bolts ?? [];
  return dominant(bolts.filter((bolt) => !bolt.ward).map((bolt) => bolt.element));
}

export function SpellCard(props: {
  run: ShardrunView;
  spell: SpellView;
  index: number;
  disabled: boolean;
  casting: boolean;
  onCast: () => void;
  onExplore: () => void;
  /** The pointer or focus is on this spell (its element), or has left it (undefined). */
  onReady: (element: ElementView | undefined) => void;
  /** A deck run's blank spell (ADR-0020): its slots take cards from the hand, and give them back. */
  slots?: SpellSlots | undefined;
}) {
  const { run, spell, index, disabled, casting, onCast, onExplore, onReady, slots } = props;
  const preview = spell.preview;
  const counts = preview?.steps.map((step) => step.returned) ?? [];
  const canCast = !disabled && !spell.spent && preview?.affordable === true;
  const label = spell.spent ? "Spent this turn" : !preview ? "Reading the shards…" : !preview.affordable ? "Not enough mana" : "Cast";
  const ready = () => {
    onReady(canCast ? spellElement(spell) : undefined);
  };
  const unready = () => {
    onReady(undefined);
  };
  return (
    <article
      className={`shr-spell${spell.spent ? " spent" : ""}${casting ? " casting" : ""}${slots?.targeted === true ? " targeted" : ""}`}
      onMouseEnter={ready}
      onMouseLeave={unready}
      onFocus={ready}
      onBlur={unready}
    >
      <header>
        <kbd>{index + 1}</kbd>
        <h3>{spell.name}</h3>
        {slots && !spell.spent && (
          <button
            type="button"
            className={`shr-target${slots.targeted ? " on" : ""}`}
            aria-pressed={slots.targeted}
            disabled={disabled}
            onClick={slots.onTarget}
            title="Clicked cards go into the spell picked here"
          >
            {slots.targeted ? "playing here" : "play here"}
          </button>
        )}
        {preview && <ManaCost cost={preview.cost} />}
      </header>
      <div
        className="shr-flow"
        aria-label="The spell step by step, with how many bolts each shard passes on"
        {...slots?.drop(spell.shards.length)}
      >
        <span className="shr-count" title="Every spell starts from one bolt">
          1
        </span>
        {spell.shards.map((shardId, step) => (
          <Fragment key={`${shardId}-${step}`}>
            <span className="shr-arrow" aria-hidden="true">
              →
            </span>
            {slots ? (
              <button
                type="button"
                className="shr-flow-shard card"
                title={`${run.shards[shardId]?.summary ?? run.shards[shardId]?.function ?? shardId}. Click to take it back.`}
                disabled={disabled || spell.spent}
                onClick={() => {
                  slots.onUnplay(step);
                }}
                {...slots.drag(step)}
                {...slots.drop(step)}
              >
                <ShardIcon shardId={shardId} size={20} />
                {run.shards[shardId]?.name ?? shardId}
              </button>
            ) : (
              <span className="shr-flow-shard" title={run.shards[shardId]?.summary ?? run.shards[shardId]?.function}>
                <ShardIcon shardId={shardId} size={20} />
                {run.shards[shardId]?.name ?? shardId}
              </span>
            )}
            {counts[step] !== undefined && <span className="shr-count">{counts[step]}</span>}
          </Fragment>
        ))}
        {slots &&
          !spell.spent &&
          Array.from({ length: Math.max(0, spell.capacity - spell.shards.length) }, (_, open) => (
            <Fragment key={`open-${open}`}>
              <span className="shr-arrow" aria-hidden="true">
                →
              </span>
              <span className="shr-slot-open" {...slots.drop(spell.shards.length)}>
                slot
              </span>
            </Fragment>
          ))}
        {spell.shards.length === 0 && (
          <span className="meta">{slots ? (spell.spent ? "cast this turn" : "blank: one plain bolt") : "no shards: one plain bolt"}</span>
        )}
      </div>
      <div className="shr-predict">
        {slots && spell.spent ? (
          // A deck run's cast spell is blank again: what it would do now says nothing about what it did.
          <span className="meta">Its cards are in the discard pile.</span>
        ) : preview?.misfire !== undefined ? (
          <span className="shr-misfire">Misfire: {preview.misfire.reason}</span>
        ) : preview?.result ? (
          <>
            <span>
              {preview.result.bolts} {preview.result.bolts === 1 ? "bolt" : "bolts"}
            </span>
            {/* Zero damage is worth saying out loud: it is how a nullify or a thick hide shows up before the cast. */}
            {(preview.result.potential > 0 || preview.result.block === 0) && (
              <span className="dmg">
                {preview.result.potential} damage
                {preview.result.potential > preview.result.damage && <i className="over"> ({preview.result.damage} needed)</i>}
              </span>
            )}
            {preview.result.block > 0 && <span className="blk">{preview.result.block} block</span>}
          </>
        ) : preview ? (
          <span className="meta">Read the code to predict it.</span>
        ) : (
          <span className="meta">Running the shards…</span>
        )}
      </div>
      {preview !== undefined && preview.console !== "" && <pre className="shr-console">{preview.console}</pre>}
      <div className="shr-spell-actions">
        <button type="button" className="btn" onClick={onExplore} title="See the whole spell as one function">
          {"</>"} Code
        </button>
        <button type="button" className="btn primary" disabled={!canCast} onClick={onCast}>
          {label}
        </button>
      </div>
    </article>
  );
}
