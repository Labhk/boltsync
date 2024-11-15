import AdmZip from "adm-zip";
import simpleGit from "simple-git";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {

  async function parseMultipartFormData(req) {
    const formidable = (await import('formidable')).default;
    return new Promise((resolve, reject) => {
      const form = new formidable.IncomingForm();
      form.parse(req, (err, fields, files) => {
        if (err) {
          reject(err);
        } else {
          resolve({ fields, files });
        }
      });
    });
  }


  if (req.method === "POST") {
    const tempDir = path.join(tmpdir(), `repo-${Date.now()}`);
    try {
      const authHeader = req.headers.authorization;
      const accessToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!accessToken) return res.status(401).json({ message: "Unauthorized - No Access Token." });

      const formData = await parseMultipartFormData(req);

      const { repoName } = formData.fields;
      const zipFile = formData.files.zipFile;

      if (!zipFile || !repoName) {
        return res.status(400).json({ message: "Missing required parameters" });
      }

      fs.mkdirSync(tempDir, { recursive: true });

      const zip = new AdmZip(zipFile.data);
      zip.extractAllTo(tempDir, true);

      const git = simpleGit(tempDir);
      const githubUser = formData.fields.githubUser;

      await git.clone(
        `https://${githubUser}:${accessToken}@github.com/${githubUser}/${repoName}.git`,
        tempDir,
        { '--depth': 1 }
      );

      const diff = await git.diff();

      if (diff.trim() !== "") {
        await git.add("./*");
        await git.commit("Automated update via app");
        await git.push("origin", "main");  // Or the appropriate branch
        res.status(200).json({ message: "Changes pushed to GitHub!" });
      } else {
        res.status(200).json({ message: "No changes detected." });
      }

    } catch (error) {
      console.error("Server-side error:", error);
      res.status(500).json({ message: "Error processing the request", error: error.message });
    } finally {
      if (tempDir) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.error("Cleanup error:", cleanupError);
        }
      }
    }
  } else {
    res.status(405).json({ message: "Method Not Allowed" });
  }
}