import NextAuth from "next-auth";
import authConfig from "./auth.config";

// Re-export config for backwards compatibility
export default authConfig;

// Full auth with adapter - only used in Node.js runtime (API routes)
export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const { MongoDBAdapter } = await import("@auth/mongodb-adapter");
  const clientPromise = (await import("./db/mongodb-client")).default;

  return {
    ...authConfig,
    adapter: MongoDBAdapter(clientPromise),
    events: {
      // Create a free subscription when a new user signs up
      async createUser({ user }) {
        if (user.id) {
          const { getOrCreateSubscription } = await import("@/lib/subscription");
          await getOrCreateSubscription(user.id);
        }
      },
    },
  };
});
