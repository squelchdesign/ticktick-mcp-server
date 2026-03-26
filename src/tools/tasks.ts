import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TickTickClient } from '../services/ticktick-client.js';
import {
  formatTask,
  formatCompletedTask,
  isToday,
  isOverdue,
  todayDateString,
  yesterdayDateString,
  buildProjectMap,
} from '../services/formatters.js';

export function registerTaskTools(server: McpServer, getClient: () => TickTickClient): void {

  // ------------------------------------------------------------------
  // GET TODAY'S TASKS
  // ------------------------------------------------------------------
  server.registerTool(
    'ticktick_get_today_tasks',
    {
      title: 'Get Today\'s Tasks',
      description: `Retrieve all incomplete tasks due today, plus any overdue tasks.
Returns tasks sorted by priority (high → medium → low → none).

Returns:
  A formatted list of tasks. Each task shows:
  - Title
  - Project name
  - Priority (High / Medium / Low / None)
  - Due date
  - Notes (if any)
  - Task ID and project ID (needed for complete/update operations)

Use this tool at the start of a session to understand what needs doing today.`,
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
      const [projects, allTasks] = await Promise.all([
        client.getProjects(),
        client.getAllTasks(),
      ]);

      const projectMap = buildProjectMap(projects);
      const today = todayDateString();

      const relevantTasks = allTasks.filter(t =>
        t.status === 0 &&
        t.dueDate &&
        (isToday(t.dueDate) || isOverdue(t.dueDate))
      );

      if (relevantTasks.length === 0) {
        return {
          content: [{ type: 'text', text: `No tasks due today (${today}). You're clear!` }],
        };
      }

      // Sort: high(5) → medium(3) → low(1) → none(0), then overdue before today
      relevantTasks.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        const aDate = a.dueDate ?? '';
        const bDate = b.dueDate ?? '';
        return aDate.localeCompare(bDate);
      });

      const overdue = relevantTasks.filter(t => isOverdue(t.dueDate));
      const dueToday = relevantTasks.filter(t => isToday(t.dueDate));

      const sections: string[] = [`# Tasks for ${today}\n`];

      if (overdue.length > 0) {
        sections.push(`## ⚠️ Overdue (${overdue.length})\n`);
        overdue.forEach(t => sections.push(formatTask(t, projectMap.get(t.projectId))));
        sections.push('');
      }

      if (dueToday.length > 0) {
        sections.push(`## 📋 Due Today (${dueToday.length})\n`);
        dueToday.forEach(t => sections.push(formatTask(t, projectMap.get(t.projectId))));
      }

      const text = sections.join('\n');
      return { content: [{ type: 'text', text }] };
    }
  );

  // ------------------------------------------------------------------
  // GET TASKS BY PROJECT
  // ------------------------------------------------------------------
  server.registerTool(
    'ticktick_get_project_tasks',
    {
      title: 'Get Project Tasks',
      description: `Retrieve all incomplete tasks in a specific TickTick project.

Args:
  - project_id (string): The TickTick project ID. Use ticktick_get_projects to find project IDs.

Returns:
  A formatted list of tasks in that project, sorted by priority then due date.
  Returns a message if the project is empty.`,
      inputSchema: z.object({
        project_id: z.string().describe('TickTick project ID'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ project_id }) => {
      const client = getClient();
      const data = await client.getProjectData(project_id);
      const incompleteTasks = data.tasks.filter(t => t.status === 0);

      if (incompleteTasks.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No incomplete tasks in project "${data.project.name}".`,
          }],
        };
      }

      incompleteTasks.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        const aDate = a.dueDate ?? 'z';
        const bDate = b.dueDate ?? 'z';
        return aDate.localeCompare(bDate);
      });

      const lines = [
        `# ${data.project.name} — ${incompleteTasks.length} task(s)\n`,
        ...incompleteTasks.map(t => formatTask(t)),
      ];

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  // ------------------------------------------------------------------
  // CREATE TASK
  // ------------------------------------------------------------------
  server.registerTool(
    'ticktick_create_task',
    {
      title: 'Create Task',
      description: `Create a new task in TickTick.

Args:
  - title (string): Task title (required)
  - project_id (string, optional): Project to add task to. Omit to add to Inbox.
  - content (string, optional): Task notes or description
  - due_date (string, optional): Due date in ISO 8601 format, e.g. "2025-04-01" or "2025-04-01T09:00:00+01:00"
  - priority (number, optional): 0=None, 1=Low, 3=Medium, 5=High (default: 0)
  - is_all_day (boolean, optional): Whether the task is an all-day task (default: true if only date given)

Returns:
  The created task details including its ID.

Example: Create a high-priority task due today -> title="Fix bug", priority=5, due_date="2025-03-26"`,
      inputSchema: z.object({
        title: z.string().min(1).describe('Task title'),
        project_id: z.string().optional().describe('Project ID (omit for Inbox)'),
        content: z.string().optional().describe('Task notes or description'),
        due_date: z.string().optional().describe('Due date in ISO 8601 format'),
        priority: z.number().int().optional().describe('0=None, 1=Low, 3=Medium, 5=High'),
        is_all_day: z.boolean().optional().describe('All-day task (default true if date only)'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ title, project_id, content, due_date, priority, is_all_day }) => {
      const client = getClient();
      const task = await client.createTask({
        title,
        projectId: project_id,
        content,
        dueDate: due_date,
        priority: priority ?? 0,
        isAllDay: is_all_day,
      });

      return {
        content: [{
          type: 'text',
          text: `Task created successfully.\nID: ${task.id}\nProject: ${task.projectId}\nTitle: ${task.title}`,
        }],
      };
    }
  );

  // ------------------------------------------------------------------
  // COMPLETE TASK
  // ------------------------------------------------------------------
  server.registerTool(
    'ticktick_complete_task',
    {
      title: 'Complete Task',
      description: `Mark a TickTick task as complete.

Args:
  - task_id (string): The task ID (visible in task listings as "ID: ...")
  - project_id (string): The project ID the task belongs to

Returns:
  Confirmation message.

Note: This action cannot be undone via the API. The task will move to the completed list in TickTick.`,
      inputSchema: z.object({
        task_id: z.string().describe('Task ID'),
        project_id: z.string().describe('Project ID the task belongs to'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ task_id, project_id }) => {
      const client = getClient();
      await client.completeTask(project_id, task_id);
      return {
        content: [{ type: 'text', text: `Task ${task_id} marked as complete.` }],
      };
    }
  );

  // ------------------------------------------------------------------
  // UPDATE TASK
  // ------------------------------------------------------------------
  server.registerTool(
    'ticktick_update_task',
    {
      title: 'Update Task',
      description: `Update an existing TickTick task's details.

Args:
  - task_id (string): The task ID
  - project_id (string): The project ID the task belongs to
  - title (string, optional): New title
  - content (string, optional): New notes or description
  - due_date (string, optional): New due date in ISO 8601 format
  - priority (number, optional): New priority (0=None, 1=Low, 3=Medium, 5=High)

Returns:
  The updated task details.`,
      inputSchema: z.object({
        task_id: z.string().describe('Task ID'),
        project_id: z.string().describe('Project ID the task belongs to'),
        title: z.string().optional().describe('New task title'),
        content: z.string().optional().describe('New notes or description'),
        due_date: z.string().optional().describe('New due date in ISO 8601 format'),
        priority: z.number().int().optional().describe('New priority: 0=None, 1=Low, 3=Medium, 5=High'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ task_id, project_id, title, content, due_date, priority }) => {
      const client = getClient();
      const updated = await client.updateTask({
        taskId: task_id,
        projectId: project_id,
        title,
        content,
        dueDate: due_date,
        priority,
      });

      return {
        content: [{
          type: 'text',
          text: `Task updated.\nID: ${updated.id}\nTitle: ${updated.title}`,
        }],
      };
    }
  );

  // ------------------------------------------------------------------
  // GET COMPLETED TASKS
  // ------------------------------------------------------------------
  server.registerTool(
    'ticktick_get_completed_tasks',
    {
      title: 'Get Completed Tasks',
      description: `Retrieve tasks completed within a date range, across all projects or specific ones.

Args:
  - start_date (string, optional): Start of range in YYYY-MM-DD format. Defaults to yesterday.
  - end_date (string, optional): End of range in YYYY-MM-DD format. Defaults to today.
  - project_ids (array of strings, optional): Limit results to specific projects. Omit for all projects.

Returns:
  Completed tasks grouped by completion date, sorted by completedTime descending.
  Each task shows title, project, completion time, due date (if set), priority, and IDs.

Example: Review what was done recently -> call with no arguments to see yesterday and today.`,
      inputSchema: z.object({
        start_date: z.string().optional().describe('Start date YYYY-MM-DD (default: yesterday)'),
        end_date: z.string().optional().describe('End date YYYY-MM-DD (default: today)'),
        project_ids: z.array(z.string()).optional().describe('Limit to these project IDs'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ start_date, end_date, project_ids }) => {
      const client = getClient();
      const projects = await client.getProjects();
      const projectMap = buildProjectMap(projects);

      const startStr = start_date ?? yesterdayDateString();
      const endStr = end_date ?? todayDateString();

      const tasks = await client.getCompletedTasks({
        projectIds: project_ids,
        startDate: `${startStr}T00:00:00+0000`,
        endDate: `${endStr}T23:59:59+0000`,
      });

      if (tasks.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No completed tasks found between ${startStr} and ${endStr}.`,
          }],
        };
      }

      // Sort by completedTime descending (most recent first)
      tasks.sort((a, b) => {
        const aTime = a.completedTime ?? '';
        const bTime = b.completedTime ?? '';
        return bTime.localeCompare(aTime);
      });

      // Group by completion date
      const byDate = new Map<string, typeof tasks>();
      for (const task of tasks) {
        const dateKey = task.completedTime ? task.completedTime.split('T')[0] : 'Unknown';
        if (!byDate.has(dateKey)) byDate.set(dateKey, []);
        byDate.get(dateKey)!.push(task);
      }

      const sections: string[] = [
        `# Completed Tasks: ${startStr} to ${endStr} (${tasks.length} total)\n`,
      ];

      for (const [date, dateTasks] of byDate) {
        const label = date === todayDateString() ? `${date} (Today)` :
                      date === yesterdayDateString() ? `${date} (Yesterday)` : date;
        sections.push(`## ${label} — ${dateTasks.length} task(s)\n`);
        dateTasks.forEach(t => sections.push(formatCompletedTask(t, projectMap.get(t.projectId))));
        sections.push('');
      }

      return { content: [{ type: 'text', text: sections.join('\n') }] };
    }
  );

  // ------------------------------------------------------------------
  // FILTER TASKS
  // ------------------------------------------------------------------
  server.registerTool(
    'ticktick_filter_tasks',
    {
      title: 'Filter Tasks',
      description: `Search for tasks using multiple filter criteria in a single call.

Args:
  - project_ids (array, optional): Limit to specific projects. Omit for all projects.
  - start_date (string, optional): YYYY-MM-DD. Returns tasks whose startDate >= this date.
  - end_date (string, optional): YYYY-MM-DD. Returns tasks whose startDate <= this date.
  - priorities (array of numbers, optional): Filter by priority — 0=None, 1=Low, 3=Medium, 5=High.
  - tags (array of strings, optional): Filter to tasks containing ALL specified tags.
  - statuses (array of numbers, optional): 0=open, 2=completed. Defaults to open tasks only.

Note: startDate/endDate filter against the task's START date, not its due date.
For filtering by due date or completion date use ticktick_get_today_tasks or
ticktick_get_completed_tasks instead.

Returns:
  Matching tasks sorted by priority then start date.`,
      inputSchema: z.object({
        project_ids: z.array(z.string()).optional().describe('Limit to these project IDs'),
        start_date: z.string().optional().describe('Tasks with startDate >= YYYY-MM-DD'),
        end_date: z.string().optional().describe('Tasks with startDate <= YYYY-MM-DD'),
        priorities: z.array(z.number().int()).optional().describe('Priority filter: 0=None, 1=Low, 3=Medium, 5=High'),
        tags: z.array(z.string()).optional().describe('Tasks must contain ALL of these tags'),
        statuses: z.array(z.number().int()).optional().describe('Status filter: 0=open, 2=completed (default: [0])'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ project_ids, start_date, end_date, priorities, tags, statuses }) => {
      const client = getClient();
      const projects = await client.getProjects();
      const projectMap = buildProjectMap(projects);

      const tasks = await client.filterTasks({
        projectIds: project_ids,
        startDate: start_date ? `${start_date}T00:00:00+0000` : undefined,
        endDate: end_date ? `${end_date}T23:59:59+0000` : undefined,
        priority: priorities,
        tag: tags,
        status: statuses ?? [0],
      });

      if (tasks.length === 0) {
        return { content: [{ type: 'text', text: 'No tasks matched the filter criteria.' }] };
      }

      tasks.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        const aDate = a.startDate ?? a.dueDate ?? '';
        const bDate = b.startDate ?? b.dueDate ?? '';
        return aDate.localeCompare(bDate);
      });

      const lines = [
        `# Filter Results — ${tasks.length} task(s)\n`,
        ...tasks.map(t => formatTask(t, projectMap.get(t.projectId))),
      ];

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  // ------------------------------------------------------------------
  // MOVE TASK
  // ------------------------------------------------------------------
  server.registerTool(
    'ticktick_move_task',
    {
      title: 'Move Task',
      description: `Move a task from one project to another.

Args:
  - task_id (string): The task ID
  - from_project_id (string): The project the task currently belongs to
  - to_project_id (string): The destination project ID

Returns:
  Confirmation message.

Use ticktick_get_projects to look up project IDs.`,
      inputSchema: z.object({
        task_id: z.string().describe('Task ID'),
        from_project_id: z.string().describe('Source project ID'),
        to_project_id: z.string().describe('Destination project ID'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ task_id, from_project_id, to_project_id }) => {
      const client = getClient();
      await client.moveTask({
        taskId: task_id,
        fromProjectId: from_project_id,
        toProjectId: to_project_id,
      });
      return {
        content: [{
          type: 'text',
          text: `Task ${task_id} moved from project ${from_project_id} to ${to_project_id}.`,
        }],
      };
    }
  );
}
