import fs from 'fs';
import path from 'path';
import os from 'os';
import type { TokenData } from '../types.js';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'ticktick-mcp');
const TOKEN_FILE = path.join(CONFIG_DIR, 'tokens.json');

export function saveTokens(tokens: TokenData): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

export function loadTokens(): TokenData | null {
  if (!fs.existsSync(TOKEN_FILE)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(TOKEN_FILE, 'utf8');
    return JSON.parse(raw) as TokenData;
  } catch {
    return null;
  }
}

export function tokenFilePath(): string {
  return TOKEN_FILE;
}
