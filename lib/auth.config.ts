import Credentials from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";

const AUTH_USER = {
  id: "flowys-user",
  email: "user@flowys.io",
  name: "Flowys User",
  password: "@FLOWYS2025",
};

// Edge-compatible auth config (no Node.js dependencies)
// Used by middleware for session verification
const authConfig: NextAuthConfig = {
  session: {
    strategy: "jwt",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize(credentials) {
        const email = String(credentials?.email || "").trim().toLowerCase();
        const password = String(credentials?.password || "");

        if (email === AUTH_USER.email && password === AUTH_USER.password) {
          return {
            id: AUTH_USER.id,
            email: AUTH_USER.email,
            name: AUTH_USER.name,
          };
        }

        return null;
      },
    }),
  ],
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
