import type { TickTickTask, TickTickProject } from '../types.js';
import { PRIORITY_LABELS } from '../types.js';

export function formatDate(iso?: string): string {
  if (!iso) return 'No date';
  return iso.split('T')[0]; // YYYY-MM-DD
}

export function todayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

export function yesterdayDateString(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
}

export function isToday(isoDate?: string): boolean {
  if (!isoDate) return false;
  return isoDate.startsWith(todayDateString());
}

export function isOverdue(isoDate?: string): boolean {
  if (!isoDate) return false;
  return isoDate.split('T')[0] < todayDateString();
}

export function priorityLabel(priority: number): string {
  return PRIORITY_LABELS[priority] ?? 'Unknown';
}

export function formatTask(task: TickTickTask, projectName?: string): string {
  const lines: string[] = [];
  lines.push(`**${task.title}**`);
  if (projectName) lines.push(`  Project: ${projectName}`);
  lines.push(`  Priority: ${priorityLabel(task.priority)}`);
  if (task.dueDate) lines.push(`  Due: ${formatDate(task.dueDate)}`);
  if (task.content) lines.push(`  Notes: ${task.content}`);
  if (task.tags && task.tags.length > 0) lines.push(`  Tags: ${task.tags.join(', ')}`);
  lines.push(`  ID: ${task.id} (project: ${task.projectId})`);
  return lines.join('\n');
}

export function formatCompletedTask(task: TickTickTask, projectName?: string): string {
  const lines: string[] = [];
  lines.push(`**${task.title}**`);
  if (projectName) lines.push(`  Project: ${projectName}`);
  if (task.completedTime) lines.push(`  Completed: ${formatDate(task.completedTime)}`);
  if (task.dueDate) lines.push(`  Due: ${formatDate(task.dueDate)}`);
  lines.push(`  Priority: ${priorityLabel(task.priority)}`);
  if (task.content) lines.push(`  Notes: ${task.content}`);
  lines.push(`  ID: ${task.id} (project: ${task.projectId})`);
  return lines.join('\n');
}

export function buildProjectMap(projects: TickTickProject[]): Map<string, string> {
  return new Map(projects.map(p => [p.id, p.name]));
}
