/// <reference types="bun-types" />

import type {CommandConfig} from "./types";
import {parseFrontmatter, getTemplateBody, parseParallelConfig} from "./parser";
import {log} from "./logger";

// Normalize command name - try multiple variations to find a match
export function getConfig(
  configs: Record<string, CommandConfig>,
  cmd: string
): CommandConfig | undefined {
  log(`getConfig called with cmd="${cmd}", available keys:`, Object.keys(configs));
  
  // Direct match
  if (configs[cmd]) {
    log(`getConfig: direct match found for "${cmd}"`);
    return configs[cmd];
  }
  
  // Try filename-only (last segment of path)
  const filenameOnly = cmd.split("/").pop()!;
  log(`getConfig: trying filenameOnly="${filenameOnly}"`);
  if (configs[filenameOnly]) {
    log(`getConfig: filenameOnly match found`);
    return configs[filenameOnly];
  }
  
  // Try with slashes replaced by hyphens (in case opencode flattens paths)
  const hyphenated = cmd.replace(/\//g, "-");
  log(`getConfig: trying hyphenated="${hyphenated}"`);
  if (configs[hyphenated]) {
    log(`getConfig: hyphenated match found`);
    return configs[hyphenated];
  }
  
  // Try converting hyphens back to slashes
  const slashed = cmd.replace(/-/g, "/");
  log(`getConfig: trying slashed="${slashed}"`);
  if (configs[slashed]) {
    log(`getConfig: slashed match found`);
    return configs[slashed];
  }
  
  log(`getConfig: NO MATCH FOUND for "${cmd}"`);
  return undefined;
}

export async function loadCommandFile(
  name: string
): Promise<{content: string; path: string} | null> {
  const home = Bun.env.HOME ?? "";
  const dirs = [
    `${home}/.config/opencode/command`,
    `${Bun.env.PWD ?? "."}/.opencode/command`,
  ];

  for (const dir of dirs) {
    // Try direct path first, then search subdirs
    const directPath = `${dir}/${name}.md`;
    try {
      const file = Bun.file(directPath);
      if (await file.exists()) {
        return {content: await file.text(), path: directPath};
      }
    } catch {}

    // Search subdirs for name.md
    try {
      const glob = new Bun.Glob(`**/${name}.md`);
      for await (const match of glob.scan(dir)) {
        const fullPath = `${dir}/${match}`;
        const content = await Bun.file(fullPath).text();
        return {content, path: fullPath};
      }
    } catch {}
  }
  return null;
}

export async function buildManifest(): Promise<Record<string, CommandConfig>> {
  const manifest: Record<string, CommandConfig> = {};
  const home = Bun.env.HOME ?? "";
  const dirs = [
    `${home}/.config/opencode/command`,
    `${Bun.env.PWD ?? "."}/.opencode/command`,
  ];

  log(`buildManifest: starting, dirs=${JSON.stringify(dirs)}`);

  for (const dir of dirs) {
    try {
      const glob = new Bun.Glob("**/*.md");
      for await (const file of glob.scan(dir)) {
        const name = file.replace(/\.md$/, "").split("/").pop()!;
        const pathKey = file.replace(/\.md$/, "");
        log(`buildManifest: file="${file}", name="${name}", pathKey="${pathKey}"`);
        
        const content = await Bun.file(`${dir}/${file}`).text();
        const fm = parseFrontmatter(content);
        const returnVal = fm.return;
        const returnArr = returnVal
          ? Array.isArray(returnVal)
            ? returnVal
            : [returnVal]
          : [];
        const parallelArr = parseParallelConfig(fm.parallel);

        const config: CommandConfig = {
          return: returnArr,
          parallel: parallelArr,
          agent: fm.agent as string | undefined,
          description: fm.description as string | undefined,
          template: getTemplateBody(content),
        };
        
        // Store with filename-only key
        manifest[name] = config;
        
        // Also store with full relative path (without .md) for subfolder commands
        if (pathKey !== name) {
          manifest[pathKey] = config;
          log(`buildManifest: ADDED PATH KEY "${pathKey}"`);
        }
      }
    } catch (e) {
      log(`buildManifest: error scanning ${dir}:`, e);
    }
  }
  log(`buildManifest: FINAL KEYS: ${JSON.stringify(Object.keys(manifest))}`);
  return manifest;
}
