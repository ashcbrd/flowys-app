import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import authConfig from "./auth.config";
import { connectToDatabase } from "./db";
import { User } from "./db/models/User";
import { verifyPassword } from "./password";

// Re-export config for backwards compatibility
export default authConfig;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // The Credentials provider is defined here (not in the edge config) because
  // authorize() reads the database and runs scrypt — both Node-only.
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email || "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password || "");

        if (!email || !password) {
          return null;
        }

        await connectToDatabase();
        const user = await User.findOne({ email });
        if (!user) {
          return null;
        }

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) {
          return null;
        }

        return {
          id: user._id,
          email: user.email,
          name: user.name ?? null,
        };
      },
    }),
  ],
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
