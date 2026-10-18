import type { OllamaTool } from './ollama';

const CANVAS_BRIDGE_URL = 'http://127.0.0.1:4317/tools/call';

export const canvasReadTool: OllamaTool = {
  type: 'function',
  function: {
    name: 'canvas_read',
    description: 'Read Canvas courses and course materials. This tool cannot submit or change coursework.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'list_courses',
            'list_course_materials',
            'list_assignments',
            'get_assignment',
            'get_course_page',
            'list_course_files',
            'read_course_file',
          ],
        },
        courseId: { type: 'integer', minimum: 1 },
        assignmentId: { type: 'integer', minimum: 1 },
        pageUrl: { type: 'string', pattern: '^[A-Za-z0-9_-]+$' },
        fileId: { type: 'integer', minimum: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['action'],
    },
  },
};

export async function callCanvasReadTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (name !== canvasReadTool.function.name) {
    throw new Error(`Unknown local tool: ${name}`);
  }

  const normalizedArgs = Object.fromEntries(
    Object.entries(args).filter(([, value]) => value !== null && value !== undefined),
  );
  const response = await fetch(CANVAS_BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizedArgs),
  });
  const result = await response.json() as { error?: string };
  if (!response.ok) {
    throw new Error(result.error ?? `Canvas helper failed with HTTP ${response.status}.`);
  }
  return result;
}