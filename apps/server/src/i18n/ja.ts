import type { MessageKey } from "./en.ts";

// Japanese for the sentences the server composes (ADR-0018). Partial on purpose: anything missing falls back to the
// English in `en.ts`, key by key. Placeholders are filled by name, so a translation may put the number wherever the
// sentence needs it — which Japanese, with its verb at the end, generally does.

export const ja: Partial<Record<MessageKey, string>> = {
  "intent.strike": "{power} の攻撃",
  "intent.multi": "{power} の攻撃を {times} 回",
  "intent.shield": "{amount} の防壁",
  "intent.stoke": "力を溜めている：次の攻撃は二倍",
  "intent.heal": "{amount} 回復",
  "intent.watching": "様子を見ている",

  "found.fights": "戦闘",
  "found.elites": "精鋭",
  "found.guardians": "守護者",
  "found.treasure": "宝物庫",
  "found.forge.upgrade": "鍛冶場で「{shard}」を鍛え直す",
  "found.forge.repair": "鍛冶場で「{shard}」を修復する",
  "found.startingSpell": "最初から持つ呪文「{spell}」",
  "found.startingSpares": "最初から持つ予備の欠片",

  "trait.nullify.name": "無効化",
  "trait.nullify.text": "毎ターン、最初に当たった矢は効きません。",
  "trait.thickHide.name": "厚い殻",
  "trait.thickHide.text": "威力 {threshold} 未満の矢は弾かれます。",
  "trait.shifting.name": "変転",
  "trait.shifting.text": "弱点が毎ターン移ります：{cycle}。",
  "trait.patternWard.name": "型の守り",
  "trait.patternWard.text": "{pattern} のうち、そのターンの属性だけが完全に通ります。",

  "workCurve.log": "対数",
  "workCurve.sqrt": "平方根",
  "workCurve.linear": "そのまま",

  "modifier.manaPerTurn": "毎ターンのマナ",
  "modifier.boltCap": "着弾する矢の数",
  "modifier.workBilling": "仕事量の計算",
  "modifier.boltPower": "すべての矢への威力加算",
  "modifier.boltMult": "すべての矢への倍率加算",
  "modifier.boltMultFactor": "さらに矢の倍率を乗算",
  "modifier.damageMultiplier": "ダメージ倍率",
  "modifier.weakMultiplier": "弱点倍率",
  "modifier.turnBlock": "ターン開始時の防御",
  "modifier.firstCastDiscount": "毎ターン最初の詠唱の割引",
  "modifier.healAfterFight": "戦闘後に回復する整合性",
  "modifier.maxIntegrity": "整合性の上限",
  "modifier.spellCapacity": "すべての呪文への枠追加",
  "modifier.handSize": "毎ターン引くカード",
  "modifier.hold": "次のターンへ持ち越せるカード",
  "modifier.from.layer": "第 {layer} 層",
};
