/**
 * The Gemini model every AI feature uses.
 *
 * Centralised because model ids get deprecated: gemini-2.5-flash-lite started
 * returning 404 ("no longer available to new users") while it was still
 * hard-coded in three places, silently breaking the welcome email and the daily
 * news summary. One constant means the next deprecation is a one-line change
 * instead of a hunt.
 */
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
