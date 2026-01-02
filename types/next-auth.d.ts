import type { DefaultSession } from "next-auth";

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      username?: string | null;
      sub?: string;
    } & DefaultSession['user'];
  }

  interface User {
    username?: string | null;
  }

  interface Profile {
    'cognito:username'?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    username?: string | null;
  }
}