import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import type { CanvasClient } from "./canvasClient.js";

const BRIDGE_HOST = "127.0.0.1";
const BRIDGE_PORT = 4317;
const MAX_BODY_BYTES = 16 * 1024;
const positiveId = z.preprocess(
  (value) => typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value,
  z.number().int().positive(),
);
const optionalLimit = z.preprocess(
  (value) => typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value,
  z.number().int().min(1).max(50),
).optional();

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list_courses") }),
  z.object({ action: z.literal("list_course_materials"), courseId: positiveId }),
  z.object({ action: z.literal("list_assignments"), courseId: positiveId, limit: optionalLimit }),
  z.object({ action: z.literal("get_assignment"), courseId: positiveId, assignmentId: positiveId }),
  z.object({ action: z.literal("get_course_page"), courseId: positiveId, pageUrl: z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/) }),
  z.object({ action: z.literal("list_course_files"), courseId: positiveId }),
  z.object({ action: z.literal("read_course_file"), fileId: positiveId }),
]);

export function startLocalBridge(canvas: CanvasClient, extensionId?: string, devOrigin?: string): void {
  if (extensionId && !/^[a-p]{32}$/.test(extensionId)) {
    throw new Error("Set CHROME_EXTENSION_ID to the 32-character ID shown for the unpacked extension at chrome://extensions.");
  }

  const allowedOrigins = new Set<string>();
  if (extensionId) allowedOrigins.add(`chrome-extension://${extensionId}`);
  if (devOrigin) {
    const parsedOrigin = new URL(devOrigin);
    if (
      parsedOrigin.protocol !== "http:" ||
      !["localhost", "127.0.0.1"].includes(parsedOrigin.hostname) ||
      !parsedOrigin.port ||
      parsedOrigin.origin !== devOrigin
    ) {
      throw new Error("CANVAS_DEV_ORIGIN must be a loopback HTTP origin with an explicit port, such as http://localhost:5173.");
    }
    allowedOrigins.add(devOrigin);
  }
  if (allowedOrigins.size === 0) {
    throw new Error("Configure a Chrome extension ID or a loopback development origin for the local Canvas bridge.");
  }

  const server = createServer((request, response) => {
    void handleRequest(request, response, allowedOrigins, canvas);
  });

  server.on("error", (error) => {
    console.error("Canvas local bridge error:", error.message);
  });
  server.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
    console.error(`Canvas local bridge listening on ${BRIDGE_HOST}:${BRIDGE_PORT}`);
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: Set<string>,
  canvas: CanvasClient,
): Promise<void> {
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) {
    sendJson(response, 403, { error: "This local helper only accepts requests from the configured extension." });
    return;
  }

  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Vary", "Origin");
  if (request.headers["access-control-request-private-network"] === "true") {
    response.setHeader("Access-Control-Allow-Private-Network", "true");
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
  if (request.method !== "POST" || request.url !== "/tools/call") {
    sendJson(response, 404, { error: "Local helper route not found." });
    return;
  }

  try {
    const input = requestSchema.parse(await readJson(request));
    const result = await runCanvasAction(canvas, input);
    sendJson(response, 200, { result });
  } catch (error) {
    const isValidationError = error instanceof z.ZodError || error instanceof SyntaxError;
    sendJson(response, isValidationError ? 400 : 502, {
      error: error instanceof Error ? error.message : "Canvas read failed.",
    });
  }
}

async function runCanvasAction(canvas: CanvasClient, input: z.infer<typeof requestSchema>): Promise<unknown> {
  switch (input.action) {
    case "list_courses":
      return canvas.listCourses();
    case "list_course_materials":
      return canvas.listCourseMaterials(input.courseId);
    case "list_assignments":
      return canvas.listAssignments(input.courseId, input.limit ?? 25);
    case "get_assignment":
      return canvas.getAssignment(input.courseId, input.assignmentId);
    case "get_course_page":
      return canvas.getCoursePage(input.courseId, input.pageUrl);
    case "list_course_files":
      return canvas.listCourseFiles(input.courseId);
    case "read_course_file":
      return canvas.readCourseFile(input.fileId);
  }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytesRead = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytesRead += buffer.byteLength;
    if (bytesRead > MAX_BODY_BYTES) throw new Error("Tool request is too large.");
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}