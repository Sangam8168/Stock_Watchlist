'use client';

import { Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import InputField from '@/components/forms/InputField';
import FooterLink from '@/components/forms/FooterLink';
import { resetPassword } from '@/lib/actions/auth.actions';
import { toast } from 'sonner';

type Form = { password: string; confirm: string };

function ResetPasswordForm() {
    const router = useRouter();
    const token = useSearchParams().get('token') ?? '';
    const {
        register,
        handleSubmit,
        watch,
        formState: { errors, isSubmitting },
    } = useForm<Form>({ defaultValues: { password: '', confirm: '' }, mode: 'onBlur' });

    const onSubmit = async ({ password }: Form) => {
        const res = await resetPassword({ token, newPassword: password });
        if (res.success) {
            toast.success('Password updated', { description: 'Sign in with your new password.' });
            router.push('/sign-in');
        } else {
            toast.error('Could not reset password', { description: res.error });
        }
    };

    if (!token) {
        return (
            <>
                <h1 className="form-title">Link expired</h1>
                <p className="text-gray-400">This reset link is missing or invalid. Request a fresh one.</p>
                <div className="mt-6">
                    <FooterLink text="" linkText="Send a new reset link" href="/forgot-password" />
                </div>
            </>
        );
    }

    return (
        <>
            <h1 className="form-title">Set a new password</h1>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
                <InputField
                    name="password"
                    label="New password"
                    placeholder="At least 8 characters"
                    type="password"
                    register={register}
                    error={errors.password}
                    validation={{
                        required: 'Password is required',
                        minLength: { value: 8, message: 'Password must be at least 8 characters' },
                    }}
                />
                <InputField
                    name="confirm"
                    label="Confirm password"
                    placeholder="Re-enter your new password"
                    type="password"
                    register={register}
                    error={errors.confirm}
                    validation={{
                        required: 'Please confirm your password',
                        validate: (v: string) => v === watch('password') || 'Passwords do not match',
                    }}
                />

                <Button type="submit" disabled={isSubmitting} className="yellow-btn w-full mt-5">
                    {isSubmitting ? 'Updating…' : 'Update password'}
                </Button>

                <FooterLink text="Changed your mind?" linkText="Back to sign in" href="/sign-in" />
            </form>
        </>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<h1 className="form-title">Loading…</h1>}>
            <ResetPasswordForm />
        </Suspense>
    );
}
