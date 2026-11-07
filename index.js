
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const OWNER = "aaaaubad-byte";
const PORT = process.env.PORT || 3000;

// المستودعات المسموح للخادم بالعمل عليها

const app = express();
app.use(express.json({ limit: "2mb" }));

const repoSchema = z.string().trim().min(1).max(200);

function getRepo(repository = "AMAN.Y") {
  const value = String(repository || "AMAN.Y").trim();
  const parts = value.split("/");

  if (parts.length === 1 && /^[A-Za-z0-9_.-]+$/.test(parts[0])) {
    return `${OWNER}/${parts[0]}`;
  }

  if (
    parts.length === 2 &&
    parts.every((part) => /^[A-Za-z0-9_.-]+$/.test(part))
  ) {
    return `${parts[0]}/${parts[1]}`;
  }

  throw new Error("صيغة المستودع غير صحيحة. استخدم owner/repository.");
}

function encodePath(path = "") {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function githubApi(path, options = {}) {
  if (!process.env.GH_TOKEN) {
    throw new Error("GH_TOKEN غير مضبوط في إعدادات الخادم.");
  }

  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const responseText = await response.text();
  let data;

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = { message: responseText };
  }

  if (!response.ok) {
    throw new Error(
      `GitHub HTTP ${response.status}: ${
        data.message || responseText || "خطأ غير معروف"
      }`
    );
  }

  return data;
}

async function github(repository, path, options = {}) {
  const repo = getRepo(repository);
  return githubApi(`/repos/${repo}${path}`, options);
}

function registerTools(server) {
  // استعراض الملفات
  server.tool(
    "list_files",
    "عرض الملفات والمجلدات في مستودع وفرع محددين.",
    {
      repository: repoSchema.optional().default("AMAN.Y"),
      path: z.string().optional(),
      branch: z.string().optional().default("main"),
    },
    async ({
      repository = "AMAN.Y",
      path = "",
      branch = "main",
    }) => {
      const repo = getRepo(repository);
      const query = `?ref=${encodeURIComponent(branch)}`;

      const data = await github(
        repo,
        `/contents/${encodePath(path)}${query}`
      );

      const items = Array.isArray(data) ? data : [data];

      const result = items.map((item) => ({
        repository: repo,
        branch,
        name: item.name,
        path: item.path,
        type: item.type,
        size: item.size,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // قراءة ملف
  server.tool(
    "read_file",
    "قراءة محتوى ملف من مستودع وفرع محددين.",
    {
      repository: repoSchema.optional().default("AMAN.Y"),
      path: z.string().min(1),
      branch: z.string().optional().default("main"),
    },
    async ({
      repository = "AMAN.Y",
      path,
      branch = "main",
    }) => {
      const repo = getRepo(repository);

      const data = await github(
        repo,
        `/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`
      );

      if (data.type !== "file" || !data.content) {
        throw new Error("المسار ليس ملفًا نصيًا قابلًا للقراءة.");
      }

      const content = Buffer.from(
        data.content,
        "base64"
      ).toString("utf8");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                repository: repo,
                path: data.path,
                branch,
                content,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // إنشاء ملف أو تحديثه
  server.tool(
    "write_file",
    "إنشاء ملف أو تحديثه في مستودع وفرع محددين.",
    {
      repository: repoSchema.optional().default("AMAN.Y"),
      path: z.string().min(1),
      content: z.string(),
      branch: z.string().optional().default("main"),
      message: z.string().optional(),
    },
    async ({
      repository = "AMAN.Y",
      path,
      content,
      branch = "main",
      message = "Update file via AMAN MCP",
    }) => {
      const repo = getRepo(repository);
      let sha;

      try {
        const existing = await github(
          repo,
          `/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`
        );

        sha = existing.sha;
      } catch (error) {
        if (!String(error.message).startsWith("GitHub HTTP 404:")) {
          throw error;
        }
      }

      const body = {
        message,
        content: Buffer.from(content, "utf8").toString("base64"),
        branch,
      };

      if (sha) body.sha = sha;

      const result = await github(
        repo,
        `/contents/${encodePath(path)}`,
        {
          method: "PUT",
          body: JSON.stringify(body),
        }
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                repository: repo,
                path: result.content.path,
                branch,
                commit: result.commit.sha,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // حذف ملف
  server.tool(
    "delete_file",
    "حذف ملف من مستودع وفرع محددين. يتطلب تأكيدًا صريحًا من المستخدم.",
    {
      repository: repoSchema.optional().default("AMAN.Y"),
      path: z.string().min(1),
      branch: z.string().optional().default("main"),
      message: z.string().optional(),
    },
    async ({
      repository = "AMAN.Y",
      path,
      branch = "main",
      message = "Delete file via AMAN MCP",
    }) => {
      const repo = getRepo(repository);

      const existing = await github(
        repo,
        `/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`
      );

      const result = await github(
        repo,
        `/contents/${encodePath(path)}`,
        {
          method: "DELETE",
          body: JSON.stringify({
            message,
            sha: existing.sha,
            branch,
          }),
        }
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                repository: repo,
                path,
                branch,
                commit: result.commit.sha,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // اكتشاف المستودعات التي يستطيع التوكن الحالي الوصول إليها
  server.tool(
    "list_accessible_repositories",
    "عرض المستودعات التي يسمح توكن GitHub الحالي بالوصول إليها، مع صلاحياته الفعلية لكل مستودع.",
    {
      page: z.number().int().min(1).max(100).optional().default(1),
      per_page: z.number().int().min(1).max(100).optional().default(100),
    },
    async ({ page = 1, per_page = 100 }) => {
      const data = await githubApi(
        `/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&per_page=${per_page}&page=${page}`
      );

      const repositories = data.map((item) => ({
        full_name: item.full_name,
        private: item.private,
        default_branch: item.default_branch,
        permissions: item.permissions || {},
      }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ page, per_page, repositories }, null, 2),
        }],
      };
    }
  );

  // معلومات المستودع
  server.tool(
    "get_repository_info",
    "عرض معلومات المستودع والفرع الافتراضي والصلاحيات المتاحة.",
    { repository: repoSchema.optional().default("AMAN.Y") },
    async ({ repository = "AMAN.Y" }) => {
      const data = await github(getRepo(repository), "");
      return { content: [{ type: "text", text: JSON.stringify({
        full_name: data.full_name, description: data.description,
        default_branch: data.default_branch, visibility: data.visibility,
        archived: data.archived, permissions: data.permissions
      }, null, 2) }] };
    }
  );

  // عرض جميع الملفات في الشجرة مع إمكانية التصفية بالمجلد
  server.tool(
    "list_tree",
    "عرض شجرة ملفات المستودع كاملة أو داخل مجلد، مع تحديد الفرع.",
    {
      repository: repoSchema.optional().default("AMAN.Y"),
      branch: z.string().min(1).optional().default("main"),
      path: z.string().optional().default("")
    },
    async ({ repository = "AMAN.Y", branch = "main", path = "" }) => {
      const repo = getRepo(repository);
      const ref = await github(repo, `/git/ref/heads/${encodeURIComponent(branch)}`);
      const commit = await github(repo, `/git/commits/${ref.object.sha}`);
      const tree = await github(repo, `/git/trees/${commit.tree.sha}?recursive=1`);
      const prefix = path.replace(/^\/+|\/+$/g, "");
      const entries = (tree.tree || []).filter(item =>
        !prefix || item.path === prefix || item.path.startsWith(prefix + "/")
      ).map(item => ({ path: item.path, type: item.type, size: item.size, sha: item.sha }));
      return { content: [{ type: "text", text: JSON.stringify({
        repository: repo, branch, truncated: tree.truncated || false, entries
      }, null, 2) }] };
    }
  );

  // عرض الفروع
  server.tool(
    "list_branches",
    "عرض فروع المستودع مع آخر التزام لكل فرع.",
    { repository: repoSchema.optional().default("AMAN.Y"), page: z.number().int().min(1).max(100).optional().default(1) },
    async ({ repository = "AMAN.Y", page = 1 }) => {
      const repo = getRepo(repository);
      const data = await github(repo, `/branches?per_page=100&page=${page}`);
      return { content: [{ type: "text", text: JSON.stringify(data.map(b => ({
        name: b.name, commit: b.commit.sha, protected: b.protected
      })), null, 2) }] };
    }
  );

  // سجل الالتزامات وتاريخ ملف محدد
  server.tool(
    "list_commits",
    "عرض سجل الالتزامات، ويمكن تقييده بفرع أو ملف محدد.",
    {
      repository: repoSchema.optional().default("AMAN.Y"),
      branch: z.string().optional().default("main"),
      path: z.string().optional(),
      per_page: z.number().int().min(1).max(100).optional().default(30)
    },
    async ({ repository = "AMAN.Y", branch = "main", path, per_page = 30 }) => {
      const repo = getRepo(repository);
      const params = new URLSearchParams({ sha: branch, per_page: String(per_page) });
      if (path) params.set("path", path);
      const data = await github(repo, `/commits?${params}`);
      return { content: [{ type: "text", text: JSON.stringify(data.map(c => ({
        sha: c.sha, message: c.commit.message, author: c.commit.author,
        date: c.commit.author?.date, url: c.html_url
      })), null, 2) }] };
    }
  );

  // مقارنة فرعين أو التزامين
  server.tool(
    "compare_refs",
    "مقارنة فرعين أو التزامين وإظهار الملفات والتغييرات.",
    {
      repository: repoSchema.optional().default("AMAN.Y"),
      base: z.string().min(1),
      head: z.string().min(1)
    },
    async ({ repository = "AMAN.Y", base, head }) => {
      const repo = getRepo(repository);
      const data = await github(repo, `/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
      return { content: [{ type: "text", text: JSON.stringify({
        status: data.status, ahead_by: data.ahead_by, behind_by: data.behind_by,
        total_commits: data.total_commits,
        files: (data.files || []).map(f => ({
          filename: f.filename, status: f.status, additions: f.additions,
          deletions: f.deletions, changes: f.changes, patch: f.patch
        }))
      }, null, 2) }] };
    }
  );

  // إنشاء فرع من فرع/التزام معروف
  server.tool(
    "create_branch",
    "إنشاء فرع جديد انطلاقًا من فرع أو التزام محدد.",
    {
      repository: repoSchema.optional().default("AMAN.Y"),
      branch_name: z.string().min(1),
      source: z.string().min(1).optional().default("main")
    },
    async ({ repository = "AMAN.Y", branch_name, source = "main" }) => {
      const repo = getRepo(repository);
      const sourceRef = source.match(/^[0-9a-f]{40}$/i)
        ? source
        : (await github(repo, `/git/ref/heads/${encodeURIComponent(source)}`)).object.sha;
      const created = await github(repo, "/git/refs", {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branch_name}`, sha: sourceRef })
      });
      return { content: [{ type: "text", text: JSON.stringify({
        success: true, branch: created.ref.replace("refs/heads/", ""),
        sha: created.object.sha
      }, null, 2) }] };
    }
  );
}

app.get("/", (_req, res) => {
  res.type("text").send("AMAN MCP server is running.");
});

app.all("/mcp", async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Use POST for MCP requests.");
  }

  const server = new McpServer({
    name: "aman-multi-repo-mcp",
    version: "2.0.0",
  });

  registerTools(server);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error.message);

    if (!res.headersSent) {
      res.status(500).json({
        error: "MCP request failed",
      });
    }
  } finally {
    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AMAN MCP server listening on port ${PORT}`);
});
