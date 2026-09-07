'use server';

import {auth} from "@/lib/better-auth/auth";
import {inngest} from "@/lib/inngest/client";
import {isMailConfigured} from "@/lib/nodemailer";
import {headers} from "next/headers";

export const signUpWithEmail = async ({ email, password, fullName, country, investmentGoals, riskTolerance, preferredIndustry }: SignUpFormData) => {
    try {
        const response = await auth.api.signUpEmail({ body: { email, password, name: fullName } })

        if (response) {
            // The welcome email is a best-effort side effect. Fire-and-forget so a
            // missing / unreachable Inngest setup neither fails nor slows sign-up.
            void inngest
                .send({
                    name: 'app/user.created',
                    data: { email, name: fullName, country, investmentGoals, riskTolerance, preferredIndustry }
                })
                .catch((inngestErr) =>
                    console.warn('inngest user.created not sent:', inngestErr instanceof Error ? inngestErr.message : inngestErr)
                )
        }

        return { success: true, data: response }
    } catch (e) {
        console.log('Sign up failed', e)
        return { success: false, error: e instanceof Error ? e.message : 'Sign up failed' }
    }
}

export const signInWithEmail = async ({ email, password }: SignInFormData) => {
    try {
        const response = await auth.api.signInEmail({ body: { email, password } })

        return { success: true, data: response }
    } catch (e) {
        console.log('Sign in failed', e)
        return { success: false, error: 'Sign in failed' }
    }
}

/**
 * Kick off a password reset. Always reports success — never reveal whether an
 * email is registered. Better Auth generates the token and calls
 * `sendResetPassword` (see lib/better-auth/auth.ts) which emails the link.
 */
export const requestPasswordReset = async ({ email }: { email: string }) => {
    try {
        await auth.api.requestPasswordReset({
            body: { email: email.trim().toLowerCase(), redirectTo: '/reset-password' },
        });
    } catch (e) {
        console.warn('requestPasswordReset:', e instanceof Error ? e.message : e);
    }
    return { success: true, mailConfigured: isMailConfigured() };
};

/** Complete the reset with the token from the emailed link + a new password. */
export const resetPassword = async ({ token, newPassword }: { token: string; newPassword: string }) => {
    try {
        if (!token) return { success: false, error: 'This reset link is missing its token.' };
        if (!newPassword || newPassword.length < 8) {
            return { success: false, error: 'Password must be at least 8 characters.' };
        }
        await auth.api.resetPassword({ body: { token, newPassword } });
        return { success: true };
    } catch (e) {
        console.warn('resetPassword:', e instanceof Error ? e.message : e);
        return {
            success: false,
            error: 'This reset link is invalid or has expired. Request a new one.',
        };
    }
};

/** Whether "Continue with Google" should be shown — i.e. OAuth creds are set. */
export const isGoogleAuthEnabled = async (): Promise<boolean> =>
    !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export const signOut = async () => {
    try {
        await auth.api.signOut({ headers: await headers() });
    } catch (e) {
        console.log('Sign out failed', e)
        return { success: false, error: 'Sign out failed' }
    }
}
