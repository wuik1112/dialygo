'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';

export default function AdminSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const router = useRouter();

  const [passwordVerification, setPasswordVerification] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');

  const [formData, setFormData] = useState({
    user_email: '',
    user_ic: '',
    fullname: '',
    contact_number: '',
    current_password: '',
    new_password: '',
    confirm_password: ''
  });

  const [initialData, setInitialData] = useState({
    fullname: '',
    contact_number: ''
  });

  useEffect(() => {
    async function fetchUserProfile() {
      setIsLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (sessionData.session) {
        const email = sessionData.session.user.email;
        
        // Only fetch the users table, Admin doesn't need staff data here
        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('user_email', email)
          .single();

        if (userData) {
          const profileData = {
            user_email: userData.user_email,
            user_ic: userData.user_ic || '',
            fullname: userData.user_fullname || '',
            contact_number: userData.user_contact_number || '',
            current_password: '',
            new_password: '',
            confirm_password: ''
          };
          
          setFormData(profileData);
          setInitialData({
            fullname: profileData.fullname,
            contact_number: profileData.contact_number
          });
        }
      }
      setIsLoading(false);
    }

    fetchUserProfile();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setMessage({ type: '', text: '' }); 

    if (name === 'current_password') {
      setPasswordVerification('idle');
    }
  };

  const handleCurrentPasswordBlur = async () => {
    if (!formData.current_password) return;
    setPasswordVerification('checking');
    
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: formData.user_email,
      password: formData.current_password
    });

    if (signInError) {
      setPasswordVerification('invalid');
    } else {
      setPasswordVerification('valid');
    }
  };

  const pwd = formData.new_password;
  const isLengthValid = pwd.length >= 8;
  const isUpperValid = /[A-Z]/.test(pwd);
  const isLowerValid = /[a-z]/.test(pwd);
  const isNumberValid = /[0-9]/.test(pwd);
  const isSpecialValid = /[!@#$%^&*(),.?":{}|<>\-_]/.test(pwd);
  const passwordsMatch = pwd.length > 0 && pwd === formData.confirm_password;
  const allRequirementsMet = isLengthValid && isUpperValid && isLowerValid && isNumberValid && isSpecialValid;

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const cleanContact = formData.contact_number.replace(/[\s-]/g, '');
      if (!/^\+?[0-9]{10,15}$/.test(cleanContact)) {
        throw new Error("Please enter a valid contact number (10 to 15 digits).");
      }

      let passwordChanged = false;

      if (formData.current_password || formData.new_password || formData.confirm_password) {
        if (!formData.current_password) throw new Error("You must enter your Current Password to authorize this change.");
        if (passwordVerification === 'invalid') throw new Error("Incorrect current password. Please try again.");
        if (!allRequirementsMet) throw new Error("Your new password does not meet all the security requirements.");
        if (!passwordsMatch) throw new Error("Your new password and confirmation password do not match.");

        const { error: authError } = await supabase.auth.updateUser({
          password: formData.new_password
        });

        if (authError) throw authError;
        passwordChanged = true;
      }

      const { error: dbError } = await supabase
        .from('users')
        .update({
          user_fullname: formData.fullname.trim(),
          user_contact_number: formData.contact_number.trim(),
          ...(passwordChanged ? { user_password: formData.new_password } : {})
        })
        .eq('user_email', formData.user_email);

      if (dbError) throw dbError;

      if (passwordChanged) {
        setMessage({ type: 'success', text: 'Password verified and updated successfully.' });
        setTimeout(() => { router.push('/admin'); }, 1500);
      } else {
        setMessage({ type: 'success', text: 'Profile settings updated successfully.' });
        setInitialData({
          fullname: formData.fullname.trim(),
          contact_number: formData.contact_number.trim()
        });
        setFormData(prev => ({ ...prev, current_password: '', new_password: '', confirm_password: '' }));
        setPasswordVerification('idle');
      }

    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'An error occurred while saving.' });
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = 
    formData.fullname !== initialData.fullname ||
    formData.contact_number !== initialData.contact_number ||
    formData.current_password.length > 0 ||
    formData.new_password.length > 0 ||
    formData.confirm_password.length > 0;

  if (isLoading) return <div className='p-8 text-slate-600 font-sans text-center mt-20'>Loading Profile Data...</div>;

  const CheckItem = ({ isValid, text }: { isValid: boolean, text: string }) => (
    <li className={`flex items-center gap-2 transition-colors duration-300 ${isValid ? 'text-emerald-600' : 'text-slate-400'}`}>
      <span>{isValid ? '✅' : '⚪'}</span>
      <span className={isValid ? 'font-medium' : ''}>{text}</span>
    </li>
  );

  return (
    <main className='p-8 bg-slate-50 min-h-screen font-sans pb-24'>
      <div className='max-w-3xl mx-auto'>
        
        <div className='mb-8'>
          <h1 className='text-3xl font-bold text-slate-800 tracking-tight'>Account Settings</h1>
          <p className='text-slate-500 mt-1 font-medium'>Manage your personal profile and security credentials</p>
        </div>

        <form onSubmit={handleSaveSettings} className='space-y-8'>
          
          <div className='bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden'>
            <div className='px-8 py-5 border-b border-slate-100 bg-slate-50/50'>
              <h2 className='text-sm font-bold text-slate-800 uppercase tracking-wider'>Personal Information</h2>
            </div>
            <div className='p-8 space-y-6'>
              
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                <div>
                  <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>System Email Address (Uneditable)</label>
                  <input type='email' disabled value={formData.user_email} className='w-full p-3.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-medium cursor-not-allowed' />
                </div>
                <div>
                  <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Identity Card (Uneditable)</label>
                  <div className='w-full p-3.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-medium font-mono cursor-not-allowed'>
                    {formData.user_ic ? `XXXXXX-XX-${formData.user_ic.slice(-4)}` : 'N/A'}
                  </div>
                </div>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100'>
                <div>
                  <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Full Name</label>
                  <input type='text' name='fullname' required value={formData.fullname} onChange={handleInputChange} className='w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-800 transition-colors' />
                </div>
                <div>
                  <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Contact Number</label>
                  <input type='text' name='contact_number' value={formData.contact_number} onChange={handleInputChange} placeholder="e.g. 012-3456789" className={`w-full p-3.5 bg-slate-50 border rounded-xl outline-none focus:border-blue-500 font-medium text-slate-800 transition-colors ${message.text.includes("valid contact number") ? 'border-red-400 focus:border-red-500 bg-red-50' : 'border-slate-200'}`} />
                </div>
              </div>

            </div>
          </div>

          <div className='bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden'>
            <div className='px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center'>
              <h2 className='text-sm font-bold text-slate-800 uppercase tracking-wider'>Security & Password</h2>
            </div>
            <div className='p-8 space-y-6'>
              
              <div className={`p-5 rounded-xl border flex items-start gap-4 transition-colors duration-300 ${formData.new_password.length > 0 && !allRequirementsMet ? 'bg-amber-50 border-amber-200' : 'bg-blue-50/50 border-blue-100'}`}>
                <div className='text-xl'>{formData.new_password.length > 0 && !allRequirementsMet ? '⚠️' : 'ℹ️'}</div>
                <div className='text-sm text-slate-600 leading-relaxed w-full'>
                  <p className='mb-2 font-bold text-slate-800'>Secure Password Requirements:</p>
                  <ul className='grid grid-cols-1 md:grid-cols-2 gap-2 text-xs'>
                    <CheckItem isValid={isLengthValid} text="Minimum 8 characters long" />
                    <CheckItem isValid={isUpperValid} text="One uppercase letter (A-Z)" />
                    <CheckItem isValid={isLowerValid} text="One lowercase letter (a-z)" />
                    <CheckItem isValid={isNumberValid} text="One number (0-9)" />
                    <CheckItem isValid={isSpecialValid} text="One special symbol (!@#$%^&*)" />
                    {formData.new_password.length > 0 && <CheckItem isValid={passwordsMatch} text="Passwords match" />}
                  </ul>
                </div>
              </div>

              <div>
                <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Current Password</label>
                <div className='relative'>
                  <input 
                    type='password' name='current_password' placeholder='Required to authorize password changes'
                    value={formData.current_password} onChange={handleInputChange} onBlur={handleCurrentPasswordBlur}
                    className={`w-full p-3.5 pr-12 bg-slate-50 border rounded-xl outline-none focus:border-blue-500 font-medium text-slate-800 transition-colors ${passwordVerification === 'invalid' ? 'border-red-400 focus:border-red-500 bg-red-50' : passwordVerification === 'valid' ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-200'}`}
                  />
                  <div className='absolute right-4 top-1/2 -translate-y-1/2 text-lg'>
                    {passwordVerification === 'checking' && <span className="animate-spin inline-block text-blue-500">⏳</span>}
                    {passwordVerification === 'valid' && <span className="text-emerald-500">✅</span>}
                    {passwordVerification === 'invalid' && <span className="text-red-500">❌</span>}
                  </div>
                </div>
                {passwordVerification === 'invalid' && <p className='text-xs font-bold text-red-500 mt-2 animate-in fade-in'>Incorrect current password. Please try again.</p>}
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-100'>
                <div>
                  <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>New Password</label>
                  <input type='password' name='new_password' placeholder='Uppercase, lowercase, number, & symbol' value={formData.new_password} onChange={handleInputChange} className={`w-full p-3.5 bg-slate-50 border rounded-xl outline-none focus:border-blue-500 font-medium text-slate-800 transition-colors ${formData.new_password.length > 0 && !allRequirementsMet ? 'border-amber-300 focus:border-amber-500' : 'border-slate-200'}`} />
                </div>
                <div>
                  <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Confirm New Password</label>
                  <input type='password' name='confirm_password' placeholder='Confirm your new password' value={formData.confirm_password} onChange={handleInputChange} className={`w-full p-3.5 bg-slate-50 border rounded-xl outline-none focus:border-blue-500 font-medium text-slate-800 transition-colors ${formData.confirm_password.length > 0 && !passwordsMatch ? 'border-red-300 focus:border-red-500' : 'border-slate-200'}`} />
                </div>
              </div>

            </div>
          </div>

          {message.text && (
            <div className={`p-4 rounded-xl font-bold text-sm border animate-in fade-in duration-300 flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
              <span>{message.type === 'success' ? '✅' : '❌'}</span>
              <span>{message.text}</span>
            </div>
          )}

          {hasChanges && (
            <div className='flex justify-end pt-2 animate-in slide-in-from-bottom-4 fade-in duration-300'>
              <button type='submit' disabled={isSaving || passwordVerification === 'invalid'} className='px-8 py-3.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:bg-blue-300 shadow-lg shadow-blue-500/20 transition-all'>
                {isSaving ? 'Authenticating & Saving...' : 'Save All Settings'}
              </button>
            </div>
          )}

        </form>
      </div>
    </main>
  );
}