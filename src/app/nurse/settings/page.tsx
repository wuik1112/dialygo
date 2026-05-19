'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  FiArrowLeft, FiUser, FiShield, 
  FiMapPin, FiMail 
} from 'react-icons/fi';
import ProfileSecuritySettings from '@/components/ProfileSecuritySettings'; // Import universal component

export default function NurseSettings() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  // Read-only Official Identity State
  const [officialInfo, setOfficialInfo] = useState({
    fullname: '',
    ic: '',
    email: '',
    role: '',
    branch: ''
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
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchProfile();
  }, [router]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-blue-600"><div className="animate-pulse font-bold">Loading Profile...</div></div>;
  }

  return (
    <main className="p-4 sm:p-8 max-w-4xl mx-auto pb-24 relative">
      
      {/* HEADER */}
      <div className="flex items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Profile Settings</h1>
        </div>
      </div>

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

        {/* SECTION 2: UNIVERSAL SECURITY COMPONENT */}
        {/* Replaces both the old Profile Edit and Password Edit forms */}
        <ProfileSecuritySettings />

      </div>
    </main>
  );
}