import type { NextAuthConfig } from "next-auth";

// Edge-compatible auth config (no Node.js dependencies).
// Used by middleware for session verification. The Credentials provider itself
// lives in lib/auth.ts because verifying a password needs Node's crypto and a
// database lookup, neither of which is allowed in the edge middleware bundle.
const authConfig: NextAuthConfig = {
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};

export default authConfig;
