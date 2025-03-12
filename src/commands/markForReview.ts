import {
  ChannelType,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ThreadAutoArchiveDuration,
} from "discord.js";
import { SupportPost } from "../models/supportPost.js";
import config from "../config.js";

export default {
  data: new SlashCommandBuilder()
    .setName("mark-for-review")
    .setDescription("Mark a post for review by a developer."),

  async run(ctx: ChatInputCommandInteraction) {
    if (
      ctx.channel.isDMBased() ||
      ctx.channel.type !== ChannelType.PublicThread ||
      ctx.channel.parentId !== process.env.CHANNEL_SUPPORT_FORUM
    )
      return await ctx.reply({
        content: "This is the wrong channel my friend.",
        flags: 64,
      });

    if (!ctx.inCachedGuild()) await ctx.guild.fetch();

    const supportPost = await SupportPost.findOne({
      postId: ctx.channel.id,
    });

    if (!supportPost) {
      return await ctx.reply({
        content: "This post is not a support post.",
        flags: 64,
      });
    } else if (!supportPost.closedAt) {
      return await ctx.reply({
        content: "This post has not been resolved yet.",
        flags: 64,
      });
    }

    const canMarkRolewise = ctx.member.roles.cache.hasAny(
      process.env.ROLE_DEVELOPER,
      process.env.ROLE_THREAD_MANAGER
    );
    const canMarkPermissionwise = ctx.member.permissions.has("ManageGuild");

    if (!canMark && !canMarkPermissionwise) {
      return await ctx.reply({
        content:
          "### :x: You are not authorized.\nIt can only be resolved by the author, a staff member or voluntary helper.",
        flags: 64,
      });
    }

    await supportPost.updateOne({
      remindedAt: null,
      ignoreFlags: {
        reminder: true,
        close: true,
      },
      flags: {
        noArchive: true,
      },
    });

    await ctx.channel.edit({
      appliedTags: [config.tags.review],
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    });

    await ctx.reply({
      content:
        "### ✅ Post Marked for Review\n" +
        ">>> This post has been marked for review by a developer. Please be patient while we review your issue.\n" +
        "Make sure to keep an eye on this post for any updates!",
    });
  },
};
