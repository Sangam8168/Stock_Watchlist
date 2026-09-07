import { betterAuth } from "better-auth";
import { mongodbAdapter} from "better-auth/adapters/mongodb";
import { connectToDatabase} from "@/database/mongoose";
import { nextCookies} from "better-auth/next-js";
import { sendPasswordResetEmail } from "@/lib/nodemailer";

let authInstance: ReturnType<typeof betterAuth> | null = null;

export const getAuth = async () => {
    if(authInstance) return authInstance;

    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;

    if(!db) throw new Error('MongoDB connection not found');

    const googleId = process.env.GOOGLE_CLIENT_ID;
    const googleSecret = process.env.GOOGLE_CLIENT_SECRET;

    authInstance = betterAuth({
        database: mongodbAdapter(db as any),
        secret: process.env.BETTER_AUTH_SECRET,
        baseURL: process.env.BETTER_AUTH_URL,
        // Enable Google only when credentials are present, so the app still boots
        // without them (the button just won't be shown — see socialEnabled()).
        socialProviders: googleId && googleSecret
            ? { google: { clientId: googleId, clientSecret: googleSecret, prompt: 'select_account' } }
            : undefined,
        account: {
            accountLinking: { enabled: true, trustedProviders: ['google'] },
        },
        emailAndPassword: {
            enabled: true,
            disableSignUp: false,
            requireEmailVerification: false,
            minPasswordLength: 8,
            maxPasswordLength: 128,
            autoSignIn: true,
            resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
            sendResetPassword: async ({ user, token }) => {
                const baseUrl = process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
                const resetUrl = `${baseUrl}/reset-password?token=${token}`;
                try {
                    await sendPasswordResetEmail({ email: user.email, name: user.name || 'there', resetUrl });
                } catch (e) {
                    // No mail transport configured (dev / demo) — surface the link so it's still testable.
                    console.warn('[reset-password] email not sent:', e instanceof Error ? e.message : e);
                    console.warn('[reset-password] link for', user.email, '→', resetUrl);
                }
            },
        },
        plugins: [nextCookies()],
    });

    return authInstance;
}

export const auth = await getAuth();
