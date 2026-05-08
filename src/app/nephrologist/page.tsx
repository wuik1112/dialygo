'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';
import { FiUsers, FiFileText, FiActivity } from 'react-icons/fi';

export default function NephrologistDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    totalPatients: 0,
    recentPrescriptions: 0,
    branchName: ''
  });
  const [recentPatients, setRecentPatients] = useState<any[]>([]);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) return;

        // Get Nephrologist Info
        const { data: userData } = await supabase
          .from('users')
          .select('user_id, branch_id, branches(branch_name)')
          .eq('user_email', sessionData.session.user.email)
          .single();

        if (userData) {
          // Bypass the TS array assumption and safely extract the branch name (Requirement 3)
          const branchInfo = userData.branches as any;
          const resolvedBranchName = Array.isArray(branchInfo) 
            ? branchInfo[0]?.branch_name 
            : branchInfo?.branch_name;

          // Fetch patients in the same branch
          const { data: patients } = await supabase
            .from('patients')
            .select(`
              patient_id, 
              users!inner(user_fullname, user_ic),
              prescriptions(updated_at, target_dry_weight)
            `)
            .eq('home_branch_id', userData.branch_id);

          const totalPatients = patients?.length || 0;
          
          // Count recent prescriptions (updated in last 7 days)
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
          
          const recentPrescriptions = patients?.filter(p => 
            p.prescriptions && p.prescriptions.length > 0 && 
            new Date(p.prescriptions[0].updated_at) > oneWeekAgo
          ).length || 0;

          setDashboardData({
            totalPatients,
            recentPrescriptions,
            branchName: resolvedBranchName || 'Your Branch'
          });

          setRecentPatients(patients?.slice(0, 5) || []);
        }
      } catch (error) {
        console.error('Error fetching dashboard:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDashboardData();
  }, []);

  // Requirement 1: Standardized Loading Screen
  if (isLoading) {
    return (
      <div className='min-h-screen bg-slate-50 flex items-center justify-center'>
        <div className='flex flex-col items-center text-blue-600 font-bold'>
          <FiActivity className='text-4xl mb-4 animate-spin' />
          <span>Loading Dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <main className="p-4 sm:p-8 max-w-7xl mx-auto pb-24">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Nephrologist Portal</h1>
        {/* Requirement 3: Branch Awareness Display */}
        <p className="text-slate-500 font-medium mt-1 flex items-center gap-2">
          <FiActivity className="text-blue-500" /> {dashboardData.branchName} Overview
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl"><FiUsers /></div>
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Active Patients</p>
            <p className="text-3xl font-black text-slate-900">{dashboardData.totalPatients}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl"><FiFileText /></div>
          <div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Recent Prescriptions</p>
            <p className="text-3xl font-black text-slate-900">{dashboardData.recentPrescriptions}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800">Patients Under Care</h2>
          <Link href="/nephrologist/patients" className="text-sm font-bold text-blue-600 hover:text-blue-700">View All</Link>
        </div>
        <div className="divide-y divide-slate-100">
          {recentPatients.map((patient) => (
            <div key={patient.patient_id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold">
                  {patient.users?.user_fullname?.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-slate-900">{patient.users?.user_fullname}</p>
                  <p className="text-xs text-slate-500">IC: {patient.users?.user_ic}</p>
                </div>
              </div>
              <Link href={`/nephrologist/patients?id=${patient.patient_id}`} className="px-4 py-2 bg-blue-50 text-blue-600 font-bold rounded-lg text-sm hover:bg-blue-100 transition-colors">
                Manage RX
              </Link>
            </div>
          ))}
          {recentPatients.length === 0 && (
            <div className="p-8 text-center text-slate-500 font-medium">No patients found in your branch.</div>
          )}
        </div>
      </div>
    </main>
  );
}