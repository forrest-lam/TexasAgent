import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { UserProfile, DEFAULT_USER_CHIPS } from '@texas-agent/shared';

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

// Load on startup
loadUsers();

export function createUser(username: string, password: string): UserProfile | null {
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
