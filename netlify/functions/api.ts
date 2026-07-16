import serverless from 'serverless-http';
import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createApiApp } from '../../server.ts';

type ServerlessHandler = ReturnType<typeof serverless>;

let cached: ServerlessHandler | null = null;

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Long-running PBS sync executes in pbs-sync-background, not in this function.
  context.callbackWaitsForEmptyEventLoop = false;

  if (!cached) {
    const app = await createApiApp();
    cached = serverless(app, {
      request(
        req: { url?: string; headers?: Record<string, string | string[] | undefined> },
        incomingEvent: HandlerEvent
      ) {
        // Use the current invocation's event — not the cold-start event — or every warm
        // request would keep hitting the first URL (e.g. GET /api/pbs/sync/status).
        if (incomingEvent.rawUrl) {
          try {
            const url = new URL(incomingEvent.rawUrl);
            req.url = url.pathname + (url.search || '');
          } catch {
            req.url = incomingEvent.path;
          }
        } else {
          req.url = incomingEvent.path;
        }
      },
    });
  }

  return cached(event, context);
};
