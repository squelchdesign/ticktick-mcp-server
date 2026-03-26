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

  // ------------------------------------------------------------------
  // CREATE PROJECT
  // ------------------------------------------------------------------
  server.registerTool(
    'ticktick_create_project',
    {
      title: 'Create Project',
      description: `Create a new TickTick project (list).

Args:
  - name (string): Project name (required)
  - color (string, optional): Hex colour, e.g. "#F18181"
  - view_mode (string, optional): "list", "kanban", or "timeline" (default: "list")
  - kind (string, optional): "TASK" or "NOTE" (default: "TASK")

Returns:
  The created project details including its ID.`,
      inputSchema: z.object({
        name: z.string().min(1).describe('Project name'),
        color: z.string().optional().describe('Hex colour e.g. "#F18181"'),
        view_mode: z.enum(['list', 'kanban', 'timeline']).optional().describe('View mode (default: list)'),
        kind: z.enum(['TASK', 'NOTE']).optional().describe('Project kind (default: TASK)'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ name, color, view_mode, kind }) => {
      const client = getClient();
      const project = await client.createProject({
        name,
        color,
        viewMode: view_mode,
        kind,
      });

      return {
        content: [{
          type: 'text',
          text: `Project created.\nID: ${project.id}\nName: ${project.name}`,
        }],
      };
    }
  );
}
