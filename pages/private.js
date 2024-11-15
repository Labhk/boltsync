import { useSession, signIn, signOut } from "next-auth/react";
import { useState } from "react";
import { Octokit } from "@octokit/rest";

export default function Home() {
  const { data: session } = useSession();
  const [repoName, setRepoName] = useState("");
  const [files, setFiles] = useState([]);
  const [fileContent, setFileContent] = useState(null);
  const [status, setStatus] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [currentPath, setCurrentPath] = useState("");
  const [pathHistory, setPathHistory] = useState([]);

  const handleGitHubAuth = () => {
    signIn("github");
  };

  const handleFetchFiles = async (path = "") => {
    if (!session?.accessToken) {
      setStatus("Please sign in with GitHub first");
      return;
    }

    if (!repoName) {
      alert("Please enter a GitHub repository name.");
      return;
    }

    const parts = repoName.split("/");
    let owner, repo;
    if (parts.length === 2) {
      owner = parts[0].trim();
      repo = parts[1].trim();
    } else if (parts.length === 1) {
      owner = session.user.name;
      repo = parts[0].trim();
    } else {
      alert("Invalid repository name format. Please use 'username/repo' or just 'repo' for your own repository.");
      return;
    }

    setStatus("Fetching files...");
    try {
      console.log('Debug - Owner:', owner);
      console.log('Debug - Repo:', repo);
      console.log('Debug - Token:', session.accessToken);

      const octokit = new Octokit({
        auth: `token ${session.accessToken}` // Note the 'token ' prefix
      });

      const response = await octokit.repos.getContent({
        owner,
        repo,
        path,
      });

      if (Array.isArray(response.data)) {
        setFiles(response.data);
        setStatus("Files fetched successfully.");
        setFileContent(null);
        setSelectedFile(null);
        setCurrentPath(path);
      } else {
        throw new Error("Unexpected response data format.");
      }
    } catch (error) {
      setStatus(`Error fetching files: ${error.message}`);
      console.error("Error details:", error);
      
      // Additional error handling
      if (error.status === 401) {
        setStatus("Authentication error. Please sign out and sign in again.");
      } else if (error.status === 404) {
        setStatus("Repository not found or no access.");
      }
    }
  };

  const handleOpenFile = async (file) => {
    if (!session?.accessToken) {
      setStatus("Please sign in with GitHub first");
      return;
    }

    if (file.type === "dir") {
      setPathHistory([...pathHistory, currentPath]);
      handleFetchFiles(file.path);
      return;
    }

    setStatus("Fetching file content...");
    setSelectedFile(file);

    try {
      const octokit = new Octokit({
        auth: session.accessToken // Use the session token instead of PAT
      });

      const parts = repoName.split("/");
      let owner, repo;
      if (parts.length === 2) {
        owner = parts[0].trim();
        repo = parts[1].trim();
      } else if (parts.length === 1) {
        owner = session.user.name;
        repo = parts[0].trim();
      } else {
        alert("Invalid repository name format. Please use 'username/repo' or just 'repo' for your own repository.");
        return;
      }

      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: file.path,
      });

      if (response.data.content) {
        const decodedContent = atob(response.data.content);
        setFileContent(decodedContent);
        setStatus("File content fetched successfully.");
      } else {
        throw new Error("No content received from API");
      }
    } catch (error) {
      setStatus("Failed to fetch file content");
      console.error("File content error:", error);
    }
  };

  // Rest of the component remains the same
  const handleBack = () => {
    if (pathHistory.length > 0) {
      const previousPath = pathHistory.pop();
      setPathHistory([...pathHistory]);
      handleFetchFiles(previousPath);
    }
  };

  const renderFileIcon = (type) => {
    return type === "dir" ? "📁" : "📄";
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl w-full bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-3xl font-semibold text-center text-gray-900 mb-6">RepoSync</h1>

        {!session ? (
          <div className="text-center">
            <button
              onClick={handleGitHubAuth}
              className="py-2 px-4 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
            >
              Sign in with GitHub
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
                Repository Name
              </label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <input
                  type="text"
                  id="repoName"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  className="flex-1 min-w-0 block w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="username/repository or just repository"
                />
                <button
                  onClick={() => handleFetchFiles("")}
                  className="ml-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Fetch Files
                </button>
              </div>
            </div>

            <div className="flex space-x-4">
              <div className="w-1/3 border rounded-lg p-4 bg-gray-50">
                <h2 className="text-lg font-medium mb-4">Files</h2>
                <div className="overflow-y-auto max-h-96">
                  <button
                    onClick={handleBack}
                    disabled={pathHistory.length === 0}
                    className="text-indigo-600 hover:text-indigo-900 mb-2"
                  >
                    ← Back
                  </button>
                  {files.length > 0 ? (
                    <ul className="space-y-1">
                      {files.map((file) => (
                        <li
                          key={file.path}
                          onClick={() => handleOpenFile(file)}
                          className={`cursor-pointer p-2 rounded hover:bg-gray-200 flex items-center ${
                            selectedFile?.path === file.path ? "bg-gray-200" : ""
                          }`}
                        >
                          <span className="mr-2">{renderFileIcon(file.type)}</span>
                          <span className="truncate">{file.name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-500 text-center">No files to display</p>
                  )}
                </div>
              </div>

              <div className="w-2/3 border rounded-lg p-4">
                <h2 className="text-lg font-medium mb-4">
                  {selectedFile ? selectedFile.name : "File Preview"}
                </h2>
                <div className="overflow-y-auto max-h-96">
                  {fileContent ? (
                    <pre className="bg-gray-100 p-4 rounded-lg text-sm overflow-x-auto">
                      {fileContent}
                    </pre>
                  ) : (
                    <p className="text-gray-500 text-center">Select a file to view its contents</p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 text-center text-gray-600">{status}</div>

            <div className="mt-4 text-center">
              <button
                onClick={() => signOut()}
                className="text-sm text-indigo-600 hover:text-indigo-900"
              >
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}