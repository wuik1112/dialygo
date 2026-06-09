'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { supabase } from '../../../../lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  FiArrowLeft, FiCheckCircle, FiAlertCircle, FiClock, FiActivity, 
  FiDroplet, FiPlus, FiSave, FiAlertTriangle, FiUnlock, FiPauseCircle, FiPlayCircle 
} from 'react-icons/fi';
import { validateDischargeVitals, validateHourlyVitals } from '@/utils/validationHelpers';

function MonitorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get('patient_id');
  const bookingId = searchParams.get('booking_id');

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  
  const [treatment, setTreatment] = useState<any>(null);
  const [sessionLogs, setSessionLogs] = useState<any[]>([]);
  const [currentNurseId, setCurrentNurseId] = useState<string | null>(null);

  const [newLog, setNewLog] = useState({ bp_sys: '', bp_dia: '', hr: '', vp: '', tmp: '', uf_rate: '', bf: '', hep: '' });

  const [dischargeForm, setDischargeForm] = useState({
    post_weight: '', bp_sys: '', bp_dia: '', post_hr: '', fluid_removed: '', weight_loss: '', kt_v: '', injections: '', complications: ''
  });

  const [customIntervention, setCustomIntervention] = useState('');
  const [hemostasisAchieved, setHemostasisAchieved] = useState(false);
  const [needlesIntact, setNeedlesIntact] = useState(false);

  const [targetMinutes, setTargetMinutes] = useState(240);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [isOverrideActive, setIsOverrideActive] = useState(false);
  
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(isPaused); 
  const hasNotifiedOvertime = useRef(false);
  const [interventionFeedback, setInterventionFeedback] = useState<string | null>(null);

  const isTimeComplete = elapsedMinutes >= targetMinutes;

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    async function fetchTreatmentAndLogs() {
      if (!patientId) return router.push('/nurse/treatments');

      const { data: session } = await supabase.auth.getSession();
      if (session?.session?.user?.email) {
        const { data: userData } = await supabase.from('users').select('user_id').eq('user_email', session.session.user.email).single();
        if (userData) setCurrentNurseId(userData.user_id);
      }

      const { data: treatmentData } = await supabase.from('treatments').select(`*, patients(user_id, users(user_fullname, user_ic), prescriptions(status, target_duration))`).eq('patient_id', patientId).eq('session_status', 'Ongoing').single();

      if (treatmentData) {
        setTreatment(treatmentData);
        setIsPaused(treatmentData.is_paused || false);
        
        // Load existing complications from database
        setDischargeForm(prev => ({ 
          ...prev, 
          fluid_removed: treatmentData.target_uf?.toString() || '',
          complications: treatmentData.session_complications || '' 
        }));

        const activeRx = treatmentData.patients?.prescriptions?.find((p: any) => p.status === 'Active');
        if (activeRx && activeRx.target_duration) setTargetMinutes(activeRx.target_duration);

        if (treatmentData.start_time) {
          const [hours, minutes, seconds] = treatmentData.start_time.split(':').map(Number);
          const startDate = new Date(treatmentData.session_date);
          startDate.setHours(hours, minutes, seconds || 0);
          const now = new Date();
          
          let diffMs = now.getTime() - startDate.getTime();
          let pausedMs = (treatmentData.total_paused_minutes || 0) * 60000;
          
          // If currently paused, add the time spent in the current pause state
          if (treatmentData.is_paused && treatmentData.last_paused_at) {
            const lastPaused = new Date(treatmentData.last_paused_at);
            pausedMs += (now.getTime() - lastPaused.getTime());
          }

          setElapsedMinutes(Math.max(Math.floor((diffMs - pausedMs) / 60000), 0));
        }

        const { data: logsData } = await supabase.from('session_logs').select('*').eq('session_id', treatmentData.session_id).order('log_time', { ascending: false });
        if (logsData) setSessionLogs(logsData);
      }
      setIsLoading(false);
    }
    fetchTreatmentAndLogs();
  }, [patientId, router]);

  // NEW: Overtime Notification Trigger
  useEffect(() => {
    async function triggerOvertimeAlert() {
      // If we are overtime, and haven't notified yet, and we know who the nurse is
      if (elapsedMinutes > targetMinutes && !hasNotifiedOvertime.current && currentNurseId) {
        
        hasNotifiedOvertime.current = true; // Lock it immediately to prevent spam

        try {
          const patientName = treatment?.patients?.users?.user_fullname || 'A patient';
          
          await supabase.from('notifications').insert([{
            user_id: currentNurseId,
            title: 'CRITICAL: Session Overtime',
            message: `URGENT: ${patientName}'s dialysis session has exceeded the prescribed ${targetMinutes} minutes. Please assess the patient and disconnect immediately.`,
            type: 'Alert', // Uses your 'Alert' type to make it show up red with a warning icon
            is_read: false
          }]);
          
          // Optional: Auto-log it into the clinical notes
          const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const logEntry = `[${time}] SYSTEM WARNING: Session exceeded prescribed duration.\n`;
          setDischargeForm(prev => ({ ...prev, complications: prev.complications ? prev.complications + logEntry : logEntry }));

        } catch (error) {
          console.error("Failed to send overtime notification:", error);
        }
      }
    }

    triggerOvertimeAlert();
  }, [elapsedMinutes, targetMinutes, currentNurseId, treatment]);
  
  useEffect(() => {
    if (!treatment) return;
    const interval = setInterval(() => {
      if (!isPausedRef.current) setElapsedMinutes(prev => prev + 1);
    }, 60000); 
    return () => clearInterval(interval);
  }, [treatment]);

  // NEW: Completely rewritten to sync with Supabase in real-time
  const handleTogglePause = async () => {
    const newState = !isPaused;
    setIsPaused(newState);
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const actionText = newState ? "Treatment PAUSED" : "Treatment RESUMED";
    const logEntry = `[${time}] ${actionText}\n`;
    const updatedComplications = dischargeForm.complications ? dischargeForm.complications + logEntry : logEntry;

    setDischargeForm(prev => ({ ...prev, complications: updatedComplications }));

    let updatedTotalPaused = treatment?.total_paused_minutes || 0;
    
    // If resuming, calculate how long it was paused and add to the total
    if (!newState && treatment?.last_paused_at) { 
      const lastPaused = new Date(treatment.last_paused_at);
      const pausedDurationMins = Math.floor((new Date().getTime() - lastPaused.getTime()) / 60000);
      updatedTotalPaused += pausedDurationMins;
    }

    const updatePayload = {
      is_paused: newState,
      last_paused_at: newState ? new Date().toISOString() : null,
      total_paused_minutes: updatedTotalPaused,
      session_complications: updatedComplications
    };

    // Save to Database immediately
    await supabase.from('treatments').update(updatePayload).eq('session_id', treatment.session_id);
    
    // Update local treatment state
    setTreatment((prev: any) => ({ ...prev, ...updatePayload }));
  };

  const handleAddHourlyLog = async (e: React.FormEvent) => {
    e.preventDefault();
    const hourlyValidation = validateHourlyVitals(newLog.bp_sys, newLog.bp_dia, newLog.vp, newLog.tmp, newLog.uf_rate, newLog.bf);
    if (!hourlyValidation.isValid) {
      alert(hourlyValidation.errorMessage); 
      return;
    }
    setIsLogging(true);
    try {
      const nowTime = new Date().toTimeString().split(' ')[0]; 
      const payload = {
        session_id: treatment.session_id, log_time: nowTime,
        log_systolic_bp: parseInt(newLog.bp_sys), log_diastolic_bp: parseInt(newLog.bp_dia), log_heart_rate: parseInt(newLog.hr),
        log_venous_pressure: parseFloat(newLog.vp), log_transmembrane_pressure: parseFloat(newLog.tmp),
        log_uf_rate: parseFloat(newLog.uf_rate), log_blood_flow: parseInt(newLog.bf), log_heparin: parseFloat(newLog.hep) || 0
      };
      const { data, error } = await supabase.from('session_logs').insert([payload]).select().single();
      if (error) throw error;
      setSessionLogs([data, ...sessionLogs]);
      setNewLog({ bp_sys: '', bp_dia: '', hr: '', vp: '', tmp: '', uf_rate: '', bf: '', hep: '' });
      setInterventionFeedback("Vitals saved to Flow Sheet");
      setTimeout(() => setInterventionFeedback(null), 3000);
    } catch (error: any) {
      alert("Error saving log: " + error.message);
    } finally {
      setIsLogging(false);
    }
  };

  // NEW: Updated to sync custom interventions immediately to the database
  const handleQuickIntervention = async (interventionText: string) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const logEntry = `[${time}] ${interventionText}\n`;
    const updatedComplications = dischargeForm.complications ? dischargeForm.complications + logEntry : logEntry;
    
    setDischargeForm(prev => ({ ...prev, complications: updatedComplications }));
    
    await supabase.from('treatments').update({ session_complications: updatedComplications }).eq('session_id', treatment.session_id);

    setInterventionFeedback("Intervention Logged Successfully");
    setTimeout(() => setInterventionFeedback(null), 3000);
  };

  const actualFluid = parseFloat(dischargeForm.fluid_removed || '0');
  const targetFluid = parseFloat(treatment?.target_uf || '0');
  const isUfMismatch = Math.abs(actualFluid - targetFluid) > 0.2; 
  const requiresExplanation = isUfMismatch || isOverrideActive || dischargeForm.complications.includes('PAUSED');
  const hasRequiredExplanation = requiresExplanation ? (dischargeForm.complications.length > 10) : true;

  const vitalsValidation = validateDischargeVitals(dischargeForm.bp_sys, dischargeForm.bp_dia, dischargeForm.post_hr, dischargeForm.post_weight);
  const isDischargeValid = hemostasisAchieved && needlesIntact && dischargeForm.post_weight !== '' && hasRequiredExplanation && !isPaused && vitalsValidation.isValid;

  const handleDischarge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPaused) {
      alert("You cannot discharge a patient while the session is paused.");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        session_status: 'Completed',
        session_postweight: parseFloat(dischargeForm.post_weight), post_bp: `${dischargeForm.bp_sys}/${dischargeForm.bp_dia}`,
        post_hr: parseInt(dischargeForm.post_hr) || null, fluid_removed: parseFloat(dischargeForm.fluid_removed),
        actual_weight_loss: parseFloat(dischargeForm.weight_loss) || null, kt_v: parseFloat(dischargeForm.kt_v) || null,
        injections: dischargeForm.injections || null, session_complications: dischargeForm.complications || null,
        hemostasis_achieved: hemostasisAchieved, needles_intact: needlesIntact, discharged_by: currentNurseId
      };
      
      const { error } = await supabase.from('treatments').update(payload).eq('session_id', treatment.session_id);
      if (error) throw error;
      
      const finalBookingId = bookingId || treatment.booking_id;
      if (finalBookingId) {
        await supabase.from('bookings').update({ booking_status: 'Completed' }).eq('id', finalBookingId);
      }

      const patientUserId = treatment.patients?.user_id;
      if (patientUserId) {
        await supabase.from('notifications').insert([{
          user_id: patientUserId,
          title: 'Treatment Completed & Discharged',
          message: 'Your dialysis session is complete and you have been successfully discharged by the nursing staff. Please rest well and hydrate carefully!',
          type: 'System',
          is_read: false
        }]);
      }

      router.push('/nurse/logs'); 
    } catch (error: any) {
      alert("Error saving discharge logs: " + error.message);
      setIsSubmitting(false);
    }
  };

  const formatTimeHM = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  if (isLoading) return <div className="p-8 text-center text-blue-600 font-bold animate-pulse">Loading Charting Workstation...</div>;

  return (
    <main className="p-4 sm:p-8 max-w-7xl mx-auto pb-24">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <Link href="/nurse/treatments" className="h-10 w-10 bg-white border border-slate-200 rounded-full flex items-center justify-center hover:bg-slate-50 shadow-sm shrink-0"><FiArrowLeft className="text-xl" /></Link>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Intradialytic Charting</h1>
            <p className="text-sm font-bold text-slate-500">Patient: {treatment?.patients?.users?.user_fullname || 'Unknown'}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`px-4 py-2 rounded-xl text-xs font-black tracking-widest flex items-center gap-2 border shadow-sm shrink-0 transition-colors ${elapsedMinutes > targetMinutes ? 'bg-red-100 text-red-700 border-red-200 animate-pulse' : 'bg-white text-slate-700 border-slate-200'}`}>
  <FiClock className={`text-lg ${elapsedMinutes > targetMinutes ? 'text-red-600' : 'text-blue-500'}`} /> 
  {formatTimeHM(elapsedMinutes)} Elapsed 
  {elapsedMinutes > targetMinutes && ` (+${elapsedMinutes - targetMinutes}m Over)`}
</div>
          {isPaused ? (
            <div className="bg-red-100 text-red-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 animate-pulse border border-red-200 shrink-0">
              <FiPauseCircle className="text-lg" /> Paused
            </div>
          ) : (
            <div className="bg-amber-100 text-amber-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 animate-pulse border border-amber-200 shrink-0">
              <FiActivity className="text-lg" /> Active
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center"><h2 className="font-black text-slate-800 flex items-center gap-2"><FiClock className="text-blue-500"/> Chart New Vitals</h2></div>
            <form onSubmit={handleAddHourlyLog} className="p-6 bg-blue-50/30">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">BP (Sys)</label><input type="number" required value={newLog.bp_sys} onChange={e => setNewLog({...newLog, bp_sys: e.target.value})} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-sm placeholder:text-slate-300" placeholder="120" /></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">BP (Dia)</label><input type="number" required value={newLog.bp_dia} onChange={e => setNewLog({...newLog, bp_dia: e.target.value})} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-sm placeholder:text-slate-300" placeholder="80" /></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Heart Rate</label><input type="number" required value={newLog.hr} onChange={e => setNewLog({...newLog, hr: e.target.value})} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-sm placeholder:text-slate-300" placeholder="75" /></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">V/P</label><input type="number" required value={newLog.vp} onChange={e => setNewLog({...newLog, vp: e.target.value})} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-sm placeholder:text-slate-300" placeholder="150" /></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">TMP</label><input type="number" required value={newLog.tmp} onChange={e => setNewLog({...newLog, tmp: e.target.value})} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-sm placeholder:text-slate-300" placeholder="100" /></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">UF Rate</label><input type="number" step="0.01" required value={newLog.uf_rate} onChange={e => setNewLog({...newLog, uf_rate: e.target.value})} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-sm placeholder:text-slate-300" placeholder="0.80" /></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">B/F (Blood Flow)</label><input type="number" required value={newLog.bf} onChange={e => setNewLog({...newLog, bf: e.target.value})} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-sm placeholder:text-slate-300" placeholder="300" /></div>
                <div><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Heparin Infused</label><input type="number" required value={newLog.hep} onChange={e => setNewLog({...newLog, hep: e.target.value})} className="w-full p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-sm placeholder:text-slate-300" placeholder="1000" /></div>
              </div>
              <button type="submit" disabled={isLogging || isPaused} className="mt-5 w-full py-3 bg-slate-900 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:bg-slate-400 hover:bg-slate-800 transition-colors"><FiPlus /> {isPaused ? 'Cannot Chart While Paused' : 'Save Chart Entry'}</button>
            </form>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50"><h2 className="font-black text-slate-800 flex items-center gap-2"><FiActivity className="text-blue-500"/> Clinical Flow Sheet</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full text-left whitespace-nowrap">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest pl-6">Time</th>
                    <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">BP / HR</th>
                    <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">V/P</th>
                    <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">TMP / UF</th>
                    <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">B/F</th>
                    <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Heparin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessionLogs.map(log => (
                    <tr key={log.log_id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 pl-6 font-bold text-sm text-slate-700">{log.log_time?.slice(0,5)}</td>
                      <td className="p-3 font-black text-sm text-slate-900">{log.log_systolic_bp}/{log.log_diastolic_bp} <span className="text-xs text-slate-500 font-medium">({log.log_heart_rate})</span></td>
                      <td className="p-3 font-bold text-sm text-slate-600">{log.log_venous_pressure}</td>
                      <td className="p-3 font-bold text-sm text-slate-600">{log.log_transmembrane_pressure} / {log.log_uf_rate}</td>
                      <td className="p-3 font-bold text-sm text-blue-600">{log.log_blood_flow}</td>
                      <td className="p-3 font-bold text-sm text-amber-600">{log.log_heparin}</td>
                    </tr>
                  ))}
                  {sessionLogs.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-sm font-bold text-slate-400">No vitals logged yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 relative">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Interventions & Logs</h3>
            <div className="grid grid-cols-1 gap-2 mb-4">
              <button onClick={() => handleQuickIntervention("Administered 100ml Normal Saline flush due to hypotension.")} className="text-left p-3 rounded-xl border border-blue-100 bg-blue-50/50 hover:bg-blue-100 font-bold text-sm text-blue-700 transition-colors flex items-center gap-2"><FiDroplet className="shrink-0" /> 100ml Saline Flush</button>
              <button onClick={() => handleQuickIntervention("Patient reported cramping. UF rate temporarily decreased.")} className="text-left p-3 rounded-xl border border-amber-100 bg-amber-50/50 hover:bg-amber-100 font-bold text-sm text-amber-700 transition-colors flex items-center gap-2"><FiAlertTriangle className="shrink-0" /> Log Cramping / UF Drop</button>
            </div>

            <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
              <input 
                type="text" 
                value={customIntervention} 
                onChange={e => setCustomIntervention(e.target.value)} 
                placeholder="Type custom clinical note..." 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-sm placeholder:text-slate-400"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (customIntervention.trim()) {
                      handleQuickIntervention(customIntervention);
                      setCustomIntervention('');
                    }
                  }
                }}
              />
              <button 
                type="button"
                onClick={() => {
                  if (customIntervention.trim()) {
                    handleQuickIntervention(customIntervention);
                    setCustomIntervention('');
                  }
                }}
                disabled={!customIntervention.trim()}
                className="p-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:bg-slate-300 transition-colors shrink-0"
              >
                <FiPlus className="text-lg" />
              </button>
            </div>

            {interventionFeedback && <p className="text-[10px] font-black text-emerald-500 uppercase flex items-center gap-1 mt-3 animate-pulse bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-100"><FiCheckCircle className="text-sm" /> {interventionFeedback}</p>}
          </div>

          <div className="bg-slate-900 rounded-3xl shadow-xl p-6 text-white relative overflow-hidden">
            <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-6 border-b border-slate-700 pb-4 flex items-center justify-between">
              <span className="flex items-center gap-2"><FiCheckCircle /> Conclude Session</span>
            </h3>

            {!isTimeComplete && !isOverrideActive ? (
              <div className="py-4 text-center animate-in fade-in zoom-in-95 duration-500">
                {isPaused ? <FiPauseCircle className="text-6xl text-red-500 mx-auto mb-4 animate-pulse" /> : <FiClock className="text-6xl text-blue-500 mx-auto mb-4 animate-pulse" />}
                <h4 className="text-white font-black text-xl mb-1">{isPaused ? "Treatment Paused" : "Dialysis in Progress"}</h4>
                
                <p className="text-slate-400 font-bold mb-6">
                  {formatTimeHM(Math.max(targetMinutes - elapsedMinutes, 0))} remaining of {formatTimeHM(targetMinutes)} prescription.
                </p>
                
                <div className="w-full bg-slate-800 rounded-full h-4 mb-8 overflow-hidden shadow-inner">
                  <div className={`${isPaused ? 'bg-red-500' : 'bg-blue-500'} h-4 rounded-full transition-all duration-1000 ease-in-out relative`} style={{ width: `${Math.min((elapsedMinutes/targetMinutes)*100, 100)}%` }}>
                    {!isPaused && <div className="absolute top-0 right-0 bottom-0 left-0 bg-white/20 animate-pulse"></div>}
                  </div>
                </div>
                <button onClick={handleTogglePause} className={`w-full py-4 rounded-xl font-black flex items-center justify-center gap-2 mb-4 transition-colors ${isPaused ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/50' : 'bg-red-600/20 text-red-400 border border-red-500/50 hover:bg-red-600 hover:text-white'}`}>
                  {isPaused ? <><FiPlayCircle className="text-xl" /> Resume Treatment</> : <><FiPauseCircle className="text-xl" /> Pause Treatment</>}
                </button>
                <button onClick={() => setIsOverrideActive(true)} className="text-[10px] font-black text-slate-500 uppercase flex items-center justify-center gap-2 w-full hover:text-amber-400 transition-colors group">
                  <FiUnlock className="group-hover:animate-bounce" /> Emergency: Terminate Early
                </button>
              </div>
            ) : (
            <form onSubmit={handleDischarge} className="space-y-6 animate-in fade-in duration-500">
              {isOverrideActive && <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-xl mb-4"><p className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center gap-2"><FiAlertTriangle /> Early Termination Active</p></div>}
              {elapsedMinutes > targetMinutes && (
    <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-xl mb-4">
      <p className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center gap-2">
        <FiAlertTriangle className="text-lg shrink-0" /> WARNING: Session has exceeded the prescribed {targetMinutes} minutes by {elapsedMinutes - targetMinutes} minutes. Disconnect immediately.
      </p>
    </div>
  )}
              <div className="space-y-4">
                <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 flex justify-between">
                    <span>Post-Weight (kg)</span><span className="text-blue-400">Pre-Wt: {treatment?.pre_weight} kg</span>
                  </label>
                  <input 
                    type="number" step="0.1" required value={dischargeForm.post_weight} 
                    onChange={e => {
                      const newPostWeight = e.target.value;
                      let calculatedLoss = '';
                      if (newPostWeight && treatment?.pre_weight) {
                        const pre = parseFloat(treatment.pre_weight);
                        const post = parseFloat(newPostWeight);
                        if (!isNaN(pre) && !isNaN(post)) calculatedLoss = (pre - post).toFixed(1);
                      }
                      setDischargeForm({...dischargeForm, post_weight: newPostWeight, weight_loss: calculatedLoss, fluid_removed: calculatedLoss});
                    }} 
                    className="w-full bg-transparent text-xl font-black text-white outline-none placeholder:text-slate-600" placeholder="e.g. 65.5" 
                  />
                </div>
                
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 col-span-1"><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Post-BP(Sys)</label><input type="number" required value={dischargeForm.bp_sys} onChange={e => setDischargeForm({...dischargeForm, bp_sys: e.target.value})} className="w-full bg-transparent text-sm font-black text-white outline-none placeholder:text-slate-600" placeholder="120" /></div>
                  <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 col-span-1"><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Post-BP(Dia)</label><input type="number" required value={dischargeForm.bp_dia} onChange={e => setDischargeForm({...dischargeForm, bp_dia: e.target.value})} className="w-full bg-transparent text-sm font-black text-white outline-none placeholder:text-slate-600" placeholder="80" /></div>
                  <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 col-span-1"><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Heart Rate</label><input type="number" required value={dischargeForm.post_hr} onChange={e => setDischargeForm({...dischargeForm, post_hr: e.target.value})} className="w-full bg-transparent text-sm font-black text-white outline-none placeholder:text-slate-600" placeholder="75" /></div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-3 rounded-xl border ${isUfMismatch ? 'bg-amber-900/30 border-amber-500/50' : 'bg-emerald-900/30 border-emerald-500/30'}`}>
                    <label className={`block text-[10px] font-black uppercase mb-1 flex flex-col gap-1 ${isUfMismatch ? 'text-amber-400' : 'text-emerald-400'}`}><span>U/F Removed</span><span className="text-slate-500">Target: {treatment?.target_uf} L</span></label>
                    <input type="number" step="0.1" required value={dischargeForm.fluid_removed} onChange={e => setDischargeForm({...dischargeForm, fluid_removed: e.target.value})} className={`w-full bg-transparent text-lg font-black outline-none placeholder:text-slate-600 ${isUfMismatch ? 'text-amber-400' : 'text-emerald-400'}`} placeholder="3.0" />
                  </div>
                  <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-5">WT Loss</label>
                    <input type="number" step="0.1" required value={dischargeForm.weight_loss} onChange={e => setDischargeForm({...dischargeForm, weight_loss: e.target.value})} className="w-full bg-transparent text-lg font-black text-white outline-none placeholder:text-slate-600" placeholder="3.0" />
                  </div>
                  <div className="bg-slate-800 p-3 rounded-xl border border-slate-700"><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">KT/V</label><input type="number" step="0.1" value={dischargeForm.kt_v} onChange={e => setDischargeForm({...dischargeForm, kt_v: e.target.value})} className="w-full bg-transparent text-lg font-black text-white outline-none placeholder:text-slate-600" placeholder="1.4" /></div>
                  <div className="bg-slate-800 p-3 rounded-xl border border-slate-700"><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Injection</label><input type="text" value={dischargeForm.injections} onChange={e => setDischargeForm({...dischargeForm, injections: e.target.value})} className="w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-slate-600" placeholder="e.g. Recormon" /></div>
                </div>
              </div>

              <div>
                <label className="flex justify-between items-center mb-2"><span className="text-[10px] font-black text-slate-400 uppercase">Clinical Notes & Complications</span>{requiresExplanation && <span className="text-[10px] font-black text-amber-400 uppercase animate-pulse">Required</span>}</label>
                <textarea value={dischargeForm.complications} onChange={e => setDischargeForm({...dischargeForm, complications: e.target.value})} className={`w-full p-3 bg-slate-800 border rounded-xl outline-none focus:border-emerald-500 font-medium text-sm text-slate-300 h-20 resize-none placeholder:text-slate-600 ${requiresExplanation && !hasRequiredExplanation ? 'border-amber-500/50 bg-amber-900/10' : 'border-slate-700'}`} placeholder={requiresExplanation ? "Explain UF mismatch or early termination..." : "Add final clinical notes..."} />
              </div>

              <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700 space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Required Audit Trail Check</p>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${hemostasisAchieved ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-900 border-slate-600'}`}>
                    {hemostasisAchieved && <FiCheckCircle className="text-white text-[10px]" />}
                  </div>
                  <span className="text-xs font-bold text-slate-300 select-none">Hemostasis achieved (Bleeding stopped).</span>
                  <input type="checkbox" className="hidden" checked={hemostasisAchieved} onChange={e => setHemostasisAchieved(e.target.checked)} />
                </label>
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${needlesIntact ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-900 border-slate-600'}`}>
                    {needlesIntact && <FiCheckCircle className="text-white text-[10px]" />}
                  </div>
                  <span className="text-xs font-bold text-slate-300 select-none">Needles removed intact.</span>
                  <input type="checkbox" className="hidden" checked={needlesIntact} onChange={e => setNeedlesIntact(e.target.checked)} />
                </label>
              </div>

              <div className="pt-2">
                {isPaused && <p className="text-center text-[10px] text-red-400 font-bold uppercase mb-3 animate-pulse"><FiAlertTriangle className="inline mr-1" /> Cannot discharge while paused</p>}
                {!vitalsValidation.isValid && (
                  <p className="text-center text-[10px] text-red-400 font-bold uppercase mb-3 animate-pulse">
                    <FiAlertTriangle className="inline mr-1" /> {vitalsValidation.errorMessage}
                  </p>
                )}

                <button type="submit" disabled={isSubmitting || !isDischargeValid || isPaused} className="w-full py-4 bg-emerald-600 text-white font-black rounded-xl shadow-lg hover:bg-emerald-500 transition-colors disabled:bg-slate-700 disabled:text-slate-500 flex justify-center items-center gap-2">
                  {isSubmitting ? 'Processing...' : <><FiSave /> Sign & Discharge Patient</>}
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function MonitorWorkstation() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-blue-600 font-bold animate-pulse">Loading Charting Workstation...</div>}>
      <MonitorContent />
    </Suspense>
  );
}