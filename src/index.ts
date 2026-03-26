#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TickTickClient } from './services/ticktick-client.js';
import { loadTokens } from './services/token-store.js';
import { registerTaskTools } from './tools/tasks.js';
import { registerProjectTools } from './tools/projects.js';

function loadConfig(): { clientId: string; clientSecret: string } {
  const clientId = process.env['TICKTICK_CLIENT_ID'];
  const clientSecret = process.env['TICKTICK_CLIENT_SECRET'];

  if (!clientId || !clientSecret) {
    process.stderr.write(
      'Error: TICKTICK_CLIENT_ID and TICKTICK_CLIENT_SECRET must be set in the environment.\n' +
      'Add them to your Claude Desktop MCP config (see README).\n'
    );
    process.exit(1);
  }

  return { clientId, clientSecret };
}

async function main(): Promise<void> {
  const { clientId, clientSecret } = loadConfig();

  const tokens = loadTokens();
  if (!tokens) {
    process.stderr.write(
      'Error: No stored tokens found.\n' +
      'Run the auth command first: node dist/auth-cli.js\n'
    );
    process.exit(1);
  }

  const client = new TickTickClient(tokens, clientId, clientSecret);

  // Lazy getter — returns the single client instance.
  // If you need per-request client creation in future, swap this out.
  const getClient = (): TickTickClient => client;

  const server = new McpServer({
    name: 'ticktick-mcp-server',
    version: '1.0.0',
  });

  registerProjectTools(server, getClient);
  registerTaskTools(server, getClient);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write('TickTick MCP server running (stdio)\n');
}

main().catch(err => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
