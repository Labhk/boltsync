import React, { useState } from 'react';
import JSZip from 'jszip';

const ZipFileViewer = () => {
  const [fileStructure, setFileStructure] = useState({});
  const [currentPath, setCurrentPath] = useState([]);
  const [fileContent, setFileContent] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !file.name.endsWith('.zip')) {
      alert('Please upload a zip file');
      return;
    }

    setLoading(true);
    try {
      const zip = new JSZip();
      const zipContents = await zip.loadAsync(file);
      const structure = {};

      // Process all files in the zip
      for (const [path, file] of Object.entries(zipContents.files)) {
        let current = structure;
        const parts = path.split('/');

        // Skip if it's a directory entry
        if (file.dir && parts[parts.length - 1] === '') {
          parts.pop();
        }

        // Build nested structure
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (i === parts.length - 1 && !file.dir) {
            // It's a file
            current[part] = {
              type: 'file',
              ref: file,
              name: part
            };
          } else {
            // It's a directory
            if (!current[part]) {
              current[part] = {
                type: 'directory',
                contents: {}
              };
            }
            current = current[part].contents;
          }
        }
      }

      // Check if the structure has a top-level 'project' folder and set initial path
      if (structure['project']) {
        setCurrentPath(['project']);
      }

      setFileStructure(structure);
      setFileContent(null);
    } catch (error) {
      console.error('Error processing zip file:', error);
      alert('Error processing zip file');
    }
    setLoading(false);
  };

  const getCurrentFolder = () => {
    let current = fileStructure;
    for (const folder of currentPath) {
      current = current[folder].contents;
    }
    return current;
  };

  const handleFolderClick = (folderName) => {
    setCurrentPath([...currentPath, folderName]);
    setFileContent(null);
  };

  const handleFileClick = async (file) => {
    try {
      setLoading(true);
      const content = await file.ref.async('string');
      setFileContent(content);
    } catch (error) {
      console.error('Error reading file:', error);
      alert('Error reading file');
    }
    setLoading(false);
  };

  const handleBack = () => {
    setCurrentPath(currentPath.slice(0, -1));
    setFileContent(null);
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="mb-4">
        <input
          type="file"
          accept=".zip"
          onChange={handleFileUpload}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
      </div>

      {loading && (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      )}

      {Object.keys(fileStructure).length > 0 && (
        <div className="border rounded-lg shadow-sm">
          <div className="bg-gray-50 px-4 py-2 border-b">
            <div className="flex items-center space-x-2">
              {currentPath.length > 0 && (
                <button
                  onClick={handleBack}
                  className="text-blue-600 hover:text-blue-800"
                >
                  ← Back
                </button>
              )}
              <span className="text-gray-600">
                /{currentPath.join('/')}
              </span>
            </div>
          </div>

          <div className="divide-y">
            {Object.entries(getCurrentFolder()).map(([name, item]) => (
              <div
                key={name}
                className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center"
                onClick={() => item.type === 'directory' ? handleFolderClick(name) : handleFileClick(item)}
              >
                <span className="mr-2">
                  {item.type === 'directory' ? '📁' : '📄'}
                </span>
                {name}
              </div>
            ))}
          </div>
        </div>
      )}

      {fileContent && (
        <div className="mt-4 border rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-2">File Content:</h3>
          <pre className="bg-gray-50 p-4 rounded overflow-auto max-h-96">
            {fileContent}
          </pre>
        </div>
      )}
    </div>
  );
};

export default ZipFileViewer;
