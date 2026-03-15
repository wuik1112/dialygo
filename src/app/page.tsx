'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useRouter } from 'next/navigation';

export default function AuthPortal() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function checkActiveSession() {
      const { data } = await supabase.auth.getSession();
      
      if (data.session) {
        const { data: userData } = await supabase
          .from('users')
          .select('role_id')
          .eq('user_email', data.session.user.email)
          .single();

        if (userData) {
          const routes: Record<number, string> = {
            1: '/admin', 
            2: '/manager', 
            3: '/nephrologist', 
            4: '/nurse', 
            5: '/patient'
          };
          router.push(routes[userData.role_id] || '/');
        }
      } else {
        setLoading(false);
      }
    }
    
    checkActiveSession();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithPassword({ 
      email, 
      password 
    });
    
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    window.location.reload();
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (resetError) {
      setError(resetError.message);
    } else {
      setResetSent(true);
    }
    setLoading(false);
  };

  if (loading) {
    return <div className='min-h-screen flex items-center justify-center bg-slate-100 font-sans'>Loading secure portal...</div>;
  }

  return (
    <div className='min-h-screen flex items-center justify-center bg-slate-100 font-sans'>
      <div className='bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200'>
        <h1 className='text-3xl font-bold text-slate-900 mb-2'>DialyGo</h1>
        
        {isResetMode ? (
          <>
            <p className='text-slate-500 mb-8'>Reset Your Password</p>
            {resetSent ? (
              <div className='text-center'>
                <p className='text-green-600 font-medium mb-6'>Recovery email sent successfully. Please check your inbox.</p>
                <button 
                  onClick={() => {
                    setIsResetMode(false);
                    setResetSent(false);
                  }}
                  className='text-sm text-blue-600 hover:underline'
                >
                  Return to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className='space-y-4'>
                <div>
                  <label className='block text-sm font-medium text-slate-700 mb-1'>Email Address</label>
                  <input 
                    type='email' 
                    required 
                    className='w-full p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500' 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                  />
                </div>
                
                {error && <p className='text-red-500 text-sm'>{error}</p>}

                <button 
                  type='submit' 
                  disabled={loading} 
                  className='w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-blue-300'
                >
                  Send Reset Link
                </button>

                <div className='mt-6 text-center'>
                  <button 
                    type='button'
                    onClick={() => setIsResetMode(false)} 
                    className='text-sm text-slate-500 hover:text-slate-800 transition-colors'
                  >
                    Back to Login
                  </button>
                </div>
              </form>
            )}
          </>
        ) : (
          <>
            <p className='text-slate-500 mb-8'>Secure Clinical Login</p>
            <form onSubmit={handleLogin} className='space-y-4'>
              <div>
                <label className='block text-sm font-medium text-slate-700 mb-1'>Email Address</label>
                <input 
                  type='email' 
                  required 
                  className='w-full p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500' 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                />
              </div>
              <div>
                <div className='flex justify-between items-center mb-1'>
                  <label className='block text-sm font-medium text-slate-700'>Password</label>
                  <button 
                    type='button'
                    onClick={() => setIsResetMode(true)}
                    className='text-xs text-blue-600 hover:underline focus:outline-none'
                  >
                    Forgot password?
                  </button>
                </div>
                <input 
                  type='password' 
                  required 
                  className='w-full p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500' 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                />
              </div>
              
              {error && <p className='text-red-500 text-sm'>{error}</p>}

              <button 
                type='submit' 
                disabled={loading} 
                className='w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-blue-300'
              >
                Sign In
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}