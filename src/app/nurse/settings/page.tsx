'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  FiArrowLeft, FiUser, FiLock, FiShield, 
  FiMapPin, FiMail, FiPhone, FiCheckCircle, FiSave, FiAlertCircle
} from 'react-icons/fi';

export default function NurseSettings() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [feedback, setFeedback] = useState<{type: 'success' | 'error', message: string} | null>(null);

  // Read-only Official Identity State
  const [officialInfo, setOfficialInfo] = useState({
    fullname: '',
    ic: '',
    email: '',
    role: '',
    branch: ''
  });

  // Editable Profile State
  const [profileForm, setProfileForm] = useState({
    phone: '',
    address: '',
    emergency_contact: ''
  });

  // Password State
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    async function fetchProfile() {
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) return router.push('/login');

        const { data: userData, error } = await supabase
          .from('users')
          .select(`
            *,
            branches (branch_name)
          `)
          .eq('user_email', session.session.user.email)
          .single();

        if (error) throw error;

        if (userData) {
          // Set Read-Only Data
          const branchInfo = userData.branches as any;
          setOfficialInfo({
            fullname: userData.user_fullname || 'Unknown',
            ic: userData.user_ic || 'N/A',
            email: userData.user_email || '',
            role: userData.user_role || 'Staff Nurse',
            branch: Array.isArray(branchInfo) ? branchInfo[0]?.branch_name : branchInfo?.branch_name || 'Unassigned'
          });

          // Set Editable Data
          setProfileForm({
            phone: userData.user_phone || '',
            address: userData.user_address || '',
            emergency_contact: userData.emergency_contact || ''
          });
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchProfile();
  }, [router]);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;

      const { error } = await supabase
        .from('users')
        .update({
          user_phone: profileForm.phone,
          user_address: profileForm.address,
          emergency_contact: profileForm.emergency_contact
        })
        .eq('user_email', session.session.user.email);

      if (error) throw error;
      showFeedback('success', 'Profile contact information updated successfully.');
    } catch (err: any) {
      showFeedback('error', 'Failed to update profile: ' + err.message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showFeedback('error', 'New passwords do not match.');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      showFeedback('error', 'Password must be at least 6 characters long.');
      return;
    }

    setIsSavingPassword(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.newPassword
      });

      if (error) throw error;

      setPasswordForm({ newPassword: '', confirmPassword: '' });
      showFeedback('success', 'Security password updated successfully.');
    } catch (err: any) {
      showFeedback('error', 'Failed to update password: ' + err.message);
    } finally {
      setIsSavingPassword(false);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-blue-600"><div className="animate-pulse font-bold">Loading Profile...</div></div>;
  }

  return (
    <main className="p-4 sm:p-8 max-w-4xl mx-auto pb-24 relative">
      
      {/* HEADER */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/nurse" className="h-10 w-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors shadow-sm">
          <FiArrowLeft className="text-xl" />
        </Link>
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Profile Settings</h1>
          <p className="text-sm font-bold text-slate-500">Manage your clinical account and security</p>
        </div>
      </div>

      {/* FEEDBACK TOAST */}
      {feedback && (
        <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 font-bold text-sm animate-in fade-in slide-in-from-top-2 shadow-sm ${feedback.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {feedback.type === 'success' ? <FiCheckCircle className="text-lg" /> : <FiAlertCircle className="text-lg" />}
          {feedback.message}
        </div>
      )}

      <div className="space-y-8">
        
        {/* SECTION 1: OFFICIAL IDENTITY (READ-ONLY) */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h2 className="font-black text-slate-800 flex items-center gap-2">
              <FiShield className="text-blue-500"/> Official HR Identity
            </h2>
            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-[10px] font-black uppercase tracking-widest">Read Only</span>
          </div>
          <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex items-center gap-5 md:col-span-2">
              <div className="h-20 w-20 rounded-2xl bg-blue-50 flex items-center justify-center text-3xl font-black text-blue-500 border border-blue-100">
                {officialInfo.fullname.charAt(0)}
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900">{officialInfo.fullname}</h3>
                <p className="font-bold text-slate-500 mt-1">{officialInfo.role}</p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><FiUser /> IC / Passport No.</p>
              <p className="font-black text-slate-900 bg-slate-50 p-3 rounded-xl border border-slate-100">{officialInfo.ic}</p>
            </div>
            
            <div className="space-y-1">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><FiMapPin /> Assigned Branch</p>
              <p className="font-black text-slate-900 bg-slate-50 p-3 rounded-xl border border-slate-100">{officialInfo.branch}</p>
            </div>

            <div className="space-y-1 md:col-span-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><FiMail /> Registered Email (Login ID)</p>
              <p className="font-black text-slate-900 bg-slate-50 p-3 rounded-xl border border-slate-100">{officialInfo.email}</p>
            </div>
          </div>
          <div className="bg-slate-50 p-4 border-t border-slate-100 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase">To change official identity or branch transfer, please contact your Administrator.</p>
          </div>
        </div>

        {/* SECTION 2: EDITABLE CONTACT INFO */}
        <form onSubmit={handleUpdateProfile} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50">
            <h2 className="font-black text-slate-800 flex items-center gap-2">
              <FiPhone className="text-emerald-500"/> Contact Information
            </h2>
          </div>
          <div className="p-6 md:p-8 space-y-6">
            
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Personal Phone Number</label>
              <input 
                type="tel" 
                value={profileForm.phone} 
                onChange={e => setProfileForm({...profileForm, phone: e.target.value})}
                className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-500 font-bold text-sm text-slate-900"
                placeholder="+60 12-345 6789"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Home Address</label>
              <textarea 
                value={profileForm.address} 
                onChange={e => setProfileForm({...profileForm, address: e.target.value})}
                className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-500 font-bold text-sm text-slate-900 h-24 resize-none"
                placeholder="Enter current residential address..."
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Emergency Contact (Name & Number)</label>
              <input 
                type="text" 
                value={profileForm.emergency_contact} 
                onChange={e => setProfileForm({...profileForm, emergency_contact: e.target.value})}
                className="w-full p-3 bg-red-50/30 border border-red-100 rounded-xl outline-none focus:border-red-400 font-bold text-sm text-slate-900 placeholder:text-slate-400"
                placeholder="e.g., Ali Bin Ahmad (Husband) - 0198765432"
              />
            </div>

            <div className="pt-4 flex justify-end">
              <button 
                type="submit" 
                disabled={isSavingProfile}
                className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 transition-colors disabled:bg-slate-300 flex items-center gap-2 shadow-sm shadow-emerald-900/20"
              >
                {isSavingProfile ? 'Saving...' : <><FiSave /> Save Contact Info</>}
              </button>
            </div>
          </div>
        </form>

        {/* SECTION 3: CHANGE PASSWORD */}
        <form onSubmit={handleUpdatePassword} className="bg-slate-900 rounded-3xl shadow-xl overflow-hidden text-white">
          <div className="p-5 border-b border-slate-700 bg-slate-800/50">
            <h2 className="font-black flex items-center gap-2">
              <FiLock className="text-blue-400"/> Security & Password
            </h2>
          </div>
          <div className="p-6 md:p-8 space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">New Password</label>
                <input 
                  type="password" 
                  required
                  value={passwordForm.newPassword} 
                  onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                  className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl outline-none focus:border-blue-500 font-bold text-sm text-white placeholder:text-slate-500"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Confirm New Password</label>
                <input 
                  type="password" 
                  required
                  value={passwordForm.confirmPassword} 
                  onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                  className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl outline-none focus:border-blue-500 font-bold text-sm text-white placeholder:text-slate-500"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row justify-between items-center gap-4">
              <p className="text-[10px] font-bold text-slate-400">* Passwords must be at least 6 characters long.</p>
              <button 
                type="submit" 
                disabled={isSavingPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
                className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 transition-colors disabled:bg-slate-700 disabled:text-slate-500 flex items-center justify-center gap-2 shadow-lg shadow-blue-900/50"
              >
                {isSavingPassword ? 'Updating...' : <><FiLock /> Update Password</>}
              </button>
            </div>
          </div>
        </form>

      </div>
    </main>
  );
}