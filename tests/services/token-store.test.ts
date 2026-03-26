import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TokenData } from '../../src/types.js';

vi.mock('fs');

import fs from 'fs';
import { saveTokens, loadTokens, tokenFilePath } from '../../src/services/token-store.js';

const mockTokens: TokenData = {
  access_token: 'acc-token',
  refresh_token: 'ref-token',
  expires_at: 1_800_000_000_000,
  token_type: 'Bearer',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// saveTokens
// ---------------------------------------------------------------------------
describe('saveTokens', () => {
  it('creates the config directory recursively', () => {
    saveTokens(mockTokens);
    expect(vi.mocked(fs.mkdirSync)).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(fs.mkdirSync).mock.calls[0];
    expect(options).toMatchObject({ recursive: true });
  });

  it('writes the token file with mode 0o600', () => {
    saveTokens(mockTokens);
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledOnce();
    const [filePath, , options] = vi.mocked(fs.writeFileSync).mock.calls[0];
    expect(String(filePath)).toContain('tokens.json');
    expect(options).toMatchObject({ mode: 0o600 });
  });

  it('writes valid JSON that round-trips to the original tokens', () => {
    saveTokens(mockTokens);
    const [, content] = vi.mocked(fs.writeFileSync).mock.calls[0];
    expect(JSON.parse(String(content))).toEqual(mockTokens);
  });
});

// ---------------------------------------------------------------------------
// loadTokens
// ---------------------------------------------------------------------------
describe('loadTokens', () => {
  it('returns null when the token file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(loadTokens()).toBeNull();
  });

  it('returns parsed TokenData when the file contains valid JSON', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockTokens));
    expect(loadTokens()).toEqual(mockTokens);
  });

  it('returns null when the file contains malformed JSON', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('not valid json {{');
    expect(loadTokens()).toBeNull();
  });

  it('returns null when readFileSync throws', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('EACCES'); });
    expect(loadTokens()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// tokenFilePath
// ---------------------------------------------------------------------------
describe('tokenFilePath', () => {
  it('ends with tokens.json', () => {
    expect(tokenFilePath()).toMatch(/tokens\.json$/);
  });

  it('contains the ticktick-mcp config directory', () => {
    expect(tokenFilePath()).toContain('ticktick-mcp');
  });
});
