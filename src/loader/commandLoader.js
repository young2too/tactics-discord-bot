import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadCommands() {
  const commands = new Map();
  const dir = path.resolve('src/commands');
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.js')) continue;
    const fileUrl = pathToFileURL(path.join(dir, file)).href;
    const mod = await import(fileUrl);
    commands.set(mod.data.name, mod);
  }
  return commands;
}
