'use client';
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import { FiChevronLeft, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';

export default function UpdatePassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  // --- PASSWORD VALIDATION LOGIC ---
  const isLengthValid = password.length >= 8;
  const isUpperValid = /[A-Z]/.test(password);
  const isLowerValid = /[a-z]/.test(password);
  const isNumberValid = /[0-9]/.test(password);
  const isSpecialValid = /[!@#$%^&*(),.?":{}|<>\-_]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  
  const allRequirementsMet = isLengthValid && isUpperValid && isLowerValid && isNumberValid && isSpecialValid;

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!allRequirementsMet) {
      setErrorMsg("Please meet all security requirements before saving.");
      return;
    }
    if (!passwordsMatch) {
      setErrorMsg("Your passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: password });
      if (error) throw error;
      setSuccess(true);
    } catch (error: any) {
      setErrorMsg(error.message || "Failed to update password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const CheckItem = ({ isValid, text }: { isValid: boolean, text: string }) => (
    <li className={`flex items-center gap-2.5 transition-colors duration-300 ${isValid ? 'text-emerald-600' : 'text-slate-400'}`}>
      <span className='text-sm'>{isValid ? '✅' : '⚪'}</span>
      <span className={`text-xs ${isValid ? 'font-bold' : 'font-medium'}`}>{text}</span>
    </li>
  );

  return (
    <div className='max-w-md mx-auto bg-slate-50 h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
      
      {/* HEADER */}
      <div className='bg-white px-5 pt-12 pb-4 shadow-sm flex items-center justify-between shrink-0 border-b border-slate-100'>
        <button onClick={() => router.back()} className='p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors flex items-center gap-1 font-bold text-sm'>
          <FiChevronLeft className='text-2xl' /> Back
        </button>
        <h1 className='text-lg font-black text-slate-800'>Update Password</h1>
        <div className='w-14' /> {/* Spacer for centering */}
      </div>

      {/* CONTENT */}
      <div className='flex-1 p-5 overflow-y-auto custom-scrollbar pt-8'>
        {success ? (
          <div className='bg-white rounded-3xl p-8 shadow-sm border border-slate-100 text-center mt-4 animate-in zoom-in-95'>
            <FiCheckCircle className='text-6xl text-emerald-500 mx-auto mb-4' />
            <h2 className='text-xl font-black text-slate-800 mb-2'>Password Updated</h2>
            <p className='text-sm text-slate-500 mb-8 leading-relaxed'>Your account password has been successfully changed. Please use your new password the next time you log in.</p>
            <button onClick={() => router.push('/patient/profile')} className='w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm shadow-md transition-transform active:scale-95'>
              Return to Profile
            </button>
          </div>
        ) : (
          <div className='animate-in fade-in pb-10'>
            <h2 className='text-2xl font-black text-slate-800 mb-2'>Create New Password</h2>
            <p className='text-sm text-slate-500 mb-6 leading-relaxed'>Choose a strong password that you haven't used before to secure your medical data.</p>

            {errorMsg && (
              <div className='mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3'>
                <FiAlertCircle className='text-red-600 text-xl shrink-0 mt-0.5' />
                <p className='text-sm font-bold text-red-700'>{errorMsg}</p>
              </div>
            )}

            {/* REAL-TIME VALIDATION CHECKLIST */}
            <div className={`p-5 rounded-2xl border mb-6 transition-colors duration-300 ${password.length > 0 && !allRequirementsMet ? 'bg-amber-50 border-amber-200' : 'bg-blue-50/40 border-blue-100'}`}>
              <p className='text-[10px] font-black text-slate-500 mb-3 uppercase tracking-widest'>Security Requirements</p>
              <ul className='space-y-2.5'>
                <CheckItem isValid={isLengthValid} text="Minimum 8 characters long" />
                <CheckItem isValid={isUpperValid} text="One uppercase letter (A-Z)" />
                <CheckItem isValid={isLowerValid} text="One lowercase letter (a-z)" />
                <CheckItem isValid={isNumberValid} text="One number (0-9)" />
                <CheckItem isValid={isSpecialValid} text="One special symbol (!@#$%^&*)" />
              </ul>
            </div>

            <form onSubmit={handleUpdate} className='space-y-5'>
              <div>
                <label className='block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 pl-1'>New Password</label>
                <input 
                  type="password" 
                  required 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  className={`w-full p-4 bg-white border rounded-2xl outline-none focus:ring-2 transition-all font-bold text-slate-800 ${password.length > 0 && !allRequirementsMet ? 'border-amber-300 focus:border-amber-500 focus:ring-amber-100' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100'}`}
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className='block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 pl-1'>Confirm New Password</label>
                <input 
                  type="password" 
                  required 
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                  className={`w-full p-4 bg-white border rounded-2xl outline-none focus:ring-2 transition-all font-bold text-slate-800 ${confirmPassword.length > 0 && !passwordsMatch ? 'border-red-300 focus:border-red-500 focus:ring-red-100' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100'}`}
                  placeholder="••••••••"
                />
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <p className='text-xs font-bold text-red-500 mt-2 pl-1 animate-in fade-in'>Passwords do not match.</p>
                )}
                {passwordsMatch && confirmPassword.length > 0 && (
                  <p className='text-xs font-bold text-emerald-600 mt-2 pl-1 animate-in fade-in'>✅ Passwords match!</p>
                )}
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting || !allRequirementsMet || !passwordsMatch} 
                className='w-full py-4 mt-6 bg-blue-600 text-white rounded-2xl font-black text-base shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95'
              >
                {isSubmitting ? 'Updating Security...' : 'Save New Password'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}