import { createServer } from "node:http";
import { z } from "zod";
const BRIDGE_HOST = "127.0.0.1";
const BRIDGE_PORT = 4317;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_OLLAMA_BODY_BYTES = 2 * 1024 * 1024;
const OLLAMA_TIMEOUT_MS = 180_000;
const OLLAMA_BASE_URL = "http://127.0.0.1:11434";
// Keep this proxy allow-listed; callers cannot choose an Ollama URL or path.
const OLLAMA_ROUTES = new Map([
    ["/ollama/api/tags", { method: "GET", path: "/api/tags" }],
    ["/ollama/api/chat", { method: "POST", path: "/api/chat" }],
    ["/ollama/api/generate", { method: "POST", path: "/api/generate" }],
    ["/ollama/api/embeddings", { method: "POST", path: "/api/embeddings" }],
    ["/ollama/api/show", { method: "POST", path: "/api/show" }],
]);
const positiveId = z.preprocess((value) => typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value, z.number().int().positive());
const optionalLimit = z.preprocess((value) => typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value, z.number().int().min(1).max(50)).optional();
const requestSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("list_courses") }),
    z.object({ action: z.literal("list_course_materials"), courseId: positiveId }),
    z.object({ action: z.literal("list_assignments"), courseId: positiveId, limit: optionalLimit }),
    z.object({ action: z.literal("get_assignment"), courseId: positiveId, assignmentId: positiveId }),
    z.object({ action: z.literal("get_course_page"), courseId: positiveId, pageUrl: z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/) }),
    z.object({ action: z.literal("list_course_files"), courseId: positiveId }),
    z.object({ action: z.literal("read_course_file"), fileId: positiveId }),
]);
export function startLocalBridge(canvas, extensionId, devOrigin) {
    if (extensionId && !/^[a-p]{32}$/.test(extensionId)) {
        throw new Error("Set CHROME_EXTENSION_ID to the 32-character ID shown for the unpacked extension at chrome://extensions.");
    }
    // CORS is limited to the actual extension or Vite dev origin, never wildcarded.
    const allowedOrigins = new Set();
    if (extensionId)
        allowedOrigins.add(`chrome-extension://${extensionId}`);
    if (devOrigin) {
        const parsedOrigin = new URL(devOrigin);
        if (parsedOrigin.protocol !== "http:" ||
            !["localhost", "127.0.0.1"].includes(parsedOrigin.hostname) ||
            !parsedOrigin.port ||
            parsedOrigin.origin !== devOrigin) {
            throw new Error("CANVAS_DEV_ORIGIN must be a loopback HTTP origin with an explicit port, such as http://localhost:5173.");
        }
        allowedOrigins.add(devOrigin);
    }
    if (allowedOrigins.size === 0) {
        throw new Error("Configure a Chrome extension ID or a loopback development origin for the local Canvas bridge.");
    }
    const server = createServer((request, response) => {
        void handleRequest(request, response, allowedOrigins, extensionId, canvas);
    });
    server.on("error", (error) => {
        console.error("Canvas local bridge error:", error.message);
    });
    server.listen(BRIDGE_PORT, BRIDGE_HOST, () => {
        console.error(`Canvas local bridge listening on ${BRIDGE_HOST}:${BRIDGE_PORT}`);
    });
}
async function handleRequest(request, response, allowedOrigins, extensionId, canvas) {
    const origin = request.headers.origin;
    const requestExtensionId = request.headers["x-chrome-extension-id"];
    const extensionAuthorized = Boolean(extensionId && requestExtensionId === extensionId);
    if (origin ? !allowedOrigins.has(origin) : !extensionAuthorized) {
        sendJson(response, 403, {
            error: `This local helper only accepts requests from the configured extension. Received Origin: ${origin ?? "(missing)"}.`,
        });
        return;
    }
    if (origin)
        response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Chrome-Extension-Id");
    response.setHeader("Vary", "Origin");
    if (request.headers["access-control-request-private-network"] === "true") {
        response.setHeader("Access-Control-Allow-Private-Network", "true");
    }
    if (request.method === "OPTIONS") {
        response.writeHead(204).end();
        return;
    }
    const ollamaRoute = OLLAMA_ROUTES.get(request.url ?? "");
    if (ollamaRoute && request.method === ollamaRoute.method) {
        await proxyOllama(request, response, ollamaRoute);
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
    }
    catch (error) {
        const isValidationError = error instanceof z.ZodError || error instanceof SyntaxError;
        sendJson(response, isValidationError ? 400 : 502, {
            error: error instanceof Error ? error.message : "Canvas read failed.",
        });
    }
}
async function runCanvasAction(canvas, input) {
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
async function readJson(request) {
    return JSON.parse((await readBody(request, MAX_BODY_BYTES)).toString("utf8"));
}
async function proxyOllama(request, response, route) {
    try {
        let body;
        if (route.method === "POST") {
            body = (await readBody(request, MAX_OLLAMA_BODY_BYTES)).toString("utf8");
            JSON.parse(body);
        }
        // Node makes this request locally, avoiding Ollama's browser-Origin rejection.
        const upstream = await fetch(`${OLLAMA_BASE_URL}${route.path}`, {
            method: route.method,
            headers: body ? { "Content-Type": "application/json" } : undefined,
            body,
            signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
        });
        const payload = Buffer.from(await upstream.arrayBuffer());
        if (payload.byteLength > MAX_OLLAMA_BODY_BYTES) {
            sendJson(response, 502, { error: "Ollama response exceeded the local proxy limit." });
            return;
        }
        response.writeHead(upstream.status, {
            "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
        });
        response.end(payload);
    }
    catch (error) {
        const status = error instanceof SyntaxError ? 400 : 502;
        sendJson(response, status, {
            error: error instanceof Error ? error.message : "Local Ollama request failed.",
        });
    }
}
async function readBody(request, maxBytes) {
    const chunks = [];
    let bytesRead = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytesRead += buffer.byteLength;
        if (bytesRead > maxBytes)
            throw new Error("Request body is too large.");
        chunks.push(buffer);
    }
    return Buffer.concat(chunks);
}
function sendJson(response, status, body) {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
}
