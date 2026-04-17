/**
 * TestCase Agent SDK
 * Client SDK for calling NestJS TestCase Agent API endpoints
 */

import { fetchEventSource } from '@microsoft/fetch-event-source';

// Base URL for API calls - adjust based on environment
const API_BASE = '/api/v1/testcase-agent';

// ==================== Types ====================

export interface FeaturePoint {
  id: string;
  name: string;
  category: string;
  priority: string;
  description: string;
  selected?: boolean;
}

export interface Session {
  session_id: string;
  project_id?: string;
  created_at: string;
  last_active?: string;
  status?: string;
}

export interface SessionDetail {
  session_id: string;
  messages?: Array<{
    role: string;
    content: string;
  }>;
  feature_points?: FeaturePoint[];
  status?: string;
}

export interface GenerationResponse {
  task_id: string;
  status: string;
  total_features?: number;
}

export interface TaskStatus {
  task_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  total?: number;
  current_feature?: string;
  result?: {
    test_cases: TestCase[];
  };
  error?: string;
}

export interface TestCase {
  id: string;
  name: string;
  description: string;
  type: string;
  steps: string[];
  expected_result: string;
  feature_id: string;
}

export interface ChatEventData {
  type: 'token' | 'tool_start' | 'tool_end' | 'hitl_interrupt' | 'error' | 'end';
  content?: string;
  tool?: string;
  feature_points?: FeaturePoint[];
  message?: string;
}

type ChatCallback = (event: ChatEventData) => void;
type ErrorCallback = (error: Error) => void;
type CompleteCallback = () => void;

// ==================== Session Management ====================

/**
 * Start a new session
 */
export async function startSession(
  projectId: string | null,
  requirementContent: string
): Promise<{ session_id: string }> {
  const response = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      requirement_content: requirementContent,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to start session: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get session history
 */
export async function getSessionHistory(): Promise<Session[]> {
  const response = await fetch(`${API_BASE}/sessions`);

  if (!response.ok) {
    throw new Error(`Failed to get sessions: ${response.statusText}`);
  }

  const data = await response.json();
  return data.sessions || [];
}

/**
 * Get session detail
 */
export async function getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to get session detail: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Delete session
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete session: ${response.statusText}`);
  }
}

// ==================== Chat Stream ====================

/**
 * Send chat message with SSE streaming
 * Returns an AbortController to cancel the stream
 */
export function chat(
  sessionId: string,
  message: string,
  context: unknown | null,
  onEvent: ChatCallback,
  onError: ErrorCallback,
  onComplete: CompleteCallback
): AbortController {
  const controller = new AbortController();

  fetchEventSource(`${API_BASE}/sessions/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context }),
    signal: controller.signal,
    openWhenHidden: true,

    async onopen(response) {
      if (!response.ok) {
        throw new Error(`Chat connection failed: ${response.statusText}`);
      }
    },

    onmessage(msg) {
      try {
        const data: ChatEventData = JSON.parse(msg.data);
        onEvent(data);

        if (data.type === 'end') {
          onComplete();
        }
      } catch (e) {
        console.error('Failed to parse SSE message:', e);
      }
    },

    onclose() {
      onComplete();
    },

    onerror(err) {
      onError(err instanceof Error ? err : new Error(String(err)));
    },
  });

  return controller;
}

// ==================== HITL Resume ====================

/**
 * Resume HITL interrupt
 */
export async function resumeHitl(
  sessionId: string,
  decision: 'approve' | 'edit' | 'reject',
  modifiedFeatures?: FeaturePoint[]
): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      decision,
      modified_features: modifiedFeatures,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to resume HITL: ${response.statusText}`);
  }

  return response.json();
}

// ==================== Generation ====================

/**
 * Start test case generation
 */
export async function startGeneration(
  sessionId: string,
  featurePoints: FeaturePoint[],
  requirementContent: string,
  parallelism: number = 10
): Promise<GenerationResponse> {
  const response = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      feature_points: featurePoints,
      requirement_content: requirementContent,
      parallelism,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to start generation: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get task status
 */
export async function getTaskStatus(taskId: string): Promise<TaskStatus | null> {
  const response = await fetch(`${API_BASE}/tasks/${taskId}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to get task status: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Poll task until complete
 */
export async function pollUntilComplete(
  taskId: string,
  onUpdate: (status: TaskStatus) => void,
  pollInterval: number = 1000
): Promise<TaskStatus> {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await getTaskStatus(taskId);

        if (!status) {
          reject(new Error('Task not found'));
          return;
        }

        onUpdate(status);

        if (status.status === 'completed') {
          resolve(status);
          return;
        }

        if (status.status === 'failed') {
          reject(new Error(status.error || 'Task failed'));
          return;
        }

        // Continue polling
        setTimeout(poll, pollInterval);
      } catch (e) {
        reject(e);
      }
    };

    poll();
  });
}

// ==================== Result Actions ====================

/**
 * Save test cases to project
 */
export async function saveToProject(
  taskId: string,
  projectId: string
): Promise<{ status: string; saved_count: number }> {
  const response = await fetch(`${API_BASE}/tasks/${taskId}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to save to project: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Download test cases
 */
export async function downloadResult(
  taskId: string,
  format: string = 'excel'
): Promise<void> {
  const response = await fetch(`${API_BASE}/tasks/${taskId}/download?format=${format}`);

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }

  const data = await response.json();

  // If server returns a download URL, trigger download
  if (data.download_url) {
    const link = document.createElement('a');
    link.href = data.download_url;
    link.download = `testcases.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// ==================== Quality Reports ====================

/**
 * Get quality report
 */
export async function getQualityReport(taskId: string): Promise<unknown> {
  const response = await fetch(`${API_BASE}/tasks/${taskId}/quality-report`);

  if (!response.ok) {
    throw new Error(`Failed to get quality report: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get coverage stats
 */
export async function getCoverageStats(taskId: string): Promise<unknown> {
  const response = await fetch(`${API_BASE}/tasks/${taskId}/coverage`);

  if (!response.ok) {
    throw new Error(`Failed to get coverage stats: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get distribution stats
 */
export async function getDistributionStats(taskId: string): Promise<unknown> {
  const response = await fetch(`${API_BASE}/tasks/${taskId}/distribution`);

  if (!response.ok) {
    throw new Error(`Failed to get distribution stats: ${response.statusText}`);
  }

  return response.json();
}

// ==================== Default Export ====================

export default {
  startSession,
  getSessionHistory,
  getSessionDetail,
  deleteSession,
  chat,
  resumeHitl,
  startGeneration,
  getTaskStatus,
  pollUntilComplete,
  saveToProject,
  downloadResult,
  getQualityReport,
  getCoverageStats,
  getDistributionStats,
};
