
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const OWNER = "aaaaubad-byte";
const PORT = process.env.PORT || 3000;

// المستودعات المسموح للخادم بالعمل عليها
const ALLOWED_REPOS = ["AMAN.Y", "AMAN.C"];

const app = express();
app.use(express.json({ limit: "2mb" }));

const repoSchema = z.enum(["AMAN.Y", "AMAN.C"]);

function getRepo(repository = "AMAN.Y") {
  const parsed = repoSchema.safeParse(repository);

  if (!parsed.success || !ALLOWED_REPOS.includes(repository)) {
    throw new Error("المستودع غير مسموح به.");
  }

  return parsed.data;
}

function encodePath(path = "") {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function github(repository, path, options = {}) {
  const repo = getRepo(repository);

  if (!process.env.GH_TOKEN) {
    throw new Error("GH_TOKEN غير مضبوط في إعدادات الخادم.");
  }

  const response = await fetch(
    `https://api.github.com/repos/${OWNER}/${repo}${path}`,
    {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        ...options.headers,
      },
    }
  );

  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    throw new Error(
      `GitHub HTTP ${response.status}: ${
        data.message || text || "خطأ غير معروف"
      }`
    );
  }

  return data;
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
