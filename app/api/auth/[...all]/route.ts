import { auth } from '@/lib/better-auth/auth';
import { toNextJsHandler } from 'better-auth/next-js';

// Better Auth's REST endpoints. Needed for social sign-in (the OAuth redirect
// lands on /api/auth/callback/<provider>) and for the client SDK.
export const { GET, POST } = toNextJsHandler(auth);
