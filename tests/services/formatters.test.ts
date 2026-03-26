import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatDate,
  todayDateString,
  yesterdayDateString,
  isToday,
  isOverdue,
  priorityLabel,
  formatTask,
  formatCompletedTask,
  buildProjectMap,
} from '../../src/services/formatters.js';
import type { TickTickTask, TickTickProject } from '../../src/types.js';

// Pin time to 2026-03-26T12:00:00Z for all date-sensitive tests
const FIXED_DATE = new Date('2026-03-26T12:00:00Z');

function makeTask(overrides: Partial<TickTickTask> = {}): TickTickTask {
  return {
    id: 'task-1',
    projectId: 'proj-1',
    title: 'Test Task',
    priority: 0,
    status: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe('formatDate', () => {
  it('returns "No date" for undefined', () => {
    expect(formatDate(undefined)).toBe('No date');
  });

  it('extracts YYYY-MM-DD from a full ISO datetime', () => {
    expect(formatDate('2026-03-26T09:00:00+0000')).toBe('2026-03-26');
  });

  it('returns a date-only string unchanged', () => {
    expect(formatDate('2026-03-26')).toBe('2026-03-26');
  });
});

// ---------------------------------------------------------------------------
// todayDateString
// ---------------------------------------------------------------------------
describe('todayDateString', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_DATE); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns the UTC date in YYYY-MM-DD format', () => {
    expect(todayDateString()).toBe('2026-03-26');
  });

  it('matches the pattern YYYY-MM-DD', () => {
    expect(todayDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// yesterdayDateString
// ---------------------------------------------------------------------------
describe('yesterdayDateString', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('returns the previous UTC day', () => {
    vi.useFakeTimers(); vi.setSystemTime(FIXED_DATE);
    expect(yesterdayDateString()).toBe('2026-03-25');
  });

  it('crosses a month boundary correctly', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-03-01T06:00:00Z'));
    expect(yesterdayDateString()).toBe('2026-02-28');
  });

  it('crosses a year boundary correctly', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:30:00Z'));
    expect(yesterdayDateString()).toBe('2025-12-31');
  });
});

// ---------------------------------------------------------------------------
// isToday
// ---------------------------------------------------------------------------
describe('isToday', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_DATE); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns false for undefined', () => {
    expect(isToday(undefined)).toBe(false);
  });

  it('returns true for a date-only string matching today', () => {
    expect(isToday('2026-03-26')).toBe(true);
  });

  it('returns true for a full datetime on today', () => {
    expect(isToday('2026-03-26T14:30:00+0000')).toBe(true);
  });

  it('returns false for yesterday', () => {
    expect(isToday('2026-03-25')).toBe(false);
  });

  it('returns false for tomorrow', () => {
    expect(isToday('2026-03-27')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isOverdue
// ---------------------------------------------------------------------------
describe('isOverdue', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_DATE); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns false for undefined', () => {
    expect(isOverdue(undefined)).toBe(false);
  });

  it('returns true for yesterday', () => {
    expect(isOverdue('2026-03-25')).toBe(true);
  });

  it('returns false for today', () => {
    expect(isOverdue('2026-03-26')).toBe(false);
  });

  it('returns false for a future date', () => {
    expect(isOverdue('2026-03-27')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// priorityLabel
// ---------------------------------------------------------------------------
describe('priorityLabel', () => {
  it('returns "None" for 0', () => { expect(priorityLabel(0)).toBe('None'); });
  it('returns "Low" for 1', () => { expect(priorityLabel(1)).toBe('Low'); });
  it('returns "Medium" for 3', () => { expect(priorityLabel(3)).toBe('Medium'); });
  it('returns "High" for 5', () => { expect(priorityLabel(5)).toBe('High'); });
  it('returns "Unknown" for an unlisted value', () => { expect(priorityLabel(99)).toBe('Unknown'); });
});

// ---------------------------------------------------------------------------
// formatTask
// ---------------------------------------------------------------------------
describe('formatTask', () => {
  it('includes the title in bold', () => {
    const out = formatTask(makeTask({ title: 'My Task' }));
    expect(out).toContain('**My Task**');
  });

  it('includes priority and ID lines', () => {
    const out = formatTask(makeTask());
    expect(out).toContain('Priority: None');
    expect(out).toContain('ID: task-1 (project: proj-1)');
  });

  it('includes project name when provided', () => {
    const out = formatTask(makeTask(), 'Work');
    expect(out).toContain('Project: Work');
  });

  it('omits project line when name is not provided', () => {
    const out = formatTask(makeTask());
    expect(out).not.toContain('Project:');
  });

  it('includes due date when dueDate is set', () => {
    const out = formatTask(makeTask({ dueDate: '2026-03-26T00:00:00+0000' }));
    expect(out).toContain('Due: 2026-03-26');
  });

  it('omits due date line when dueDate is absent', () => {
    const out = formatTask(makeTask());
    expect(out).not.toContain('Due:');
  });

  it('includes notes when content is set', () => {
    const out = formatTask(makeTask({ content: 'Some note' }));
    expect(out).toContain('Notes: Some note');
  });

  it('includes tags as comma-separated list', () => {
    const out = formatTask(makeTask({ tags: ['work', 'urgent'] }));
    expect(out).toContain('Tags: work, urgent');
  });

  it('omits tags line when tags array is empty', () => {
    const out = formatTask(makeTask({ tags: [] }));
    expect(out).not.toContain('Tags:');
  });
});

// ---------------------------------------------------------------------------
// formatCompletedTask
// ---------------------------------------------------------------------------
describe('formatCompletedTask', () => {
  it('includes the title in bold', () => {
    const out = formatCompletedTask(makeTask({ title: 'Done Task', status: 2 }));
    expect(out).toContain('**Done Task**');
  });

  it('includes Completed line when completedTime is set', () => {
    const out = formatCompletedTask(makeTask({ completedTime: '2026-03-26T10:00:00+0000', status: 2 }));
    expect(out).toContain('Completed: 2026-03-26');
  });

  it('omits Completed line when completedTime is absent', () => {
    const out = formatCompletedTask(makeTask({ status: 2 }));
    expect(out).not.toContain('Completed:');
  });

  it('includes Due line when dueDate is set', () => {
    const out = formatCompletedTask(makeTask({ dueDate: '2026-03-26T00:00:00+0000', status: 2 }));
    expect(out).toContain('Due: 2026-03-26');
  });

  it('includes project name when provided', () => {
    const out = formatCompletedTask(makeTask({ status: 2 }), 'Inbox');
    expect(out).toContain('Project: Inbox');
  });

  it('omits project line when name is not provided', () => {
    const out = formatCompletedTask(makeTask({ status: 2 }));
    expect(out).not.toContain('Project:');
  });

  it('includes notes when content is set', () => {
    const out = formatCompletedTask(makeTask({ content: 'Done note', status: 2 }));
    expect(out).toContain('Notes: Done note');
  });
});

// ---------------------------------------------------------------------------
// buildProjectMap
// ---------------------------------------------------------------------------
describe('buildProjectMap', () => {
  const project = (id: string, name: string): TickTickProject => ({ id, name });

  it('returns an empty Map for an empty array', () => {
    expect(buildProjectMap([])).toEqual(new Map());
  });

  it('maps a single project id to its name', () => {
    const map = buildProjectMap([project('p1', 'Work')]);
    expect(map.get('p1')).toBe('Work');
  });

  it('maps multiple projects correctly', () => {
    const map = buildProjectMap([project('p1', 'Work'), project('p2', 'Personal')]);
    expect(map.get('p1')).toBe('Work');
    expect(map.get('p2')).toBe('Personal');
    expect(map.size).toBe(2);
  });
});
