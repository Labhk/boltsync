

import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { Octokit } from "@octokit/rest";

export default function Home() {
  const { data: session } = useSession();
  const [repoName, setRepoName] = useState("");
  const [repos, setRepos] = useState([]);
  const [files, setFiles] = useState([]);
  const [fileContent, setFileContent] = useState(null);
  const [editedContent, setEditedContent] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [currentPath, setCurrentPath] = useState("");
  const [pathHistory, setPathHistory] = useState([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [octokit, setOctokit] = useState(null);

  // Set up Octokit instance once authenticated
  useEffect(() => {
    if (session?.accessToken) {
      const octokitInstance = new Octokit({
        auth: session.accessToken,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
          Accept: 'application/vnd.github.v3+json',
        }
      });
      setOctokit(octokitInstance);
    } else {
      setOctokit(null);
    }
  }, [session]);

  const handleGitHubAppInstall = () => {
    window.location.href = "https://github.com/apps/reposync7x/installations/new"; // Replace with your GitHub App installation URL
  };

  const handleGitHubAuth = () => {
    signIn("github", {
      callbackUrl: window.location.origin,
      scope: "repo user:email write:repo_hook repo:status"
    });
  };

  useEffect(() => {
    const checkAuth = async () => {
      if (!octokit) return;
      try {
        const { data } = await octokit.rest.users.getAuthenticated();
        setStatusMessage(`Successfully authenticated as ${data.login}`);
        fetchRepos(); // Fetch repositories after authentication
      } catch (error) {
        console.error("Authentication error:", error);
        setStatusMessage("Authentication failed. Please sign in again.");
        signOut();
      }
    };
    checkAuth();
  }, [octokit]);

  const fetchRepos = async () => {
    if (!octokit) return;
    try {
      const { data } = await octokit.rest.repos.listForAuthenticatedUser({
        type: 'all', // You can modify this to 'public', 'private', etc.
      });
      setRepos(data);
    } catch (error) {
      console.error("Error fetching repositories:", error);
      setStatusMessage("Failed to fetch repositories.");
    }
  };

  const getRepoDetails = () => {
    const parts = repoName.split("/");
    console.log("repo:", repoName);
    if (parts.length === 2) {
      return { owner: parts[0].trim(), repo: parts[1].trim() };
    } else if (parts.length === 1 && session?.user?.name) {
      return { owner: session.user.name, repo: parts[0].trim() };
    }
    throw new Error("Invalid repository name format. Use 'username/repository'.");
  };

  const renderFileIcon = (type) => {
    return type === "dir" ? "📁" : "📄";
  };

  const handleFetchFiles = async (path = "") => {
    if (!repoName) {
      setStatusMessage("Please enter a repository name.");
      return;
    }
    if (!octokit) {
      setStatusMessage("Not authenticated. Please sign in.");
      return;
    }

    setStatusMessage("Fetching files...");
    try {
      const { owner, repo } = getRepoDetails();
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      if (Array.isArray(response.data)) {
        setFiles(response.data);
        setCurrentPath(path);
        setFileContent(null);
        setEditedContent(null);
        setSelectedFile(null);
        setStatusMessage("");
      } else {
        throw new Error("Invalid repository response.");
      }
    } catch (error) {
      setStatusMessage(error.status === 404 ? "Repository not found." : error.message);
      console.error("Error fetching files:", error);
    }
  };

  const handleOpenFile = async (file) => {
    if (file.type === "dir") {
      setPathHistory([...pathHistory, currentPath]);
      handleFetchFiles(file.path);
      return;
    }

    setSelectedFile(file);
    setIsEditing(false);
    setStatusMessage("Fetching file content...");

    try {
      const { owner, repo } = getRepoDetails();
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: file.path,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      const decodedContent = Buffer.from(response.data.content, 'base64').toString();
      setFileContent(decodedContent);
      setEditedContent(decodedContent);
      setStatusMessage("");
    } catch (error) {
      setStatusMessage("Failed to fetch file content.");
      console.error("Error fetching file content:", error);
    }
  };

  const handleSaveChanges = async () => {
    if (!selectedFile || !editedContent || !commitMessage) {
      setStatusMessage("Please fill in all fields.");
      return;
    }

    setStatusMessage("Saving changes...");
    try {
      const { owner, repo } = getRepoDetails();

      // Get the current file's SHA
      const currentFile = await octokit.repos.getContent({
        owner,
        repo,
        path: selectedFile.path,
      });

      // Create the commit
      const response = await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: selectedFile.path,
        message: commitMessage,
        content: Buffer.from(editedContent).toString('base64'),
        sha: currentFile.data.sha,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
          Accept: 'application/vnd.github.v3+json',
        }
      });

      setStatusMessage("Changes saved successfully!");
      setIsEditing(false);
      setCommitMessage("");
      handleOpenFile(selectedFile); // Refresh file content
    } catch (error) {
      console.error("Error saving changes:", error);
      if (error.status === 403) {
        setStatusMessage("Permission denied. Please check repository access permissions.");
      } else {
        setStatusMessage(`Error saving changes: ${error.message}`);
      }
    }
  };

  const handleBack = () => {
    if (pathHistory.length > 0) {
      const previousPath = pathHistory.pop();
      setPathHistory([...pathHistory]);
      handleFetchFiles(previousPath);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl w-full bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-3xl font-semibold text-center text-gray-900 mb-6">RepoSync</h1>

        {!session ? (
          <div className="text-center">
            <div>Please Install Github App before proceeding with signIn. You only needed to install once</div>
            <button
              onClick={handleGitHubAppInstall}
              className="py-2 px-4  bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
            >
              Install GitHub App
            </button>
            <button
              onClick={handleGitHubAuth}
              className="ml-2 py-2 px-4 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
            >
              Sign In with GitHub
            </button>
          </div>
        ) : (
          <div>
            <div className="mb-4 text-center">
              <p className="text-lg font-medium text-gray-800">
                Welcome, {session.user?.name || session.user?.email}
              </p>
            </div>

            <div className="mb-4">
              <label htmlFor="repoName" className="block text-sm font-medium text-gray-700">
                Repository
              </label>
              <div className="mt-1">
                <select
                  id="repoName"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  className="py-2 px-4 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 block w-full"
                >
                  <option value="">Select a repository</option>
                  {repos.map((repo) => (
                    <option key={repo.id} value={`${repo.owner.login}/${repo.name}`}>
                      {repo.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap space-x-4 space-y-4">
              <button
                onClick={() => handleFetchFiles()}
                className="py-2 px-4 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
              >
                Fetch Files
              </button>
              <button
                onClick={() => signOut()}
                className="py-2 px-4 bg-red-600 text-white font-semibold rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
              >
                Sign Out
              </button>
            </div>

            <div className="mt-6">
              {statusMessage && (
                <div className="mb-4 p-2 bg-gray-100 text-gray-800 text-sm rounded-md">
                  {statusMessage}
                </div>
              )}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Files</h2>
                  {currentPath && (
                    <button
                      onClick={handleBack}
                      className="py-1 px-2 text-gray-600 bg-gray-200 rounded-md"
                    >
                      🔙 Back
                    </button>
                  )}
                  {files.length > 0 ? (
                    <ul className="space-y-2">
                      {files.map((file) => (
                        <li key={file.path}>
                          <button
                            onClick={() => handleOpenFile(file)}
                            className="w-full text-left flex items-center space-x-2 text-blue-600 hover:underline"
                          >
                            <span>{renderFileIcon(file.type)}</span>
                            <span>{file.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-500">No files found.</p>
                  )}
                </div>

                <div className="space-y-4">
                  {selectedFile && (
                    <div>
                      <h2 className="text-lg font-semibold">{selectedFile.name}</h2>
                      {isEditing ? (
                        <div>
                          <textarea
                            rows={10}
                            value={editedContent || ""}
                            onChange={(e) => setEditedContent(e.target.value)}
                            className="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500"
                          ></textarea>
                          <input
                            type="text"
                            value={commitMessage}
                            onChange={(e) => setCommitMessage(e.target.value)}
                            placeholder="Commit message"
                            className="mt-2 w-full py-2 px-4 border border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500"
                          />
                          <button
                            onClick={handleSaveChanges}
                            className="mt-2 py-2 px-4 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
                          >
                            Save Changes
                          </button>
                          <button
                            onClick={() => setIsEditing(false)}
                            className="mt-2 ml-2 py-2 px-4 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div>
                          <pre className="overflow-auto bg-gray-100 p-4 rounded-md border">{fileContent}</pre>
                          <button
                            onClick={() => setIsEditing(true)}
                            className="mt-2 py-2 px-4 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                          >
                            Edit File
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
