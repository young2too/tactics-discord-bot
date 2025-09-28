import { Client, GatewayIntentBits, Collection } from "discord.js";
import { config } from "dotenv";
import fs from "fs";
import path from "path";
import url from "url";
import { handleSkillSelect, handleSkillArgs } from "./handlers/skillHandler.js";

config();
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");
for (const file of fs.readdirSync(commandsPath)) {
  if (file.endsWith(".js")) {
    const filePath = path.join(commandsPath, file);
    const fileUrl = url.pathToFileURL(filePath).href;
    const command = await import(fileUrl);
    client.commands.set(command.data.name, command);
  }
}

client.once("ready", () => {
  console.log(`✅ 로그인됨: ${client.user.tag}`);
});


client.on("interactionCreate", async interaction => {
  // 스킬 선택 (드롭다운)
  // 스킬 드롭다운 1차
    if (interaction.isStringSelectMenu() && interaction.customId === "skill_select") {
      return handleSkillSelect(interaction);
    }

    // 스킬 인자 드롭다운 (target / role 등)
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("skill|")) {
      return handleSkillArgs(interaction);
    }

  //버튼 인터렉션
  if (interaction.isButton()) {
    if (interaction.customId === "status_self") {
      const manaCmd = client.commands.get("mana");
      if (!manaCmd) {
        return interaction.reply({ content: "⚠️ /mana 명령어를 찾을 수 없습니다.", ephemeral: true });
      }
      return manaCmd.execute(interaction); // 누른 사람 본인 상태창 표시
    }
  }

  // 🔹 Autocomplete 처리
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        console.error(`❌ ${interaction.commandName} autocomplete 오류:`, err);
      }
    }
    return;
  }

  // 🔹 일반 ChatInputCommand 처리
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`❌ ${interaction.commandName} 실행 오류:`, err);
    const reply = { content: "⚠️ 처리 중 오류 발생", ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

client.login(process.env.TOKEN);
