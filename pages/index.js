import React, { useState, useEffect } from 'react';
import { useSession, signIn, signOut } from "next-auth/react";
import { Octokit } from "@octokit/rest";
import JSZip from 'jszip';

export default function GitHubSync() {
  const { data: session } = useSession();
  const [octokit, setOctokit] = useState(null);
  const [repos, setRepos] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [status, setStatus] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [changes, setChanges] = useState([]);
  const [repoFiles, setRepoFiles] = useState({});
  const [uploadedFiles, setUploadedFiles] = useState({});
  const [isRepoFetching, setIsRepoFetching] = useState(false);
  const [isZipProcessing, setIsZipProcessing] = useState(false);

  // Initialize Octokit when session is available
  useEffect(() => {
    if (session?.accessToken) {
      const octokitInstance = new Octokit({
        auth: session.accessToken,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      setOctokit(octokitInstance);
    }
  }, [session]);

  // Fetch repositories when authenticated
  // Fetch repositories when authenticated
  useEffect(() => {
    const fetchRepos = async () => {
      if (!octokit) return;
  
      try {
        // Fetch personal repositories (owned by the user)
        const personalRepos = await octokit.repos.listForAuthenticatedUser({
          affiliation: 'owner'
        });
  
        // Fetch organizational repositories (where the user is a member)
        const orgRepos = await octokit.repos.listForAuthenticatedUser({
          affiliation: 'organization_member'
        });
  
        // Combine personal and org repositories
        const allRepos = [...personalRepos.data, ...orgRepos.data];
  
        // Sort repositories by updated_at in descending order (latest first)
        const sortedRepos = allRepos.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        setRepos(sortedRepos);
      } catch (error) {
        setStatus("Failed to fetch repositories: " + error.message);
      }
    };
  
    fetchRepos();
  }, [octokit]);
  

  console.log("session", session);


  // Handle repository selection
  const handleRepoSelect = async (repoFullName) => {
    setSelectedRepo(repoFullName);
    setStatus("Fetching repository contents...");
    setIsRepoFetching(true);

    try {
      const [owner, repo] = repoFullName.split('/');
      await fetchRepoContents(owner, repo);
      setStatus("Repository contents fetched successfully");
    } catch (error) {
      setStatus("Error fetching repository: " + error.message);
    }
    setIsRepoFetching(false);
  };

  // Recursively fetch repository contents
  const fetchRepoContents = async (owner, repo, path = '') => {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path
    });

    const files = {};
    for (const item of Array.isArray(data) ? data : [data]) {
      if (item.type === 'file') {
        const content = await octokit.repos.getContent({
          owner,
          repo,
          path: item.path,
          headers: { accept: 'application/vnd.github.raw' }
        });
        files[item.path] = {
          content: content.data,
          sha: item.sha
        };
      } else if (item.type === 'dir') {
        const subFiles = await fetchRepoContents(owner, repo, item.path);
        Object.assign(files, subFiles);
      }
    }
    setRepoFiles(prev => ({ ...prev, ...files }));
    return files;
  };

  const handleGitHubAppInstall = () => {
    window.open("https://github.com/apps/reposync7x/installations/new", "_blank"); // Open in new tab
  };

  // Handle zip file upload
  const handleZipUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !file.name.endsWith('.zip')) {
      setStatus("Please upload a zip file");
      return;
    }

    // Prevent detecting changes during processing
    setStatus("Processing zip file...");
    setIsZipProcessing(true);

    try {
      const zip = new JSZip();
      const zipContents = await zip.loadAsync(file);
      const files = {};

      for (const [path, zipEntry] of Object.entries(zipContents.files)) {
        if (zipEntry.dir || path.startsWith('.next/') || path.includes('.next/') || path.startsWith('public/') || path.includes('public/')) {
          // Skip directories and anything within .next folder
          continue;
        }

        // If the path starts with "project/", remove the prefix
        const adjustedPath = path.startsWith('project/') ? path.slice('project/'.length) : path;
        
        const content = await zipEntry.async('string');
        files[adjustedPath] = {
          content,
          isNew: !repoFiles[adjustedPath]
        };
      }

      setUploadedFiles(files);
      detectChanges(files);
    } catch (error) {
      setStatus("Error processing zip file: " + error.message);
    }
    setIsZipProcessing(false);
  };

  // Detect changes between repo and uploaded files
  const detectChanges = (uploadedFiles) => {
    if (isRepoFetching || isZipProcessing) {
      // Avoid detecting changes while fetching repo files or processing zip
      return;
    }

    const changes = [];

    // Check for modified and new files
    Object.entries(uploadedFiles).forEach(([path, file]) => {
      if (repoFiles[path]) {
        if (file.content !== repoFiles[path].content) {
          changes.push({
            path,
            type: 'modified',
            content: file.content
          });
        }
      } else {
        changes.push({
          path,
          type: 'added',
          content: file.content
        });
      }
    });

    setChanges(changes);
    setStatus(`Found ${changes.length} changes`);
  };

  // Push changes to GitHub
  const pushChanges = async () => {
    if (!selectedRepo || changes.length === 0) return;

    setStatus("Pushing changes to GitHub...");
    setIsProcessing(true);

    try {
      const [owner, repo] = selectedRepo.split('/');
      let successCount = 0;

      for (const change of changes) {
        try {
          const content = Buffer.from(change.content).toString('base64');
          const message = `Update ${change.path} [RepoSync]`;

          if (change.type === 'modified') {
            await octokit.repos.createOrUpdateFileContents({
              owner,
              repo,
              path: change.path,
              message,
              content,
              sha: repoFiles[change.path].sha
            });
          } else if (change.type === 'added') {
            await octokit.repos.createOrUpdateFileContents({
              owner,
              repo,
              path: change.path,
              message,
              content
            });
          }
          successCount++;
        } catch (error) {
          console.error(`Failed to push ${change.path}:`, error);
        }
      }

      setStatus(`Successfully pushed ${successCount} out of ${changes.length} changes`);
      setChanges([]);
      setStatus("Changes successfully pushed!");

    } catch (error) {
      setStatus("Error pushing changes: " + error.message);
    }
    setIsProcessing(false);
  };

  // Fetch repo files again
  const handleFetchRepoFilesAgain = () => {
    if (selectedRepo) {
      const [owner, repo] = selectedRepo.split('/');
      setStatus("Fetching repository files again...");
      setIsRepoFetching(true);
      fetchRepoContents(owner, repo)
        .then(() => setStatus("Repository files fetched successfully"))
        .catch((error) => setStatus("Error fetching repository files: " + error.message))
        .finally(() => setIsRepoFetching(false));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-md overflow-hidden">
        <div className="p-8">
          <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
            RepoSync
          </h1>

          {!session ? (
            <div className="text-center">
              <div className='mb-2'>Please Install Github App before proceeding with signIn. You only needed to install once</div>
              <button
                onClick={handleGitHubAppInstall}
                className="py-3 px-6 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
              >
                Install GitHub App
              </button>
              <button
                onClick={() => signIn("github")}
                className="ml-2 bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Sign in with GitHub
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <p className="text-gray-600">
                  Signed in as {session.user?.name}
                </p>
                <button
                  onClick={() => signOut()}
                  className="text-red-600 hover:text-red-800"
                >
                  Sign Out
                </button>
              </div>

              <div className="space-y-4">
                <select
                  value={selectedRepo}
                  onChange={(e) => handleRepoSelect(e.target.value)}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="">Select a repository</option>
                  {repos.map((repo) => (
                    <option key={repo.id} value={repo.full_name}>
                      {repo.full_name}
                    </option>
                  ))}
                </select>

                {selectedRepo && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Upload a zip file</h3>
                    <input
                      type="file"
                      accept=".zip"
                      onChange={handleZipUpload}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />

                    <button
                      onClick={() => detectChanges(uploadedFiles)}
                      disabled={isZipProcessing || isRepoFetching || Object.keys(uploadedFiles).length === 0}
                      className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      Detect Changes
                    </button>

                    {changes.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Detected Changes:</h3>
                        <div className="max-h-60 overflow-y-auto">
                          {changes.map((change, index) => (
                            <div key={index} className="p-2 bg-gray-50 rounded-md flex items-center">
                              <span className={`mr-2 px-2 py-1 rounded-md text-sm ${change.type === 'modified' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                {change.type}
                              </span>
                              <span className="text-gray-600">{change.path}</span>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={pushChanges}
                          disabled={isProcessing}
                          className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400"
                        >
                          Push Changes to GitHub
                        </button>
                      </div>
                    )}

                    {/* Button to fetch repo files again */}
                    <button
                      onClick={handleFetchRepoFilesAgain}
                      disabled={isRepoFetching}
                      className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 disabled:bg-gray-400"
                    >
                      Fetch Repository Files Again
                    </button>

                    {/* Link to GitHub Repo after successful push */}
                    
                      <div className='flex gap-2'>
                      <a
                        href={`https://github.com/${selectedRepo}`}
                        target="_blank"
                        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 text-center inline-block"
                      >
                        Go to GitHub Repo
                      </a>
                       <a
                       href={`https://bolt.new/~/github.com/${selectedRepo}`}
                       target="_blank"
                       className="w-full bg-gray-800 text-white py-2 px-4 rounded-md hover:bg-graylue-700 text-center inline-block"
                     >
                       Open Repo in Bolt
                     </a>
                      </div>
                  </div>
                )}

                {/* Status updates */}
                {status && (
                  <div className={`p-4 rounded-md ${status.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                    {isRepoFetching && (
                      <div className="animate-spin inline-block w-4 h-4 border-2 border-current rounded-full mr-2 border-t-transparent" />
                    )}
                    {status}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
