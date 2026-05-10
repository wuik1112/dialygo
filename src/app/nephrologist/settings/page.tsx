'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import { 
  FiActivity, FiCamera, FiLoader, FiAlertTriangle, 
  FiCheckCircle, FiXCircle, FiLock, FiUser, FiMapPin,
  FiMail, FiCreditCard, FiCalendar, FiAward
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
    user_email: '',
    user_ic: '',
    fullname: '',
    contact_number: '',
    user_gender: '',
    user_date_of_birth: '',
    user_profile_photo: '',
    branch_name: '', // Read-only
    professional_license_number: '', // Read-only
    current_password: '',
    new_password: '',
    confirm_password: ''
  });

  const [initialData, setInitialData] = useState({
    fullname: '',
    contact_number: '',
    user_gender: '',
    user_date_of_birth: '',
    user_profile_photo: ''
  });

  useEffect(() => {
    async function fetchUserProfile() {
      setIsLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (sessionData.session) {
        const email = sessionData.session.user.email;
        
        // Fetch User + Branch + Staff License
        const { data: userData } = await supabase
          .from('users')
          .select('*, branches(branch_name), staff(professional_license_number)')
          .eq('user_email', email)
          .single();

        if (userData) {
          const branchInfo = userData.branches as any;
          const resolvedBranchName = Array.isArray(branchInfo) 
            ? branchInfo[0]?.branch_name 
            : branchInfo?.branch_name;
            
          const staffInfo = userData.staff as any;
          const resolvedLicense = Array.isArray(staffInfo)
            ? staffInfo[0]?.professional_license_number
            : staffInfo?.professional_license_number;

          const profileData = {
            user_email: userData.user_email || '',
            user_ic: userData.user_ic || '',
            fullname: userData.user_fullname || '',
            contact_number: userData.user_contact_number || '',
            user_gender: userData.user_gender || '',
            user_date_of_birth: userData.user_date_of_birth || '',
            user_profile_photo: userData.user_profile_photo || '',
            branch_name: resolvedBranchName || 'Unassigned Branch',
            professional_license_number: resolvedLicense || 'Not Registered'
          };
          
          setFormData(prev => ({ ...prev, ...profileData }));
          
          setInitialData({
            fullname: profileData.fullname,
            contact_number: profileData.contact_number,
            user_gender: profileData.user_gender,
            user_date_of_birth: profileData.user_date_of_birth,
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
          user_gender: formData.user_gender,
          user_date_of_birth: formData.user_date_of_birth || null,
          user_profile_photo: formData.user_profile_photo
        })
        .eq('user_email', email);

      if (userError) throw userError;

      setInitialData({
        fullname: formData.fullname,
        contact_number: formData.contact_number,
        user_gender: formData.user_gender,
        user_date_of_birth: formData.user_date_of_birth,
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
    user_gender: formData.user_gender,
    user_date_of_birth: formData.user_date_of_birth,
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
    <main className="p-4 sm:p-8 max-w-5xl mx-auto pb-24">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Account Settings</h1>
        <p className="text-slate-500 font-medium mt-1 flex items-center gap-2">
          <FiActivity className="text-blue-500" /> Manage your clinical profile and security
        </p>
      </header>

      <div className="space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* PERSONAL PROFILE SECTION */}
          <div className='bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500'>
            <div className='p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3'>
              <div className='h-10 w-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-lg'><FiUser /></div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">Personal Profile</h2>
                <p className="text-xs text-slate-500 font-medium">Update your core demographic and contact details.</p>
              </div>
            </div>
            
            <div className='p-6 md:p-8 space-y-8'>
              <div className='flex flex-col md:flex-row gap-8'>
                
                {/* Profile Picture Upload */}
                <div className='flex flex-col items-center gap-4'>
                  <div className='relative shrink-0'>
                    <div className='h-32 w-32 rounded-full bg-slate-100 border-4 border-white shadow-lg overflow-hidden flex items-center justify-center'>
                      {formData.user_profile_photo ? (
                        <img src={formData.user_profile_photo} alt="Profile" className='w-full h-full object-cover' />
                      ) : (
                        <FiCamera className='text-4xl text-slate-300' />
                      )}
                    </div>
                    <label className='absolute bottom-0 right-2 h-10 w-10 bg-blue-600 rounded-full text-white flex items-center justify-center shadow-lg cursor-pointer hover:bg-blue-700 hover:scale-105 transition-all'>
                      {isUploadingProfile ? <FiLoader className='animate-spin' /> : <FiCamera className='text-lg' />}
                      <input type='file' accept='image/*' className='hidden' onChange={handleProfilePhotoUpload} disabled={isUploadingProfile} />
                    </label>
                  </div>
                  <p className='text-[10px] font-black text-slate-400 uppercase tracking-widest text-center'>Profile Photo</p>
                </div>
                
                {/* Form Fields */}
                <div className='flex-1 grid grid-cols-1 md:grid-cols-2 gap-6'>
                  <div>
                    <label className='block text-[10px] font-bold text-slate-400 uppercase mb-1.5'>Full Name (Dr.)</label>
                    <input type='text' name='fullname' required value={formData.fullname} onChange={handleInputChange} className='w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-slate-800 transition-colors' />
                  </div>
                  <div>
                    <label className='block text-[10px] font-bold text-slate-400 uppercase mb-1.5'>Contact Number</label>
                    <input type='text' name='contact_number' required value={formData.contact_number} onChange={handleInputChange} className='w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-slate-800 transition-colors' />
                  </div>
                  
                  <div>
                    <label className='block text-[10px] font-bold text-slate-400 uppercase mb-1.5'>Gender</label>
                    <select name='user_gender' value={formData.user_gender} onChange={handleInputChange} className='w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-slate-800 transition-colors'>
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className='block text-[10px] font-bold text-slate-400 uppercase mb-1.5'>Date of Birth</label>
                    <input type='date' name='user_date_of_birth' value={formData.user_date_of_birth} onChange={handleInputChange} className='w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-slate-800 transition-colors' />
                  </div>

                  {/* Read-Only System Identity Fields */}
                  <div className='md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100'>
                    <div>
                      <label className='flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase mb-1.5'><FiCreditCard /> IC / NRIC Number (Read-Only)</label>
                      <input type='text' disabled value={formData.user_ic} className='w-full p-3.5 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-500 cursor-not-allowed opacity-70' />
                    </div>
                    <div>
                      <label className='flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase mb-1.5'><FiMail /> Account Email (Read-Only)</label>
                      <input type='email' disabled value={formData.user_email} className='w-full p-3.5 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-500 cursor-not-allowed opacity-70' />
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>

          {/* CLINICAL ASSIGNMENT SECTION (Read-Only) */}
          <div className='bg-blue-50 border border-blue-100 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 shadow-sm animate-in fade-in slide-in-from-bottom-6 duration-700'>
             <div className="flex-1 w-full">
                <p className="text-[10px] font-black text-blue-400 uppercase flex items-center gap-2 mb-2"><FiMapPin /> Assigned Clinical Branch</p>
                <p className="text-xl font-black text-blue-900">{formData.branch_name}</p>
             </div>
             <div className="hidden md:block w-px h-12 bg-blue-200"></div>
             <div className="flex-1 w-full">
                <p className="text-[10px] font-black text-blue-400 uppercase flex items-center gap-2 mb-2"><FiAward /> Professional License No.</p>
                <p className="text-xl font-black text-blue-900">{formData.professional_license_number}</p>
             </div>
          </div>

          {/* SECURITY SECTION */}
          <div className='bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-700'>
            <div className='p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3'>
              <div className='h-10 w-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center text-lg'><FiLock /></div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">Security & Authentication</h2>
                <p className="text-xs text-slate-500 font-medium">Update your password to keep your system access secure.</p>
              </div>
            </div>
            
            <div className='p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-8'>
              <div>
                <label className='block text-[10px] font-bold text-slate-400 uppercase mb-1.5'>Current Password</label>
                <div className='relative'>
                  <input type='password' name='current_password' placeholder='Enter current password to make changes' value={formData.current_password} onChange={handleInputChange} className={`w-full p-3.5 bg-slate-50 border rounded-xl outline-none transition-colors font-bold text-slate-800 ${passwordVerification === 'invalid' ? 'border-red-300 focus:border-red-500' : 'border-slate-200 focus:border-blue-500'}`} />
                  {passwordVerification === 'invalid' && <FiAlertTriangle className='absolute right-3.5 top-4 text-red-500' />}
                </div>
              </div>
              
              <div className='space-y-4'>
                <div>
                  <label className='block text-[10px] font-bold text-slate-400 uppercase mb-1.5'>New Password</label>
                  <input type='password' name='new_password' placeholder='Enter new password' value={formData.new_password} onChange={handleInputChange} className='w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-slate-800 transition-colors' />
                </div>
                <div>
                  <label className='block text-[10px] font-bold text-slate-400 uppercase mb-1.5'>Confirm New Password</label>
                  <input type='password' name='confirm_password' placeholder='Confirm your new password' value={formData.confirm_password} onChange={handleInputChange} className={`w-full p-3.5 bg-slate-50 border rounded-xl outline-none focus:border-blue-500 font-bold text-slate-800 transition-colors ${formData.confirm_password.length > 0 && !passwordsMatch ? 'border-red-300 focus:border-red-500' : 'border-slate-200'}`} />
                </div>
              </div>
            </div>
          </div>

          {message.text && (
            <div className={`p-4 rounded-xl font-bold text-sm border animate-in fade-in duration-300 flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
              <span>{message.type === 'success' ? <FiCheckCircle className="text-lg" /> : <FiXCircle className="text-lg" />}</span>
              <span>{message.text}</span>
            </div>
          )}

          {hasChanges && (
            <div className='flex justify-end pt-4 animate-in slide-in-from-bottom-4 fade-in duration-300'>
              <button type='submit' disabled={isSaving || passwordVerification === 'invalid' || isUploadingProfile} className='px-10 py-4 bg-blue-600 text-white rounded-xl font-black text-sm hover:bg-blue-700 disabled:bg-blue-300 shadow-lg shadow-blue-500/30 transition-all active:scale-95'>
                {isSaving ? 'Authenticating & Saving...' : 'Save All Settings'}
              </button>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}