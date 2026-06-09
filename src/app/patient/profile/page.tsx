'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import PatientBottomNav from '../../../components/PatientBottomNav';

import { 
  FiUser, FiPhone, FiMapPin, FiDroplet, FiLogOut, 
  FiAlertCircle, FiCheckCircle, FiFileText, FiHome,
  FiMail, FiCalendar, FiActivity, FiEye, FiEyeOff, 
  FiFile, FiClock, FiX, FiShield, FiPhoneCall, FiLock, FiHelpCircle, FiEdit2
} from 'react-icons/fi';
import { FaWheelchair, FaWalking } from 'react-icons/fa';

export default function PatientProfile() {
  const [isLoading, setIsLoading] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showIC, setShowIC] = useState(false);
  
  // Document View State
  const [showDocViewer, setShowDocViewer] = useState<{title: string, url: string} | null>(null);

  // Emergency Contact Edit States
  const [showEditEmergency, setShowEditEmergency] = useState(false);
  const [editEmName, setEditEmName] = useState('');
  const [editEmRel, setEditEmRel] = useState('');
  const [editEmPhone, setEditEmPhone] = useState('');
  const [isUpdatingEm, setIsUpdatingEm] = useState(false);
  const [emErrorMsg, setEmErrorMsg] = useState('');

  const router = useRouter();

  useEffect(() => {
    async function loadProfile() {
      setIsLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) throw new Error("Please log in.");

        const email = sessionData.session.user.email;
        const { data: user } = await supabase.from('users').select('*').eq('user_email', email).single();
        
        if (user) {
          const { data: patient } = await supabase
            .from('patients')
            .select('*, branches(branch_name)')
            .eq('user_id', user.user_id)
            .single();
            
          setProfileData({ ...user, ...patient });
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadProfile();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const openEmergencyEdit = () => {
    setEditEmName(profileData?.emergency_contact_name || '');
    setEditEmRel(profileData?.emergency_contact_relationship || '');
    setEditEmPhone(profileData?.emergency_contact_number || '');
    setShowEditEmergency(true);
  };

  const handleUpdateEmergencyContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmErrorMsg('');

    // 1. Name Validation: Only letters and spaces, min 3 chars
    const nameRegex = /^[A-Za-z\s]+$/;
    if (!nameRegex.test(editEmName) || editEmName.trim().length < 3) {
      setEmErrorMsg("Name must contain only letters and be at least 3 characters long.");
      return;
    }

    // 2. Phone Validation: Remove spaces/hyphens, check for 10-15 digits
    const cleanPhone = editEmPhone.replace(/[\s-]/g, '');
    if (!/^\+?[0-9]{10,15}$/.test(cleanPhone)) {
      setEmErrorMsg("Please enter a valid phone number (10 to 15 digits number).");
      return;
    }

    setIsUpdatingEm(true);
    try {
      const { error } = await supabase.from('patients').update({
          emergency_contact_name: editEmName.trim(),
          emergency_contact_relationship: editEmRel,
          emergency_contact_number: editEmPhone.trim()
        }).eq('patient_id', profileData.patient_id);

      if (error) throw error;

      setProfileData((prev: any) => ({
        ...prev,
        emergency_contact_name: editEmName.trim(),
        emergency_contact_relationship: editEmRel,
        emergency_contact_number: editEmPhone.trim()
      }));
      setShowEditEmergency(false);
    } catch (error) {
      setEmErrorMsg("Failed to update emergency contact. Please try again.");
    } finally {
      setIsUpdatingEm(false);
    }
  };

  if (isLoading) {
    return (
      <div className='max-w-md mx-auto bg-slate-50 h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
        <div className='bg-white px-5 pt-12 pb-4 shadow-sm z-10 shrink-0'>
          <h1 className='text-2xl font-black text-slate-800 tracking-tight mb-4'>My Profile</h1>
        </div>
        <div className='flex-1 flex items-center justify-center text-blue-600 font-bold'>
          <span className='animate-pulse'>Loading Profile...</span>
        </div>
        <PatientBottomNav />
      </div>
    );
  }

  // --- STRICT BINARY CLINICAL CALCULATIONS ---
  let isSerologyValidDate = false;
  let serologyStatusText = "No Record";
  
  if (profileData?.last_serology_date) {
    const serologyDate = new Date(profileData.last_serology_date);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    isSerologyValidDate = serologyDate >= sixMonthsAgo;
    serologyStatusText = `Last test: ${serologyDate.toLocaleDateString('en-GB')}`;
  }

  const hasSerologyDoc = !!profileData?.serology_report_url;
  const hasReferralDoc = !!profileData?.referral_letter_url;
  const isEligibleToTravel = profileData?.travel_status === 'Active' && isSerologyValidDate && hasSerologyDoc && hasReferralDoc;

  let ageStr = '-';
  if (profileData?.user_date_of_birth) {
    const dob = new Date(profileData.user_date_of_birth);
    const ageDifMs = Date.now() - dob.getTime();
    const ageDate = new Date(ageDifMs);
    ageStr = `${Math.abs(ageDate.getUTCFullYear() - 1970)} years old`;
  }

  const handleViewDocument = async (title: string, filePath: string) => {
    let path = filePath;
    if (path.includes('http')) {
      path = path.split('/patient_documents/')[1];
    }

    const { data, error } = await supabase.storage.from('patient_documents').createSignedUrl(path, 60);
    if (data) {
      setShowDocViewer({ title: title, url: data.signedUrl });
    } else {
      alert("Failed to load secure document.");
    }
  };

 return (
    <div className='max-w-md mx-auto bg-slate-50 h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
      
      {/* 1. HEADER OVERLAY */}
      <div className='bg-white px-5 pt-12 pb-6 shadow-sm z-10 shrink-0 flex items-center gap-4'>
        <div className='w-16 h-16 rounded-full bg-slate-200 overflow-hidden border-2 border-slate-100 flex-shrink-0'>
          {profileData?.user_profile_photo ? (
            <img src={profileData.user_profile_photo} alt="Profile" className='w-full h-full object-cover' />
          ) : (
            <div className='w-full h-full flex items-center justify-center text-slate-400 text-2xl'><FiUser /></div>
          )}
        </div>
        <div className='flex-1'>
          <h1 className='text-xl font-black text-slate-800 tracking-tight'>{profileData?.user_fullname}</h1>
          <div className='flex items-center gap-2 mt-0.5'>
            <p className='text-sm font-bold text-slate-500 uppercase flex items-center gap-1.5'>
              <FiFileText /> IC: {showIC ? profileData?.user_ic : '••••••-••-••••'}
            </p>
            <button onClick={() => setShowIC(!showIC)} className='p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors active:scale-95'>
              {showIC ? <FiEyeOff className="text-sm" /> : <FiEye className="text-sm" />}
            </button>
          </div>
        </div>
      </div>

      <div className='flex-1 overflow-y-auto p-5 pb-24 space-y-6 custom-scrollbar'>
        
        {/* 2. TRAVEL ELIGIBILITY & DOCUMENTS */}
        <div className={`p-5 rounded-2xl border-2 ${isEligibleToTravel ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <div className='flex items-center gap-2 mb-3'>
            {isEligibleToTravel ? <FiCheckCircle className='text-emerald-600 text-xl' /> : <FiAlertCircle className='text-red-600 text-xl' />}
            <h2 className={`font-black uppercase tracking-widest text-sm ${isEligibleToTravel ? 'text-emerald-800' : 'text-red-800'}`}>
              Travel Eligibility
            </h2>
          </div>
          
          <div className='bg-white rounded-xl p-4 shadow-sm mb-3'>
            <div className='flex justify-between items-center mb-1'>
              <span className='text-xs font-bold text-slate-500'>Serology Expiry Status</span>
              <span className={`text-xs font-black uppercase px-2 py-0.5 rounded-md ${isSerologyValidDate ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {isSerologyValidDate ? 'VALID' : 'EXPIRED'}
              </span>
            </div>
            <p className='text-sm font-bold text-slate-800'>{serologyStatusText}</p>
          </div>

          {!isSerologyValidDate && (
            <div className='bg-red-600 text-white p-4 rounded-xl shadow-md mb-3'>
              <p className='text-sm font-bold leading-snug'>Your Serology blood test has expired (Valid for 6 months only).</p>
            </div>
          )}

          {(!hasSerologyDoc || !hasReferralDoc) && (
            <div className='bg-amber-100 text-amber-900 p-4 rounded-xl shadow-sm mb-3'>
              <p className='text-sm font-bold leading-snug'>Clinical Documents Missing.</p>
              <p className='text-xs font-medium mt-1'>Your Home Centre staff must upload your clinical documents before you can book travel.</p>
            </div>
          )}

          {isEligibleToTravel && (
            <p className='text-sm font-bold text-emerald-700 mb-3'>All clinical requirements met. You are eligible to travel.</p>
          )}

          {/* Attached Documents */}
          <div className='border-t border-black/5 pt-3 mt-3 space-y-2'>
            <h3 className='text-[10px] font-black uppercase tracking-widest opacity-60 mb-2'>Attached Files</h3>
            <div className='flex items-center justify-between bg-white/50 p-2.5 rounded-lg border border-black/5'>
              <div className='flex items-center gap-2'>
                <FiFileText className={hasSerologyDoc ? 'text-emerald-600' : 'text-slate-400'} />
                <span className='text-xs font-bold text-slate-700'>Serology Report</span>
              </div>
              {hasSerologyDoc ? (
                <button onClick={() => handleViewDocument('Serology Report', profileData.serology_report_url)} className='text-blue-600 text-xs font-bold hover:underline'>View</button>
              ) : (
                <span className='text-[10px] font-bold text-red-500'>Missing</span>
              )}
            </div>
            <div className='flex items-center justify-between bg-white/50 p-2.5 rounded-lg border border-black/5'>
              <div className='flex items-center gap-2'>
                <FiFile className={hasReferralDoc ? 'text-emerald-600' : 'text-slate-400'} />
                <span className='text-xs font-bold text-slate-700'>Doctor's Referral</span>
              </div>
              {hasReferralDoc ? (
                <button onClick={() => setShowDocViewer({title: "Doctor's Referral", url: profileData.referral_letter_url})} className='text-blue-600 text-xs font-bold hover:underline'>View</button>
              ) : (
                <span className='text-[10px] font-bold text-red-500'>Missing</span>
              )}
            </div>
          </div>
        </div>

        {/* 3. CONTACT & DEMOGRAPHICS */}
        <div>
          <h2 className='text-xs font-black text-slate-400 uppercase tracking-widest mb-3 pl-1'>Contact & Demographics</h2>
          <div className='bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden'>
            
            <div className='p-4 border-b border-slate-50 flex items-start gap-3'>
              <div className='p-2 bg-slate-100 text-slate-600 rounded-lg'><FiHome className='text-lg' /></div>
              <div>
                <p className='text-xs font-bold text-slate-400'>Home Centre</p>
                <p className='text-sm font-black text-slate-800'>{profileData?.branches?.branch_name || 'Not Assigned'}</p>
              </div>
            </div>

            <div className='p-4 border-b border-slate-50 flex items-start gap-3'>
              <div className='p-2 bg-slate-100 text-slate-600 rounded-lg'><FiCalendar className='text-lg' /></div>
              <div>
                <p className='text-xs font-bold text-slate-400'>Date of Birth / Gender</p>
                <p className='text-sm font-black text-slate-800'>
                  {profileData?.user_date_of_birth ? new Date(profileData.user_date_of_birth).toLocaleDateString('en-GB') : '-'} 
                  <span className='text-slate-400 font-medium'> ({ageStr}) • {profileData?.user_gender || '-'}</span>
                </p>
              </div>
            </div>

            <div className='p-4 border-b border-slate-50 flex items-start gap-3'>
              <div className='p-2 bg-slate-100 text-slate-600 rounded-lg'><FiPhone className='text-lg' /></div>
              <div>
                <p className='text-xs font-bold text-slate-400'>Contact Number</p>
                <p className='text-sm font-black text-slate-800'>{profileData?.user_contact_number || '-'}</p>
              </div>
            </div>

            <div className='p-4 border-b border-slate-50 flex items-start gap-3'>
              <div className='p-2 bg-slate-100 text-slate-600 rounded-lg'><FiMail className='text-lg' /></div>
              <div className='break-all'>
                <p className='text-xs font-bold text-slate-400'>Email Address</p>
                <p className='text-sm font-black text-slate-800'>{profileData?.user_email || '-'}</p>
              </div>
            </div>

            <div className='p-4 flex items-start gap-3'>
              <div className='p-2 bg-slate-100 text-slate-600 rounded-lg'><FiMapPin className='text-lg' /></div>
              <div>
                <p className='text-xs font-bold text-slate-400'>Home Address</p>
                <p className='text-sm font-black text-slate-800 leading-snug'>{profileData?.patient_address || '-'}</p>
              </div>
            </div>

          </div>
        </div>

        {/* 4. EMERGENCY CONTACT */}
        <div>
          <div className='flex justify-between items-end mb-3 pl-1 pr-2'>
            <h2 className='text-xs font-black text-slate-400 uppercase tracking-widest'>Emergency Contact</h2>
            <button onClick={openEmergencyEdit} className='text-[10px] font-bold text-blue-600 flex items-center gap-1 hover:underline'>
              <FiEdit2 /> Edit
            </button>
          </div>
          <div className='bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden'>
            <div className='p-4 flex items-start gap-3 bg-red-50/30'>
              <div className='p-2 bg-red-100 text-red-600 rounded-lg'><FiPhoneCall className='text-lg' /></div>
              <div>
                <p className='text-xs font-bold text-red-400 uppercase tracking-widest mb-0.5'>Primary Contact</p>
                <p className='text-base font-black text-slate-800'>{profileData?.emergency_contact_name || 'Not Provided'}</p>
                <p className='text-sm font-bold text-slate-500 mt-0.5 flex items-center gap-1.5'>
                  {profileData?.emergency_contact_relationship || '-'} <span className='text-slate-300'>•</span> {profileData?.emergency_contact_number || '-'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 5. CLINICAL DIALYSIS PROFILE */}
        {/* <div>
          <h2 className='text-xs font-black text-slate-400 uppercase tracking-widest mb-3 pl-1'>Clinical Profile</h2>
          <div className='bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden'>
            <div className='p-4 border-b border-slate-50 flex items-start gap-3'>
              <div className='p-2 bg-red-50 text-red-600 rounded-lg'><FiDroplet className='text-lg' /></div>
              <div>
                <p className='text-xs font-bold text-slate-400'>Blood Type</p>
                <p className='text-sm font-black text-slate-800'>{profileData?.patient_blood_type || 'Unknown'}</p>
              </div>
            </div>

            <div className='p-4 border-b border-slate-50 flex items-start gap-3'>
              <div className='p-2 bg-blue-50 text-blue-600 rounded-lg'><FiActivity className='text-lg' /></div>
              <div>
                <p className='text-xs font-bold text-slate-400'>Vascular Access</p>
                <p className='text-sm font-black text-slate-800'>
                  {profileData?.vascular_access_location && <span className='text-slate-500 font-medium'> • {profileData?.vascular_access_location}</span>}
                </p>
              </div>
            </div>

            <div className='p-4 border-b border-slate-50 flex items-start gap-3'>
              <div className='p-2 bg-indigo-50 text-indigo-600 rounded-lg'><FiCheckCircle className='text-lg' /></div>
              <div>
                <p className='text-xs font-bold text-slate-400'>Usual Dialysis Machine</p>
                <p className='text-sm font-black text-slate-800'>{profileData?.preferred_machine_model || 'Standard'}</p>
              </div>
            </div>

            <div className='p-4 border-b border-slate-50 flex items-start gap-3'>
              <div className='p-2 bg-emerald-50 text-emerald-600 rounded-lg'><FiClock className='text-lg' /></div>
              <div>
                <p className='text-xs font-bold text-slate-400'>Usual Dialysis Shift</p>
                <p className='text-sm font-black text-slate-800'>{profileData?.preferred_shift || 'Unassigned'} Shift</p>
              </div>
            </div>

            <div className='p-4 flex items-start gap-3'>
              <div className='p-2 bg-amber-50 text-amber-600 rounded-lg'>
                {profileData?.mobility_status === 'Wheelchair' ? <FaWheelchair className='text-lg' /> : <FaWalking className='text-lg' />}
              </div>
              <div className='flex-1 flex justify-between items-center'>
                <div>
                  <p className='text-xs font-bold text-slate-400'>Mobility Status</p>
                  <p className='text-sm font-black text-slate-800'>{profileData?.mobility_status || 'Ambulatory'}</p>
                </div>
              </div>
            </div>
          </div>
        </div> */}

        {/* 6. INFECTION STATUS GRID */}
        <div>
          <h2 className='text-xs font-black text-slate-400 uppercase tracking-widest mb-3 pl-1'>Infection Status</h2>
          <div className='bg-white rounded-2xl border border-slate-100 shadow-sm p-2 grid grid-cols-3 gap-2'>
            <div className='p-3 bg-slate-50 rounded-xl text-center'>
              <p className='text-[10px] font-bold text-slate-500 uppercase'>Hepatitis B</p>
              <p className={`text-sm font-black mt-1 ${profileData?.hepatitis_b_status === 'Negative' ? 'text-emerald-600' : 'text-red-600'}`}>{profileData?.hepatitis_b_status || '-'}</p>
            </div>
            <div className='p-3 bg-slate-50 rounded-xl text-center'>
              <p className='text-[10px] font-bold text-slate-500 uppercase'>Hepatitis C</p>
              <p className={`text-sm font-black mt-1 ${profileData?.hepatitis_c_status === 'Negative' ? 'text-emerald-600' : 'text-red-600'}`}>{profileData?.hepatitis_c_status || '-'}</p>
            </div>
            <div className='p-3 bg-slate-50 rounded-xl text-center'>
              <p className='text-[10px] font-bold text-slate-500 uppercase'>HIV</p>
              <p className={`text-sm font-black mt-1 ${profileData?.hiv_status === 'Negative' ? 'text-emerald-600' : 'text-red-600'}`}>{profileData?.hiv_status || '-'}</p>
            </div>
          </div>
        </div>

        {/* 7. ACCOUNT & SUPPORT SETTINGS */}
        <div>
          <h2 className='text-xs font-black text-slate-400 uppercase tracking-widest mb-3 pl-1'>Account & Support</h2>
          <div className='bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col'>
            
            <button onClick={() => router.push('/patient/update-password')} className='p-4 border-b border-slate-50 flex items-center gap-4 hover:bg-slate-50 transition-colors text-left w-full'>
              <div className='p-2.5 bg-slate-100 text-slate-600 rounded-xl'><FiLock className='text-lg' /></div>
              <div className='flex-1'>
                <h4 className='text-sm font-black text-slate-800'>Update Password</h4>
                <p className='text-[10px] font-bold text-slate-400 mt-0.5'>Change your account password securely</p>
              </div>
            </button>

            <button onClick={() => router.push('/patient/support')} className='p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors text-left w-full'>
              <div className='p-2.5 bg-blue-50 text-blue-600 rounded-xl'><FiHelpCircle className='text-lg' /></div>
              <div className='flex-1'>
                <h4 className='text-sm font-black text-slate-800'>Help & Support</h4>
                <p className='text-[10px] font-bold text-slate-400 mt-0.5'>Contact administration or read FAQs</p>
              </div>
            </button>

          </div>
        </div>

        {/* LOGOUT BUTTON */}
        <button 
          onClick={() => setShowLogoutDialog(true)}
          className='w-full mt-2 py-4 bg-white border-2 border-red-100 text-red-600 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-red-50 transition-colors'
        >
          <FiLogOut className='text-lg' /> Log Out
        </button>

      </div>
      
      <PatientBottomNav />

      {/* ========================================= */}
      {/* EDIT EMERGENCY CONTACT MODAL */}
      {/* ========================================= */}
      {showEditEmergency && (
        <div className='absolute inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in'>
          <div className='bg-white w-full max-w-md rounded-t-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-full pb-safe'>
            <div className='flex justify-between items-center mb-6'>
              <h3 className='text-lg font-black text-slate-800'>Edit Emergency Contact</h3>
              <button onClick={() => setShowEditEmergency(false)} className='p-2 bg-slate-100 rounded-full text-slate-600'><FiX /></button>
            </div>
            
            {emErrorMsg && (
              <div className='mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2'>
                <FiAlertCircle className='text-red-600 shrink-0 mt-0.5' />
                <p className='text-xs font-bold text-red-700 leading-snug'>{emErrorMsg}</p>
              </div>
            )}

            <form onSubmit={handleUpdateEmergencyContact} className='space-y-4'>
              <div>
                <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Full Name</label>
                <input type="text" required value={editEmName} onChange={e => setEditEmName(e.target.value)} className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-slate-800' placeholder="e.g. Siti Binti Ali" />
              </div>
              
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Relationship</label>
                  <select required value={editEmRel} onChange={e => setEditEmRel(e.target.value)} className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-slate-800 appearance-none'>
                    <option value="" disabled>Select</option>
                    <option value="Spouse">Spouse</option>
                    <option value="Child">Child</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Parent">Parent</option>
                    <option value="Friend">Friend</option>
                  </select>
                </div>
                <div>
                  <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Phone Number</label>
                  <input type="tel" required value={editEmPhone} onChange={e => setEditEmPhone(e.target.value)} className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-slate-800' placeholder="e.g. 012-3456789" />
                </div>
              </div>

              <button type="submit" disabled={isUpdatingEm} className='w-full py-4 mt-2 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-md disabled:opacity-50 transition-all'>
                {isUpdatingEm ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* REAL DOCUMENT VIEWER OVERLAY */}
      {showDocViewer && (
        <div className='fixed inset-0 z-[100] bg-slate-900/95 flex flex-col animate-in fade-in pb-safe'>
          <div className='flex justify-between items-center p-5'>
            <h3 className='text-white font-black text-lg'>{showDocViewer.title}</h3>
            <button onClick={() => setShowDocViewer(null)} className='p-2 bg-white/10 rounded-full text-white hover:bg-white/20'><FiX className='text-xl' /></button>
          </div>
          
          <div className='flex-1 w-full bg-black flex items-center justify-center relative'>
            {showDocViewer.url.toLowerCase().includes('.pdf') ? (
              <iframe src={showDocViewer.url} className='w-full h-full border-none bg-white' title="Document Viewer" />
            ) : (
              <img src={showDocViewer.url} alt="Document Viewer" className='w-full h-full object-contain' />
            )}
          </div>
        </div>
      )}

      {/* LOGOUT CONFIRMATION DIALOG */}
      {showLogoutDialog && (
        <div className='absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-5 animate-in fade-in'>
          <div className='bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in zoom-in-95'>
            <div className='w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4 text-red-600 text-2xl'><FiLogOut /></div>
            <h3 className='text-lg font-black text-slate-800 mb-2'>Are you sure you want to log out?</h3>
            <p className='text-sm text-slate-500 mb-6'>You will need to enter your email and password to log back in.</p>
            <div className='flex gap-3'>
              <button onClick={() => setShowLogoutDialog(false)} className='flex-1 py-3.5 rounded-xl font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors'>Cancel</button>
              <button onClick={handleLogout} className='flex-1 py-3.5 rounded-xl font-bold text-sm text-white bg-red-600 hover:bg-red-700 transition-colors shadow-md shadow-red-600/20'>Log Out</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}