import { createAppAuth } from "@octokit/auth-app";

export async function getToken(installationId) {
  try {
    const appAuth = createAppAuth({
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    });

    const installationAuthentication = await appAuth({
      type: "installation",
      installationId: installationId,
    });

    return installationAuthentication.token;
  } catch (error) {
    console.error('Error getting installation token:', error);
    throw error;
  }
}