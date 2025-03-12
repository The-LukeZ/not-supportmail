import { Message, MessageType } from "discord.js";
import config from "../../config.js";

export default async function autoPublish(message: Message) {
  if (
    message.guildId !== "1064594649668395128" ||
    message.type != MessageType.Default
  )
    return;

  const validChannel = config.autoPublishChannels.find(
    (c) => c.id === message.channelId
  );

  let isValidPing = !!validChannel;
  if (isValidPing) {
    if (typeof validChannel.pings != "undefined") {
      isValidPing = validChannel.pings.some((ping) =>
          ping.type == 1
            ? message.mentions.users.has(ping.id))
            : message.mentions.roles.has(ping.id))
      );
    }
  }

  if (validChannel && isValidPing) {
    try {
      await message.crosspost();
    } catch (error) {
      console.error("Message crosst failed:", error);
    }
  }
}
