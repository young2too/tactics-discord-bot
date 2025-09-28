import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const cmdDir = path.resolve('src/commands');
const body = [];

for (const f of fs.readdirSync(cmdDir)) {
  if (f.endsWith('.js')) {
    // 여기서 pathToFileURL 로 변환해야 Windows 경로가 안 깨짐
    const fileUrl = pathToFileURL(path.join(cmdDir, f)).href;
    const m = await import(fileUrl);
    body.push(m.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

await rest.put(
  Routes.applicationGuildCommands(process.env.APP_ID, process.env.GUILD_ID),
  { body }
);

console.log('Slash commands deployed.');
