import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TokenData } from '../../src/types.js';

// Hoist the mock HTTP instance so it is accessible both inside the vi.mock
// factory (which is hoisted by Vitest before imports) and in the test bodies.
const mockHttp = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockHttp),
    post: vi.fn(), // used by refreshIfNeeded for token refresh
  },
}));

vi.mock('../../src/services/token-store.js', () => ({
  loadTokens: vi.fn(),
  saveTokens: vi.fn(),
}));

import axios from 'axios';
import { saveTokens, loadTokens } from '../../src/services/token-store.js';
import { TickTickClient } from '../../src/services/ticktick-client.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const freshTokens: TokenData = {
  access_token: 'acc-token',
  refresh_token: 'ref-token',
  expires_at: Date.now() + 3_600_000, // 1 hour from now — no refresh needed
  token_type: 'Bearer',
};

const authHeader = { Authorization: 'Bearer acc-token' };

function makeClient(): TickTickClient {
  return new TickTickClient(freshTokens, 'client-id', 'client-secret');
}

function makeTask(overrides = {}) {
  return { id: 'task-1', projectId: 'proj-1', title: 'Task', priority: 0, status: 0, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createProject
// ---------------------------------------------------------------------------
describe('createProject', () => {
  it('POSTs to /project and returns the created project', async () => {
    const project = { id: 'proj-new', name: 'My Project', viewMode: 'list', kind: 'TASK' };
    mockHttp.post.mockResolvedValue({ data: project });

    const result = await makeClient().createProject({ name: 'My Project', viewMode: 'list', kind: 'TASK' });

    expect(mockHttp.post).toHaveBeenCalledWith(
      '/project',
      { name: 'My Project', viewMode: 'list', kind: 'TASK' },
      { headers: authHeader }
    );
    expect(result).toEqual(project);
  });

  it('sends only provided optional fields', async () => {
    mockHttp.post.mockResolvedValue({ data: { id: 'p1', name: 'Minimal' } });

    await makeClient().createProject({ name: 'Minimal' });

    const body = mockHttp.post.mock.calls[0][1];
    expect(body.color).toBeUndefined();
    expect(body.viewMode).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getProjects
// ---------------------------------------------------------------------------
describe('getProjects', () => {
  it('calls GET /project and returns the response array', async () => {
    const projects = [{ id: 'p1', name: 'Work' }];
    mockHttp.get.mockResolvedValue({ data: projects });

    const client = makeClient();
    const result = await client.getProjects();

    expect(mockHttp.get).toHaveBeenCalledWith('/project', { headers: authHeader });
    expect(result).toEqual(projects);
  });

  it('does not trigger a token refresh when the token is fresh', async () => {
    mockHttp.get.mockResolvedValue({ data: [] });
    await makeClient().getProjects();
    expect(vi.mocked(axios.post)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getProjectData
// ---------------------------------------------------------------------------
describe('getProjectData', () => {
  it('calls GET /project/{id}/data', async () => {
    const data = { project: { id: 'p1', name: 'Work' }, tasks: [] };
    mockHttp.get.mockResolvedValue({ data });

    await makeClient().getProjectData('p1');

    expect(mockHttp.get).toHaveBeenCalledWith('/project/p1/data', { headers: authHeader });
  });

  it('returns the project data from the response', async () => {
    const data = { project: { id: 'p1', name: 'Work' }, tasks: [makeTask()] };
    mockHttp.get.mockResolvedValue({ data });
    expect(await makeClient().getProjectData('p1')).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// getAllTasks
// ---------------------------------------------------------------------------
describe('getAllTasks', () => {
  it('fetches inbox and all project tasks, returning a flat array', async () => {
    const inboxTask = makeTask({ id: 'inbox-task', projectId: 'inbox' });
    const projTask = makeTask({ id: 'proj-task', projectId: 'p1' });

    mockHttp.get.mockImplementation((url: string) => {
      if (url === '/project') return Promise.resolve({ data: [{ id: 'p1', name: 'Work' }] });
      if (url === '/project/inbox/data') return Promise.resolve({ data: { project: {}, tasks: [inboxTask] } });
      if (url === '/project/p1/data') return Promise.resolve({ data: { project: {}, tasks: [projTask] } });
      return Promise.resolve({ data: { project: {}, tasks: [] } });
    });

    const tasks = await makeClient().getAllTasks();
    expect(tasks).toContainEqual(inboxTask);
    expect(tasks).toContainEqual(projTask);
    expect(tasks).toHaveLength(2);
  });

  it('silently skips inbox if fetching inbox data fails', async () => {
    const projTask = makeTask({ id: 'proj-task', projectId: 'p1' });

    mockHttp.get.mockImplementation((url: string) => {
      if (url === '/project') return Promise.resolve({ data: [{ id: 'p1', name: 'Work' }] });
      if (url === '/project/inbox/data') return Promise.reject(new Error('not found'));
      return Promise.resolve({ data: { project: {}, tasks: [projTask] } });
    });

    const tasks = await makeClient().getAllTasks();
    expect(tasks).toEqual([projTask]);
  });
});

// ---------------------------------------------------------------------------
// getTask
// ---------------------------------------------------------------------------
describe('getTask', () => {
  it('calls GET /project/{projectId}/task/{taskId}', async () => {
    const task = makeTask();
    mockHttp.get.mockResolvedValue({ data: task });

    await makeClient().getTask('proj-1', 'task-1');

    expect(mockHttp.get).toHaveBeenCalledWith(
      '/project/proj-1/task/task-1',
      { headers: authHeader }
    );
  });
});

// ---------------------------------------------------------------------------
// createTask — including normalizeDueDate behaviour
// ---------------------------------------------------------------------------
describe('createTask', () => {
  it('POSTs to /task and returns the created task', async () => {
    const task = makeTask();
    mockHttp.post.mockResolvedValue({ data: task });

    const result = await makeClient().createTask({ title: 'Task' });

    expect(mockHttp.post).toHaveBeenCalledWith('/task', expect.any(Object), { headers: authHeader });
    expect(result).toEqual(task);
  });

  it('normalises a date-only dueDate to midnight UTC', async () => {
    mockHttp.post.mockResolvedValue({ data: makeTask() });

    await makeClient().createTask({ title: 'Task', dueDate: '2026-03-26' });

    const body = mockHttp.post.mock.calls[0][1];
    expect(body.dueDate).toBe('2026-03-26T00:00:00+0000');
  });

  it('passes through a full datetime dueDate unchanged', async () => {
    mockHttp.post.mockResolvedValue({ data: makeTask() });

    await makeClient().createTask({ title: 'Task', dueDate: '2026-03-26T09:00:00+0100' });

    const body = mockHttp.post.mock.calls[0][1];
    expect(body.dueDate).toBe('2026-03-26T09:00:00+0100');
  });

  it('sends dueDate as undefined when not provided', async () => {
    mockHttp.post.mockResolvedValue({ data: makeTask() });

    await makeClient().createTask({ title: 'Task' });

    const body = mockHttp.post.mock.calls[0][1];
    expect(body.dueDate).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// updateTask — including normalizeDueDate and taskId stripping
// ---------------------------------------------------------------------------
describe('updateTask', () => {
  it('POSTs to /task/{taskId} (not /task)', async () => {
    mockHttp.post.mockResolvedValue({ data: makeTask() });

    await makeClient().updateTask({ taskId: 'task-1', projectId: 'proj-1', title: 'Updated' });

    expect(mockHttp.post).toHaveBeenCalledWith(
      '/task/task-1',
      expect.any(Object),
      { headers: authHeader }
    );
  });

  it('does not include taskId in the request body', async () => {
    mockHttp.post.mockResolvedValue({ data: makeTask() });

    await makeClient().updateTask({ taskId: 'task-1', projectId: 'proj-1' });

    const body = mockHttp.post.mock.calls[0][1];
    expect(body).not.toHaveProperty('taskId');
  });

  it('normalises a date-only dueDate to midnight UTC', async () => {
    mockHttp.post.mockResolvedValue({ data: makeTask() });

    await makeClient().updateTask({ taskId: 'task-1', projectId: 'proj-1', dueDate: '2026-04-01' });

    const body = mockHttp.post.mock.calls[0][1];
    expect(body.dueDate).toBe('2026-04-01T00:00:00+0000');
  });
});

// ---------------------------------------------------------------------------
// completeTask
// ---------------------------------------------------------------------------
describe('completeTask', () => {
  it('POSTs to /project/{projectId}/task/{taskId}/complete with an empty body', async () => {
    mockHttp.post.mockResolvedValue({ data: {} });

    await makeClient().completeTask('proj-1', 'task-1');

    expect(mockHttp.post).toHaveBeenCalledWith(
      '/project/proj-1/task/task-1/complete',
      {},
      { headers: authHeader }
    );
  });
});

// ---------------------------------------------------------------------------
// deleteTask
// ---------------------------------------------------------------------------
describe('deleteTask', () => {
  it('sends DELETE /project/{projectId}/task/{taskId}', async () => {
    mockHttp.delete.mockResolvedValue({ data: {} });

    await makeClient().deleteTask('proj-1', 'task-1');

    expect(mockHttp.delete).toHaveBeenCalledWith(
      '/project/proj-1/task/task-1',
      { headers: authHeader }
    );
  });
});

// ---------------------------------------------------------------------------
// getCompletedTasks
// ---------------------------------------------------------------------------
describe('getCompletedTasks', () => {
  it('POSTs to /task/completed with the provided params', async () => {
    const tasks = [makeTask({ status: 2, completedTime: '2026-03-26T10:00:00+0000' })];
    mockHttp.post.mockResolvedValue({ data: tasks });

    const params = {
      projectIds: ['proj-1'],
      startDate: '2026-03-25T00:00:00+0000',
      endDate: '2026-03-26T23:59:59+0000',
    };

    const result = await makeClient().getCompletedTasks(params);

    expect(mockHttp.post).toHaveBeenCalledWith('/task/completed', params, { headers: authHeader });
    expect(result).toEqual(tasks);
  });

  it('sends the body without projectIds when they are omitted', async () => {
    mockHttp.post.mockResolvedValue({ data: [] });

    await makeClient().getCompletedTasks({
      startDate: '2026-03-25T00:00:00+0000',
      endDate: '2026-03-26T23:59:59+0000',
    });

    const body = mockHttp.post.mock.calls[0][1];
    expect(body.projectIds).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// filterTasks
// ---------------------------------------------------------------------------
describe('filterTasks', () => {
  it('POSTs to /task/filter with the provided params', async () => {
    const tasks = [makeTask()];
    mockHttp.post.mockResolvedValue({ data: tasks });

    const params = {
      projectIds: ['proj-1'],
      startDate: '2026-03-01T00:00:00+0000',
      endDate: '2026-03-31T23:59:59+0000',
      priority: [3, 5],
      tag: ['urgent'],
      status: [0],
    };

    const result = await makeClient().filterTasks(params);

    expect(mockHttp.post).toHaveBeenCalledWith('/task/filter', params, { headers: authHeader });
    expect(result).toEqual(tasks);
  });

  it('sends only provided fields', async () => {
    mockHttp.post.mockResolvedValue({ data: [] });

    await makeClient().filterTasks({ status: [0] });

    const body = mockHttp.post.mock.calls[0][1];
    expect(body).toEqual({ status: [0] });
    expect(body.projectIds).toBeUndefined();
    expect(body.priority).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// moveTask
// ---------------------------------------------------------------------------
describe('moveTask', () => {
  it('POSTs to /task/move with an array containing the move params', async () => {
    mockHttp.post.mockResolvedValue({ data: [{ id: 'task-1', etag: 'abc' }] });

    await makeClient().moveTask({
      taskId: 'task-1',
      fromProjectId: 'proj-a',
      toProjectId: 'proj-b',
    });

    expect(mockHttp.post).toHaveBeenCalledWith(
      '/task/move',
      [{ taskId: 'task-1', fromProjectId: 'proj-a', toProjectId: 'proj-b' }],
      { headers: authHeader }
    );
  });
});

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------
describe('token refresh', () => {
  it('does not call axios.post for refresh when the token is fresh', async () => {
    mockHttp.get.mockResolvedValue({ data: [] });
    await makeClient().getProjects();
    expect(vi.mocked(axios.post)).not.toHaveBeenCalled();
  });

  it('calls axios.post to refresh when the token is expired', async () => {
    const expiredTokens: TokenData = { ...freshTokens, expires_at: Date.now() - 1 };
    const newTokens = {
      access_token: 'new-acc',
      refresh_token: 'new-ref',
      expires_in: 3600,
      token_type: 'Bearer',
    };

    vi.mocked(axios.post).mockResolvedValue({ data: newTokens });
    mockHttp.get.mockResolvedValue({ data: [] });

    const client = new TickTickClient(expiredTokens, 'client-id', 'client-secret');
    await client.getProjects();

    expect(vi.mocked(axios.post)).toHaveBeenCalledOnce();
  });

  it('persists the refreshed token via saveTokens', async () => {
    const expiredTokens: TokenData = { ...freshTokens, expires_at: Date.now() - 1 };
    const newTokenData = {
      access_token: 'new-acc',
      refresh_token: 'new-ref',
      expires_in: 3600,
      token_type: 'Bearer',
    };

    vi.mocked(axios.post).mockResolvedValue({ data: newTokenData });
    mockHttp.get.mockResolvedValue({ data: [] });

    const client = new TickTickClient(expiredTokens, 'client-id', 'client-secret');
    await client.getProjects();

    expect(vi.mocked(saveTokens)).toHaveBeenCalledOnce();
    const saved = vi.mocked(saveTokens).mock.calls[0][0];
    expect(saved.access_token).toBe('new-acc');
  });

  it('uses the new access token in subsequent requests after refresh', async () => {
    const expiredTokens: TokenData = { ...freshTokens, expires_at: Date.now() - 1 };
    vi.mocked(axios.post).mockResolvedValue({
      data: { access_token: 'new-acc', refresh_token: 'new-ref', expires_in: 3600, token_type: 'Bearer' },
    });
    mockHttp.get.mockResolvedValue({ data: [] });

    const client = new TickTickClient(expiredTokens, 'client-id', 'client-secret');
    await client.getProjects();

    const headers = mockHttp.get.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer new-acc');
  });
});

// ---------------------------------------------------------------------------
// fromStoredTokens (static factory)
// ---------------------------------------------------------------------------
describe('fromStoredTokens', () => {
  it('returns null when loadTokens returns null', () => {
    vi.mocked(loadTokens).mockReturnValue(null);
    expect(TickTickClient.fromStoredTokens('id', 'secret')).toBeNull();
  });

  it('returns a TickTickClient when loadTokens returns valid tokens', () => {
    vi.mocked(loadTokens).mockReturnValue(freshTokens);
    const client = TickTickClient.fromStoredTokens('id', 'secret');
    expect(client).toBeInstanceOf(TickTickClient);
  });
});
