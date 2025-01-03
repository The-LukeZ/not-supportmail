import dayjs from "dayjs";
import {
  APIApplicationCommand,
  REST,
  Routes,
  ThreadEditOptions,
} from "discord.js";
import schedule from "node-schedule";
import { SupportQuestion } from "../models/supportQuestion.js";
import config from "../config.js";

const reminders = [
  (u: string) =>
    `### Hi <@${u}>!\n> Your last message is about 24 hours old.\n> Let us know if there's anything else we can do. If we don't hear back from you, this post will automatically be archived. Reach out if you still need help.`,
  (u: string) =>
    `### Hey <@${u}>!\n> It's been a day since your last message.\n> We'll close this post in 24 hours if we don't hear back from you. Let us know if you need more help.`,
  (u: string) =>
    `### Gday <@${u}>!\n> It's been a day since your last message.\n> This post will be automatically archived in 24 hours if we don't hear from you. Let us know if you need further assistance.`,
  (u: string) =>
    `### Hi again <@${u}>!\n> Just checking in on your support request.\n> We're here to help if you have any more questions if your issue isn't resolved.`,
];

const closeWithCommandText = (commands: APIApplicationCommand[]) =>
  `If your question was answered, please resolve it with the command </resolve:${
    commands.find((cmd) => cmd.name == "resolve").id
  }>.`;

class ClosePostsScheduler {
  public static async start() {
    schedule.scheduleJob("0 * * * *", this.execute);
  }

  // random because of ratelimits
  private static getRandomReminderMessage() {
    return reminders[~~(Math.random() * reminders.length)];
  }

  public static async execute() {
    const nowTs = dayjs();

    const toRemind = await SupportQuestion.find({
      $and: [{ closedAt: { $ne: null } }, { resolved: false }],
      lastActivity: { $gte: nowTs.subtract(1, "days").toDate() },
      "flags.reminded": { $ne: true },
      $or: [
        { "flags.noAutoClose": { $exists: false } },
        { "flags.noAutoClose": false },
      ],
    });

    const toArchive = await SupportQuestion.find({
      $and: [{ closedAt: { $ne: null } }, { resolved: false }],
      lastActivity: { $gte: nowTs.subtract(2, "days").toDate() },
      "flags.reminded": true,
      $or: [
        { "flags.noAutoClose": { $exists: false } },
        { "flags.noAutoClose": false },
      ],
    });

    const rest = new REST({ version: "10" }).setToken(config.botToken);
    const appCommands = (await rest.get(
      Routes.applicationCommands("1097562026575933604")
    )) as APIApplicationCommand[];
    const closeWithCommand = "\n-# " + closeWithCommandText(appCommands);

    for (const post of toRemind) {
      await rest.post(Routes.channelMessages(post.postId), {
        body: {
          content:
            this.getRandomReminderMessage()(post.userId) + closeWithCommand,
          allowed_mentions: { users: [post.userId] },
        },
      });
    }

    await SupportQuestion.updateMany(
      { _id: { $in: toRemind.map((p) => p._id) } },
      { "flags.reminded": true }
    );

    for (const post of toArchive) {
      await rest.patch(Routes.channel(post.postId), {
        body: {
          archived: true,
        } as ThreadEditOptions,
        reason: "Inactive",
      });
    }

    await SupportQuestion.updateMany(
      { _id: { $in: toArchive.map((p) => p._id) } },
      { closedAt: dayjs().toDate(), resolved: true }
    );
  }
}

export default ClosePostsScheduler;
