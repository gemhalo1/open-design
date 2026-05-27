import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleMcpToolCall } from '../src/mcp.js';

const originalFetch = globalThis.fetch;

function firstText(result: { content: Array<{ text: string }> }): string {
  const item = result.content[0];
  if (!item) throw new Error('expected MCP text content');
  return item.text;
}

// These tools let a coding agent (Codex, Cursor, …) commission Open
// Design to generate a design and then poll for the result, instead of
// only reading/creating raw artifacts. The agent never runs a skill
// itself — it asks the daemon to, and the daemon spawns its own agent.
describe('public MCP discovery + generation tools', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it('list_skills proxies GET /api/skills', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('http://127.0.0.1:17456/api/skills');
      return new Response(JSON.stringify({ skills: [{ id: 'deck', name: 'Deck' }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'list_skills', {});
    expect(JSON.parse(firstText(result))).toEqual({ skills: [{ id: 'deck', name: 'Deck' }] });
  });

  it('list_plugins proxies GET /api/plugins', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('http://127.0.0.1:17456/api/plugins');
      return new Response(JSON.stringify({ plugins: [{ id: 'pitch-deck', name: 'Pitch Deck' }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'list_plugins', {});
    expect(JSON.parse(firstText(result))).toEqual({ plugins: [{ id: 'pitch-deck', name: 'Pitch Deck' }] });
  });

  it('start_run resolves a project name and POSTs /api/runs with the prompt + plugin + inputs', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/projects')) {
        return new Response(JSON.stringify({ projects: [{ id: 'project-1', name: 'Demo' }] }), { status: 200 });
      }
      expect(url).toBe('http://127.0.0.1:17456/api/runs');
      expect(init?.method).toBe('POST');
      return new Response(JSON.stringify({ runId: 'run-42', pluginId: 'pitch-deck' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'start_run', {
      project: 'Demo',
      prompt: 'A 5-slide seed pitch deck',
      plugin: 'pitch-deck',
      inputs: { tone: 'bold' },
      agent: 'claude',
      model: 'claude-opus-4-7',
    });

    const postBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(postBody).toEqual({
      projectId: 'project-1',
      message: 'A 5-slide seed pitch deck',
      pluginId: 'pitch-deck',
      pluginInputs: { tone: 'bold' },
      agentId: 'claude',
      model: 'claude-opus-4-7',
    });
    expect(JSON.parse(firstText(result))).toMatchObject({ runId: 'run-42' });
  });

  it('start_run uses the active project when project is omitted', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/api/active')) {
        return new Response(JSON.stringify({ active: true, projectId: 'active-1', projectName: 'Active', fileName: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ runId: 'run-7' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'start_run', { prompt: 'iterate' });

    const postBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(postBody).toMatchObject({ projectId: 'active-1', message: 'iterate' });
    expect(JSON.parse(firstText(result))).toMatchObject({
      runId: 'run-7',
      usedActiveContext: { projectId: 'active-1' },
    });
  });

  it('start_run rejects non-object inputs before posting', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/projects')) {
        return new Response(JSON.stringify({ projects: [{ id: 'project-1', name: 'Demo' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ runId: 'unused' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'start_run', {
      project: 'Demo',
      inputs: 'not-an-object',
    });

    expect(result).toMatchObject({ isError: true });
    expect(firstText(result)).toContain('inputs must be an object');
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/api/runs'))).toBe(false);
  });

  it('get_run returns status and, on success, a previewUrl built from the project entry file', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/runs/run-42')) {
        return new Response(JSON.stringify({ id: 'run-42', status: 'succeeded', projectId: 'project-1' }), { status: 200 });
      }
      if (url.endsWith('/api/projects/project-1')) {
        return new Response(JSON.stringify({ project: { id: 'project-1', metadata: { entryFile: 'index.html' } } }), { status: 200 });
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'get_run', { runId: 'run-42' });
    const parsed = JSON.parse(firstText(result));
    expect(parsed).toMatchObject({ id: 'run-42', status: 'succeeded' });
    expect(parsed.previewUrl).toBe('http://127.0.0.1:17456/api/projects/project-1/raw/index.html');
  });

  it('get_run does not add a previewUrl while the run is still running', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('http://127.0.0.1:17456/api/runs/run-99');
      return new Response(JSON.stringify({ id: 'run-99', status: 'running', projectId: 'project-1' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'get_run', { runId: 'run-99' });
    const parsed = JSON.parse(firstText(result));
    expect(parsed.status).toBe('running');
    expect(parsed.previewUrl).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('get_run requires a runId', async () => {
    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'get_run', {});
    expect(result).toMatchObject({ isError: true });
    expect(firstText(result)).toContain('runId is required');
  });

  it('cancel_run POSTs /api/runs/:id/cancel', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://127.0.0.1:17456/api/runs/run-42/cancel');
      expect(init?.method).toBe('POST');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'cancel_run', { runId: 'run-42' });
    expect(JSON.parse(firstText(result))).toEqual({ ok: true });
  });

  it('create_project derives a slug id from the name and POSTs /api/projects', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://127.0.0.1:17456/api/projects');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ project: { id: body.id, name: body.name }, conversationId: 'c1' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'create_project', {
      name: 'Demo Deck',
      designSystem: 'stripe',
    });

    const postBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(postBody.name).toBe('Demo Deck');
    expect(postBody.id).toMatch(/^demo-deck-[0-9a-f]{4}$/);
    expect(postBody.designSystemId).toBe('stripe');
    expect(JSON.parse(firstText(result))).toMatchObject({ project: { name: 'Demo Deck' }, conversationId: 'c1' });
  });

  it('create_project honors an explicit id', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ project: { id: body.id, name: body.name }, conversationId: 'c1' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await handleMcpToolCall('http://127.0.0.1:17456', 'create_project', { name: 'My Site', id: 'fixed-id' });
    const postBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(postBody.id).toBe('fixed-id');
  });

  it('create_project requires a name before posting', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'create_project', {});
    expect(result).toMatchObject({ isError: true });
    expect(firstText(result)).toContain('name is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  const PROJECT_UUID = '11111111-1111-1111-1111-111111111111';

  it('get_project includes a browser-openable previewUrl from metadata.entryFile', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe(`http://127.0.0.1:17456/api/projects/${PROJECT_UUID}`);
      return new Response(
        JSON.stringify({ project: { id: PROJECT_UUID, name: 'P1', metadata: { entryFile: 'index.html', kind: 'landing' } } }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'get_project', { project: PROJECT_UUID });
    const parsed = JSON.parse(firstText(result));
    expect(parsed.entryFile).toBe('index.html');
    expect(parsed.previewUrl).toBe(`http://127.0.0.1:17456/api/projects/${PROJECT_UUID}/raw/index.html`);
  });

  it('get_project omits previewUrl when the project has no entry file', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ project: { id: PROJECT_UUID, name: 'P1', metadata: {} } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'get_project', { project: PROJECT_UUID });
    const parsed = JSON.parse(firstText(result));
    expect(parsed.previewUrl).toBeUndefined();
  });
});
