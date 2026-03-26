# ticktick-mcp-server

A local MCP server that gives Claude access to your TickTick tasks. Built with Node.js/TypeScript, using TickTick's official Open API.

## Prerequisites

- Node.js v18 or later (v25 is fine)
- A TickTick account

## Installation

```bash
cd ticktick-mcp-server
npm install
npm run build
```

## Step 1 — Register a TickTick application

1. Go to https://developer.ticktick.com/manage and sign in.
2. Click **+ App Name** and give it any name (e.g. "Claude MCP").
3. Set the **OAuth Redirect URL** to exactly: `http://localhost:8080/callback`
4. Save. Note the **Client ID** and **Client Secret**.

## Step 2 — Authorise

Run the auth CLI once. It will open a browser, handle the OAuth callback, and save tokens to `~/.config/ticktick-mcp/tokens.json`.

```bash
npm run auth
# or: node dist/auth-cli.js
```

Follow the prompts. At the end it prints the exact JSON block you need for the next step.

## Step 3 — Configure Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) and add the `ticktick` block inside `mcpServers`. Use the full absolute path to this directory.

```json
{
  "mcpServers": {
    "ticktick": {
      "command": "node",
      "args": ["/full/path/to/ticktick-mcp-server/dist/index.js"],
      "env": {
        "TICKTICK_CLIENT_ID": "your-client-id",
        "TICKTICK_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

Restart Claude Desktop. You should see the hammer (🔨) icon indicating tools are available.

## Available tools

| Tool | Description |
|------|-------------|
| `ticktick_get_today_tasks` | All tasks due today plus any overdue, sorted by priority |
| `ticktick_get_projects` | List all projects with their IDs |
| `ticktick_get_project_tasks` | All incomplete tasks in a given project |
| `ticktick_create_task` | Create a task (title, project, due date, priority, notes) |
| `ticktick_update_task` | Update an existing task's details |
| `ticktick_complete_task` | Mark a task as complete |

## Example prompts

- "What's on my TickTick today?"
- "Show me all my TickTick projects."
- "Add a task to call the accountant, high priority, due tomorrow."
- "Mark the 'Send invoice' task as done." *(you'll need to tell Claude the task ID, or ask it to find the task first)*

## Token refresh

Access tokens expire. The server refreshes them automatically using the stored refresh token and writes the new tokens back to `~/.config/ticktick-mcp/tokens.json`. You should not need to re-run the auth CLI unless you revoke access from the TickTick developer portal.

## Extending the server

The project is designed to be iterated on. To add new tools:

1. Add methods to `src/services/ticktick-client.ts` for any new API calls.
2. Add tool registrations in `src/tools/tasks.ts` or create a new file in `src/tools/`.
3. Register the new file in `src/index.ts`.
4. Run `npm run build`.

TickTick's Open API reference: https://developer.ticktick.com/api

## File locations

| File | Purpose |
|------|---------|
| `~/.config/ticktick-mcp/tokens.json` | OAuth tokens (mode 600 — readable only by you) |
| `dist/index.js` | MCP server (run by Claude Desktop) |
| `dist/auth-cli.js` | One-shot auth setup |
