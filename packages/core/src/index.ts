export type Capability =
  "text" | "coding" | "browser" | "computer" | "delegate";
export interface ExecutionOptions {
  workspace?: string;
  model?: string;
  resumeTaskId?: string;
  sessionId?: string;
}
export interface RuntimeInput {
  instructions: string;
  memory: string;
  prompt: string;
  workspace?: string;
  model?: string;
  resumeSessionId?: string;
  onSession?: (id: string) => void;
  onProgress?: (text: string) => void;
}
export interface RuntimeInfo {
  id: string;
  name: string;
  ownerId: string;
  available: boolean;
  capabilities: Capability[];
  billing: "subscription" | "api" | "local";
  description: string;
}
export interface Agent {
  id: string;
  name: string;
  role: string;
  instructions: string;
  memory: string;
  color: string;
}
export interface Task {
  execution?: ExecutionOptions;
  id: string;
  agentId: string;
  prompt: string;
  runtimeId: string;
  status:
    | "awaiting_approval"
    | "awaiting_native"
    | "running"
    | "stopping"
    | "cancelled"
    | "completed"
    | "failed"
    | "rejected"
    | "interrupted";
  output: string;
  createdAt: string;
  updatedAt: string;
}
export interface AgentRuntime {
  info: RuntimeInfo;
  execute(input: RuntimeInput, signal: AbortSignal): Promise<string>;
}
export function route(
  runtimes: RuntimeInfo[],
  ownerId: string,
  id: string,
  required: Capability[],
): RuntimeInfo {
  const found = runtimes.find(
    (r) =>
      r.id === id &&
      r.ownerId === ownerId &&
      r.available &&
      required.every((c) => r.capabilities.includes(c)),
  );
  if (!found)
    throw new Error(
      "Selected runtime is unavailable or does not support this task.",
    );
  return found;
}
