'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { authClient } from '@/lib/better-auth/client';
import { isGoogleAuthEnabled } from '@/lib/actions/auth.actions';

export default function GoogleButton({ label = 'Continue with Google' }: { label?: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  // Shown automatically when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set.
  useEffect(() => {
    isGoogleAuthEnabled().then(setEnabled).catch(() => setEnabled(false));
  }, []);

  if (!enabled) return null;

  const onClick = async () => {
    setLoading(true);
    try {
      await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
      // Success → browser redirects to Google; nothing below runs.
    } catch (e) {
      console.error(e);
      toast.error('Google sign-in failed', {
        description: e instanceof Error ? e.message : 'Please try again.',
      });
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-gray-600 bg-gray-800 text-base font-medium text-gray-100 hover:border-gray-500 hover:bg-gray-700 disabled:opacity-50"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
          <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.32z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58z" />
        </svg>
        {loading ? 'Redirecting…' : label}
      </button>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="h-px flex-1 bg-gray-700" />
        or
        <span className="h-px flex-1 bg-gray-700" />
      </div>
    </div>
  );
}
