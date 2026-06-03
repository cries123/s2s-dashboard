import serverless from 'serverless-http';
import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createApiApp } from '../../server.ts';

type ServerlessHandler = ReturnType<typeof serverless>;

let cached: ServerlessHandler | null = null;

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  context.callbackWaitsForEmptyEventLoop = false;

  if (!cached) {
    const app = await createApiApp();
    cached = serverless(app, {
      request(
        req: { url?: string; headers?: Record<string, string | string[] | undefined> },
        _event: HandlerEvent
      ) {
        // Preserve the public URL path (/api/...) when Netlify invokes the function.
        if (event.rawUrl) {
          try {
            req.url = new URL(event.rawUrl).pathname + (new URL(event.rawUrl).search || '');
          } catch {
            req.url = event.path;
          }
        } else {
          req.url = event.path;
        }
      },
    });
  }

  return cached(event, context);
};
