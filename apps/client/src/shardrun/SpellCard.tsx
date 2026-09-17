import type { ElementView, ShardrunView, SpellView } from "@rootward/shared";
import { Fragment } from "react";
import { CardFace, cardTipHandlers } from "./Card.tsx";
import { dominant } from "./fx/timeline.ts";
import type { TableControls } from "./Hand.tsx";
import { ManaCost, ShardIcon } from "./parts.tsx";
import type { Spot } from "./table.ts";

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
  /** A deck run's table (ADR-0020): this spell's slots hold cards played from the hand. */
  table?: TableControls | undefined;
}) {
  const { run, spell, index, disabled, casting, onCast, onExplore, onReady, table } = props;
  const preview = spell.preview;
  // A deck run shows a move the moment it is made; its preview catches up when the server answers.
  const shards = table?.table.spells.find((candidate) => candidate.id === spell.id)?.shards ?? spell.shards;
  const current = shards.length === spell.shards.length && shards.every((shard, step) => shard === spell.shards[step]);
  const counts = current ? (preview?.steps.map((step) => step.returned) ?? []) : [];
  const canCast = !disabled && !spell.spent && preview?.affordable === true;
  const label = spell.spent ? "Spent this turn" : !preview ? "Reading the shards…" : !preview.affordable ? "Not enough mana" : "Cast";
  const targeted = table?.target === spell.id;
  const ready = () => {
    onReady(canCast ? spellElement(spell) : undefined);
  };
  const unready = () => {
    onReady(undefined);
  };
  return (
    <article
      className={`shr-spell${spell.spent ? " spent" : ""}${casting ? " casting" : ""}${targeted ? " targeted" : ""}${table ? " deck" : ""}`}
      onMouseEnter={ready}
      onMouseLeave={unready}
      onFocus={ready}
      onBlur={unready}
    >
      <header>
        <kbd>{index + 1}</kbd>
        <h3>{spell.name}</h3>
        {table && !spell.spent && (
          <button
            type="button"
            className={`shr-target${targeted ? " on" : ""}`}
            aria-pressed={targeted}
            disabled={table.locked}
            onClick={() => {
              table.choose(spell.id);
            }}
            title="Clicked cards go into the spell picked here"
          >
            {targeted ? "playing here" : "play here"}
          </button>
        )}
        {preview && <ManaCost cost={preview.cost} />}
      </header>
      {table ? (
        <div
          className="shr-flow shr-slots-row"
          aria-label="The spell's slots, run left to right, with how many bolts each card passes on"
          {...(spell.spent ? {} : table.dropAt({ zone: "spell", spellId: spell.id, index: shards.length }))}
        >
          <span className="shr-count" title="Every spell starts from one bolt">
            1
          </span>
          {shards.map((shardId, step) => {
            const spot: Spot = { zone: "spell", spellId: spell.id, index: step };
            return (
              <Fragment key={`${shardId}-${step}`}>
                <span className="shr-arrow" aria-hidden="true">
                  →
                </span>
                <button
                  type="button"
                  className={`shr-card-button${table.lifted(spot) ? " lifted" : ""}`}
                  disabled={table.locked || spell.spent}
                  aria-label={`${run.shards[shardId]?.name ?? shardId}, slot ${step + 1}. Click to take it back into the hand.`}
                  {...table.dropAt(spot)}
                  {...table.grab(spot, shardId)}
                  {...cardTipHandlers(shardId)}
                >
                  <CardFace run={run} shardId={shardId} size="mini" />
                </button>
                {counts[step] !== undefined && <span className="shr-count">{counts[step]}</span>}
              </Fragment>
            );
          })}
          {!spell.spent &&
            Array.from({ length: Math.max(0, spell.capacity - shards.length) }, (_, open) => (
              <Fragment key={`open-${open}`}>
                <span className="shr-arrow" aria-hidden="true">
                  →
                </span>
                <span className="shr-slot-card" {...table.dropAt({ zone: "spell", spellId: spell.id, index: shards.length + open })}>
                  +
                </span>
              </Fragment>
            ))}
          {spell.spent && <span className="meta">cast this turn</span>}
        </div>
      ) : (
        <div className="shr-flow" aria-label="The spell step by step, with how many bolts each shard passes on">
          <span className="shr-count" title="Every spell starts from one bolt">
            1
          </span>
          {spell.shards.map((shardId, step) => (
            <Fragment key={`${shardId}-${step}`}>
              <span className="shr-arrow" aria-hidden="true">
                →
              </span>
              <span className="shr-flow-shard" title={run.shards[shardId]?.summary ?? run.shards[shardId]?.function}>
                <ShardIcon shardId={shardId} size={20} />
                {run.shards[shardId]?.name ?? shardId}
              </span>
              {counts[step] !== undefined && <span className="shr-count">{counts[step]}</span>}
            </Fragment>
          ))}
          {spell.shards.length === 0 && <span className="meta">no shards: one plain bolt</span>}
        </div>
      )}
      <div className="shr-predict">
        {table && spell.spent ? (
          // A deck run's cast spell is blank again: what it would do now says nothing about what it did.
          <span className="meta">Its cards are in the discard pile.</span>
        ) : !current ? (
          <span className="meta">Running the cards…</span>
        ) : preview?.misfire !== undefined ? (
          <span className="shr-misfire">Misfire: {preview.misfire.reason}</span>
        ) : preview?.result ? (
          <>
            <span>
              {preview.result.bolts} {preview.result.bolts === 1 ? "bolt" : "bolts"}
            </span>
            {/* Zero damage is worth saying out loud: it is how a nullify or a thick hide shows up before the cast. */}
            {(preview.result.damage > 0 || preview.result.potential > 0 || preview.result.block === 0) && (
              <span className="dmg">
                {preview.result.damage} damage
                {preview.result.potential > preview.result.damage && <i className="over"> (worth {preview.result.potential})</i>}
              </span>
            )}
            {preview.result.block > 0 && <span className="blk">{preview.result.block} block</span>}
            {table && shards.length === 0 && <span className="meta">blank: one plain bolt</span>}
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
