'use client';

import { useForm } from 'react-hook-form';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import InputField from '@/components/forms/InputField';
import FooterLink from '@/components/forms/FooterLink';
import GoogleButton from '@/components/auth/GoogleButton';
import { signInWithEmail } from '@/lib/actions/auth.actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SignIn = () => {
    const router = useRouter();
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<SignInFormData>({
        defaultValues: { email: '', password: '' },
        mode: 'onBlur',
    });

    const onSubmit = async (data: SignInFormData) => {
        try {
            const result = await signInWithEmail(data);
            if (result.success) {
                router.push('/');
                router.refresh();
            } else {
                toast.error('Could not sign in', {
                    description: result.error || 'Check your email and password and try again.',
                });
            }
        } catch (e) {
            console.error(e);
            toast.error('Could not sign in', {
                description: e instanceof Error ? e.message : 'Something went wrong.',
            });
        }
    };

    return (
        <>
            <h1 className="form-title">Welcome back</h1>

            <GoogleButton label="Sign in with Google" />

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 mt-4" noValidate>
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

                <InputField
                    name="password"
                    label="Password"
                    placeholder="Enter your password"
                    type="password"
                    register={register}
                    error={errors.password}
                    validation={{ required: 'Password is required' }}
                />

                <div className="text-right -mt-2">
                    <Link href="/forgot-password" className="text-sm footer-link">
                        Forgot password?
                    </Link>
                </div>

                <Button type="submit" disabled={isSubmitting} className="yellow-btn w-full mt-5">
                    {isSubmitting ? 'Signing in…' : 'Sign In'}
                </Button>

                <FooterLink text="Don't have an account?" linkText="Create an account" href="/sign-up" />
            </form>
        </>
    );
};
export default SignIn;
