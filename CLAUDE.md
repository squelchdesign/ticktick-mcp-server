# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # Compile TypeScript to dist/
npm run dev          # Watch mode compilation
npm start            # Run the MCP server
npm run auth         # Run the one-time OAuth setup CLI
npm test             # Run tests (single pass)
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

## Tests

Tests use [Vitest](https://vitest.dev/) and live in `tests/services/`. Run with `npm test`.

The three service files are covered (`formatters.ts`, `ticktick-client.ts`, `token-store.ts`). The MCP tool files (`src/tools/`) are **not** unit tested — they are thin orchestration over the already-tested service layer, and would require a complex `McpServer` mock to unit test usefully. If tool-layer coverage becomes important, the right approach is integration testing via an in-memory MCP transport.

## Architecture

This is a **Model Context Protocol (MCP) server** that exposes TickTick task management to Claude via stdio transport. It uses TickTick's OAuth2 Open API.

### Data Flow

1. On startup, `src/index.ts` loads `TICKTICK_CLIENT_ID` / `TICKTICK_CLIENT_SECRET` from env, restores tokens from `~/.config/ticktick-mcp/tokens.json`, and registers tools via the MCP SDK
2. `src/services/ticktick-client.ts` wraps the TickTick REST API (`https://api.ticktick.com/open/v1`), handles token refresh automatically (60s before expiry), and exposes typed methods for all CRUD operations
3. Tools in `src/tools/` register with the MCP server using Zod input schemas; each tool calls the client and returns formatted markdown
4. `src/services/formatters.ts` converts raw API responses to human-readable markdown with priority labels and date status
5. OAuth tokens are persisted at `~/.config/ticktick-mcp/tokens.json` (mode 0600) by `src/services/token-store.ts`

### Key Design Points

- **Inbox tasks** are fetched separately using the special project ID `"inbox"` — the TickTick API treats inbox differently from named projects
- **`getAllTasks()`** aggregates tasks across all projects plus inbox; it makes N+1 API calls (one per project)
- Tools are passed a `getClient()` getter (not the client directly) so the single client instance is shared across all tool registrations
- MCP tool annotations (`readOnly`, `destructive`, `idempotent`) are set on each tool registration in `src/tools/`

### Adding a New Tool

1. Add the API method to `src/services/ticktick-client.ts` if needed
2. Register the tool in the appropriate file under `src/tools/` (or create a new one and call `registerXxxTools(server, getClient)` from `src/index.ts`)
3. Run `npm run build` and restart Claude Desktop to pick up changes

## Configuration

The server is configured via Claude Desktop's `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ticktick": {
      "command": "node",
      "args": ["/full/path/to/dist/index.js"],
      "env": {
        "TICKTICK_CLIENT_ID": "your-id",
        "TICKTICK_CLIENT_SECRET": "your-secret"
      }
    }
  }
}
```

OAuth apps must be registered at [developer.ticktick.com](https://developer.ticktick.com) with redirect URI `http://localhost:8080/callback`. Run `npm run auth` once to complete the OAuth flow and store tokens before starting the server.

A snapshot of the TickTick Open API docs is saved at `docs/ticktick-open-api-2026-03-26.html` — use this when you need to check endpoint specs, as the live docs require JavaScript to render and are not directly fetchable.
