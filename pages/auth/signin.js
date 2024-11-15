import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { signIn } from 'next-auth/react';

const SignInPage = () => {
  const router = useRouter();

  useEffect(() => {
    // If error=OAuthCallback exists in query parameters, redirect to home
    if (router.query.error === 'OAuthCallback') {
      router.push('/'); // Redirect to homepage or any other page
    }
  }, [router.query.error]);

  return (
    <div>
      <h1>Sign In</h1>
      <button onClick={() => signIn('github')}>Sign in with GitHub</button>
    </div>
  );
};

export default SignInPage;
