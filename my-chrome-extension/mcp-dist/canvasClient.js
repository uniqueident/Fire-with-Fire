import { Buffer } from "node:buffer";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_PAGES = 5;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_CHARACTERS = 20_000;
const CACHE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 100;
const MIN_REQUEST_INTERVAL_MS = 500;
const MAX_RATE_LIMIT_WAIT_MS = 30_000;
// One client instance owns the token, short-lived cache, and request pacing.
export class CanvasClient {
    baseUrl;
    token;
    responseCache = new Map();
    inFlight = new Map();
    requestQueue = Promise.resolve();
    lastRequestAt = 0;
    constructor(baseUrl, token) {
        this.token = token;
        let parsedUrl;
        try {
            parsedUrl = new URL(baseUrl);
        }
        catch {
            throw new Error("CANVAS_BASE_URL must be a valid HTTPS origin, such as https://school.instructure.com.");
        }
        if (parsedUrl.protocol !== "https:" || parsedUrl.pathname !== "/" || parsedUrl.search || parsedUrl.hash || parsedUrl.username || parsedUrl.password) {
            throw new Error("CANVAS_BASE_URL must be an HTTPS origin without a path, query, or credentials.");
        }
        this.baseUrl = new URL(parsedUrl.origin);
    }
    async listCourses() {
        const courses = await this.getAll("/api/v1/courses?enrollment_state=active&per_page=100");
        return courses.map(({ id, name, course_code, term }) => ({ id, name, courseCode: course_code, term: term?.name }));
    }
    async listCourseMaterials(courseId) {
        // Keep these sequential; a course overview can otherwise burst four Canvas requests at once.
        const modules = await this.getAll(`/api/v1/courses/${courseId}/modules?include%5B%5D=items&per_page=100`);
        const pages = await this.getAll(`/api/v1/courses/${courseId}/pages?per_page=100`);
        const files = await this.listCourseFiles(courseId);
        const assignments = await this.listAssignments(courseId, 50);
        return {
            courseId,
            modules: modules.map(({ id, name, items }) => ({
                id,
                name,
                items: items?.map(({ id: itemId, title, type, content_id, page_url }) => ({
                    id: itemId,
                    title,
                    type,
                    contentId: content_id,
                    pageUrl: page_url,
                })),
            })),
            pages: pages.map(({ url, title }) => ({ url, title })),
            files,
            assignments: assignments.map(({ id, name, dueAt }) => ({ id, name, dueAt })),
        };
    }
    async listAssignments(courseId, limit) {
        const assignments = await this.getAll(`/api/v1/courses/${courseId}/assignments?per_page=100`);
        return assignments.slice(0, limit).map((assignment) => this.assignmentSummary(assignment));
    }
    async getAssignment(courseId, assignmentId) {
        const assignment = await this.get(`/api/v1/courses/${courseId}/assignments/${assignmentId}`);
        return {
            ...this.assignmentSummary(assignment),
            instructions: plainText(assignment.description ?? ""),
            attachments: (assignment.attachments ?? []).map((file) => this.fileSummary(file)),
        };
    }
    async getCoursePage(courseId, pageUrl) {
        const page = await this.get(`/api/v1/courses/${courseId}/pages/${pageUrl}`);
        return { title: page.title, text: plainText(page.body ?? "") };
    }
    async listCourseFiles(courseId) {
        const files = await this.getAll(`/api/v1/courses/${courseId}/files?per_page=100`);
        return files.map((file) => this.fileSummary(file));
    }
    async readCourseFile(fileId) {
        const file = await this.get(`/api/v1/files/${fileId}`);
        const contentType = (file.content_type ?? "").split(";")[0].trim().toLowerCase();
        if (!contentType.startsWith("text/") && contentType !== "application/xhtml+xml") {
            throw new Error(`Canvas file type '${contentType || "unknown"}' is not supported yet. Plain-text and HTML files can be read.`);
        }
        if (typeof file.size === "number" && file.size > MAX_FILE_BYTES) {
            throw new Error(`Canvas file exceeds the ${MAX_FILE_BYTES / 1024 / 1024} MB read limit.`);
        }
        if (!file.url)
            throw new Error("Canvas did not provide a download URL for this file.");
        const downloadUrl = this.validateDownloadUrl(file.url);
        const response = await this.fetchWithRateLimit(downloadUrl, {
            headers: downloadUrl.origin === this.baseUrl.origin ? this.authorizationHeaders() : undefined,
        });
        if (!response.ok)
            throw this.responseError(response.status);
        const rawText = await this.readTextBody(response);
        const extractedText = contentType === "text/html" || contentType === "application/xhtml+xml"
            ? plainText(rawText)
            : rawText;
        return {
            id: file.id,
            name: file.display_name ?? file.filename ?? `Canvas file ${file.id}`,
            contentType,
            text: extractedText.slice(0, MAX_TEXT_CHARACTERS),
            truncated: extractedText.length > MAX_TEXT_CHARACTERS,
        };
    }
    assignmentSummary(assignment) {
        return {
            id: assignment.id,
            name: assignment.name,
            dueAt: assignment.due_at ?? null,
            pointsPossible: assignment.points_possible ?? null,
        };
    }
    fileSummary(file) {
        return {
            id: file.id,
            name: file.display_name ?? file.filename ?? `Canvas file ${file.id}`,
            contentType: file.content_type,
            size: file.size,
        };
    }
    async get(path) {
        const response = await this.getResponse(this.apiUrl(path));
        return response.data;
    }
    async getAll(path) {
        let next = this.apiUrl(path);
        const items = [];
        for (let page = 0; next && page < MAX_PAGES; page += 1) {
            const response = await this.getResponse(next);
            items.push(...response.data);
            next = response.next;
        }
        return items;
    }
    async getResponse(url) {
        const cacheKey = url.href;
        const cached = this.responseCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return {
                data: cached.data,
                next: cached.next ? new URL(cached.next) : undefined,
            };
        }
        if (cached)
            this.responseCache.delete(cacheKey);
        // Share an in-flight read so repeated model tool calls do not duplicate it.
        const pending = this.inFlight.get(cacheKey);
        if (pending)
            return pending;
        const request = this.fetchJsonResponse(url);
        this.inFlight.set(cacheKey, request);
        try {
            const result = await request;
            if (this.responseCache.size >= MAX_CACHE_ENTRIES) {
                const oldestKey = this.responseCache.keys().next().value;
                if (oldestKey)
                    this.responseCache.delete(oldestKey);
            }
            this.responseCache.set(cacheKey, {
                expiresAt: Date.now() + CACHE_TTL_MS,
                data: result.data,
                next: result.next?.href,
            });
            return result;
        }
        finally {
            this.inFlight.delete(cacheKey);
        }
    }
    async fetchJsonResponse(url) {
        const response = await this.fetchWithRateLimit(url, {
            headers: this.authorizationHeaders(),
        });
        if (!response.ok)
            throw this.responseError(response.status);
        const nextLink = response.headers.get("Link")?.match(/<([^>]+)>;\s*rel="?next"?/i)?.[1];
        let next;
        if (nextLink) {
            next = new URL(nextLink, this.baseUrl);
            if (next.origin !== this.baseUrl.origin || !next.pathname.startsWith("/api/v1/")) {
                throw new Error("Canvas returned an invalid pagination URL.");
            }
        }
        return { data: await response.json(), next };
    }
    async fetchWithRateLimit(url, init) {
        const response = await this.queueRequest(url, init);
        if (response.status !== 429)
            return response;
        // Respect Canvas's backoff hint, but never retry indefinitely.
        const retryAfter = this.retryDelay(response.headers.get("Retry-After"));
        await response.body?.cancel();
        await new Promise((resolve) => setTimeout(resolve, retryAfter));
        return this.queueRequest(url, init);
    }
    queueRequest(url, init) {
        // Space request starts and keep Canvas requests from overlapping.
        const request = this.requestQueue.then(async () => {
            const waitMs = MIN_REQUEST_INTERVAL_MS - (Date.now() - this.lastRequestAt);
            if (waitMs > 0)
                await new Promise((resolve) => setTimeout(resolve, waitMs));
            this.lastRequestAt = Date.now();
            return fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        });
        this.requestQueue = request.then(() => undefined, () => undefined);
        return request;
    }
    retryDelay(retryAfter) {
        if (!retryAfter)
            return 1_000;
        const seconds = Number(retryAfter);
        const delay = Number.isFinite(seconds)
            ? seconds * 1_000
            : Date.parse(retryAfter) - Date.now();
        if (!Number.isFinite(delay))
            return 1_000;
        return Math.min(MAX_RATE_LIMIT_WAIT_MS, Math.max(0, delay));
    }
    apiUrl(path) {
        if (!path.startsWith("/api/v1/"))
            throw new Error("Only Canvas API read endpoints are allowed.");
        return new URL(path, this.baseUrl);
    }
    validateDownloadUrl(value) {
        let url;
        try {
            url = new URL(value);
        }
        catch {
            throw new Error("Canvas returned an invalid file URL.");
        }
        if (url.protocol !== "https:" || url.username || url.password) {
            throw new Error("Canvas returned an unsafe file URL.");
        }
        // A Canvas bearer token is sent only to the configured Canvas origin.
        return url;
    }
    authorizationHeaders() {
        return { Authorization: `Bearer ${this.token}`, Accept: "application/json" };
    }
    responseError(status) {
        if (status === 401)
            return new Error("Canvas rejected the token. Check CANVAS_API_TOKEN.");
        if (status === 403)
            return new Error("Canvas denied access to this course or material.");
        if (status === 404)
            return new Error("Canvas course or material was not found or is not accessible.");
        if (status === 429)
            return new Error("Canvas rate limit reached. Try again shortly.");
        return new Error(`Canvas request failed with HTTP ${status}.`);
    }
    async readTextBody(response) {
        if (!response.body)
            return "";
        const reader = response.body.getReader();
        const chunks = [];
        let totalBytes = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                totalBytes += value.byteLength;
                if (totalBytes > MAX_FILE_BYTES) {
                    // Cancel before buffering an oversized file in memory.
                    await reader.cancel();
                    throw new Error(`Canvas file exceeds the ${MAX_FILE_BYTES / 1024 / 1024} MB read limit.`);
                }
                chunks.push(value);
            }
        }
        finally {
            reader.releaseLock();
        }
        return Buffer.concat(chunks).toString("utf8");
    }
}
function plainText(value) {
    const text = value
        .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
        .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s+/g, "\n")
        .trim();
    return text.slice(0, MAX_TEXT_CHARACTERS);
}
