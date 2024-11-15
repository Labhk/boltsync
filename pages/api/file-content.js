import axios from "axios";

export default async function handler(req, res) {
  const { repoName, filePath } = req.query;

  // Validate that repoName and filePath are provided
  if (!repoName || !filePath) {
    return res.status(400).json({ message: "Repository name and file path are required." });
  }

  // Get the GitHub access token from environment variables
  const token = process.env.NEXT_PUBLIC_GITHUB_PERSONAL_ACCESS_TOKEN;

  if (!token) {
    return res.status(401).json({ message: "Authentication token is required." });
  }

  try {
    // Make a request to GitHub's API to get the content of the file
    const response = await axios.get(
      `https://api.github.com/repos/${repoName}/contents/${filePath}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Accept": "application/vnd.github+json", // Use the correct GitHub API version
          "X-GitHub-Api-Version": "2022-11-28",  // Specify the API version
        },
      }
    );

    // Log the response data for debugging
    console.log("GitHub API response:", response.data);

    // Return the file data (content in base64) from the API response
    return res.status(200).json(response.data);

  } catch (error) {
    console.error("GitHub API error:", error.response?.data || error.message);

    // Send more detailed error information
    return res.status(error.response?.status || 500).json({
      message: error.response?.data?.message || "Error fetching file content",
      status: error.response?.status,
      details: error.response?.data,
    });
  }
}
