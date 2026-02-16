import NextAuth from "next-auth";
import authConfig from "./auth.config";

// Re-export config for backwards compatibility
export default authConfig;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      if (user.id) {
        const { getOrCreateCredits } = await import("@/lib/credits");
        await getOrCreateCredits(user.id);
      }
      return true;
    },
  },
});
