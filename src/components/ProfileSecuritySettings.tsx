'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  FiAlertTriangle, FiInfo, FiLoader, 
  FiCheckCircle, FiXCircle 
} from 'react-icons/fi';

const CheckItem = ({ isValid, text }: { isValid: boolean, text: string }) => (
  <li className={`flex items-center gap-2 transition-colors ${isValid ? 'text-emerald-600 font-bold' : 'text-slate-500'}`}>
    {isValid ? <FiCheckCircle className="text-emerald-500" /> : <div className='w-3 h-3 rounded-full border border-slate-300' />}
    {text}
  </li>
);

export default function ProfileSecuritySettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({
    user_email: '',
    user_ic: '',
    fullname: '',
    contact_number: '',
    current_password: '',
    new_password: '',
    confirm_password: ''
  });
  
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [passwordVerification, setPasswordVerification] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');

  useEffect(() => {
    const fetchUser = async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) return;
      
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('user_email', session.session.user.email)
        .single();
        
      if (data) {
        setUserId(data.user_id);
        setFormData(prev => ({
          ...prev,
          user_email: data.user_email || '',
          user_ic: data.user_ic || '',
          fullname: data.user_fullname || '',
          contact_number: data.user_contact_number || ''
        }));
      }
      setIsLoading(false);
    };
    fetchUser();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setHasChanges(true);
    if (e.target.name === 'current_password') {
      setPasswordVerification('idle'); 
    }
  };

  // --- FIXED: Verify password securely via Auth Engine, NOT public tables ---
  const handleCurrentPasswordBlur = async () => {
    if (!formData.current_password || !formData.user_email) return;
    setPasswordVerification('checking');
    
    const { error } = await supabase.auth.signInWithPassword({
      email: formData.user_email,
      password: formData.current_password,
    });
      
    if (!error) {
      setPasswordVerification('valid');
    } else {
      setPasswordVerification('invalid');
    }
  };

  const isLengthValid = formData.new_password.length >= 8;
  const isUpperValid = /[A-Z]/.test(formData.new_password);
  const isLowerValid = /[a-z]/.test(formData.new_password);
  const isNumberValid = /\d/.test(formData.new_password);
  const isSpecialValid = /[!@#$%^&*]/.test(formData.new_password);
  const passwordsMatch = formData.new_password === formData.confirm_password;
  const allRequirementsMet = isLengthValid && isUpperValid && isLowerValid && isNumberValid && isSpecialValid;

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    if (formData.new_password && (!allRequirementsMet || !passwordsMatch)) {
      setMessage({ type: 'error', text: 'Please ensure all new password requirements are met.' });
      return;
    }

    if (formData.new_password && passwordVerification !== 'valid') {
      setMessage({ type: 'error', text: 'You must verify your current password to set a new one.' });
      return;
    }

    setIsSaving(true);
    setMessage({ type: '', text: '' });

    // 1. Save standard profile data to the database
    const payload: any = {
      user_fullname: formData.fullname,
      user_contact_number: formData.contact_number
    };

    const { error: dbError } = await supabase.from('users').update(payload).eq('user_id', userId);

    if (dbError) {
      setMessage({ type: 'error', text: dbError.message });
      setIsSaving(false);
      return;
    }

    // 2. FIXED: Save the actual new password to the Supabase Auth Engine
    if (formData.new_password) {
      const { error: authError } = await supabase.auth.updateUser({
        password: formData.new_password
      });

      if (authError) {
        setMessage({ type: 'error', text: "Profile updated, but password change failed: " + authError.message });
        setIsSaving(false);
        return;
      }
    }

    setIsSaving(false);
    setMessage({ type: 'success', text: 'Settings updated successfully!' });
    setHasChanges(false);
    setFormData(prev => ({ ...prev, current_password: '', new_password: '', confirm_password: '' }));
    setPasswordVerification('idle');
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  if (isLoading) {
    return <div className="flex flex-col items-center justify-center p-12 text-blue-500"><FiLoader className="animate-spin text-4xl mb-4"/> Loading Profile...</div>;
  }

  return (
    <form onSubmit={handleSaveSettings} className='space-y-8 max-w-4xl mx-auto'>

      {/* SECURITY CARD */}
      <div className='bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden'>
        <div className='px-8 py-5 border-b border-slate-100 bg-slate-50/50'>
          <h2 className='text-sm font-bold text-slate-800 uppercase tracking-wider'>Security & Password</h2>
        </div>
        <div className='p-8 space-y-6'>
          <div className={`p-5 rounded-xl border flex items-start gap-4 transition-colors duration-300 ${formData.new_password.length > 0 && !allRequirementsMet ? 'bg-amber-50 border-amber-200' : 'bg-blue-50/50 border-blue-100'}`}>
            <div className='text-xl'>{formData.new_password.length > 0 && !allRequirementsMet ? <FiAlertTriangle className='text-amber-500'/> : <FiInfo className='text-blue-500'/>}</div>
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
                {passwordVerification === 'checking' && <FiLoader className="animate-spin text-blue-500" />}
                {passwordVerification === 'valid' && <FiCheckCircle className="text-emerald-500"/>}
                {passwordVerification === 'invalid' && <FiXCircle className="text-red-500"/>}
              </div>
            </div>
            {passwordVerification === 'invalid' && <p className='text-xs font-bold text-red-500 mt-2'>Incorrect current password. Please try again.</p>}
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
          <span>{message.type === 'success' ? <FiCheckCircle className="text-emerald-600 text-xl" /> : <FiXCircle className="text-red-600 text-xl" />}</span>
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
  );
}