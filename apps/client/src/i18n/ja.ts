import type { MessageKey } from "./en.ts";

// Japanese (ADR-0017). Deliberately `Partial`: a locale is allowed to be incomplete, and anything missing here falls
// back to the English in `en.ts`, key by key. That is what lets translation happen a screen at a time instead of as
// one enormous change that has to land all at once.
//
// Placeholders (`{version}`, `{zone}`, …) must survive translation — `t()` fills them by name, so they can be moved
// around the sentence freely, which Japanese word order needs.

export const ja: Partial<Record<MessageKey, string>> = {
  "language.label": "言語",

  "menu.character": "あなたのキャラクター",
  "menu.version": "メンテナー v{version}",
  "menu.switch": "キャラクターを変更",
  "menu.world.tag": "クラシック",
  "menu.world.name": "ワールド",
  "menu.world.text":
    "城塞を歩き、住人たちから依頼を受け、本物のプログラミング問題でビットロットと戦います。勝った戦いはすべて、あなたの年代記に習熟として刻まれます。",
  "menu.world.here": "現在地：{zone}",
  "menu.world.nowhere": "まだ到着していません",
  "menu.shardrun.tag": "ローグライト",
  "menu.shardrun.name": "シャードラン",
  "menu.shardrun.text":
    "本物のコードの欠片を集め、繋いで呪文を組み立て、ターン制の戦いで機械の三つの層を登ります。短く、毎回あたらしい冒険です。",
  "menu.shardrun.running": "進行中：{layer}、整合性 {integrity}/{max}",
  "menu.shardrun.idle": "進行中の冒険はありません",
  "menu.experimental.tag": "実験中",
  "menu.experimental.name": "シャードラン（実験版）",
  "menu.experimental.text":
    "同じ塔を、カードで登ります。欠片は山札になり、毎ターン引いた手札から、実行する順にカードを並べて二つの呪文を組み立てます。",
  "menu.codex": "シャードラン図鑑：すべての欠片・遺物・敵",

  "title.tagline": "ビットロットが機械を蝕んでいます。本物のコードで直しましょう。",
  "title.continue": "つづきから",
  "title.newMaintainer": "新しいメンテナー",
  "title.begin": "はじめる",
  // The heading and the button are both "Begin" in English; in Japanese the button reads as an action, so the two
  // keys earn their separation here.
  "title.start": "この名前ではじめる",
  "title.class": "クラス",
  "title.playable": "プレイ可能",
  "title.comingLater": "準備中",
  "title.plannedHint": "{name}：{discipline}。準備中です。",
  "title.name": "キャラクター名",
  "title.lastPlayed": "前回",
  "title.foot": "すべてこの機械の中で動きます。コードはサンドボックスで実行され、進行状況は自動で保存され、送信は一切ありません。",

  // Japanese does not inflect for number, so both English plural forms become the same string. That is the normal
  // case, not a shortcut: the two keys exist for English's sake.
  "title.fights.one": "戦闘 {count} 回",
  "title.fights.many": "戦闘 {count} 回",
  "title.quests.none": "進行中の依頼なし",
  "title.quests.one": "依頼 {count} 件が進行中",
  "title.quests.many": "依頼 {count} 件が進行中",
  "title.notArrived": "{fights}・まだ城塞に到着していません",
  "title.where": "{zone}にて・{quests}・{fights}",

  "stats.title": "統計",
  "stats.rules": "適用中のルール",
  "stats.was": "元は {value}",
  "stats.run": "この冒険",
  "stats.damageBySpell": "呪文ごとのダメージ",
  "stats.nothingYet": "まだ何も当たっていません。",
  "stats.layers": "踏破した層",
  "stats.fights": "戦闘",
  "stats.turns": "ターン",
  "stats.casts": "詠唱",
  "stats.damage": "与えたダメージ",
  "stats.bestCast": "最大の一撃",
  "stats.bolts": "放った矢",
  "stats.fizzled": "不発した矢",
  "stats.manaSpent": "消費マナ",
  "stats.shards": "回収した欠片",
  "stats.relics": "獲得した遺物",

  "battle.integrity": "整合性",
  "battle.block": "防御 {amount}",
  "battle.blockHint": "防御は、次のあなたのターンまで敵の攻撃を受け止めます",
  "battle.mana": "マナ {mana}/{max}",
  "battle.turn": "ターン {turn}",
  "battle.kind.fight": "戦闘",
  "battle.kind.elite": "精鋭",
  "battle.kind.boss": "守護者",
  "battle.endTurn": "ターン終了",
  "battle.log": "戦闘記録",
  "battle.guardian": "{layer}の守護者",
  "battle.intentHint": "ターンを終えたときに取る行動",

  "fx.weak": "弱点！",
  "fx.resist": "耐性",
  "fx.nullified": "無効",
  "fx.glanced": "弾かれた",
  "fx.blocked": "{amount} 防いだ",
  "fx.block": "防御 +{amount}",
  "fx.shield": "防壁 +{amount}",
  "fx.stoked": "力を溜めた！",
  "fx.fizzle": "不発",
  "fx.hits.one": "{count} ヒット",
  "fx.hits.many": "{count} ヒット",

  "options.shake": "強い攻撃で画面を揺らす",
  "options.on": "オン",
  "options.off": "オフ",
};
