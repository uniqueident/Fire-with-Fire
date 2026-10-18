/// <reference types="node" />

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { argv, env } from "node:process";
import { CanvasClient } from "./canvasClient.js";
import { startLocalBridge } from "./localBridge.js";

function createServer(canvas: CanvasClient): McpServer {
  const server = new McpServer({ name: "canvas-education", version: "0.1.0" });
  const readOnly = { readOnlyHint: true, destructiveHint: false };
  const result = (value: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  });

  server.registerTool(
    "list_courses",
    {
      description: "List active Canvas courses available to the authenticated user.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    async () => result(await canvas.listCourses()),
  );

  server.registerTool(
    "list_course_materials",
    {
      description: "List modules, pages, files, and assignments in a Canvas course.",
      inputSchema: z.object({ courseId: z.number().int().positive() }),
      annotations: readOnly,
    },
    async ({ courseId }) => result(await canvas.listCourseMaterials(courseId)),
  );

  server.registerTool(
    "list_assignments",
    {
      description: "List compact assignment metadata, including titles, due dates, and points possible, for a course.",
      inputSchema: z.object({
        courseId: z.number().int().positive(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      annotations: readOnly,
    },
    async ({ courseId, limit }) => result(await canvas.listAssignments(courseId, limit ?? 25)),
  );

  server.registerTool(
    "get_assignment",
    {
      description: "Read one Canvas assignment's details and sanitized instructions. This tool cannot submit work.",
      inputSchema: z.object({
        courseId: z.number().int().positive(),
        assignmentId: z.number().int().positive(),
      }),
      annotations: readOnly,
    },
    async ({ courseId, assignmentId }) => result(await canvas.getAssignment(courseId, assignmentId)),
  );

  server.registerTool(
    "get_course_page",
    {
      description: "Read the sanitized text of a Canvas course page by its page URL slug.",
      inputSchema: z.object({
        courseId: z.number().int().positive(),
        pageUrl: z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/),
      }),
      annotations: readOnly,
    },
    async ({ courseId, pageUrl }) => result(await canvas.getCoursePage(courseId, pageUrl)),
  );

  server.registerTool(
    "list_course_files",
    {
      description: "List Canvas course files by ID and metadata. Download URLs are not returned.",
      inputSchema: z.object({ courseId: z.number().int().positive() }),
      annotations: readOnly,
    },
    async ({ courseId }) => result(await canvas.listCourseFiles(courseId)),
  );

  server.registerTool(
    "read_course_file",
    {
      description: "Read bounded plain-text or HTML content from an accessible Canvas course file. Other file types are not extracted.",
      inputSchema: z.object({ fileId: z.number().int().positive() }),
      annotations: readOnly,
    },
    async ({ fileId }) => result(await canvas.readCourseFile(fileId)),
  );

  return server;
}

const canvasBaseUrl = env.CANVAS_BASE_URL;
const canvasToken = env.CANVAS_API_TOKEN;

if (!canvasBaseUrl || !canvasToken) {
  console.error("Set CANVAS_BASE_URL and CANVAS_API_TOKEN before starting the Canvas MCP server.");
  process.exitCode = 1;
} else {
  try {
    const canvas = new CanvasClient(canvasBaseUrl, canvasToken);
    if (argv.includes("--bridge")) {
      if (argv.includes("--dev")) {
        const devOrigin = env.CANVAS_DEV_ORIGIN ?? "http://localhost:5173";
        startLocalBridge(canvas, undefined, devOrigin);
      } else {
        if (!env.CHROME_EXTENSION_ID) throw new Error("Set CHROME_EXTENSION_ID before starting the local Canvas bridge.");
        startLocalBridge(canvas, env.CHROME_EXTENSION_ID);
      }
    } else {
      serveStdio(() => createServer(canvas), {
        onerror: (error) => console.error("Canvas MCP server error:", error.message),
      });
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Canvas MCP server configuration failed.");
    process.exitCode = 1;
  }
}