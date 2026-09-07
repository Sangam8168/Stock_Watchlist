import nodemailer from 'nodemailer';
import {
    WELCOME_EMAIL_TEMPLATE,
    NEWS_SUMMARY_EMAIL_TEMPLATE,
    WATCHLIST_DIGEST_EMAIL_TEMPLATE,
    PASSWORD_RESET_EMAIL_TEMPLATE,
} from "@/lib/nodemailer/templates";

export const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.NODEMAILER_EMAIL!,
        pass: process.env.NODEMAILER_PASSWORD!,
    }
})

export const isMailConfigured = () => !!process.env.NODEMAILER_EMAIL && !!process.env.NODEMAILER_PASSWORD;

const FROM = process.env.EMAIL_FROM || `"Stock Watchlist" <${process.env.NODEMAILER_EMAIL || 'no-reply@localhost'}>`;

export const sendWelcomeEmail = async ({ email, name, intro }: WelcomeEmailData) => {
    const htmlTemplate = WELCOME_EMAIL_TEMPLATE
        .replace('{{name}}', name)
        .replace('{{intro}}', intro);

    const mailOptions = {
        from: FROM,
        to: email,
        subject: `Welcome to Stock Watchlist - your stock market toolkit is ready!`,
        text: 'Thanks for joining Stock Watchlist',
        html: htmlTemplate,
    }

    await transporter.sendMail(mailOptions);
}

export const sendNewsSummaryEmail = async (
    { email, date, newsContent }: { email: string; date: string; newsContent: string }
): Promise<void> => {
    const htmlTemplate = NEWS_SUMMARY_EMAIL_TEMPLATE
        .replace('{{date}}', date)
        .replace('{{newsContent}}', newsContent);

    const mailOptions = {
        from: FROM,
        to: email,
        subject: `📈 Market News Summary Today - ${date}`,
        text: `Today's market news summary from Stock Watchlist`,
        html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
};

export const sendPasswordResetEmail = async (
    { email, name, resetUrl }: { email: string; name: string; resetUrl: string }
): Promise<void> => {
    if (!isMailConfigured()) throw new Error('mail transport not configured');

    const htmlTemplate = PASSWORD_RESET_EMAIL_TEMPLATE
        .replace('{{name}}', name)
        .replace(/{{resetUrl}}/g, resetUrl);

    await transporter.sendMail({
        from: FROM,
        to: email,
        subject: 'Reset your Stock Watchlist password',
        text: `Reset your password: ${resetUrl}`,
        html: htmlTemplate,
    });
};

export const sendWatchlistDigestEmail = async (
    { email, date, summaryLine, body, watchlistUrl }: {
        email: string; date: string; summaryLine: string; body: string; watchlistUrl: string;
    }
): Promise<void> => {
    const htmlTemplate = WATCHLIST_DIGEST_EMAIL_TEMPLATE
        .replace('{{date}}', date)
        .replace('{{summaryLine}}', summaryLine)
        .replace('{{body}}', body)
        .replace(/{{watchlistUrl}}/g, watchlistUrl);

    await transporter.sendMail({
        from: FROM,
        to: email,
        subject: `📋 ${summaryLine}`,
        text: summaryLine,
        html: htmlTemplate,
    });
};
