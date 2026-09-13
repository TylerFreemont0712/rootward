import type { Balance } from "@rootward/content-schema";
import {
  buildLearnerModel,
  type Evidence,
  evidenceFromRun,
  type LearnerContext,
  type LearnerModel,
  learnerSnapshot,
  type LearnerSnapshot,
  type PlannerCatalog,
  viewForLanguage,
} from "@rootward/core";
import type { EventStore } from "./runs/store.ts";

export interface LearnerServiceDeps {
  store: EventStore;
  balance: Balance;
  catalog: PlannerCatalog;
  now: () => string;
}

/** One run's evidence, with the learner model just before and just after it. */
export interface RunLearning {
  evidence: Evidence[];
  before: LearnerModel;
  after: LearnerModel;
}

/**
 * The learner model on the server (ADR-0009). It is refolded from every stored run whenever it is needed, so it can
 * never drift from the event log. A projection table can cache it once folding gets slow.
 */
export class LearnerService {
  readonly context: LearnerContext;
  private readonly store: EventStore;
  private readonly catalog: PlannerCatalog;
  private readonly now: () => string;

  constructor({ store, balance, catalog, now }: LearnerServiceDeps) {
    this.store = store;
    this.catalog = catalog;
    this.now = now;
    this.context = { balance, nodes: new Map(catalog.nodes.map((node) => [node.id, node])) };
  }

  async model(): Promise<LearnerModel> {
    return buildLearnerModel(await this.allEvidence(), this.context);
  }

  /** What the planner reads, as of now. */
  async snapshot(): Promise<LearnerSnapshot> {
    return this.snapshotOf(await this.model());
  }

  snapshotOf(model: LearnerModel): LearnerSnapshot {
    return learnerSnapshot(model, this.now(), this.context.balance);
  }

  /** Mastery of a concept for a player of `language`; other languages count through shared concepts. */
  async mastery(concept: string, language: string): Promise<number> {
    const { balance } = this.context;
    return viewForLanguage(this.catalog, await this.snapshot(), language, balance.rating.initial_player).mastery(concept);
  }

  /** A run's evidence with the model before its first fight and after its last; later runs are left out. */
  async forRun(runId: string): Promise<RunLearning> {
    const all = await this.allEvidence();
    const evidence = all.filter((item) => item.runId === runId);
    const start = evidence[0]?.at;
    const earlier = all.filter((item) => item.runId !== runId && (start === undefined || item.at < start));
    return {
      evidence,
      before: buildLearnerModel(earlier, this.context),
      after: buildLearnerModel([...earlier, ...evidence], this.context),
    };
  }

  private async allEvidence(): Promise<Evidence[]> {
    return (await this.store.loadAll()).flatMap((run) => evidenceFromRun(run.events));
  }
}
