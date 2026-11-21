import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const GEMINI_OAUTH_SCOPE = "https://www.googleapis.com/auth/generative-language.retriever";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: { scope: `openid email profile ${GEMINI_OAUTH_SCOPE}`, access_type: "online" },
      },
    }),
  ],
  // Netlify serves each deploy from its own host, so the request host is trusted explicitly.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { error: "/" },
  callbacks: {
    // Refusing sign-in without the Gemini scope keeps every signed-in user able to read receipts.
    signIn({ account }) {
      if (account?.scope?.split(" ").includes(GEMINI_OAUTH_SCOPE)) return true;
      return "/?authError=gemini-scope";
    },
    // The access token stays inside the encrypted JWT cookie and is read only on the server.
    jwt({ token, account }) {
      if (account?.access_token) {
        token.googleAccessToken = account.access_token;
        token.googleAccessTokenExpiresAt = account.expires_at ?? 0;
      }
      return token;
    },
  },
});
