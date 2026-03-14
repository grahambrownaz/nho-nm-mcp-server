import { getMCPTools } from '@/lib/mcp-client';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { name, description, category, size, html_front, html_back, css_styles, is_public } = body;

    if (!name || !html_front) {
      return Response.json(
        { success: false, error: 'name and html_front are required' },
        { status: 400 }
      );
    }

    const tools = await getMCPTools();
    const uploadTool = tools['upload_template'];

    if (!uploadTool || !('execute' in uploadTool) || typeof uploadTool.execute !== 'function') {
      return Response.json(
        { success: false, error: 'upload_template tool not available' },
        { status: 503 }
      );
    }

    const result = await uploadTool.execute(
      { name, description, category, size, html_front, html_back, css_styles, is_public },
      { toolCallId: `save-template-${Date.now()}`, messages: [] }
    );

    const parsed = typeof result === 'string' ? JSON.parse(result) : result;

    return Response.json(parsed);
  } catch (error) {
    console.error('[save-template] Error:', error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
