import type {Plugin} from "@opencode-ai/plugin";
import type {
  CommandConfig,
  Subtask2Config,
  ParallelCommand,
  SubtaskPart,
} from "./src/types";
import {loadConfig, DEFAULT_PROMPT} from "./src/config";
import {
  parseFrontmatter,
  getTemplateBody,
  parseParallelConfig,
} from "./src/parser";
import {loadCommandFile, buildManifest, getConfig} from "./src/commands";
import {log, clearLog} from "./src/logger";

// Session state
let configs: Record<string, CommandConfig> = {};
let pluginConfig: Subtask2Config = {replace_generic: true};
let client: any = null;
const callState = new Map<string, string>();
const returnState = new Map<string, string[]>();
const pendingReturns = new Map<string, string>();
const pendingNonSubtaskReturns = new Map<string, string[]>();
const pipedArgsQueue = new Map<string, string[]>();
const returnArgsState = pipedArgsQueue; // alias for backward compat
const sessionMainCommand = new Map<string, string>();
const executedReturns = new Set<string>();
let hasActiveSubtask = false;

const OPENCODE_GENERIC =
  "Summarize the task tool output above and continue with your task.";

async function flattenParallels(
  parallels: ParallelCommand[],
  mainArgs: string,
  sessionID: string,
  visited: Set<string> = new Set(),
  depth: number = 0,
  maxDepth: number = 5
): Promise<SubtaskPart[]> {
  if (depth > maxDepth) return [];

  const queue = pipedArgsQueue.get(sessionID) ?? [];
  log(`flattenParallels called:`, {
    depth,
    parallels: parallels.map(
      (p) => `${p.command}${p.arguments ? ` (args: ${p.arguments})` : ""}`
    ),
    mainArgs,
    queueRemaining: [...queue],
  });

  const parts: SubtaskPart[] = [];

  for (let i = 0; i < parallels.length; i++) {
    const parallelCmd = parallels[i];
    if (visited.has(parallelCmd.command)) continue;
    visited.add(parallelCmd.command);

    const cmdFile = await loadCommandFile(parallelCmd.command);
    if (!cmdFile) continue;

    const fm = parseFrontmatter(cmdFile.content);
    let template = getTemplateBody(cmdFile.content);

    // Priority: piped arg (from queue) > frontmatter args > main args
    const pipeArg = queue.shift();
    const args = pipeArg ?? parallelCmd.arguments ?? mainArgs;
    log(
      `Parallel ${parallelCmd.command}: using args="${args}" (pipeArg=${pipeArg}, fmArg=${parallelCmd.arguments}, mainArgs=${mainArgs})`
    );
    template = template.replace(/\$ARGUMENTS/g, args);

    // Parse model string "provider/model" into {providerID, modelID}
    let model: {providerID: string; modelID: string} | undefined;
    if (typeof fm.model === "string" && fm.model.includes("/")) {
      const [providerID, ...rest] = fm.model.split("/");
      model = {providerID, modelID: rest.join("/")};
    }

    parts.push({
      type: "subtask" as const,
      agent: (fm.agent as string) || "general",
      model,
      description:
        (fm.description as string) || `Parallel: ${parallelCmd.command}`,
      command: parallelCmd.command,
      prompt: template,
    });

    // Recursively flatten nested parallels
    const nestedParallel = fm.parallel;
    if (nestedParallel) {
      const nestedArr = parseParallelConfig(nestedParallel);

      if (nestedArr.length) {
        const nestedParts = await flattenParallels(
          nestedArr,
          args,
          sessionID,
          visited,
          depth + 1,
          maxDepth
        );
        parts.push(...nestedParts);
      }
    }
  }

  return parts;
}

const plugin: Plugin = async (ctx) => {
  clearLog();
  configs = await buildManifest();
  pluginConfig = await loadConfig();
  client = ctx.client;
  
  const allKeys = Object.keys(configs);
  const uniqueCmds = allKeys.filter(k => !k.includes('/'));
  log(`Plugin initialized: ${uniqueCmds.length} commands`, uniqueCmds);

  // Helper to execute a return item (command or prompt)
  async function executeReturn(item: string, sessionID: string) {
    // Dedup check to prevent double execution
    const key = `${sessionID}:${item}`;
    if (executedReturns.has(key)) return;
    executedReturns.add(key);

    if (item.startsWith("/")) {
      const [cmdName, ...argParts] = item.slice(1).split(/\s+/);
      let args = argParts.join(" ");

      // Find the path key for this command (OpenCode needs full path for subfolder commands)
      const allKeys = Object.keys(configs);
      const pathKey = allKeys.find(k => k.includes('/') && k.endsWith('/' + cmdName)) || cmdName;

      // Check if we have piped args for this return command
      const returnArgs = returnArgsState.get(sessionID);
      if (returnArgs?.length) {
        const pipeArg = returnArgs.shift();
        if (!returnArgs.length) returnArgsState.delete(sessionID);
        if (pipeArg) args = pipeArg;
      }

      log(`executeReturn: /${cmdName} -> ${pathKey} args="${args}"`, 
        getConfig(configs, cmdName) ? {
          return: getConfig(configs, cmdName)!.return,
          parallel: getConfig(configs, cmdName)!.parallel.map(p => p.command)
        } : undefined);
      sessionMainCommand.set(sessionID, pathKey);

      try {
        await client.session.command({
          path: {id: sessionID},
          body: {command: pathKey, arguments: args || ""},
        });
      } catch (e) {
        log(`executeReturn FAILED: ${pathKey}`, e);
      }
    } else {
      log(`executeReturn: prompt "${item.substring(0, 40)}..."`);
      await client.session.promptAsync({
        path: {id: sessionID},
        body: {parts: [{type: "text", text: item}]},
      });
    }
  }

  return {
    "command.execute.before": async (
      input: {command: string; sessionID: string; arguments: string},
      output: {parts: any[]}
    ) => {
      const cmd = input.command;
      const config = getConfig(configs, cmd);
      sessionMainCommand.set(input.sessionID, cmd);
      log(`cmd.before: ${cmd}`, config ? {
        return: config.return,
        parallel: config.parallel.map(p => p.command),
        agent: config.agent
      } : "no config");

      // Parse pipe-separated arguments: main || arg1 || arg2 || arg3 ...
      const argSegments = input.arguments.split("||").map((s) => s.trim());
      const mainArgs = argSegments[0] || "";
      const allPipedArgs = argSegments.slice(1);

      // Store piped args for consumption by parallels and return commands
      if (allPipedArgs.length) {
        pipedArgsQueue.set(input.sessionID, allPipedArgs);
      }

      // Fix main command's parts to use only mainArgs (not the full pipe string)
      if (argSegments.length > 1) {
        for (const part of output.parts) {
          if (part.type === "subtask" && part.prompt) {
            part.prompt = part.prompt.replaceAll(input.arguments, mainArgs);
          }
          if (part.type === "text" && part.text) {
            part.text = part.text.replaceAll(input.arguments, mainArgs);
          }
        }
      }

      // Track non-subtask commands with return for later injection
      const hasSubtaskPart = output.parts.some(
        (p: any) => p.type === "subtask"
      );
      if (!hasSubtaskPart && config?.return?.length) {
        pendingNonSubtaskReturns.set(input.sessionID, [...config.return]);
      }

      if (!config?.parallel?.length) return;

      // Recursively flatten all nested parallels
      const parallelParts = await flattenParallels(
        config.parallel,
        mainArgs,
        input.sessionID
      );
      output.parts.push(...parallelParts);
    },

    "tool.execute.before": async (input, output) => {
      if (input.tool !== "task") return;
      hasActiveSubtask = true;
      const cmd = output.args?.command;
      const prompt = output.args?.prompt;
      let mainCmd = sessionMainCommand.get(input.sessionID);
      
      // If mainCmd is not set (command.execute.before didn't fire - no PR), 
      // set the first subtask command as the main command
      if (!mainCmd && cmd && getConfig(configs, cmd)) {
        sessionMainCommand.set(input.sessionID, cmd);
        mainCmd = cmd;
        const cmdConfig = getConfig(configs, cmd)!;
        
        // Parse piped args from prompt if present (fallback for non-PR)
        if (prompt && prompt.includes("||")) {
          const pipeMatch = prompt.match(/\|\|(.+)/);
          if (pipeMatch) {
            const pipedPart = pipeMatch[1];
            const pipedArgs = pipedPart.split("||").map((s: string) => s.trim()).filter(Boolean);
            if (pipedArgs.length) {
              pipedArgsQueue.set(input.sessionID, pipedArgs);
              output.args.prompt = prompt.replace(/\s*\|\|.+$/, "").trim();
            }
          }
        }
        
        // Also set up return state since command.execute.before didn't run
        if (cmdConfig.return.length > 1) {
          returnState.set(input.sessionID, [...cmdConfig.return.slice(1)]);
        }
      }
      
      if (cmd && getConfig(configs, cmd)) {
        const cmdConfig = getConfig(configs, cmd)!;
        if (cmd === mainCmd) {
          pendingNonSubtaskReturns.delete(input.sessionID);
        }

        callState.set(input.callID, cmd);

        if (cmd === mainCmd && cmdConfig.return.length > 1) {
          returnState.set(input.sessionID, [...cmdConfig.return.slice(1)]);
        }
      }
    },

    "tool.execute.after": async (input, output) => {
      if (input.tool !== "task") return;
      const cmd = callState.get(input.callID);
      callState.delete(input.callID);

      const mainCmd = sessionMainCommand.get(input.sessionID);
      const cmdConfig = cmd ? getConfig(configs, cmd) : undefined;

      if (cmd && cmd === mainCmd && cmdConfig?.return?.length) {
        log(`Setting pendingReturn: ${cmdConfig.return[0].substring(0, 50)}...`);
        pendingReturns.set(input.sessionID, cmdConfig.return[0]);
      } else if (cmd && cmd !== mainCmd) {
        log(`task.after: ${cmd} (parallel of ${mainCmd})`);
      }
    },

    "experimental.chat.messages.transform": async (input, output) => {
      // Find the LAST message with OPENCODE_GENERIC
      let lastGenericPart: any = null;

      for (const msg of output.messages) {
        for (const part of msg.parts) {
          if (part.type === "text" && part.text === OPENCODE_GENERIC) {
            lastGenericPart = part;
          }
        }
      }

      if (lastGenericPart) {
        // Check for pending return
        for (const [sessionID, returnPrompt] of pendingReturns) {
          if (returnPrompt.startsWith("/")) {
            lastGenericPart.text = "";
            executeReturn(returnPrompt, sessionID).catch(console.error);
          } else {
            lastGenericPart.text = returnPrompt;
          }
          pendingReturns.delete(sessionID);
          hasActiveSubtask = false;
          return;
        }

        // No pending return found, use generic replacement if configured
        if (hasActiveSubtask && pluginConfig.replace_generic) {
          log(`Using default generic replacement`);
          lastGenericPart.text = pluginConfig.generic_return ?? DEFAULT_PROMPT;
          hasActiveSubtask = false;
          return;
        }
      }
    },

    "experimental.text.complete": async (input) => {
      // Handle non-subtask command returns
      const pendingReturn = pendingNonSubtaskReturns.get(input.sessionID);
      if (pendingReturn?.length && client) {
        const next = pendingReturn.shift()!;
        if (!pendingReturn.length) pendingNonSubtaskReturns.delete(input.sessionID);
        executeReturn(next, input.sessionID).catch(console.error);
        return;
      }

      // Handle remaining returns
      const remaining = returnState.get(input.sessionID);
      if (!remaining?.length || !client) return;
      
      const next = remaining.shift()!;
      if (!remaining.length) returnState.delete(input.sessionID);
      executeReturn(next, input.sessionID).catch(console.error);
    },
  };
};

export default plugin;
