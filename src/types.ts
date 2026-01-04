export interface LoopConfig {
  max: number; // Max iterations
  until: string; // Completion condition
}

export interface ParallelCommand {
  command: string;
  arguments?: string;
  model?: string; // Override model: "provider/model-id"
  loop?: LoopConfig; // Retry until completion
}

export interface CommandConfig {
  return: string[];
  parallel: ParallelCommand[];
  agent?: string;
  description?: string;
  template?: string;
  loop?: LoopConfig; // Retry this command until completion
}

export interface Subtask2Config {
  replace_generic: boolean;
  generic_return?: string;
}

export interface SubtaskPart {
  type: "subtask";
  agent: string;
  model?: { providerID: string; modelID: string };
  description: string;
  command: string;
  prompt: string;
}
