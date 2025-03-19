import { REST, Routes } from "discord.js";
import { MongoClient } from "mongodb";
import type { IBotVote } from "supportmail-types";
import * as Sentry from "sentry";

const client = new MongoClient(process.env.MONGO_URI_MAIN!);
const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN!);
Sentry.init({
  dsn: process.env.SENTRY_DSN!,
});

async function syncVotes() {
  try {
    await client.connect();
    const db = client.db();
    const botVoteCollection = db.collection<IBotVote>("botVotes");
    
    // Use projection to only get the fields we need
    const votesToRemove = await botVoteCollection
      .find({
        $and: [
          { hasRole: true },
          { removeRoleBy: { $exists: true } },
          { removeRoleBy: { $lte: new Date() } },
        ],
      })
      .project({ userId: 1 })  // Only retrieve the userId field
      .sort({ removeRoleBy: 1 })
      .toArray();

    if (votesToRemove.length === 0) {
      console.log("No votes to remove");
      return;
    }

    // More efficient deduplication with Set
    const uniqueUserIds = [...new Set(votesToRemove.map(vote => vote.userId))];
    
    if (uniqueUserIds.length === 0) {
      console.log("No unique users to process");
      return;
    }

    console.log(`Processing ${uniqueUserIds.length} unique users`);

    // Process in batches to avoid memory overload
    const batchSize = 20;
    for (let i = 0; i < uniqueUserIds.length; i += batchSize) {
      const batch = uniqueUserIds.slice(i, i + batchSize);
      
      // Process batch in parallel with timeout
      await Promise.all(batch.map(userId => 
        rest.delete(
          Routes.guildMemberRole(
            process.env.GUILD_ID!,
            userId,
            process.env.ROLE_VOTER!
          )
        ).catch(error => 
          console.error(`Failed to remove role for user ${userId}:`, error.message);
        )
      ));
      
      // Delete processed batch from database
      await botVoteCollection.deleteMany({ userId: { $in: batch } });
      console.log(`Processed batch ${i / batchSize + 1}/${Math.ceil(uniqueUserIds.length / batchSize)}`);
    }

    console.log("Vote sync completed successfully");
  } catch (error) {
    Sentry.captureException(error);
    console.error("Error in syncVotes:", error);
  } finally {
    // Always close the connection, even if an error occurs
    await client.close();
    console.log("MongoDB connection closed");
  }
}

// Main execution
(async () => {
  try {
    console.log("Starting vote sync process");
    await syncVotes();
    console.log("Vote sync process completed");
  } catch (error) {
    Sentry.captureException(error);
    console.error("Uncaught error in main process:", error);
    process.exit(1);
  }
})();
