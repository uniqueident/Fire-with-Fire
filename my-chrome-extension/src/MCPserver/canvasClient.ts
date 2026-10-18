import { Buffer } from "node:buffer";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_PAGES = 5;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_CHARACTERS = 20_000;

interface CanvasCourse {
  id: number;
  name: string;
  course_code?: string;
  term?: { name?: string };
}

interface CanvasAssignment {
  id: number;
  name: string;
  due_at?: string | null;
  points_possible?: number | null;
  description?: string | null;
  html_url?: string;
  attachments?: CanvasFile[];
}

interface CanvasFile {
  id: number;
  display_name?: string;
  filename?: string;
  content_type?: string;
  size?: number;
  url?: string;
}

interface CanvasPage {
  url: string;
  title: string;
  body?: string | null;
}

interface CanvasModule {
  id: number;
  name: string;
  items?: Array<{
    id: number;
    title: string;
    type: string;
    content_id?: number;
    page_url?: string;
  }>;
}

interface CanvasResponse<T> {
  data: T;
  next?: URL;
}

export class CanvasClient {
  private readonly baseUrl: URL;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.token = token;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(baseUrl);
    } catch {
      throw new Error("CANVAS_BASE_URL must be a valid HTTPS origin, such as https://school.instructure.com.");
    }

    if (parsedUrl.protocol !== "https:" || parsedUrl.pathname !== "/" || parsedUrl.search || parsedUrl.hash || parsedUrl.username || parsedUrl.password) {
      throw new Error("CANVAS_BASE_URL must be an HTTPS origin without a path, query, or credentials.");
    }

    this.baseUrl = new URL(parsedUrl.origin);
  }

  async listCourses() {
    const courses = await this.getAll<CanvasCourse>("/api/v1/courses?enrollment_state=active&per_page=100");
    return courses.map(({ id, name, course_code, term }) => ({ id, name, courseCode: course_code, term: term?.name }));
  }

  async listCourseMaterials(courseId: number) {
    const [modules, pages, files, assignments] = await Promise.all([
      this.getAll<CanvasModule>(`/api/v1/courses/${courseId}/modules?include%5B%5D=items&per_page=100`),
      this.getAll<CanvasPage>(`/api/v1/courses/${courseId}/pages?per_page=100`),
      this.listCourseFiles(courseId),
      this.listAssignments(courseId, 50),
    ]);

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

  async listAssignments(courseId: number, limit: number) {
    const assignments = await this.getAll<CanvasAssignment>(`/api/v1/courses/${courseId}/assignments?per_page=100`);
    return assignments.slice(0, limit).map((assignment) => this.assignmentSummary(assignment));
  }

  async getAssignment(courseId: number, assignmentId: number) {
    const assignment = await this.get<CanvasAssignment>(`/api/v1/courses/${courseId}/assignments/${assignmentId}`);
    return {
      ...this.assignmentSummary(assignment),
      instructions: plainText(assignment.description ?? ""),
      attachments: (assignment.attachments ?? []).map((file) => this.fileSummary(file)),
    };
  }

  async getCoursePage(courseId: number, pageUrl: string) {
    const page = await this.get<CanvasPage>(`/api/v1/courses/${courseId}/pages/${pageUrl}`);
    return { title: page.title, text: plainText(page.body ?? "") };
  }

  async listCourseFiles(courseId: number) {
    const files = await this.getAll<CanvasFile>(`/api/v1/courses/${courseId}/files?per_page=100`);
    return files.map((file) => this.fileSummary(file));
  }

  async readCourseFile(fileId: number) {
    const file = await this.get<CanvasFile>(`/api/v1/files/${fileId}`);
    const contentType = (file.content_type ?? "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("text/") && contentType !== "application/xhtml+xml") {
      throw new Error(`Canvas file type '${contentType || "unknown"}' is not supported yet. Plain-text and HTML files can be read.`);
    }
    if (typeof file.size === "number" && file.size > MAX_FILE_BYTES) {
      throw new Error(`Canvas file exceeds the ${MAX_FILE_BYTES / 1024 / 1024} MB read limit.`);
    }
    if (!file.url) throw new Error("Canvas did not provide a download URL for this file.");

    const downloadUrl = this.validateDownloadUrl(file.url);
    const response = await fetch(downloadUrl, {
      headers: downloadUrl.origin === this.baseUrl.origin ? this.authorizationHeaders() : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw this.responseError(response.status);

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

  private assignmentSummary(assignment: CanvasAssignment) {
    return {
      id: assignment.id,
      name: assignment.name,
      dueAt: assignment.due_at ?? null,
      pointsPossible: assignment.points_possible ?? null,
    };
  }

  private fileSummary(file: CanvasFile) {
    return {
      id: file.id,
      name: file.display_name ?? file.filename ?? `Canvas file ${file.id}`,
      contentType: file.content_type,
      size: file.size,
    };
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.getResponse<T>(this.apiUrl(path));
    return response.data;
  }

  private async getAll<T>(path: string): Promise<T[]> {
    let next: URL | undefined = this.apiUrl(path);
    const items: T[] = [];

    for (let page = 0; next && page < MAX_PAGES; page += 1) {
      const response: CanvasResponse<T[]> = await this.getResponse<T[]>(next);
      items.push(...response.data);
      next = response.next;
    }

    return items;
  }

  private async getResponse<T>(url: URL): Promise<CanvasResponse<T>> {
    const response = await fetch(url, {
      headers: this.authorizationHeaders(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw this.responseError(response.status);

    const nextLink = response.headers.get("Link")?.match(/<([^>]+)>;\s*rel="?next"?/i)?.[1];
    let next: URL | undefined;
    if (nextLink) {
      next = new URL(nextLink, this.baseUrl);
      if (next.origin !== this.baseUrl.origin || !next.pathname.startsWith("/api/v1/")) {
        throw new Error("Canvas returned an invalid pagination URL.");
      }
    }

    return { data: await response.json() as T, next };
  }

  private apiUrl(path: string): URL {
    if (!path.startsWith("/api/v1/")) throw new Error("Only Canvas API read endpoints are allowed.");
    return new URL(path, this.baseUrl);
  }

  private validateDownloadUrl(value: string): URL {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error("Canvas returned an invalid file URL.");
    }
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new Error("Canvas returned an unsafe file URL.");
    }
    return url;
  }

  private authorizationHeaders() {
    return { Authorization: `Bearer ${this.token}`, Accept: "application/json" };
  }

  private responseError(status: number): Error {
    if (status === 401) return new Error("Canvas rejected the token. Check CANVAS_API_TOKEN.");
    if (status === 403) return new Error("Canvas denied access to this course or material.");
    if (status === 404) return new Error("Canvas course or material was not found or is not accessible.");
    if (status === 429) return new Error("Canvas rate limit reached. Try again shortly.");
    return new Error(`Canvas request failed with HTTP ${status}.`);
  }

  private async readTextBody(response: Response): Promise<string> {
    if (!response.body) return "";
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_FILE_BYTES) {
          await reader.cancel();
          throw new Error(`Canvas file exceeds the ${MAX_FILE_BYTES / 1024 / 1024} MB read limit.`);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    return Buffer.concat(chunks).toString("utf8");
  }
}

function plainText(value: string): string {
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