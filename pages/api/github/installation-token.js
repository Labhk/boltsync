import { createAppAuth } from "@octokit/auth-app";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { installation_id } = req.body;

  if (!installation_id) {
    return res.status(400).json({ message: 'Installation ID is required' });
  }

  try {
    const auth = createAppAuth({
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_PRIVATE_KEY,
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    });

    // Get an installation access token
    const installationAuthentication = await auth({
      type: "installation",
      installationId: installation_id,
    });

    // Get the authenticated user information
    const octokit = new Octokit({
      auth: installationAuthentication.token,
    });
    
    const { data: user } = await octokit.rest.users.getAuthenticated();

    // Return both the token and user information
    res.status(200).json({
      token: installationAuthentication.token,
      user: user,
    });
  } catch (error) {
    console.error('Error getting installation token:', error);
    res.status(500).json({ message: 'Failed to get installation token' });
  }
}