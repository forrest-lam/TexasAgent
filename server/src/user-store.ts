import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { UserProfile, DEFAULT_USER_CHIPS, LLM_BOT_CONFIGS, LLM_BOT_STARTING_CHIPS, RULE_BOT_CONFIGS, RULE_BOT_STARTING_CHIPS } from '@texas-agent/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

interface StoredUser extends UserProfile {
  passwordHash: string;
}

let users: Map<string, StoredUser> = new Map();

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadUsers() {
  ensureDataDir();
  if (fs.existsSync(USERS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
      users = new Map(Object.entries(data));
    } catch {
      users = new Map();
    }
  }
}

function saveUsers() {
  ensureDataDir();
  const obj: Record<string, StoredUser> = {};
  users.forEach((v, k) => { obj[k] = v; });
  fs.writeFileSync(USERS_FILE, JSON.stringify(obj, null, 2));
}

/** Ensure all LLM bot accounts exist in the user store */
function ensureLLMBotAccounts() {
  let changed = false;
  for (const cfg of LLM_BOT_CONFIGS) {
    if (!users.has(cfg.id)) {
      const bot: StoredUser = {
        id: cfg.id,
        username: cfg.name,
        passwordHash: '', // bots cannot login
        chips: LLM_BOT_STARTING_CHIPS,
        isLLMBot: true,
        stats: { gamesPlayed: 0, gamesWon: 0, totalEarnings: 0 },
        createdAt: Date.now(),
      };
      users.set(cfg.id, bot);
      changed = true;
      console.log(`[UserStore] Created LLM bot account: ${cfg.name} (${cfg.id})`);
    } else {
      // Ensure isLLMBot flag and chips are in sync with config
      const existing = users.get(cfg.id)!;
      if (!existing.isLLMBot) {
        existing.isLLMBot = true;
        changed = true;
      }
      if (existing.chips !== LLM_BOT_STARTING_CHIPS) {
        existing.chips = LLM_BOT_STARTING_CHIPS;
        changed = true;
      }
    }
  }
  if (changed) saveUsers();
}

/** Ensure all rule-based bot accounts exist in the user store */
function ensureRuleBotAccounts() {
  let changed = false;
  for (const cfg of RULE_BOT_CONFIGS) {
    if (!users.has(cfg.id)) {
      const bot: StoredUser = {
        id: cfg.id,
        username: cfg.name,
        passwordHash: '',
        chips: RULE_BOT_STARTING_CHIPS,
        isRuleBot: true,
        stats: { gamesPlayed: 0, gamesWon: 0, totalEarnings: 0 },
        createdAt: Date.now(),
      };
      users.set(cfg.id, bot);
      changed = true;
      console.log(`[UserStore] Created rule bot account: ${cfg.name} (${cfg.id})`);
    } else {
      const existing = users.get(cfg.id)!;
      if (!existing.isRuleBot) {
        existing.isRuleBot = true;
        changed = true;
      }
    }
  }
  if (changed) saveUsers();
}

// Load on startup
loadUsers();
ensureLLMBotAccounts();
ensureRuleBotAccounts();

export function createUser(username: string, password: string): UserProfile | null {
  // Prevent registering with LLM bot names
  for (const cfg of LLM_BOT_CONFIGS) {
    if (cfg.name.toLowerCase() === username.toLowerCase()) return null;
  }
  // Prevent registering with rule bot names
  for (const cfg of RULE_BOT_CONFIGS) {
    if (cfg.name.toLowerCase() === username.toLowerCase()) return null;
  }
  // Check duplicate (case-insensitive)
  for (const u of users.values()) {
    if (u.username.toLowerCase() === username.toLowerCase()) return null;
  }

  const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const passwordHash = bcrypt.hashSync(password, 10);

  const user: StoredUser = {
    id,
    username,
    passwordHash,
    chips: DEFAULT_USER_CHIPS,
    stats: { gamesPlayed: 0, gamesWon: 0, totalEarnings: 0 },
    createdAt: Date.now(),
  };

  users.set(id, user);
  saveUsers();
  return toProfile(user);
}

export function authenticateUser(username: string, password: string): UserProfile | null {
  for (const u of users.values()) {
    if (u.username.toLowerCase() === username.toLowerCase()) {
      // LLM bots and rule bots cannot authenticate
      if (u.isLLMBot || u.isRuleBot) return null;
      if (bcrypt.compareSync(password, u.passwordHash)) {
        return toProfile(u);
      }
      return null;
    }
  }
  return null;
}

export function getUserById(id: string): UserProfile | null {
  const u = users.get(id);
  return u ? toProfile(u) : null;
}

export function updateUserChips(id: string, delta: number): number | null {
  const u = users.get(id);
  if (!u) return null;
  u.chips = Math.max(0, u.chips + delta);
  saveUsers();
  return u.chips;
}

export function updateUserStats(id: string, won: boolean, earnings: number) {
  const u = users.get(id);
  if (!u) return;
  u.stats.gamesPlayed++;
  if (won) u.stats.gamesWon++;
  u.stats.totalEarnings += earnings;
  saveUsers();
}

export function updateUserLLMConfig(id: string, config: UserProfile['llmConfig']): boolean {
  const u = users.get(id);
  if (!u) return false;
  u.llmConfig = config;
  saveUsers();
  return true;
}

export function getUserLLMConfig(id: string): UserProfile['llmConfig'] | undefined {
  return users.get(id)?.llmConfig;
}

export function setUserChips(id: string, chips: number): boolean {
  const u = users.get(id);
  if (!u) return false;
  u.chips = chips;
  saveUsers();
  return true;
}

function toProfile(u: StoredUser): UserProfile {
  const { passwordHash, ...profile } = u;
  return profile;
}

export function getAllUsers(): UserProfile[] {
  return Array.from(users.values()).map(toProfile);
}

/** Get all LLM bot profiles */
export function getLLMBotProfiles(): UserProfile[] {
  return Array.from(users.values())
    .filter(u => u.isLLMBot)
    .map(toProfile);
}

/** Get all rule-based bot profiles */
export function getRuleBotProfiles(): UserProfile[] {
  return Array.from(users.values())
    .filter(u => u.isRuleBot)
    .map(toProfile);
}
