import NextAuth from "next-auth";
import CognitoProvider from "next-auth/providers/cognito";

type profile = {
  'cognito:username': string;
  email: string;
  email_verified: boolean;
  sub: string;
}

const handler = NextAuth({
  providers: [
    CognitoProvider({
      clientId: process.env.COGNITO_CLIENT_ID!,
      clientSecret: process.env.COGNITO_CLIENT_SECRET!,
      issuer: process.env.COGNITO_ISSUER!,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      if (profile) {
        token.username = profile['cognito:username'];
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.user.username = token.username;
      return session;
    },
    async redirect({ baseUrl }) {
      return baseUrl; // redirects to "/"
    },
  },
});


export { handler as GET, handler as POST };
