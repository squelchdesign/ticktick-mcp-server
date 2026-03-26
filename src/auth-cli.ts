#!/usr/bin/env node
/**
 * One-shot OAuth2 authorisation flow for TickTick.
 * Run once: node dist/auth-cli.js
 * Tokens are saved to ~/.config/ticktick-mcp/tokens.json
 */
import http from 'http';
import { URL } from 'url';
import readline from 'readline';
import axios from 'axios';
import { saveTokens, tokenFilePath } from './services/token-store.js';
import type { TokenData } from './types.js';

const REDIRECT_PORT = 8080;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const AUTH_URL = 'https://ticktick.com/oauth/authorize';
const TOKEN_URL = 'https://ticktick.com/oauth/token';

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function buildAuthUrl(clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'tasks:read tasks:write',
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    state: 'ticktick-mcp',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

function waitForCallback(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url ?? '/', `http://localhost:${REDIRECT_PORT}`);

      if (reqUrl.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Authorisation failed</h1><p>You can close this tab.</p>');
        server.close();
        reject(new Error(`TickTick returned error: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>No code received</h1><p>You can close this tab.</p>');
        server.close();
        reject(new Error('No authorisation code in callback'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<h1>Authorised!</h1>' +
        '<p>TickTick MCP is now connected. You can close this tab.</p>'
      );
      server.close();
      resolve(code);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(
          `Port ${REDIRECT_PORT} is already in use. ` +
          'Stop whatever is using it and try again.'
        ));
      } else {
        reject(err);
      }
    });

    server.listen(REDIRECT_PORT);
  });
}

async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<TokenData> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
  });

  const response = await axios.post<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  }>(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    auth: { username: clientId, password: clientSecret },
  });

  return {
    access_token: response.data.access_token,
    refresh_token: response.data.refresh_token,
    expires_at: Date.now() + response.data.expires_in * 1000,
    token_type: response.data.token_type,
  };
}

async function main(): Promise<void> {
  console.log('TickTick MCP — OAuth2 Setup\n');
  console.log(
    'You need a TickTick Client ID and Client Secret.\n' +
    'Register your app at: https://developer.ticktick.com/manage\n' +
    `Set the redirect URI to: ${REDIRECT_URI}\n`
  );

  const clientId = await prompt('Client ID: ');
  const clientSecret = await prompt('Client Secret: ');

  if (!clientId || !clientSecret) {
    console.error('Client ID and Client Secret are required.');
    process.exit(1);
  }

  const authUrl = buildAuthUrl(clientId);

  console.log('\nOpening browser for authorisation...');
  console.log(`(If it doesn't open automatically, visit: ${authUrl})\n`);

  // Attempt to open the browser; fall through gracefully if it fails
  try {
    const { default: open } = await import('open');
    await open(authUrl);
  } catch {
    // Non-fatal — user can open manually
  }

  console.log(`Waiting for TickTick to redirect to localhost:${REDIRECT_PORT}...`);

  const code = await waitForCallback();

  console.log('\nReceived authorisation code. Exchanging for tokens...');

  const tokens = await exchangeCode(code, clientId, clientSecret);
  saveTokens(tokens);

  console.log(`\nSuccess! Tokens saved to: ${tokenFilePath()}`);
  console.log('\nNext steps:');
  console.log('1. Add the following to your Claude Desktop config:');
  console.log('   (macOS: ~/Library/Application Support/Claude/claude_desktop_config.json)\n');

  const serverPath = process.cwd();
  console.log(JSON.stringify({
    mcpServers: {
      ticktick: {
        command: 'node',
        args: [`${serverPath}/dist/index.js`],
        env: {
          TICKTICK_CLIENT_ID: clientId,
          TICKTICK_CLIENT_SECRET: clientSecret,
        },
      },
    },
  }, null, 2));

  console.log('\n2. Restart Claude Desktop.');
  console.log('3. Ask Claude: "What\'s on my TickTick today?"\n');
}

main().catch(err => {
  console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
