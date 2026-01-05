import type { CommandConfig, Subtask2Config } from "../types";
import type { LoopState } from "../loop";

/**
 * Centralized session state management for subtask2 plugin
 * All plugin state is managed through this module
 */

// Command configurations loaded from manifest
let configs: Record<string, CommandConfig> = {};

// Plugin user configuration
let pluginConfig: Subtask2Config = { replace_generic: true };

// OpenCode client instance
let client: any = null;

// Session state maps
const callState = new Map<string, string>();
const returnState = new Map<string, string[]>();
const pendingReturns = new Map<string, string>();
const pendingNonSubtaskReturns = new Map<string, string[]>();
const pipedArgsQueue = new Map<string, string[]>();
const returnArgsState = pipedArgsQueue; // alias for backward compat
const sessionMainCommand = new Map<string, string>();
const processedS2Messages = new Set<string>();
const executedReturns = new Set<string>();
const firstReturnPrompt = new Map<string, string>();
const subtaskParentSession = new Map<string, string>();
const pendingModelOverride = new Map<string, string>();
const lastReturnWasCommand = new Map<string, boolean>();

// Pending parent session for $TURN resolution (simple variable)
let pendingParentSession: string | null = null;
let hasActiveSubtask = false;

// Constants
export const OPENCODE_GENERIC =
  "Summarize the task tool output above and continue with your task.";

// ============================================================================
// Configs
// ============================================================================

export function getConfigs(): Record<string, CommandConfig> {
  return configs;
}

export function setConfigs(newConfigs: Record<string, CommandConfig>): void {
  configs = newConfigs;
}

export function getPluginConfig(): Subtask2Config {
  return pluginConfig;
}

export function setPluginConfig(newConfig: Subtask2Config): void {
  pluginConfig = newConfig;
}

// ============================================================================
// Client
// ============================================================================

export function getClient(): any {
  return client;
}

export function setClient(newClient: any): void {
  client = newClient;
}

// ============================================================================
// Call State
// ============================================================================

export function getCallState(callID: string): string | undefined {
  return callState.get(callID);
}

export function setCallState(callID: string, cmd: string): void {
  callState.set(callID, cmd);
}

export function deleteCallState(callID: string): void {
  callState.delete(callID);
}

// ============================================================================
// Return State
// ============================================================================

export function getReturnState(sessionID: string): string[] | undefined {
  return returnState.get(sessionID);
}

export function setReturnState(sessionID: string, returns: string[]): void {
  returnState.set(sessionID, returns);
}

export function hasReturnState(sessionID: string): boolean {
  return returnState.has(sessionID);
}

export function deleteReturnState(sessionID: string): void {
  returnState.delete(sessionID);
}

// ============================================================================
// Pending Returns
// ============================================================================

export function getPendingReturn(sessionID: string): string | undefined {
  return pendingReturns.get(sessionID);
}

export function setPendingReturn(sessionID: string, returnPrompt: string): void {
  pendingReturns.set(sessionID, returnPrompt);
}

export function hasPendingReturn(sessionID: string): boolean {
  return pendingReturns.has(sessionID);
}

export function deletePendingReturn(sessionID: string): void {
  pendingReturns.delete(sessionID);
}

export function getAllPendingReturns(): IterableIterator<[string, string]> {
  return pendingReturns.entries();
}

// ============================================================================
// Pending Non-Subtask Returns
// ============================================================================

export function getPendingNonSubtaskReturns(sessionID: string): string[] | undefined {
  return pendingNonSubtaskReturns.get(sessionID);
}

export function setPendingNonSubtaskReturns(sessionID: string, returns: string[]): void {
  pendingNonSubtaskReturns.set(sessionID, returns);
}

export function deletePendingNonSubtaskReturns(sessionID: string): void {
  pendingNonSubtaskReturns.delete(sessionID);
}

// ============================================================================
// Piped Args Queue
// ============================================================================

export function getPipedArgsQueue(sessionID: string): string[] | undefined {
  return pipedArgsQueue.get(sessionID);
}

export function setPipedArgsQueue(sessionID: string, args: string[]): void {
  pipedArgsQueue.set(sessionID, args);
}

export function deletePipedArgsQueue(sessionID: string): void {
  pipedArgsQueue.delete(sessionID);
}

export function getReturnArgsState(sessionID: string): string[] | undefined {
  return returnArgsState.get(sessionID);
}

export function deleteReturnArgsState(sessionID: string): void {
  returnArgsState.delete(sessionID);
}

// ============================================================================
// Session Main Command
// ============================================================================

export function getSessionMainCommand(sessionID: string): string | undefined {
  return sessionMainCommand.get(sessionID);
}

export function setSessionMainCommand(sessionID: string, cmd: string): void {
  sessionMainCommand.set(sessionID, cmd);
}

// ============================================================================
// Processed S2 Messages
// ============================================================================

export function hasProcessedS2Message(msgId: string): boolean {
  return processedS2Messages.has(msgId);
}

export function addProcessedS2Message(msgId: string): void {
  processedS2Messages.add(msgId);
}

// ============================================================================
// Executed Returns
// ============================================================================

export function hasExecutedReturn(key: string): boolean {
  return executedReturns.has(key);
}

export function addExecutedReturn(key: string): void {
  executedReturns.add(key);
}

export function deleteExecutedReturn(key: string): void {
  executedReturns.delete(key);
}

// ============================================================================
// First Return Prompt
// ============================================================================

export function getFirstReturnPrompt(sessionID: string): string | undefined {
  return firstReturnPrompt.get(sessionID);
}

export function setFirstReturnPrompt(sessionID: string, prompt: string): void {
  firstReturnPrompt.set(sessionID, prompt);
}

// ============================================================================
// Subtask Parent Session
// ============================================================================

export function getSubtaskParentSession(sessionID: string): string | undefined {
  return subtaskParentSession.get(sessionID);
}

export function setSubtaskParentSession(sessionID: string, parentID: string): void {
  subtaskParentSession.set(sessionID, parentID);
}

export function deleteSubtaskParentSession(sessionID: string): void {
  subtaskParentSession.delete(sessionID);
}

// ============================================================================
// Pending Model Override
// ============================================================================

export function getPendingModelOverride(sessionID: string): string | undefined {
  return pendingModelOverride.get(sessionID);
}

export function setPendingModelOverride(sessionID: string, model: string): void {
  pendingModelOverride.set(sessionID, model);
}

export function deletePendingModelOverride(sessionID: string): void {
  pendingModelOverride.delete(sessionID);
}

// ============================================================================
// Last Return Was Command
// ============================================================================

export function getLastReturnWasCommand(sessionID: string): boolean | undefined {
  return lastReturnWasCommand.get(sessionID);
}

export function setLastReturnWasCommand(sessionID: string, value: boolean): void {
  lastReturnWasCommand.set(sessionID, value);
}

export function hasLastReturnWasCommand(sessionID: string): boolean {
  return lastReturnWasCommand.has(sessionID);
}

export function deleteLastReturnWasCommand(sessionID: string): void {
  lastReturnWasCommand.delete(sessionID);
}

// ============================================================================
// Pending Parent Session
// ============================================================================

export function getPendingParentSession(): string | null {
  return pendingParentSession;
}

export function setPendingParentSession(sessionID: string | null): void {
  pendingParentSession = sessionID;
}

// ============================================================================
// Has Active Subtask
// ============================================================================

export function getHasActiveSubtask(): boolean {
  return hasActiveSubtask;
}

export function setHasActiveSubtask(value: boolean): void {
  hasActiveSubtask = value;
}
