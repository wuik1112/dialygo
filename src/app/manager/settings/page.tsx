'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import { FiActivity } from 'react-icons/fi';

export default function ManagerSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' }); 
  const router = useRouter();

  const [passwordVerification, setPasswordVerification] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [isUploadingProfile, setIsUploadingProfile] = useState(false);
  const [isUploadingGallery, setIsUploadingGallery] = useState(false);
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [opDays, setOpDays] = useState('Monday - Saturday');
  const [openTime, setOpenTime] = useState('07:00');
  const [closeTime, setCloseTime] = useState('21:00');

  const [formData, setFormData] = useState({
    fullname: '',
    contact_number: '',
    user_profile_photo: '',
    current_password: '',
    new_password: '',
    confirm_password: '',
    branch_contact: '',
    branch_address: '',
    gallery_photos: [] as string[],
    amenities: [] as string[]
  });

  const availableAmenities = [
    '📶 Free Wi-Fi', '🅿️ Free Parking', '♿ Wheelchair Accessible', 
    '📺 Personal TV/Entertainment', '🍱 Complimentary Meals', '🔒 Private VIP Rooms',
    '🕌 Surau / Prayer Room', '🚑 Emergency Defibrillator (AED)'
  ];

  const [readOnlyData, setReadOnlyData] = useState({
    user_email: '', user_ic: '', branch_id: null, branch_name: '', 
    registered_machines: 0, database_capacity: 0
  });

  useEffect(() => {
    async function fetchManagerProfile() {
      setIsLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) throw new Error("No active session");
        
        const email = sessionData.session.user.email;
        const { data: userData, error: userError } = await supabase
          .from('users').select('*').eq('user_email', email).single();

        if (userError) throw userError;

        let branchData = null;
        let machineCount = 0;

        if (userData.branch_id) {
          const { data: bData } = await supabase.from('branches').select('*').eq('id', userData.branch_id).single();
          branchData = bData;

          const { count } = await supabase.from('machines').select('*', { count: 'exact', head: true }).eq('branch_id', userData.branch_id).neq('status', 'Retired');
          machineCount = count || 0;

          if (bData.branch_operating_hours) {
            const parts = bData.branch_operating_hours.split(': ');
            if (parts.length === 2) {
              setOpDays(parts[0]);
              const times = parts[1].split(' - ');
              if (times.length === 2) {
                setOpenTime(times[0]);
                setCloseTime(times[1]);
              }
            }
          }
        }

        setFormData({
          fullname: userData.user_fullname || '',
          contact_number: userData.user_contact_number || '',
          user_profile_photo: userData.user_profile_photo || '',
          current_password: '', new_password: '', confirm_password: '',
          branch_contact: branchData?.branch_contact || '',
          branch_address: branchData?.branch_address || '',
          gallery_photos: branchData?.gallery_photos || [],
          amenities: branchData?.amenities || []
        });

        setReadOnlyData({
          user_email: userData.user_email,
          user_ic: userData.user_ic || '',
          branch_id: userData.branch_id,
          branch_name: branchData?.branch_name || 'Unassigned Branch',
          registered_machines: machineCount,
          database_capacity: branchData?.total_machines || 0
        });

      } catch (err: any) {
        setMessage({ type: 'error', text: err.message });
      } finally {
        setIsLoading(false);
      }
    }
    fetchManagerProfile();
  }, []);

  const validateField = (name: string, value: string) => {
    let error = '';
    const trimmedValue = value.trim();

    if (name === 'fullname' && !trimmedValue) error = 'Required';
    
    if (name === 'contact_number' || name === 'branch_contact') {
      if (!trimmedValue) {
        error = 'Required';
      } else {
        const cleanContact = trimmedValue.replace(/[\s-]/g, '');
        if (!/^\+?[0-9]{10,15}$/.test(cleanContact)) error = 'Must be 10-15 digits';
      }
    }

    if (name === 'time' && openTime === closeTime) {
      error = 'Cannot be identical';
    }

    setFieldErrors(prev => ({ ...prev, [name]: error }));
    return error === '';
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => validateField(e.target.name, e.target.value);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) setFieldErrors(prev => ({ ...prev, [name]: '' }));
    if (name === 'current_password') setPasswordVerification('idle');
  };

  const toggleAmenity = (amenity: string) => {
    setFormData(prev => {
      const isSelected = prev.amenities.includes(amenity);
      const newAmenities = isSelected 
        ? prev.amenities.filter(a => a !== amenity)
        : [...prev.amenities, amenity];
      return { ...prev, amenities: newAmenities };
    });
  };

  const handleCurrentPasswordBlur = async () => {
    if (!formData.current_password) return;
    setPasswordVerification('checking');
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: readOnlyData.user_email, password: formData.current_password
    });
    setPasswordVerification(signInError ? 'invalid' : 'valid');
  };

  const handleProfileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) throw new Error("Image must be smaller than 2MB.");
      
      setIsUploadingProfile(true);
      setMessage({ type: '', text: '' });
      
      const fileExt = file.name.split('.').pop();
      const fileName = `avatar_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage.from('profile-photos').upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('profile-photos').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, user_profile_photo: data.publicUrl }));

    } catch (error: any) {
      alert(`Upload failed: ${error.message}`);
    } finally {
      setIsUploadingProfile(false);
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      
      setIsUploadingGallery(true);
      setMessage({ type: '', text: '' });

      const newUrls: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 2 * 1024 * 1024) throw new Error(`File ${file.name} is larger than 2MB.`);
        
        const fileExt = file.name.split('.').pop();
        const fileName = `gallery_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage.from('branch-photos').upload(fileName, file);
        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('branch-photos').getPublicUrl(fileName);
        newUrls.push(data.publicUrl);
      }

      setFormData(prev => ({ ...prev, gallery_photos: [...prev.gallery_photos, ...newUrls] }));

    } catch (error: any) {
      alert(`Upload failed: ${error.message}`);
    } finally {
      setIsUploadingGallery(false);
      e.target.value = ''; 
    }
  };

  const removeGalleryPhoto = (urlToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      gallery_photos: prev.gallery_photos.filter(url => url !== urlToRemove)
    }));
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
      const isNameValid = validateField('fullname', formData.fullname);
      const isContactValid = validateField('contact_number', formData.contact_number);
      const isBranchContactValid = readOnlyData.branch_id ? validateField('branch_contact', formData.branch_contact) : true;
      const isTimeValid = validateField('time', '');

      if (!isNameValid || !isContactValid || !isBranchContactValid || !isTimeValid) {
        setIsSaving(false);
        return; 
      }

      let passwordChanged = false;
      if (formData.current_password || formData.new_password || formData.confirm_password) {
        if (!formData.current_password) {
          setFieldErrors(prev => ({ ...prev, current_password: 'Required' }));
          setIsSaving(false); return;
        }
        if (passwordVerification === 'invalid') {
           setFieldErrors(prev => ({ ...prev, current_password: 'Incorrect password' }));
           setIsSaving(false); return;
        }
        if (!allRequirementsMet) {
           setFieldErrors(prev => ({ ...prev, new_password: 'Must meet requirements' }));
           setIsSaving(false); return;
        }
        if (!passwordsMatch) {
           setFieldErrors(prev => ({ ...prev, confirm_password: 'Passwords do not match' }));
           setIsSaving(false); return;
        }

        const { error: authError } = await supabase.auth.updateUser({ password: formData.new_password });
        if (authError) throw authError;
        passwordChanged = true;
      }

      const { error: userError } = await supabase
        .from('users')
        .update({
          user_fullname: formData.fullname.trim(),
          user_contact_number: formData.contact_number.trim(),
          user_profile_photo: formData.user_profile_photo || null,
          ...(passwordChanged ? { user_password: formData.new_password } : {})
        })
        .eq('user_email', readOnlyData.user_email);

      if (userError) throw userError;

      if (readOnlyData.branch_id) {
        const compiledHours = `${opDays}: ${openTime} - ${closeTime}`;
        const { error: branchError } = await supabase
          .from('branches')
          .update({
            branch_contact: formData.branch_contact.trim(),
            branch_operating_hours: compiledHours,
            amenities: formData.amenities,
            gallery_photos: formData.gallery_photos
          })
          .eq('id', readOnlyData.branch_id);

        if (branchError) throw branchError;
      }

      if (passwordChanged) {
        setMessage({ type: 'success', text: 'Settings & Password updated successfully.' });
        setTimeout(() => { router.push('/manager'); }, 1500);
      } else {
        setMessage({ type: 'success', text: 'Profile and Branch settings saved!' });
        setFormData(prev => ({ ...prev, current_password: '', new_password: '', confirm_password: '' }));
        setPasswordVerification('idle');
      }

    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Database error occurred while saving.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className='min-h-screen bg-slate-50 flex items-center justify-center'>
        <div className='flex flex-col items-center text-blue-600 font-bold'>
          <FiActivity className='text-4xl mb-4 animate-spin' />
          <span>Loading Manager Profile...</span>
        </div>
      </div>
    );
  }

  const CheckItem = ({ isValid, text }: { isValid: boolean, text: string }) => (
    <li className={`flex items-center gap-2 transition-colors duration-300 ${isValid ? 'text-emerald-600' : 'text-slate-400'}`}>
      <span>{isValid ? '✅' : '⚪'}</span><span className={isValid ? 'font-medium' : ''}>{text}</span>
    </li>
  );

  return (
    <main className='p-8 bg-slate-50 min-h-screen font-sans pb-24'>
      <div className='max-w-4xl mx-auto'>
        
        <div className='mb-8'>
          <h1 className='text-3xl font-bold text-slate-800 tracking-tight'>Manager Settings</h1>
          <p className='text-slate-500 mt-1 font-medium'>Manage your personal profile and public branch details.</p>
        </div>

        <form onSubmit={handleSaveSettings} className='space-y-8'>
          
          {/* --- PERSONAL INFORMATION --- */}
          <div className='bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden'>
            <div className='px-8 py-5 border-b border-slate-100 bg-slate-50/50'>
              <h2 className='text-sm font-bold text-slate-800 uppercase tracking-wider'>Personal Profile</h2>
            </div>
            <div className='p-8 space-y-6'>
              
              <div className='flex items-center gap-6 pb-6 border-b border-slate-100'>
                <div className={`relative w-24 h-24 rounded-full overflow-hidden border-2 border-dashed flex items-center justify-center group transition-colors ${isUploadingProfile ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-blue-400'}`}>
                  {formData.user_profile_photo ? (
                    <>
                      <img src={formData.user_profile_photo} alt="Profile" className='w-full h-full object-cover' />
                      <div className='absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer'>
                        <span className='text-white text-xs font-bold'>Change</span>
                      </div>
                    </>
                  ) : (
                    <span className='text-3xl group-hover:scale-110 transition-transform'>📸</span>
                  )}
                  <input type="file" accept="image/*" onChange={handleProfileUpload} disabled={isUploadingProfile} className='absolute inset-0 w-full h-full opacity-0 cursor-pointer' />
                </div>
                <div>
                  <h3 className='font-bold text-slate-800'>{formData.fullname || 'Upload Profile Photo'}</h3>
                  <p className='text-sm text-slate-500 mt-0.5'>{isUploadingProfile ? 'Uploading securely...' : 'JPG, PNG, or GIF (Max 2MB)'}</p>
                </div>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                <div>
                  <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>System Email (Locked)</label>
                  <input type='email' disabled value={readOnlyData.user_email} className='w-full p-3.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-medium cursor-not-allowed' />
                </div>
                <div>
                  <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Identity Card (Locked)</label>
                  <div className='w-full p-3.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-medium font-mono cursor-not-allowed'>
                    {readOnlyData.user_ic ? `XXXXXX-XX-${readOnlyData.user_ic.slice(-4)}` : 'N/A'}
                  </div>
                </div>
                <div>
                  <label className='block text-xs font-bold text-slate-500 uppercase mb-2 flex justify-between'>
                    <span>Full Name</span>
                    {fieldErrors.fullname && <span className='text-red-500 normal-case animate-pulse'>❌ {fieldErrors.fullname}</span>}
                  </label>
                  <input type='text' name='fullname' required value={formData.fullname} onChange={handleInputChange} onBlur={handleBlur} className={`w-full p-3.5 bg-slate-50 border rounded-xl outline-none focus:border-blue-500 font-medium text-slate-800 transition-colors ${fieldErrors.fullname ? 'border-red-400 focus:border-red-500 bg-red-50' : 'border-slate-200'}`} />
                </div>
                <div>
                  <label className='block text-xs font-bold text-slate-500 uppercase mb-2 flex justify-between'>
                    <span>Personal Contact Number</span>
                    {fieldErrors.contact_number && <span className='text-red-500 normal-case animate-pulse'>❌ {fieldErrors.contact_number}</span>}
                  </label>
                  <input type='text' name='contact_number' required value={formData.contact_number} onChange={handleInputChange} onBlur={handleBlur} placeholder="e.g. 0123456789" className={`w-full p-3.5 bg-slate-50 border rounded-xl outline-none focus:border-blue-500 font-medium text-slate-800 transition-colors ${fieldErrors.contact_number ? 'border-red-400 focus:border-red-500 bg-red-50' : 'border-slate-200'}`} />
                </div>
              </div>
            </div>
          </div>

          {/* --- PUBLIC BRANCH PROFILE --- */}
          <div className='bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden'>
            <div className='px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center'>
              <h2 className='text-sm font-bold text-slate-800 uppercase tracking-wider'>Public Branch Profile: {readOnlyData.branch_name}</h2>
              <span className='text-[10px] font-bold py-1 px-2.5 bg-blue-100 text-blue-700 rounded-full uppercase tracking-widest'>Visible to Patients</span>
            </div>
            
            <div className='p-8 space-y-8'>
              
              {/* NEW MULTI-PHOTO GALLERY UI */}
              <div>
                <div className='flex justify-between items-end mb-4'>
                  <div>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-1'>Branch Photo Gallery</label>
                    <p className='text-xs text-slate-400'>Upload multiple photos of your facilities to help patients explore.</p>
                  </div>
                  <div className='relative overflow-hidden inline-block'>
                    <button type="button" disabled={isUploadingGallery} className='px-4 py-2 bg-blue-50 text-blue-600 font-bold text-xs rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-50'>
                      {isUploadingGallery ? 'Uploading...' : '+ Add Photos'}
                    </button>
                    <input 
                      type="file" multiple accept="image/*" 
                      onChange={handleGalleryUpload} disabled={isUploadingGallery} 
                      className='absolute inset-0 opacity-0 cursor-pointer' 
                      title="Select one or multiple photos" 
                    />
                  </div>
                </div>

                {formData.gallery_photos.length === 0 && !isUploadingGallery ? (
                  <div className='w-full p-8 border-2 border-dashed border-slate-200 bg-slate-50 rounded-xl text-center'>
                    <span className='text-4xl mb-2 block opacity-50'>🏥</span>
                    <p className='text-sm font-bold text-slate-500'>Your gallery is empty.</p>
                    <p className='text-xs text-slate-400 mt-1'>Click "Add Photos" to showcase your branch.</p>
                  </div>
                ) : (
                  <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4'>
                    {formData.gallery_photos.map((photoUrl, idx) => (
                      <div key={idx} className='group relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-sm'>
                        <img src={photoUrl} alt={`Gallery ${idx + 1}`} className='w-full h-full object-cover' />
                        
                        {/* Overlay Controls */}
                        <div className='absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3'>
                          <button type="button" onClick={() => setEnlargedPhoto(photoUrl)} className='w-8 h-8 bg-white/20 hover:bg-white/40 rounded-full flex items-center justify-center text-white text-lg transition-colors' title="View Full Size">
                            🔍
                          </button>
                          <button type="button" onClick={() => removeGalleryPhoto(photoUrl)} className='w-8 h-8 bg-red-500/80 hover:bg-red-600 rounded-full flex items-center justify-center text-white text-lg transition-colors' title="Delete Photo">
                            🗑️
                          </button>
                        </div>
                        
                        {/* Hero Badge for first image */}
                        {idx === 0 && (
                          <div className='absolute top-2 left-2 px-2 py-1 bg-blue-600/90 backdrop-blur-sm text-white text-[9px] font-bold uppercase tracking-widest rounded shadow-sm'>
                            Cover Photo
                          </div>
                        )}
                      </div>
                    ))}
                    {isUploadingGallery && (
                      <div className='aspect-square rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 flex flex-col items-center justify-center animate-pulse'>
                        <span className='text-blue-500 text-2xl mb-2'>⏳</span>
                        <span className='text-[10px] font-bold text-blue-600 uppercase tracking-widest'>Uploading</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className={`p-5 rounded-xl border transition-colors ${fieldErrors.time ? 'bg-red-50 border-red-200' : 'bg-amber-50/50 border-amber-100'}`}>
                <div className='flex justify-between items-center mb-4'>
                  <h3 className={`text-xs font-black uppercase tracking-widest ${fieldErrors.time ? 'text-red-600' : 'text-amber-600'}`}>Clinic Operating Hours</h3>
                  {fieldErrors.time && <span className='text-red-600 text-xs font-bold animate-pulse'>❌ {fieldErrors.time}</span>}
                </div>
                <div className='flex flex-col md:flex-row gap-4 items-end'>
                  <div className='flex-1 w-full'>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Active Days</label>
                    <select value={opDays} onChange={e => setOpDays(e.target.value)} className='w-full p-3 bg-white border border-slate-300 rounded-xl outline-none focus:border-amber-500 font-bold text-slate-800'>
                      <option value="Monday - Saturday">Monday - Saturday (Standard)</option>
                      <option value="Monday - Friday">Monday - Friday</option>
                      <option value="Everyday (Mon-Sun)">Everyday (Mon-Sun)</option>
                    </select>
                  </div>
                  <div className='w-full md:w-32'>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Opening</label>
                    <input type="time" required value={openTime} onChange={e => { setOpenTime(e.target.value); setFieldErrors(prev => ({...prev, time: ''})); }} className='w-full p-3 bg-white border border-slate-300 rounded-xl outline-none focus:border-amber-500 font-bold text-slate-800' />
                  </div>
                  <div className='w-full md:w-32'>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Closing</label>
                    <input type="time" required value={closeTime} onChange={e => { setCloseTime(e.target.value); setFieldErrors(prev => ({...prev, time: ''})); }} className='w-full p-3 bg-white border border-slate-300 rounded-xl outline-none focus:border-amber-500 font-bold text-slate-800' />
                  </div>
                </div>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                <div>
                  <label className='block text-xs font-bold text-slate-500 uppercase mb-2 flex justify-between'>
                    <span>Public Contact / Help Desk</span>
                    {fieldErrors.branch_contact && <span className='text-red-500 normal-case animate-pulse'>❌ {fieldErrors.branch_contact}</span>}
                  </label>
                  <input type='text' name='branch_contact' required value={formData.branch_contact} onChange={handleInputChange} onBlur={handleBlur} placeholder="e.g. 04-123 4567" className={`w-full p-3.5 bg-slate-50 border rounded-xl outline-none focus:border-blue-500 font-medium text-slate-800 transition-colors ${fieldErrors.branch_contact ? 'border-red-400 focus:border-red-500 bg-red-50' : 'border-slate-200'}`} />
                </div>
                <div>
                  <label className='block text-xs font-bold text-slate-500 uppercase mb-2 flex justify-between'>
                    <span>Registered Address</span><span className='text-slate-400 font-normal normal-case'>(Locked by Admin)</span>
                  </label>
                  <textarea disabled value={formData.branch_address} className='w-full p-3.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-medium cursor-not-allowed resize-none h-[54px]' />
                </div>
              </div>

              <div className='pt-4 border-t border-slate-100'>
                <label className='block text-xs font-bold text-slate-500 uppercase mb-4'>Services & Infrastructure Provided</label>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                  {availableAmenities.map(amenity => (
                    <label key={amenity} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${formData.amenities.includes(amenity) ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-white border-slate-200 hover:border-blue-300 text-slate-600'}`}>
                      <input type="checkbox" checked={formData.amenities.includes(amenity)} onChange={() => toggleAmenity(amenity)} className='w-5 h-5 rounded text-blue-600 focus:ring-blue-500' />
                      <span className='font-bold text-sm'>{amenity}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* --- SECURITY & PASSWORD --- */}
          <div className='bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden'>
            <div className='px-8 py-5 border-b border-slate-100 bg-slate-50/50'>
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
                <label className='block text-xs font-bold text-slate-500 uppercase mb-2 flex justify-between'>
                  <span>Current Password</span>
                  {fieldErrors.current_password && <span className='text-red-500 normal-case animate-pulse'>❌ {fieldErrors.current_password}</span>}
                </label>
                <div className='relative'>
                  <input type='password' name='current_password' placeholder='Required to authorize password changes' value={formData.current_password} onChange={handleInputChange} onBlur={handleCurrentPasswordBlur} className={`w-full p-3.5 pr-12 bg-slate-50 border rounded-xl outline-none focus:border-blue-500 font-medium text-slate-800 transition-colors ${passwordVerification === 'invalid' || fieldErrors.current_password ? 'border-red-400 focus:border-red-500 bg-red-50' : passwordVerification === 'valid' ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-200'}`} />
                  <div className='absolute right-4 top-1/2 -translate-y-1/2 text-lg'>
                    {passwordVerification === 'checking' && <span className="animate-spin inline-block text-blue-500">⏳</span>}
                    {passwordVerification === 'valid' && <span className="text-emerald-500">✅</span>}
                    {passwordVerification === 'invalid' && <span className="text-red-500">❌</span>}
                  </div>
                </div>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-100'>
                <div>
                  <label className='block text-xs font-bold text-slate-500 uppercase mb-2 flex justify-between'>
                    <span>New Password</span>
                    {fieldErrors.new_password && <span className='text-red-500 normal-case animate-pulse'>❌ {fieldErrors.new_password}</span>}
                  </label>
                  <input type='password' name='new_password' value={formData.new_password} onChange={handleInputChange} className={`w-full p-3.5 bg-slate-50 border rounded-xl outline-none focus:border-blue-500 font-medium text-slate-800 transition-colors ${formData.new_password.length > 0 && !allRequirementsMet ? 'border-amber-300 focus:border-amber-500' : 'border-slate-200'}`} />
                </div>
                <div>
                  <label className='block text-xs font-bold text-slate-500 uppercase mb-2 flex justify-between'>
                    <span>Confirm Password</span>
                    {fieldErrors.confirm_password && <span className='text-red-500 normal-case animate-pulse'>❌ {fieldErrors.confirm_password}</span>}
                  </label>
                  <input type='password' name='confirm_password' value={formData.confirm_password} onChange={handleInputChange} className={`w-full p-3.5 bg-slate-50 border rounded-xl outline-none focus:border-blue-500 font-medium text-slate-800 transition-colors ${formData.confirm_password.length > 0 && !passwordsMatch ? 'border-red-300 focus:border-red-500' : 'border-slate-200'}`} />
                </div>
              </div>
            </div>
          </div>

          {message.text && (
            <div className={`p-4 rounded-xl font-bold text-sm border flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
              <span>{message.type === 'success' ? '✅' : '❌'}</span><span>{message.text}</span>
            </div>
          )}

          <div className='flex justify-end pt-2 pb-12'>
            <button type='submit' disabled={isSaving || passwordVerification === 'invalid' || isUploadingProfile || isUploadingGallery || Object.values(fieldErrors).some(err => err !== '')} className='px-8 py-3.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:bg-blue-300 shadow-lg shadow-blue-500/20 transition-all'>
              {isSaving ? 'Authenticating & Saving...' : 'Save All Settings'}
            </button>
          </div>

        </form>
      </div>

      {/* LIGHTBOX OVERLAY */}
      {enlargedPhoto && (
        <div className='fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[100] flex items-center justify-center p-4 sm:p-8 cursor-pointer' onClick={() => setEnlargedPhoto(null)}>
          <div className='relative max-w-5xl max-h-[90vh] w-full h-full flex flex-col items-center justify-center'>
            <button onClick={() => setEnlargedPhoto(null)} className='absolute top-4 right-4 text-white hover:text-red-400 text-4xl font-black bg-slate-900/50 w-14 h-14 rounded-full flex items-center justify-center'>&times;</button>
            <img src={enlargedPhoto} alt="Enlarged" className='max-w-full max-h-full object-contain rounded-xl shadow-2xl' onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}
    </main>
  );
}