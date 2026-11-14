import { routeChatResponse } from '../../server/route-chat.ts';

export const config = { path: '/api/route-chat', rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
export default (request: Request) => routeChatResponse(request, process.env.GEMINI_API_KEY);
