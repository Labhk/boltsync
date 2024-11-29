import React, { useState, useEffect } from 'react';
import { useSession, signIn, signOut } from "next-auth/react";
import { Octokit } from "@octokit/rest";
import JSZip from 'jszip';
import { Github, Heart, Search, X, Linkedin } from 'lucide-react';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);

  // Filter repositories based on search term
  const filteredRepos = repos.filter(repo => 
    repo.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        const fetchAllRepos = async (fetchFn) => {
          let allRepos = [];
          let page = 1;
          let response;
    
          do {
            response = await fetchFn({
              page,
              per_page: 100  // Maximum allowed per page
            });
    
            allRepos = [...allRepos, ...response.data];
            page++;
          } while (response.data.length === 100);
    
          return allRepos;
        };
    
        // Fetch personal repositories
        const personalRepos = await fetchAllRepos((params) => 
          octokit.repos.listForAuthenticatedUser({
            ...params,
            affiliation: 'owner'
          })
        );
    
        // Fetch organizational repositories
        const orgRepos = await fetchAllRepos((params) => 
          octokit.repos.listForAuthenticatedUser({
            ...params,
            affiliation: 'organization_member'
          })
        );
    
        // Combine and sort repositories
        const allRepos = [...personalRepos, ...orgRepos];
        const sortedRepos = allRepos.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        
        setRepos(sortedRepos);
      } catch (error) {
        setStatus("Failed to fetch repositories: " + error.message);
      }
    };
  
    fetchRepos();
  }, [octokit]);
  
  console.log(repos);


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
    window.open("https://github.com/apps/boltsync/installations/new", "_blank"); // Open in new tab
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
        if (zipEntry.dir || path.startsWith('.next/') || path.startsWith('dist/') || path.includes('dist/') || path.startsWith('node_modules/') || path.includes('node_modules/') ||  path.includes('.next/') || path.startsWith('public/') || path.includes('public/')) {
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
          const message = `Update ${change.path} [BoltSync]`;

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
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-4 md:p-8">
      {/* Header Section */}
      <div className="max-w-5xl mx-auto mb-8">
        <div className="bg-black/30 rounded-2xl p-8 backdrop-blur-lg border border-gray-700">
          <div className="flex items-center justify-center space-x-4 mb-6">
            <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-white">BoltSync</h1>
          </div>
          <p className="text-gray-300 text-center max-w-3xl mx-auto mb-2">
            Modify your GitHub repositories with Bolt Prompts & sync changes back to GitHub with BoltSync.
          </p>
          <p className="text-gray-300 text-center max-w-3xl mx-auto mb-3">
              Help spread the word! If you find BoltSync useful, please share the LinkedIn post and connect with me.
            </p>
          <div className="flex justify-center gap-3">
            <a
              href="https://github.com/Labhk/BoltSync-Issues/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Report Issue</span>
            </a>
            <a
              href="https://www.linkedin.com/posts/labh-k_github-bolt-webdevelopment-activity-7268152010728742912-v4BT"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200"
            >
              <Linkedin className="w-4 h-4" />
              <span>Share BoltSync</span>
            </a>
            <a
              href="https://www.linkedin.com/in/labh-k/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors duration-200"
            >
              <span>Connect on LinkedIn</span>
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto">
        <div className="bg-black/30 backdrop-blur-lg rounded-2xl shadow-xl overflow-hidden border border-gray-700">
          {!session ? (
            <div className="p-8 text-center space-y-6">
              {/* Instructions for non-authenticated users */}
              <div className="max-w-2xl mx-auto bg-gray-800/50 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Getting Started</h2>
                <ol className="text-gray-300 text-left space-y-4">
                  <li className="flex items-start">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm mr-3 mt-0.5">1</span>
                    <span>Install the GitHub App (one-time setup)</span>
                  </li>
                  <li className="flex items-start">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm mr-3 mt-0.5">2</span>
                    <span>Sign in with your GitHub account</span>
                  </li>
                </ol>
              </div>
              
              <div className="flex justify-center gap-4">
                <button
                  onClick={handleGitHubAppInstall}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-blue-500/25"
                >
                  Install GitHub App
                </button>
                <button
                  onClick={() => signIn("github")}
                  className="px-6 py-3 bg-gradient-to-r from-gray-800 to-gray-900 text-white font-medium rounded-xl hover:from-gray-900 hover:to-black transition-all duration-200 shadow-lg hover:shadow-gray-800/25 flex items-center gap-2"
                >
                  <Github className="w-5 h-5" />
                  Sign in with GitHub
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 space-y-6">
              {/* Authenticated User Header */}
              <div className="flex justify-between items-center pb-6 border-b border-gray-700">
                <div className="flex items-center space-x-4">
                  <img src={session.user?.image} alt="Profile" className="w-10 h-10 rounded-full" />
                  <div>
                    <p className="text-white font-medium">{session.user?.name}</p>
                    <p className="text-gray-400 text-sm">{session.user?.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => signOut()}
                  className="px-4 py-2 text-gray-300 hover:text-white hover:bg-red-500/20 rounded-lg transition-colors"
                >
                  Sign Out
                </button>
              </div>

              {/* Repository Selection */}
              <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
          {/* Search Input */}
              <div className="relative">
                <div className="flex items-center">
                  <input 
                    type="text"
                    placeholder="Search repo, Open Dropdown -->"
                    value={searchTerm}
                    onClick={() => setIsSearchActive(true)}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setIsSearchActive(true);
                    }}
                    className="w-full p-3 pr-10 bg-gray-800 text-white border border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {searchTerm && (
                    <button 
                      onClick={() => {
                        setSearchTerm('');
                        setIsSearchActive(false);
                      }}
                      className="absolute right-3 text-gray-400 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
                
                {searchTerm && filteredRepos.length === 0 && (
                  <div className="text-gray-400 mt-2 text-sm">
                    No repositories found matching "{searchTerm}"
                  </div>
                )}
              </div>

              {/* Repository Select */}
              <select
                value={selectedRepo}
                onChange={(e) => handleRepoSelect(e.target.value)}
                className="w-full p-3 bg-gray-800 text-white border border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select a repository</option>
                {(isSearchActive ? filteredRepos : repos).map((repo) => (
                  <option key={repo.id} value={repo.full_name}>
                    {repo.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-white text-sm space-y-1">
              <div>NOTE: bolt.new only supports public repositories as of now</div>
              <div>NOTE: If you are not able to see your repository, Sign out and click install app again, then select that specific repository.</div>
              <div>NOTE: If you see "Failed to fetch repositories: Bad credentials..", Click Sign Out and Sign In again.</div>
            </div>
                

                {selectedRepo && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <a
                    href={`https://github.com/${selectedRepo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 bg-gradient-to-r from-gray-700 to-gray-800 text-white py-3 px-4 rounded-xl hover:from-gray-800 hover:to-gray-900 transition-all duration-200 font-medium"
                  >
                    <Github className="w-5 h-5" />
                    View on GitHub
                  </a>
                  <a
                    href={`https://bolt.new/~/github.com/${selectedRepo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 px-4 rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-200 font-medium"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Open in Bolt
                  </a>
                </div>
                )}

                

                {selectedRepo && (
                  <div className="space-y-6">
                    <div className="bg-gray-800/50 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-white mb-4">Upload Bolt Downloaded Zip File</h3>
                      <input
                        type="file"
                        accept=".zip"
                        onChange={handleZipUpload}
                        className="block w-full text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-500 file:text-white hover:file:bg-blue-600 cursor-pointer"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <button
                        onClick={() => detectChanges(uploadedFiles)}
                        disabled={isZipProcessing || isRepoFetching || Object.keys(uploadedFiles).length === 0}
                        className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 px-4 rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium"
                      >
                        Detect Changes
                      </button>
                      
                      <button
                        onClick={handleFetchRepoFilesAgain}
                        disabled={isRepoFetching}
                        className="w-full bg-gradient-to-r from-gray-700 to-gray-800 text-white py-3 px-4 rounded-xl hover:from-gray-800 hover:to-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium"
                      >
                        Fetch Latest Files
                      </button>
                    </div>

                    {changes.length > 0 && (
                      <div className="bg-gray-800/50 rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-white mb-4">Detected Changes</h3>
                        <div className="max-h-60 overflow-y-auto space-y-2">
                          {changes.map((change, index) => (
                            <div key={index} className="p-3 bg-gray-800 rounded-lg flex items-center">
                              <span className={`mr-3 px-3 py-1 rounded-md text-sm ${
                                change.type === 'modified' 
                                  ? 'bg-yellow-500/20 text-yellow-300' 
                                  : 'bg-green-500/20 text-green-300'
                              }`}>
                                {change.type}
                              </span>
                              <span className="text-gray-300 truncate">{change.path}</span>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={pushChanges}
                          disabled={isProcessing}
                          className="mt-4 w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-3 px-4 rounded-xl hover:from-green-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium"
                        >
                          Push Changes to GitHub
                        </button>
                      </div>
                    )}

                    
                  </div>
                )}

                {status && (
                  <div className={`p-4 rounded-xl ${
                    status.includes('Error') 
                      ? 'bg-red-500/20 text-red-300' 
                      : 'bg-blue-500/20 text-blue-300'
                  }`}>
                    <div className="flex items-center gap-3">
                      {(isRepoFetching || isProcessing) && (
                        <div className="animate-spin w-5 h-5 border-2 border-current rounded-full border-t-transparent" />
                      )}
                      {status}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Instructions Section */}
        <div className="mt-8 bg-black/30 backdrop-blur-lg rounded-2xl p-8 border border-gray-700">
          <h2 className="text-2xl font-bold text-white mb-6">How to Use BoltSync</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ol className="space-y-4 text-gray-300">
              {[
                "Install the GitHub App once, then sign in with GitHub.",
                "Select your repository from the list.",
                "Click 'Open with Bolt' to start working.",
                "Make changes using Bolt prompts, then download your project."
              ].map((step, index) => (
                <li key={index} className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm mr-3 mt-0.5">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <ol className="space-y-4 text-gray-300" start="5">
              {[
                "Return to BoltSync and upload the zip file.",
                "Review detected changes before pushing.",
                "Click 'Push Changes' to update GitHub.",
                "Fetch latest files before making new changes."
              ].map((step, index) => (
                <li key={index} className="flex items-start">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm mr-3 mt-0.5">
                    {index + 5}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div class="mt-8 bg-black/30 backdrop-blur-lg rounded-2xl p-8 md:p-12 lg:p-16 border border-gray-700">
          <h2 class="text-2xl md:text-3xl lg:text-4xl text-center font-bold text-white mb-6">Video Demo</h2>
          <div class="aspect-video">
            <iframe
              class="w-full h-full"
              src="https://www.youtube.com/embed/IneFM6ViV8s"
              title="YouTube video player"
              frameborder="0"
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
            ></iframe>
          </div>
        </div>



        <div className="mt-8 text-center text-gray-400 pb-8">
          <div className="flex items-center justify-center gap-2">
            <span>Made with</span>
            <Heart className="w-5 h-5 text-red-500 animate-pulse" />
            <span>by</span>
            <a 
              href="https://github.com/labhk" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors duration-200"
            >
              <Github className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
