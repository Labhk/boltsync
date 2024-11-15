
import { getSession } from "next-auth/react";
import { createAppAuth } from "@octokit/auth-app";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the session from next-auth
    const session = await getSession({ req });
    
    if (!session || !session.installationId) {
      return res.status(401).json({ error: 'No active session' });
    }

    // Get installation token using the stored installation ID
    const appAuth = createAppAuth({
      appId: process.env.NEXT_PUBLIC_GITHUB_APP_ID,
      privateKey: process.env.NEXT_PUBLIC_GITHUB_PRIVATE_KEY,
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    });

    const installationAuthentication = await appAuth({
      type: "installation",
      installationId: session.installationId,
    });

    if (!installationAuthentication.token) {
      return res.status(401).json({ error: 'Invalid installation' });
    }

    // Get the user information using the token
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${installationAuthentication.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user data');
    }

    const userData = await response.json();

    // Return the token and user data
    return res.status(200).json({
      token: installationAuthentication.token,
      user: {
        login: userData.login,
        id: userData.id,
        avatar_url: userData.avatar_url,
        html_url: userData.html_url,
      }
    });

  } catch (error) {
    console.error('Auth check error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}