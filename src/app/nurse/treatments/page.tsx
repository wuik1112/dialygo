'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Link from 'next/link';
import { FiActivity, FiClock, FiDroplet, FiHeart, FiPlayCircle } from 'react-icons/fi';

export default function ActiveSessionsBoard() {
  const [isLoading, setIsLoading] = useState(true);
  const [activeTreatments, setActiveTreatments] = useState<any[]>([]);

  useEffect(() => {
    async function fetchActiveSessions() {
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) return;

        // Get Nurse Branch
        const { data: userData } = await supabase
          .from('users')
          .select('branch_id')
          .eq('user_email', session.session.user.email)
          .single();

        if (!userData) return;

        // Fetch Ongoing Treatments
        const { data: treatments } = await supabase
          .from('treatments')
          .select(`
            *,
            patients (
              patient_id,
              patient_blood_type,
              users!inner(user_fullname, user_ic)
            )
          `)
          .eq('branch_id', userData.branch_id)
          .eq('session_status', 'Ongoing')
          .order('start_time', { ascending: false });

        setActiveTreatments(treatments || []);
      } catch (error) {
        console.error("Error fetching sessions:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchActiveSessions();
  }, []);

  if (isLoading) {
    return (
      <div className='min-h-screen bg-slate-50 flex items-center justify-center text-blue-600 font-bold'>
        <FiActivity className='text-4xl mb-4 animate-spin' />
      </div>
    );
  }

  return (
    <main className="p-4 sm:p-8 max-w-7xl mx-auto pb-24">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Active Sessions</h1>
        <p className="text-slate-500 font-bold mt-1 flex items-center gap-2">
          <FiActivity className="text-blue-500" /> Currently running dialysis treatments
        </p>
      </header>

      {activeTreatments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4">
          {activeTreatments.map(t => (
            <div key={t.session_id} className="bg-white rounded-3xl border border-amber-200 shadow-lg shadow-amber-500/10 overflow-hidden flex flex-col">
              <div className="p-5 border-b border-amber-100 bg-amber-50/50 flex justify-between items-center">
                <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1 animate-pulse">
                  <FiActivity /> Ongoing
                </span>
                <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                  <FiClock /> Started: {t.start_time?.slice(0, 5)}
                </span>
              </div>
              
              <div className="p-6 flex-1">
                <h3 className="font-black text-xl text-slate-900">{t.patients?.users?.user_fullname}</h3>
                <div className="flex gap-2 mt-2 mb-6">
                  <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-1 rounded uppercase">IC: {t.patients?.users?.user_ic}</span>
                  <span className="text-[10px] bg-red-50 text-red-600 font-bold px-2 py-1 rounded flex items-center gap-1"><FiDroplet/> {t.patients?.patient_blood_type}</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase">Pre-Weight</p>
                    <p className="font-black text-slate-800 text-lg">{t.pre_weight} <span className="text-xs">kg</span></p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase">Target UF</p>
                    <p className="font-black text-emerald-600 text-lg">{t.target_uf} <span className="text-xs">L</span></p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100">
                <Link href={`/nurse/treatments/monitor?patient_id=${t.patients?.patient_id}`} className="w-full py-3 bg-amber-500 text-white font-black rounded-xl shadow-md hover:bg-amber-600 transition-colors flex items-center justify-center gap-2">
                  <FiHeart className="text-lg" /> Monitor & Discharge
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center flex flex-col items-center justify-center">
          <FiPlayCircle className="text-6xl text-slate-200 mb-4" />
          <p className="text-lg font-black text-slate-400">No active sessions.</p>
          <p className="text-sm font-bold text-slate-400 mt-1">Start a session from the Dashboard to see it here.</p>
        </div>
      )}
    </main>
  );
}