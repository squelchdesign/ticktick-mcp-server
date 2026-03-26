export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp in ms
  token_type: string;
}

export interface TickTickProject {
  id: string;
  name: string;
  color?: string;
  sortOrder?: number;
  closed?: boolean;
  groupId?: string;
  viewMode?: string;
  permission?: string;
  kind?: string;
}

export interface TickTickChecklistItem {
  id: string;
  title: string;
  status: number; // 0 = incomplete, 1 = complete
  completedTime?: string;
  isAllDay?: boolean;
  sortOrder?: number;
  startDate?: string;
  timeZone?: string;
}

export interface TickTickTask {
  id: string;
  projectId: string;
  title: string;
  content?: string;
  desc?: string;
  isAllDay?: boolean;
  startDate?: string;
  dueDate?: string;
  timeZone?: string;
  reminders?: string[];
  repeatFlag?: string;
  priority: number; // 0=none, 1=low, 3=medium, 5=high
  status: number;   // 0=normal, 2=completed
  completedTime?: string;
  sortOrder?: number;
  items?: TickTickChecklistItem[];
  tags?: string[];
  kind?: string;
  createdTime?: string;
  modifiedTime?: string;
  etag?: string;
}

export interface TickTickProjectData {
  project: TickTickProject;
  tasks: TickTickTask[];
}

export interface CreateTaskParams {
  title: string;
  projectId?: string;
  content?: string;
  dueDate?: string;
  startDate?: string;
  priority?: number;
  isAllDay?: boolean;
  timeZone?: string;
  tags?: string[];
}

export interface UpdateTaskParams {
  taskId: string;
  projectId: string;
  title?: string;
  content?: string;
  dueDate?: string;
  startDate?: string;
  priority?: number;
  isAllDay?: boolean;
  timeZone?: string;
}

export interface GetCompletedTasksParams {
  projectIds?: string[];
  startDate?: string; // ISO 8601 datetime with UTC offset
  endDate?: string;   // ISO 8601 datetime with UTC offset
}

export const PRIORITY_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Low',
  3: 'Medium',
  5: 'High',
};
