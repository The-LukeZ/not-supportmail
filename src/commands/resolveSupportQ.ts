import {
    ChannelType,
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    ThreadAutoArchiveDuration,
} from "discord.js";
import { SupportQuestion } from "../models/supportQuestion.js";
// import dayjs from "dayjs";
const { supportForumId, threadManagerRole, supportTags } = (
  await import("../../config.json", { with: { type: "json" } })
).default;

export default {
  data: new SlashCommandBuilder()
    .setName("resolve")
    .setDescription("Resolve a support question.")
    .addStringOption((op) =>
      op
        .setName("reason")
        .setDescription(
          "The reason for resolving the question | Is publicly displayed!"
        )
        .setMaxLength(128)
        .setRequired(false)
    ),
  async run(ctx: ChatInputCommandInteraction) {
    if (
      ctx.channel.isDMBased() ||
      !ctx.inCachedGuild() ||
      !(
        ctx.channel.type === ChannelType.PublicThread ||
        ctx.channel.type === ChannelType.PrivateThread
      ) ||
      ctx.channel.parentId !== supportForumId ||
      ctx.channel.parent?.type !== ChannelType.GuildForum
    )
      return await ctx.reply({
        content: "This is the wrong channel my friend.",
        flags: "Ephemeral",
      });

    const supportIssue = await SupportQuestion.findOne({
      postId: ctx.channel.id,
    });

    const hasManagerRole = ctx.member.roles.cache.has(threadManagerRole);

    if (!supportIssue) {
      return await ctx.reply({
        content: "This post is not a support question.",
        flags: "Ephemeral",
      });
    } else if (
      supportIssue.userId != ctx.user.id &&
      !hasManagerRole &&
      !ctx.member.permissions.has("ManageGuild") &&
      !ctx.member.permissions.has("Administrator")
    ) {
      return await ctx.reply({
        content: `### :x: You are not authorized.\nIt can only be resolved by the author, a staff member or voluntary helper.`,
        flags: "Ephemeral",
      });
    } else if (supportIssue.resolved) {
      return await ctx.reply({
        content: "This post has already been resolved.",
        flags: "Ephemeral",
      });
    }

    const reason = ctx.options.getString("reason") || null;

    await ctx.channel.edit({
      appliedTags: [supportTags.resolved, supportTags[supportIssue._type]],
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
    });

    await supportIssue.updateOne({
      resolved: true,
      state: "resolved",
    });

    await ctx.reply({
      content:
        `### ✅ This post has been resolved!\n-# It will be automatically archived in 24 hours.` +
        (reason ? `\n\n**Reason:** ${reason}` : ""),
    });
  },
};
