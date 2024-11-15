export default async function handler(req, res) {
  const { repoName } = req.query;

  if (!repoName) {
    return res.status(400).json({ message: "Repository name is required." });
  }

  // Get the GitHub access token from the environment variables
  const token = process.env.NEXT_PUBLIC_GITHUB_PERSONAL_ACCESS_TOKEN;

  if (!token) {
    return res.status(401).json({ message: "Authentication token is required." });
  }

  try {
    // Use fetch to request the content from the GitHub API
    const response = await fetch(`https://api.github.com/repos/${repoName}/contents`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      // Handle response errors from GitHub's API
      const errorData = await response.json();
      console.error("GitHub API error:", errorData);
      return res.status(response.status).json({ message: errorData.message || "Error fetching file content." });
    }

    // Parse JSON directly since it’s already in JSON format
    const data = await response.json();
    

    return res.status(200).json(data);
  } catch (error) {
    console.error("Fetch error:", error.message);
    return res.status(500).json({ message: "Error fetching file content." });
  }
}
