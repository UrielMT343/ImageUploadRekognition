// types/next-auth.d.ts

import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    user: {
      username?: string | null;
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
    username?: string | null; //
  }
}