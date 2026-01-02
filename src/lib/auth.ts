import type { NextAuthOptions } from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";

export const authOptions: NextAuthOptions = {
  providers: [
    CognitoProvider({
      clientId: process.env.COGNITO_CLIENT_ID!,
      clientSecret: process.env.COGNITO_CLIENT_SECRET!,
      issuer: process.env.COGNITO_ISSUER!,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, profile }) {
      if (profile?.["cognito:username"]) {
        token.username = profile["cognito:username"];
      }
      if (profile?.sub) {
        token.sub = profile.sub;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.username = token.username;
      session.user.sub = token.sub as string | undefined;
      return session;
    },
  },
};