'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import InputField from '@/components/forms/InputField';
import FooterLink from '@/components/forms/FooterLink';
import { requestPasswordReset } from '@/lib/actions/auth.actions';
import { toast } from 'sonner';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ForgotPassword = () => {
    const [sent, setSent] = useState<{ mailConfigured: boolean } | null>(null);
    const {
        register,
        handleSubmit,
        getValues,
        formState: { errors, isSubmitting },
    } = useForm<{ email: string }>({ defaultValues: { email: '' }, mode: 'onBlur' });

    const onSubmit = async ({ email }: { email: string }) => {
        try {
            const res = await requestPasswordReset({ email });
            setSent({ mailConfigured: res.mailConfigured });
        } catch {
            toast.error('Something went wrong', { description: 'Please try again in a moment.' });
        }
    };

    if (sent) {
        return (
            <>
                <h1 className="form-title">Check your email</h1>
                <p className="text-gray-400">
                    If an account exists for <span className="text-gray-100">{getValues('email')}</span>, we&rsquo;ve sent a
                    link to reset your password. It expires in an hour.
                </p>
                {!sent.mailConfigured && (
                    <p className="mt-4 rounded-md border border-yellow-600/30 bg-yellow-500/10 p-3 text-sm text-yellow-500">
                        Email isn&rsquo;t configured on this instance. The reset link has been printed to the server
                        console — copy it from there to continue.
                    </p>
                )}
                <div className="mt-6">
                    <FooterLink text="Remembered it?" linkText="Back to sign in" href="/sign-in" />
                </div>
            </>
        );
    }

    return (
        <>
            <h1 className="form-title">Forgot your password?</h1>
            <p className="mb-6 text-gray-400">Enter your email and we&rsquo;ll send you a link to set a new one.</p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
                <InputField
                    name="email"
                    label="Email"
                    placeholder="you@example.com"
                    register={register}
                    error={errors.email}
                    validation={{
                        required: 'Email is required',
                        pattern: { value: EMAIL_RE, message: 'Enter a valid email address' },
                    }}
                />

                <Button type="submit" disabled={isSubmitting} className="yellow-btn w-full mt-5">
                    {isSubmitting ? 'Sending…' : 'Send reset link'}
                </Button>

                <FooterLink text="Remembered it?" linkText="Back to sign in" href="/sign-in" />
            </form>
        </>
    );
};
export default ForgotPassword;
