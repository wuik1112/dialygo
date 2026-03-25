'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import PatientBottomNav from '../../../components/PatientBottomNav';

import { 
  FiUser, FiPhone, FiMapPin, FiDroplet, FiLogOut, 
  FiAlertCircle, FiCheckCircle, FiFileText, FiHome,
  FiMail, FiCalendar, FiActivity, FiEye, FiEyeOff, 
  FiUploadCloud, FiFile, FiClock, FiX
} from 'react-icons/fi';
import { FaWheelchair, FaWalking } from 'react-icons/fa';

export default function PatientProfile() {
  const [isLoading, setIsLoading] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showIC, setShowIC] = useState(false);
  
  // Real Upload States
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [referralStatus, setReferralStatus] = useState<'Missing' | 'Pending Review' | 'Verified'>('Missing');
  const [showDocViewer, setShowDocViewer] = useState<{title: string, url: string} | null>(null);

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
          // Check if referral exists to set initial status
          if (patient.referral_letter_url) setReferralStatus('Pending Review');
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

  // --- REAL SUPABASE STORAGE UPLOAD ---
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, docType: 'Serology' | 'Referral') => {
    const file = event.target.files?.[0];
    if (!file || !profileData?.patient_id) return;

    setUploadingDoc(docType);
    try {
      // 1. Generate a unique file name to avoid overwriting
      const fileExt = file.name.split('.').pop();
      const fileName = `${profileData.patient_id}-${docType}-${Date.now()}.${fileExt}`;
      
      // 2. Upload to Supabase 'patient_documents' bucket
      const { error: uploadError } = await supabase.storage
        .from('patient_documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // 3. Get the public URL of the uploaded file
      const { data: { publicUrl } } = supabase.storage
        .from('patient_documents')
        .getPublicUrl(fileName);

      // 4. Save the URL to the patient's database record
      const updateColumn = docType === 'Serology' ? 'serology_report_url' : 'referral_letter_url';
      const { error: dbError } = await supabase
        .from('patients')
        .update({ [updateColumn]: publicUrl })
        .eq('patient_id', profileData.patient_id);

      if (dbError) throw dbError;

      // 5. Update local UI state
      setProfileData((prev: any) => ({ ...prev, [updateColumn]: publicUrl }));
      if (docType === 'Referral') setReferralStatus('Pending Review');
      
      alert(`${docType} document successfully uploaded!`);
    } catch (error) {
      console.error("Error uploading document:", error);
      alert("Failed to upload document. Please try again.");
    } finally {
      setUploadingDoc(null);
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

  // --- CALCULATIONS ---
  let isSerologyValid = false;
  let serologyStatusText = "No Record";
  
  if (profileData?.last_serology_date) {
    const serologyDate = new Date(profileData.last_serology_date);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    isSerologyValid = serologyDate >= sixMonthsAgo;
    serologyStatusText = `Last test: ${serologyDate.toLocaleDateString('en-GB')}`;
  }

  const isEligibleToTravel = profileData?.travel_status === 'Active' && isSerologyValid && referralStatus !== 'Missing';

  let ageStr = '-';
  if (profileData?.user_date_of_birth) {
    const dob = new Date(profileData.user_date_of_birth);
    const ageDifMs = Date.now() - dob.getTime();
    const ageDate = new Date(ageDifMs);
    ageStr = `${Math.abs(ageDate.getUTCFullYear() - 1970)} years old`;
  }

  return (
    <div className='max-w-md mx-auto bg-slate-50 h-[100dvh] relative shadow-2xl font-sans overflow-hidden flex flex-col'>
      
      {/* HEADER OVERLAY */}
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
        
        {/* TRAVEL ELIGIBILITY & DOCUMENT WARNING */}
        <div className={`p-5 rounded-2xl border-2 ${isEligibleToTravel ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <div className='flex items-center gap-2 mb-3'>
            {isEligibleToTravel ? <FiCheckCircle className='text-emerald-600 text-xl' /> : <FiAlertCircle className='text-red-600 text-xl' />}
            <h2 className={`font-black uppercase tracking-widest text-sm ${isEligibleToTravel ? 'text-emerald-800' : 'text-red-800'}`}>
              Travel Eligibility
            </h2>
          </div>
          
          <div className='bg-white rounded-xl p-4 shadow-sm mb-3'>
            <div className='flex justify-between items-center mb-1'>
              <span className='text-xs font-bold text-slate-500'>Serology Status</span>
              <span className={`text-xs font-black uppercase px-2 py-0.5 rounded-md ${isSerologyValid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {isSerologyValid ? 'VALID' : 'EXPIRED'}
              </span>
            </div>
            <p className='text-sm font-bold text-slate-800'>{serologyStatusText}</p>
          </div>

          {!isSerologyValid && (
            <div className='bg-red-600 text-white p-4 rounded-xl shadow-md mb-3'>
              <p className='text-sm font-bold leading-snug'>Your Serology blood test has expired (Valid for 6 months only).</p>
            </div>
          )}

          {referralStatus === 'Missing' && (
            <div className='bg-amber-100 text-amber-900 p-4 rounded-xl shadow-sm'>
              <p className='text-sm font-bold leading-snug'>Doctor's Referral Letter missing.</p>
              <p className='text-xs font-medium mt-1'>Please upload it below to enable travel booking.</p>
            </div>
          )}

          {isEligibleToTravel && (
            <p className='text-sm font-bold text-emerald-700'>You are currently eligible to book travel dialysis sessions.</p>
          )}
        </div>

        {/* MEDICAL DOCUMENTS SECTION */}
        <div>
          <h2 className='text-xs font-black text-slate-400 uppercase tracking-widest mb-3 pl-1'>Medical Documents</h2>
          <div className='bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden p-2 space-y-2'>
            
            {/* SEROLOGY REPORT DOC */}
            <div className='p-3 border border-slate-100 rounded-xl flex items-center justify-between bg-slate-50'>
              <div className='flex items-center gap-3'>
                <div className={`p-2.5 rounded-lg ${profileData?.serology_report_url ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                  <FiFileText className='text-xl' />
                </div>
                <div>
                  <h4 className='text-sm font-black text-slate-800'>Serology Report</h4>
                  <p className={`text-[10px] font-bold uppercase flex items-center gap-1 ${profileData?.serology_report_url ? 'text-emerald-600' : 'text-red-500'}`}>
                    {profileData?.serology_report_url ? <><FiCheckCircle /> Uploaded</> : <><FiAlertCircle /> Required</>}
                  </p>
                </div>
              </div>
              
              {profileData?.serology_report_url ? (
                <button onClick={() => setShowDocViewer({title: 'Serology Report', url: profileData.serology_report_url})} className='p-2 text-slate-400 hover:text-blue-600 bg-white border border-slate-200 rounded-lg shadow-sm'>
                  <FiEye />
                </button>
              ) : (
                <div className="relative overflow-hidden inline-block">
                  <button disabled={uploadingDoc === 'Serology'} className='px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-sm disabled:opacity-50 flex items-center gap-1.5'>
                    {uploadingDoc === 'Serology' ? <span className='animate-pulse'>Uploading...</span> : <><FiUploadCloud /> Upload</>}
                  </button>
                  <input type="file" accept=".pdf,image/*" onChange={(e) => handleFileUpload(e, 'Serology')} className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
              )}
            </div>

            {/* DOCTOR'S REFERRAL DOC */}
            <div className='p-3 border border-slate-100 rounded-xl flex items-center justify-between bg-slate-50'>
              <div className='flex items-center gap-3'>
                <div className={`p-2.5 rounded-lg ${referralStatus === 'Verified' ? 'bg-emerald-100 text-emerald-600' : referralStatus === 'Pending Review' ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-500'}`}>
                  <FiFile className='text-xl' />
                </div>
                <div>
                  <h4 className='text-sm font-black text-slate-800'>Doctor's Referral</h4>
                  <p className={`text-[10px] font-bold uppercase flex items-center gap-1 ${referralStatus === 'Verified' ? 'text-emerald-600' : referralStatus === 'Pending Review' ? 'text-amber-600' : 'text-slate-400'}`}>
                    {referralStatus === 'Verified' && <><FiCheckCircle /> Verified</>}
                    {referralStatus === 'Pending Review' && <><FiClock /> Pending Review</>}
                    {referralStatus === 'Missing' && 'Not Uploaded'}
                  </p>
                </div>
              </div>
              
              {profileData?.referral_letter_url ? (
                <button onClick={() => setShowDocViewer({title: "Doctor's Referral", url: profileData.referral_letter_url})} className='p-2 text-slate-400 hover:text-blue-600 bg-white border border-slate-200 rounded-lg shadow-sm'>
                  <FiEye />
                </button>
              ) : (
                <div className="relative overflow-hidden inline-block">
                  <button disabled={uploadingDoc === 'Referral'} className='px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-sm disabled:opacity-50 flex items-center gap-1.5'>
                    {uploadingDoc === 'Referral' ? <span className='animate-pulse'>Uploading...</span> : <><FiUploadCloud /> Upload</>}
                  </button>
                  <input type="file" accept=".pdf,image/*" onChange={(e) => handleFileUpload(e, 'Referral')} className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
              )}
            </div>

          </div>
          <p className='text-[10px] font-medium text-slate-400 mt-2 pl-1'>*Accepts PDFs or Images. Documents must be verified by the Head Nurse.</p>
        </div>

        {/* CLINICAL DIALYSIS PROFILE */}
        <div>
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
                  {profileData?.vascular_access_type || 'Unknown'} 
                  {profileData?.vascular_access_location && <span className='text-slate-500 font-medium'> • {profileData.vascular_access_location}</span>}
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

            <div className='p-4 border-b border-slate-50 flex items-start gap-3'>
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
        </div>

        {/* INFECTION STATUS GRID */}
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

        {/* LOGOUT BUTTON */}
        <button 
          onClick={() => setShowLogoutDialog(true)}
          className='w-full mt-6 py-4 bg-white border-2 border-red-100 text-red-600 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-red-50 transition-colors'
        >
          <FiLogOut className='text-lg' /> Log Out
        </button>

      </div>
      
      <PatientBottomNav />

      {/* ========================================= */}
      {/* REAL DOCUMENT VIEWER OVERLAY */}
      {/* ========================================= */}
      {showDocViewer && (
        <div className='fixed inset-0 z-[100] bg-slate-900/95 flex flex-col animate-in fade-in pb-safe'>
          <div className='flex justify-between items-center p-5'>
            <h3 className='text-white font-black text-lg'>{showDocViewer.title}</h3>
            <button onClick={() => setShowDocViewer(null)} className='p-2 bg-white/10 rounded-full text-white hover:bg-white/20'><FiX className='text-xl' /></button>
          </div>
          
          <div className='flex-1 w-full bg-black flex items-center justify-center relative'>
            {showDocViewer.url.toLowerCase().endsWith('.pdf') ? (
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