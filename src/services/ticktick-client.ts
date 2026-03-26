import axios, { type AxiosInstance } from 'axios';
import { loadTokens, saveTokens } from './token-store.js';
import type {
  TokenData,
  TickTickProject,
  TickTickTask,
  TickTickProjectData,
  CreateTaskParams,
  UpdateTaskParams,
} from '../types.js';

const API_BASE = 'https://api.ticktick.com/open/v1';
const TOKEN_URL = 'https://ticktick.com/oauth/token';

export class TickTickClient {
  private http: AxiosInstance;
  private tokens: TokenData;
  private clientId: string;
  private clientSecret: string;

  constructor(tokens: TokenData, clientId: string, clientSecret: string) {
    this.tokens = tokens;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.http = axios.create({ baseURL: API_BASE });
  }

  // ---------- Auth ----------

  private isTokenExpired(): boolean {
    // Refresh 60 seconds early to avoid edge cases
    return Date.now() > this.tokens.expires_at - 60_000;
  }

  private async refreshIfNeeded(): Promise<void> {
    if (!this.isTokenExpired()) return;

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.tokens.refresh_token,
    });

    const response = await axios.post<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
    }>(TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      auth: { username: this.clientId, password: this.clientSecret },
    });

    this.tokens = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_at: Date.now() + response.data.expires_in * 1000,
      token_type: response.data.token_type,
    };

    saveTokens(this.tokens);
  }

  private async authHeaders(): Promise<Record<string, string>> {
    await this.refreshIfNeeded();
    return { Authorization: `Bearer ${this.tokens.access_token}` };
  }

  // ---------- Projects ----------

  async getProjects(): Promise<TickTickProject[]> {
    const headers = await this.authHeaders();
    const response = await this.http.get<TickTickProject[]>('/project', { headers });
    return response.data;
  }

  async getProjectData(projectId: string): Promise<TickTickProjectData> {
    const headers = await this.authHeaders();
    const response = await this.http.get<TickTickProjectData>(
      `/project/${projectId}/data`,
      { headers }
    );
    return response.data;
  }

  // ---------- Tasks ----------

  async getAllTasks(): Promise<TickTickTask[]> {
    const projects = await this.getProjects();
    const taskLists = await Promise.all([
      // Fetch inbox tasks separately — the Inbox is not returned by GET /project
      // but is accessible via the special project ID "inbox"
      this.getProjectData('inbox').then(d => d.tasks).catch(() => []),
      ...projects.map(p => this.getProjectData(p.id).then(d => d.tasks).catch(() => [])),
    ]);
    return taskLists.flat();
  }

  async getTask(projectId: string, taskId: string): Promise<TickTickTask> {
    const headers = await this.authHeaders();
    const response = await this.http.get<TickTickTask>(
      `/project/${projectId}/task/${taskId}`,
      { headers }
    );
    return response.data;
  }

  async createTask(params: CreateTaskParams): Promise<TickTickTask> {
    const headers = await this.authHeaders();
    const response = await this.http.post<TickTickTask>('/task', params, { headers });
    return response.data;
  }

  async updateTask(params: UpdateTaskParams): Promise<TickTickTask> {
    const headers = await this.authHeaders();
    const { taskId, ...body } = params;
    const response = await this.http.post<TickTickTask>(`/task/${taskId}`, body, { headers });
    return response.data;
  }

  async completeTask(projectId: string, taskId: string): Promise<void> {
    const headers = await this.authHeaders();
    await this.http.post(
      `/project/${projectId}/task/${taskId}/complete`,
      {},
      { headers }
    );
  }

  async deleteTask(projectId: string, taskId: string): Promise<void> {
    const headers = await this.authHeaders();
    await this.http.delete(`/project/${projectId}/task/${taskId}`, { headers });
  }

  // ---------- Factory ----------

  static fromStoredTokens(clientId: string, clientSecret: string): TickTickClient | null {
    const tokens = loadTokens();
    if (!tokens) return null;
    return new TickTickClient(tokens, clientId, clientSecret);
  }
}
