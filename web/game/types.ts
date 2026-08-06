export type Faction = "mafia" | "citizen";

export type Player = {
  id: number;
  name: string;
  announced: string;
  role: string;
  faction: Faction;
  alive: boolean;
  isMe?: boolean;
};

export type Skill = {
  id: string;
  key: string;
  name: string;
  icon: string;
  cost: number;
  target: boolean;
  needsRole: boolean;
  tone: string;
  cooldown: number;
  needsText?: boolean;
};

export type GameResult = { winner: Faction; reason: string } | null;
export type ChatMessage = { id: number; from: number; text: string; channel: "public" | "alliance" };
export type PublicEffect = { id: number; type: "inspect" | "scan" | "attack" } | null;
export type BattleLog = { time: string; icon: string; text: string; tone: string };
