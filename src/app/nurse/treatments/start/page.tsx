'use client';
import { useState, useEffect, Suspense } from 'react';
import { supabase } from '../../../../lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  FiArrowLeft, FiAlertTriangle, FiDroplet, FiShield, 
  FiPlayCircle, FiCheckSquare, FiUser, FiActivity, FiMapPin, FiCheckCircle
} from 'react-icons/fi';

function StartTreatmentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get('patient_id');
  const bookingId = searchParams.get('booking_id');

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [patient, setPatient] = useState<any>(null);
  const [prescription, setPrescription] = useState<any>(null);
  const [booking, setBooking] = useState<any>(null);
  const [nurseData, setNurseData] = useState<any>(null);

  const [vitals, setVitals] = useState({ pre_weight: '', bp_sys: '', bp_dia: '', pre_hr: '', pre_temp: '36.5' });

  const [preFlight, setPreFlight] = useState({
    dialyser_model: '', dialysate_k: '', accessChecked: false, heparinAdministered: false
  });

  const [ufGoal, setUfGoal] = useState<number>(0);

  useEffect(() => {
    async function fetchSetupData() {
      if (!patientId || !bookingId) return router.push('/nurse');
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) return;

        const { data: activeTx } = await supabase.from('treatments').select('session_id').eq('patient_id', patientId).eq('session_status', 'Ongoing').maybeSingle();
        if (activeTx) {
          setHasActiveSession(true);
        }
        const { data: userData } = await supabase.from('users').select('user_id, branch_id').eq('user_email', session.session.user.email).single();
        setNurseData(userData);

        // 1. Fetch Patient & Prescription
        const { data: patientData } = await supabase.from('patients').select(`*, users!inner(user_fullname, user_ic), prescriptions(*)`).eq('patient_id', patientId).single();
        if (patientData) {
          setPatient(patientData);
          const activeRx = patientData.prescriptions?.find((p: any) => p.status === 'Active');
          setPrescription(activeRx);
          
          if (activeRx && (activeRx.heparin_dosage === 0 || activeRx.is_heparin_free)) {
            setPreFlight(prev => ({ ...prev, heparinAdministered: true }));
          }
        }

        // 2. Fetch the specific Booking to get Home/Travel status & Assigned Machine
        const { data: bookingData } = await supabase
          .from('bookings')
          .select('*, machines(model, asset_tag)')
          .eq('id', bookingId)
          .single();
        
        if (bookingData) {
          setBooking(bookingData);
        }

      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSetupData();
  }, [patientId, bookingId, router]);

  // Auto-calculate Target UF
  useEffect(() => {
    if (vitals.pre_weight && prescription?.target_dry_weight) {
      const weight = parseFloat(vitals.pre_weight);
      const dryWeight = parseFloat(prescription.target_dry_weight);
      const calculatedUf = (weight - dryWeight) + 0.3; 
      setUfGoal(calculatedUf > 0 ? Number(calculatedUf.toFixed(2)) : 0);
    } else setUfGoal(0);
  }, [vitals.pre_weight, prescription]);

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    if (!nurseData || !booking) return;

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const nowTime = new Date().toTimeString().split(' ')[0];

      const payload = {
        patient_id: patientId, booking_id: bookingId, nurse_id: nurseData.user_id, branch_id: nurseData.branch_id,
        session_date: todayStr, start_time: nowTime,
        pre_weight: parseFloat(vitals.pre_weight), pre_bp: `${vitals.bp_sys}/${vitals.bp_dia}`, 
        pre_hr: parseInt(vitals.pre_hr), pre_temp: parseFloat(vitals.pre_temp),
        target_uf: ufGoal, session_status: 'Ongoing',
        dialyser_model: preFlight.dialyser_model, dialysate_k_level: preFlight.dialysate_k
      };

      const { error: insertError } = await supabase.from('treatments').insert([payload]);
      if (insertError) throw insertError;

      await supabase.from('bookings').update({ booking_status: 'In Progress' }).eq('id', bookingId);
      
      router.push('/nurse/treatments'); 
    } catch (error: any) {
      alert("Database Error: " + error.message);
      setIsSubmitting(false);
    }
  };

  const isMachineAssigned = booking?.machine_id != null;
  const isFormValid = ufGoal > 0 && isMachineAssigned && preFlight.dialyser_model !== '' && preFlight.dialysate_k !== '' && preFlight.accessChecked && preFlight.heparinAdministered;
  const hasAbnormalVitals = parseInt(vitals.bp_sys) > 180 || parseInt(vitals.bp_dia) > 110 || parseFloat(vitals.pre_temp) >= 37.8;

  if (isLoading) return <div className="p-8 text-center text-blue-600 font-bold animate-pulse">Loading Clinical Profile...</div>;

  return (
    <main className="p-4 sm:p-8 max-w-6xl mx-auto pb-24">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/nurse" className="h-10 w-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 shadow-sm transition-colors hover:bg-slate-50"><FiArrowLeft className="text-xl" /></Link>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Commence Treatment</h1>
          <p className="text-sm font-bold text-slate-500">Clinical Verification & Pre-Flight</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: CLINICAL PROFILE & PRESCRIPTION */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute -right-10 -top-10 text-slate-50 opacity-50 pointer-events-none">
              <FiUser className="text-[200px]" />
            </div>

            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-5">
                  <div className="h-16 w-16 rounded-2xl bg-blue-50 flex items-center justify-center text-2xl font-black text-blue-600 border border-blue-100">
                    {patient?.users?.user_fullname.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900">{patient?.users?.user_fullname}</h2>
                    <p className="text-sm font-bold text-slate-500 mt-1">IC: {patient?.users?.user_ic}</p>
                  </div>
                </div>
                
                {booking?.booking_type === 'Travel' ? (
                  <div className="bg-purple-100 text-purple-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 border border-purple-200">
                    <FiMapPin className="text-lg" /> Travel Patient
                  </div>
                ) : (
                  <div className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 border border-emerald-200">
                    <FiCheckCircle className="text-lg" /> Home Patient
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1"><FiDroplet /> Blood Type</p>
                  <p className="font-black text-red-600 text-lg mt-1">{patient?.patient_blood_type || 'Unknown'}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1"><FiAlertTriangle /> Serology</p>
                  <p className="font-black text-emerald-600 text-sm mt-1">Negative (Safe)</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 md:col-span-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-1"><FiActivity /> Vascular Access</p>
                  <p className="font-black text-slate-900 text-sm mt-1">Assess visually before cannulation</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-blue-50/50 flex justify-between items-center">
              <h3 className="text-sm font-black text-blue-800 flex items-center gap-2">
                <FiShield className="text-blue-500" /> Active Nephrologist Prescription
              </h3>
              {prescription ? (
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest px-2 py-1 bg-blue-100 rounded-md">Verified</span>
              ) : (
                <span className="text-[10px] font-black text-red-600 uppercase tracking-widest px-2 py-1 bg-red-100 rounded-md border border-red-200">Missing</span>
              )}
            </div>
            
            <div className="p-6 md:p-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Modality</p>
                <p className="font-black text-xl text-slate-900">{prescription?.treatment_modality || 'HD'}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1" title="Treatment Duration">Time (Td)</p>
                <p className="font-black text-xl text-slate-900">{prescription?.target_duration || 240} <span className="text-sm font-bold text-slate-500">min</span></p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1" title="Estimated Dry Weight">Target EDW</p>
                <p className="font-black text-xl text-blue-600">{prescription?.target_dry_weight || '--'} <span className="text-sm font-bold text-blue-400">kg</span></p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1" title="Heparin Loading Dose">Heparin Rx</p>
                <p className="font-black text-xl text-slate-900">{prescription?.heparin_dosage || 0} <span className="text-sm font-bold text-slate-500">IU</span></p>
              </div>
              
              <button 
                onClick={handleStartSession} 
                type="button" 
                disabled={isSubmitting || !isFormValid || hasAbnormalVitals || hasActiveSession} 
                className="w-full py-4 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 flex justify-center items-center gap-2 shadow-lg shadow-blue-900/50 transition-all"
              >
                {hasActiveSession ? 'Session Already Ongoing' : isSubmitting ? 'Processing Start...' : <><FiPlayCircle className="text-xl" /> Commence Treatment</>}
              </button>
              <div className="pt-4 border-t border-slate-100 col-span-2 sm:col-span-3 md:col-span-4 grid grid-cols-2 sm:grid-cols-3 gap-6">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1" title="Blood Flow Rate">Target Qb</p>
                  <p className="font-black text-lg text-slate-900">{prescription?.blood_flow_rate || '300'} <span className="text-xs font-bold text-slate-500">ml/min</span></p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1" title="Dialysate Flow Rate">Target Qd</p>
                  <p className="font-black text-lg text-slate-900">{prescription?.dialysate_flow_rate || '500'} <span className="text-xs font-bold text-slate-500">ml/min</span></p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Recommended Dialysate</p>
                  <p className="font-black text-lg text-slate-900">Standard K2 / K3</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: PRE-FLIGHT ACTION BOARD */}
        <div className="bg-slate-900 rounded-3xl shadow-xl p-6 text-white flex flex-col h-full sticky top-8">
          <form className="flex-1 flex flex-col space-y-6">
            
            <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700 space-y-4">
              <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                <FiCheckSquare /> Physical Setup Required
              </p>
              
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Assigned Machine</label>
                {isMachineAssigned ? (
                  <div className="w-full p-3 bg-slate-800/80 border border-slate-600 rounded-xl flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></div>
                    <span className="font-bold text-white tracking-widest">
                      {booking.machines?.asset_tag || booking.machines?.model || 'Unknown Machine'}
                    </span>
                  </div>
                ) : (
                  <div className="w-full p-3 bg-red-900/30 border border-red-500/50 rounded-xl flex items-center gap-2 text-red-400">
                    <FiAlertTriangle /> <span className="font-bold text-xs uppercase">No Machine Assigned</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Dialyser</label>
                  <input type="text" required placeholder="e.g. F.17H" value={preFlight.dialyser_model} onChange={e => setPreFlight({...preFlight, dialyser_model: e.target.value})} className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl font-bold text-white outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Dialysate (K)</label>
                  <select required value={preFlight.dialysate_k} onChange={e => setPreFlight({...preFlight, dialysate_k: e.target.value})} className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl font-bold text-white outline-none focus:border-blue-500">
                    <option value="" disabled>Select...</option>
                    <option value="K2">K2</option><option value="K3">K3</option><option value="K5">K5</option><option value="K6">K6</option>
                  </select>
                </div>
              </div>

              <label className="flex items-start gap-3 cursor-pointer group pt-2">
                <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${preFlight.accessChecked ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-900 border-slate-600'}`}>
                  {preFlight.accessChecked && <FiCheckSquare className="text-white text-xs" />}
                </div>
                <span className="text-xs font-bold text-slate-300">Vascular access assessed & Cannulated safely.</span>
                <input type="checkbox" className="hidden" checked={preFlight.accessChecked} onChange={e => setPreFlight({...preFlight, accessChecked: e.target.checked})} />
              </label>
              
              {prescription?.heparin_dosage > 0 && (
                <label className="flex items-start gap-3 cursor-pointer group pt-2">
                  <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${preFlight.heparinAdministered ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-900 border-slate-600'}`}>
                    {preFlight.heparinAdministered && <FiCheckSquare className="text-white text-xs" />}
                  </div>
                  <span className="text-xs font-bold text-slate-300">Initial Heparin ({prescription?.heparin_dosage} IU) given.</span>
                  <input type="checkbox" className="hidden" checked={preFlight.heparinAdministered} onChange={e => setPreFlight({...preFlight, heparinAdministered: e.target.checked})} />
                </label>
              )}
            </div>

            <div className={`p-4 rounded-2xl border transition-colors ${hasAbnormalVitals ? 'bg-red-900/20 border-red-500/50' : 'bg-slate-800 border-slate-700'}`}>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex justify-between">
                <span>Pre-Weight (kg)</span>
                {prescription?.target_dry_weight && <span className="text-blue-400">Target EDW: {prescription.target_dry_weight} kg</span>}
              </label>
              <input type="number" step="0.1" required value={vitals.pre_weight} onChange={e => setVitals({...vitals, pre_weight: e.target.value})} className="w-full bg-transparent text-4xl font-black text-white outline-none placeholder:text-slate-600" placeholder="00.0" />
              
              {vitals.pre_weight && ufGoal > 0 && (
                <p className="text-xs font-bold text-emerald-400 mt-2 flex items-center gap-1 animate-in fade-in">
                  <FiPlayCircle /> Calculated U/F Goal: {ufGoal} L
                </p>
              )}
            </div>

            {/* --- UPGRADED BP/HR SHADOW INPUTS --- */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">BP(Sys)</label>
                <input type="number" required value={vitals.bp_sys} onChange={e => setVitals({...vitals, bp_sys: e.target.value})} className="w-full bg-transparent text-2xl font-black text-white outline-none placeholder:text-slate-600" placeholder="120" />
              </div>
              <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">BP(Dia)</label>
                <input type="number" required value={vitals.bp_dia} onChange={e => setVitals({...vitals, bp_dia: e.target.value})} className="w-full bg-transparent text-2xl font-black text-white outline-none placeholder:text-slate-600" placeholder="80" />
              </div>
              <div className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">HR (Nadi)</label>
                <input type="number" required value={vitals.pre_hr} onChange={e => setVitals({...vitals, pre_hr: e.target.value})} className="w-full bg-transparent text-2xl font-black text-white outline-none placeholder:text-slate-600" placeholder="75" />
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {hasAbnormalVitals && (
                <p className="text-[10px] font-bold text-red-400 uppercase text-center animate-pulse flex items-center justify-center gap-1">
                  <FiAlertTriangle /> Vitals exceed safe limits.
                </p>
              )}
              {!isMachineAssigned && (
                <p className="text-[10px] font-bold text-red-400 uppercase text-center">
                  Cannot start without machine assignment.
                </p>
              )}
              {!prescription && (
                <p className="text-[10px] font-bold text-red-400 uppercase text-center flex items-center justify-center gap-1">
                  <FiAlertTriangle /> Cannot start session. Valid prescription required.
                </p>
              )}
              
              <button 
                onClick={handleStartSession} 
                type="button" 
                disabled={isSubmitting || !isFormValid || hasAbnormalVitals || hasActiveSession || !prescription} 
                className="w-full py-4 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 flex justify-center items-center gap-2 shadow-lg shadow-blue-900/50 transition-all"
              >
                {hasActiveSession ? 'Session Already Ongoing' : (!prescription ? 'Missing Prescription' : (isSubmitting ? 'Processing Start...' : <><FiPlayCircle className="text-xl" /> Commence Treatment</>))}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function StartTreatmentWorkstation() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-blue-600 font-bold animate-pulse flex flex-col items-center justify-center min-h-screen"><FiActivity className="text-4xl mb-4 animate-spin" />Loading Clinical Setup...</div>}>
      <StartTreatmentContent />
    </Suspense>
  );
}