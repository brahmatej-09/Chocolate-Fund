import PusherJs from 'pusher-js';

// Client-side Pusher instance — used in React components for real-time updates
// Channel: `session-${sessionId}`
// Events: new-payment | total-updated | payment-verified | payment-rejected | session-closed

let client: PusherJs | null = null;

export function getPusherClient(): PusherJs {
  if (typeof window === 'undefined') {
    throw new Error('getPusherClient() must only be called on the client side');
  }
  if (!process.env.NEXT_PUBLIC_PUSHER_KEY || !process.env.NEXT_PUBLIC_PUSHER_CLUSTER) {
    throw new Error('Missing NEXT_PUBLIC_PUSHER_KEY or NEXT_PUBLIC_PUSHER_CLUSTER env vars');
  }
  if (!client) {
    client = new PusherJs(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
    });
  }
  return client;
}
