import compression = require('compression');
import type { RequestHandler } from 'express';

export function createResponseCompression(): RequestHandler {
  return compression({
    threshold: 1024,
    level: 4,
    filter: (request, response) => {
      const contentType = String(response.getHeader('Content-Type') || '');
      return !request.path.startsWith('/api/v1/auth/')
        && contentType.startsWith('application/json')
        && compression.filter(request, response);
    },
  });
}
