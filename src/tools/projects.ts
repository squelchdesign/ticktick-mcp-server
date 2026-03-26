import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TickTickClient } from '../services/ticktick-client.js';

export function registerProjectTools(server: McpServer, getClient: () => TickTickClient): void {

  server.registerTool(
    'ticktick_get_projects',
    {
      title: 'Get Projects',
      description: `List all TickTick projects (lists) in your account.

Returns:
  A list of projects with their IDs, names, and view modes.
  Project IDs are needed for other tools such as ticktick_get_project_tasks.

Note: Does not include the Inbox (tasks without a project). Use ticktick_get_today_tasks
to see tasks from all projects including the Inbox.`,
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      const client = getClient();
      const projects = await client.getProjects();

      if (projects.length === 0) {
        return { content: [{ type: 'text', text: 'No projects found.' }] };
      }

      const lines = ['# TickTick Projects\n'];
      for (const p of projects) {
        lines.push(`**${p.name}**`);
        lines.push(`  ID: ${p.id}`);
        if (p.viewMode) lines.push(`  View: ${p.viewMode}`);
        if (p.closed) lines.push(`  Status: Closed`);
        lines.push('');
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );
}
