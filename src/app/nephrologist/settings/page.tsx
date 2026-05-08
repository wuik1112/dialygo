'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import { 
  FiActivity, FiCamera, FiLoader, FiAlertTriangle, 
  FiCheckCircle, FiXCircle, FiLock, FiUser, FiMapPin 
} from 'react-icons/fi';

export default function NephrologistSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' }); 
  const router = useRouter();

  const [passwordVerification, setPasswordVerification] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    fullname: '',
    contact_number: '',
    user_profile_photo: '',
    branch_name: '', // Added for display
    current_password: '',
    new_password: '',
    confirm_password: ''
  });

  const [initialData, setInitialData] = useState({
    fullname: '',
    contact_number: '',
    user_profile_photo: ''
  });

  useEffect(() => {
    async function fetchUserProfile() {
      setIsLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (sessionData.session) {
        const email = sessionData.session.user.email;
        // Adjusted query to pull branch name securely
        const { data: userData } = await supabase
          .from('users')
          .select('*, branches(branch_name)')
          .eq('user_email', email)
          .single();

        if (userData) {
          const branchInfo = userData.branches as any;
          const resolvedBranchName = Array.isArray(branchInfo) 
            ? branchInfo[0]?.branch_name 
            : branchInfo?.branch_name;

          const profileData = {
            fullname: userData.user_fullname || '',
            contact_number: userData.user_contact_number || '',
            user_profile_photo: userData.user_profile_photo || '',
            branch_name: resolvedBranchName || 'Unassigned Branch'
          };
          
          setFormData(prev => ({ ...prev, ...profileData }));
          
          // We don't track branch_name in initialData since it's read-only
          setInitialData({
            fullname: profileData.fullname,
            contact_number: profileData.contact_number,
            user_profile_photo: profileData.user_profile_photo
          });
        }
      } else {
        router.push('/');
      }
      setIsLoading(false);
    }
    fetchUserProfile();
  }, [router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    setFieldErrors({ ...fieldErrors, [name]: '' });
    setMessage({ type: '', text: '' });

    if (name === 'current_password' && value.length > 0) {
      setPasswordVerification('idle');
    }
  };

  const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!e.target.files || e.target.files.length === 0) return;
      const file = e.target.files[0];
      setIsUploadingProfile(true);

      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `profiles/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('dialygo-assets').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('dialygo-assets').getPublicUrl(filePath);
      
      setFormData(prev => ({ ...prev, user_profile_photo: data.publicUrl }));
      setMessage({ type: 'success', text: 'Profile photo uploaded. Remember to save changes.' });
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Error uploading photo: ' + error.message });
    } finally {
      setIsUploadingProfile(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Not authenticated");
      const email = sessionData.session.user.email;

      // Handle Password Change Logic
      if (formData.new_password || formData.current_password) {
        if (formData.new_password !== formData.confirm_password) {
          throw new Error("New passwords do not match.");
        }
        
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email!,
          password: formData.current_password,
        });

        if (signInError) {
          setPasswordVerification('invalid');
          throw new Error("Current password is incorrect.");
        } else {
          setPasswordVerification('valid');
          const { error: updateAuthError } = await supabase.auth.updateUser({
            password: formData.new_password
          });
          if (updateAuthError) throw updateAuthError;
          
          await supabase.from('users').update({ user_password: formData.new_password }).eq('user_email', email);
        }
      }

      // Update User Profile
      const { error: userError } = await supabase
        .from('users')
        .update({
          user_fullname: formData.fullname,
          user_contact_number: formData.contact_number,
          user_profile_photo: formData.user_profile_photo
        })
        .eq('user_email', email);

      if (userError) throw userError;

      setInitialData({
        fullname: formData.fullname,
        contact_number: formData.contact_number,
        user_profile_photo: formData.user_profile_photo
      });

      setFormData(prev => ({
        ...prev,
        current_password: '',
        new_password: '',
        confirm_password: ''
      }));

      setMessage({ type: 'success', text: 'Profile settings updated successfully!' });

    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const passwordsMatch = formData.new_password === formData.confirm_password;
  const hasChanges = JSON.stringify(initialData) !== JSON.stringify({
    fullname: formData.fullname,
    contact_number: formData.contact_number,
    user_profile_photo: formData.user_profile_photo
  }) || (formData.new_password.length > 0 && passwordsMatch);

  if (isLoading) {
    return (
      <div className='min-h-screen bg-slate-50 flex items-center justify-center'>
        <div className='flex flex-col items-center text-blue-600 font-bold'>
          <FiActivity className='text-4xl mb-4 animate-spin' />
          <span>Loading Settings...</span>
        </div>
      </div>
    );
  }

  return (
    <main className="p-4 sm:p-8 max-w-4xl mx-auto pb-24">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Account Settings</h1>
        <p className="text-slate-500 font-medium mt-1 flex items-center gap-2">
          <FiActivity className="text-blue-500" /> Manage your clinical profile and security
        </p>
      </header>

      <div className="space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* PERSONAL PROFILE SECTION */}
          <div className='bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden'>
            <div className='p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3'>
              <div className='h-10 w-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-lg'><FiUser /></div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">Personal Profile</h2>
                <p className="text-xs text-slate-500 font-medium">Update your contact details and photo.</p>
              </div>
            </div>
            
            <div className='p-6 space-y-6'>
              <div className='flex items-center gap-6'>
                <div className='relative shrink-0'>
                  <div className='h-24 w-24 rounded-full bg-slate-100 border-4 border-white shadow-lg overflow-hidden flex items-center justify-center'>
                    {formData.user_profile_photo ? (
                      <img src={formData.user_profile_photo} alt="Profile" className='w-full h-full object-cover' />
                    ) : (
                      <FiCamera className='text-3xl text-slate-300' />
                    )}
                  </div>
                  <label className='absolute bottom-0 right-0 h-8 w-8 bg-blue-600 rounded-full text-white flex items-center justify-center shadow-md cursor-pointer hover:bg-blue-700 transition-colors'>
                    {isUploadingProfile ? <FiLoader className='animate-spin' /> : <FiCamera className='text-sm' />}
                    <input type='file' accept='image/*' className='hidden' onChange={handleProfilePhotoUpload} disabled={isUploadingProfile} />
                  </label>
                </div>
                
                <div className='flex-1 grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div>
                    <label className='block text-[10px] font-bold text-slate-400 uppercase mb-1.5'>Full Name (Dr.)</label>
                    <input type='text' name='fullname' value={formData.fullname} onChange={handleInputChange} className='w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-800 transition-colors' />
                  </div>
                  <div>
                    <label className='block text-[10px] font-bold text-slate-400 uppercase mb-1.5'>Contact Number</label>
                    <input type='text' name='contact_number' value={formData.contact_number} onChange={handleInputChange} className='w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-800 transition-colors' />
                  </div>
                  
                  {/* Read Only Branch Display */}
                  <div className="md:col-span-2 mt-2">
                    <div className="flex items-center gap-3 p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                      <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                        <FiMapPin />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-blue-400 uppercase">Assigned Clinical Branch</p>
                        <p className="font-black text-blue-900">{formData.branch_name}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECURITY SECTION */}
          <div className='bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden'>
            <div className='p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3'>
              <div className='h-10 w-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center text-lg'><FiLock /></div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">Security</h2>
                <p className="text-xs text-slate-500 font-medium">Update your password to keep your account secure.</p>
              </div>
            </div>
            
            <div className='p-6 grid grid-cols-1 md:grid-cols-2 gap-6'>
              <div>
                <label className='block text-[10px] font-bold text-slate-400 uppercase mb-1.5'>Current Password</label>
                <div className='relative'>
                  <input type='password' name='current_password' placeholder='Enter current password to make changes' value={formData.current_password} onChange={handleInputChange} className={`w-full p-3.5 bg-slate-50 border rounded-xl outline-none transition-colors font-medium text-slate-800 ${passwordVerification === 'invalid' ? 'border-red-300 focus:border-red-500' : 'border-slate-200 focus:border-blue-500'}`} />
                  {passwordVerification === 'invalid' && <FiAlertTriangle className='absolute right-3.5 top-4 text-red-500' />}
                </div>
              </div>
              
              <div className='space-y-4'>
                <div>
                  <label className='block text-[10px] font-bold text-slate-400 uppercase mb-1.5'>New Password</label>
                  <input type='password' name='new_password' placeholder='Enter new password' value={formData.new_password} onChange={handleInputChange} className='w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-800 transition-colors' />
                </div>
                <div>
                  <label className='block text-[10px] font-bold text-slate-400 uppercase mb-1.5'>Confirm New Password</label>
                  <input type='password' name='confirm_password' placeholder='Confirm your new password' value={formData.confirm_password} onChange={handleInputChange} className={`w-full p-3.5 bg-slate-50 border rounded-xl outline-none focus:border-blue-500 font-medium text-slate-800 transition-colors ${formData.confirm_password.length > 0 && !passwordsMatch ? 'border-red-300 focus:border-red-500' : 'border-slate-200'}`} />
                </div>
              </div>
            </div>
          </div>

          {message.text && (
            <div className={`p-4 rounded-xl font-bold text-sm border flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
              <span>{message.type === 'success' ? <FiCheckCircle /> : <FiXCircle />}</span>
              <span>{message.text}</span>
            </div>
          )}

          {hasChanges && (
            <div className='flex justify-end pt-2'>
              <button type='submit' disabled={isSaving || passwordVerification === 'invalid' || isUploadingProfile} className='px-8 py-3.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:bg-blue-300 shadow-lg shadow-blue-500/20 transition-all'>
                {isSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}