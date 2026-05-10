'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../../lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  FiArrowLeft, FiAlertTriangle, FiDroplet, 
  FiShield, FiPlayCircle, FiCheckSquare 
} from 'react-icons/fi';

export default function StartTreatmentWorkstation() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get('patient_id');
  const bookingId = searchParams.get('booking_id');

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [patient, setPatient] = useState<any>(null);
  const [prescription, setPrescription] = useState<any>(null);
  const [nurseData, setNurseData] = useState<any>(null);
  const [availableMachines, setAvailableMachines] = useState<any[]>([]);

  // 1. Core Vitals State
  const [vitals, setVitals] = useState({
    pre_weight: '',
    bp_sys: '',
    bp_dia: '',
    pre_temp: '36.5'
  });

  // 2. Clinical Pre-Flight Safety Checklist State
  const [preFlight, setPreFlight] = useState({
    machine_id: '',
    accessChecked: false,
    heparinAdministered: false
  });

  const [ufGoal, setUfGoal] = useState<number>(0);

  useEffect(() => {
    async function fetchSetupData() {
      if (!patientId) {
        router.push('/nurse');
        return;
      }

      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) return;

        const { data: userData } = await supabase
          .from('users')
          .select('user_id, branch_id')
          .eq('user_email', session.session.user.email)
          .single();
        
        setNurseData(userData);

        // Fetch Patient & Active Prescription
        const { data: patientData } = await supabase
          .from('patients')
          .select(`
            *,
            users!inner(user_fullname, user_ic),
            prescriptions(*)
          `)
          .eq('patient_id', patientId)
          .single();

        if (patientData) {
          setPatient(patientData);
          const activeRx = patientData.prescriptions?.find((p: any) => p.status === 'Active');
          setPrescription(activeRx);

          // If Heparin is 0 (Heparin-Free), auto-check the requirement so it doesn't block the nurse
          if (activeRx && (activeRx.heparin_dosage === 0 || activeRx.is_heparin_free)) {
            setPreFlight(prev => ({ ...prev, heparinAdministered: true }));
          }
        }

        // Fetch Available Machines for this Branch
        const { data: machinesData } = await supabase
          .from('machines')
          .select('id, model, asset_tag')
          .eq('branch_id', userData?.branch_id)
          .eq('status', 'Active');
        
        setAvailableMachines(machinesData || []);

      } catch (error) {
        console.error("Error fetching setup:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSetupData();
  }, [patientId, router]);

  // Auto-calculate UF Goal
  useEffect(() => {
    if (vitals.pre_weight && prescription?.target_dry_weight) {
      const weight = parseFloat(vitals.pre_weight);
      const dryWeight = parseFloat(prescription.target_dry_weight);
      const calculatedUf = (weight - dryWeight) + 0.3; // 0.3L Washback allowance
      setUfGoal(calculatedUf > 0 ? Number(calculatedUf.toFixed(2)) : 0);
    } else {
      setUfGoal(0);
    }
  }, [vitals.pre_weight, prescription]);

  // --- STANDARD WORKFLOW: COMMENCE TREATMENT ---
  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (!nurseData) {
      alert("Error: Nurse data missing. Please refresh the page.");
      setIsSubmitting(false);
      return;
    }

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const nowTime = new Date().toTimeString().split(' ')[0];

      // 1. Create the Treatment Record
      const payload = {
        patient_id: patientId,
        booking_id: bookingId,
        nurse_id: nurseData.user_id,
        branch_id: nurseData.branch_id,
        session_date: todayStr,
        start_time: nowTime,
        pre_weight: parseFloat(vitals.pre_weight),
        pre_bp: `${vitals.bp_sys}/${vitals.bp_dia}`,
        pre_temp: parseFloat(vitals.pre_temp),
        target_uf: ufGoal,
        session_status: 'Ongoing'
      };

      const { error: insertError } = await supabase.from('treatments').insert([payload]);
      if (insertError) throw insertError;

      // 2. Update the Booking (Mark "In Progress" AND assign the Machine ID)
      if (bookingId) {
        await supabase.from('bookings').update({ 
          booking_status: 'In Progress',
          machine_id: parseInt(preFlight.machine_id)
        }).eq('id', bookingId);
      }

      router.push('/nurse/treatments'); 
      
    } catch (error: any) {
      alert("Database Error: " + error.message);
      setIsSubmitting(false);
    }
  };

  // --- EXCEPTION WORKFLOW: HOLD TREATMENT ---
  const handleHoldTreatment = async () => {
    if (!confirm("Are you sure you want to hold this treatment? This will alert the Doctor.")) return;
    setIsSubmitting(true);
    
    try {
      // 1. Create an urgent notification for the Nephrologist
      await supabase.from('notifications').insert([{
        user_id: prescription.nephrologist_id,
        title: 'Treatment Held: Abnormal Vitals',
        message: `Treatment for ${patient.users.user_fullname} held by nurse due to abnormal pre-vitals (BP: ${vitals.bp_sys}/${vitals.bp_dia}, Temp: ${vitals.pre_temp}).`,
        type: 'Urgent'
      }]);
      
      // 2. Update Booking to 'On Hold' to clear it from the active queue
      if (bookingId) {
        await supabase.from('bookings').update({ booking_status: 'On Hold' }).eq('id', bookingId);
      }

      router.push('/nurse');
    } catch (error: any) {
      alert("Error: " + error.message);
      setIsSubmitting(false);
    }
  };

  // --- DYNAMIC CLINICAL VALIDATION ---
  const isBpHigh = parseInt(vitals.bp_sys) > 180 || parseInt(vitals.bp_dia) > 110;
  const isFever = parseFloat(vitals.pre_temp) >= 37.8;
  const hasAbnormalVitals = isBpHigh || isFever;

  // The Start button is disabled unless ALL vitals and pre-flight checks are complete
  const isFormValid = ufGoal > 0 
    && preFlight.machine_id !== '' 
    && preFlight.accessChecked 
    && preFlight.heparinAdministered;

  if (isLoading) return <div className="p-8 text-center text-blue-600 font-bold animate-pulse">Loading Clinical Profile...</div>;
  if (!patient || !prescription) return <div className="p-8 text-center text-red-600 font-bold">Error: Valid Patient or Prescription not found.</div>;

  return (
    <main className="p-4 sm:p-8 max-w-5xl mx-auto pb-24">
      
      <div className="flex items-center gap-4 mb-8">
        <Link href="/nurse" className="h-10 w-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors shadow-sm">
          <FiArrowLeft className="text-xl" />
        </Link>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Commence Treatment</h1>
          <p className="text-sm font-bold text-slate-500">Pre-Dialysis Safety Verification</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: PATIENT INFO & PRESCRIPTION */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl font-black text-slate-500">
                {patient.users.user_fullname.charAt(0)}
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">{patient.users.user_fullname}</h2>
                <div className="flex gap-3 mt-1 text-xs font-bold text-slate-500">
                  <span>IC: {patient.users.user_ic}</span>
                  <span className="flex items-center gap-1 text-red-600"><FiDroplet /> {patient.patient_blood_type}</span>
                  <span className="flex items-center gap-1 text-blue-600 ml-2">Access: {patient.vascular_access_type || 'Unknown'} ({patient.vascular_access_location || 'Unspecified'})</span>
                </div>
              </div>
            </div>
          </div>

          {prescription.nursing_instructions && (
            <div className="bg-red-50 border-2 border-red-200 rounded-3xl p-6 shadow-sm animate-in fade-in slide-in-from-bottom-4">
              <h3 className="text-red-700 font-black flex items-center gap-2 mb-2 uppercase tracking-widest text-xs">
                <FiAlertTriangle className="text-lg" /> Doctor's Specific Instructions
              </h3>
              <p className="text-red-900 font-bold text-lg leading-snug">
                "{prescription.nursing_instructions}"
              </p>
            </div>
          )}

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
              <FiShield className="text-emerald-500" /> Authorized Machine Parameters
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Modality</p>
                <p className="font-black text-xl text-slate-900 mt-1">{prescription.treatment_modality}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Duration</p>
                <p className="font-black text-xl text-slate-900 mt-1">{prescription.target_duration} <span className="text-sm text-slate-500">min</span></p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Blood (Qb)</p>
                <p className="font-black text-xl text-slate-900 mt-1">{prescription.blood_flow_rate}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dialysate (Qd)</p>
                <p className="font-black text-xl text-slate-900 mt-1">{prescription.dialysate_flow_rate}</p>
              </div>
              <div className="col-span-2 sm:col-span-4 mt-2 pt-4 border-t border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Anticoagulation</p>
                <p className="font-black text-lg text-slate-900 mt-1">
                  {prescription.anticoagulation_profile} 
                  {prescription.heparin_dosage > 0 ? ` • ${prescription.heparin_dosage} IU` : ' (Heparin-Free)'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: ACTION FORM */}
        <div className="bg-slate-900 rounded-3xl shadow-xl p-6 text-white flex flex-col h-full sticky top-8">
          <h3 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-6 border-b border-slate-700 pb-4">Clinical Setup & Vitals</h3>
          
          <form className="flex-1 flex flex-col space-y-6">
            
            {/* --- PRE-FLIGHT CHECKLIST --- */}
            <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700 space-y-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><FiCheckSquare className="text-emerald-400" /> Required Pre-Flight</p>
              
              {/* Machine Selection */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Assign Station / Machine</label>
                <select 
                  required
                  value={preFlight.machine_id}
                  onChange={e => setPreFlight({...preFlight, machine_id: e.target.value})}
                  className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl font-bold text-white outline-none focus:border-blue-500 appearance-none"
                >
                  <option value="" disabled>Select Machine...</option>
                  {availableMachines.map(m => (
                    <option key={m.id} value={m.id}>{m.asset_tag || m.model} (ID: {m.id})</option>
                  ))}
                </select>
              </div>

              {/* Vascular Access Check */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${preFlight.accessChecked ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-900 border-slate-600 group-hover:border-blue-400'}`}>
                  {preFlight.accessChecked && <FiCheckSquare className="text-white text-xs" />}
                </div>
                <span className="text-xs font-bold text-slate-300 leading-snug select-none">
                  Vascular access assessed. Thrill/Bruit present. No signs of infection. Cleaned per protocol.
                </span>
                <input type="checkbox" className="hidden" checked={preFlight.accessChecked} onChange={e => setPreFlight({...preFlight, accessChecked: e.target.checked})} />
              </label>

              {/* Heparin Check */}
              {prescription.heparin_dosage > 0 && (
                <label className="flex items-start gap-3 cursor-pointer group pt-2 border-t border-slate-700/50">
                  <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${preFlight.heparinAdministered ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-900 border-slate-600 group-hover:border-blue-400'}`}>
                    {preFlight.heparinAdministered && <FiCheckSquare className="text-white text-xs" />}
                  </div>
                  <span className="text-xs font-bold text-slate-300 leading-snug select-none">
                    Initial Heparin Bolus ({prescription.heparin_dosage} IU) administered safely.
                  </span>
                  <input type="checkbox" className="hidden" checked={preFlight.heparinAdministered} onChange={e => setPreFlight({...preFlight, heparinAdministered: e.target.checked})} />
                </label>
              )}
            </div>

            {/* Weight Input */}
            <div className={`p-4 rounded-2xl border transition-colors ${hasAbnormalVitals ? 'bg-red-900/20 border-red-500/50' : 'bg-slate-800 border-slate-700 focus-within:border-blue-500'}`}>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Patient Current Weight (kg)</label>
              <input 
                type="number" step="0.1" required
                value={vitals.pre_weight}
                onChange={e => setVitals({...vitals, pre_weight: e.target.value})}
                className="w-full bg-transparent text-3xl font-black text-white outline-none placeholder:text-slate-600"
                placeholder="00.0"
              />
            </div>

            {/* BP Inputs */}
            <div className="flex gap-4">
              <div className={`flex-1 p-4 rounded-2xl border ${isBpHigh ? 'bg-red-900/50 border-red-500' : 'bg-slate-800 border-slate-700'}`}>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">BP (Sys)</label>
                <input type="number" required value={vitals.bp_sys} onChange={e => setVitals({...vitals, bp_sys: e.target.value})} className="w-full bg-transparent text-xl font-black text-white outline-none" placeholder="120" />
              </div>
              <div className="flex flex-col justify-center text-slate-500 font-black text-2xl">/</div>
              <div className={`flex-1 p-4 rounded-2xl border ${isBpHigh ? 'bg-red-900/50 border-red-500' : 'bg-slate-800 border-slate-700'}`}>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">BP (Dia)</label>
                <input type="number" required value={vitals.bp_dia} onChange={e => setVitals({...vitals, bp_dia: e.target.value})} className="w-full bg-transparent text-xl font-black text-white outline-none" placeholder="80" />
              </div>
            </div>

            {/* Temperature */}
            <div className={`p-4 rounded-2xl border ${isFever ? 'bg-red-900/50 border-red-500' : 'bg-slate-800 border-slate-700'}`}>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Temperature (°C)</label>
              <input type="number" step="0.1" required value={vitals.pre_temp} onChange={e => setVitals({...vitals, pre_temp: e.target.value})} className="w-full bg-transparent text-xl font-black text-white outline-none" />
            </div>

            {/* AUTOMATIC CALCULATION WIDGET */}
            <div className={`mt-2 p-5 border rounded-2xl ${hasAbnormalVitals ? 'bg-red-900/50 border-red-500/50' : 'bg-blue-900/50 border-blue-500/30'}`}>
                {hasAbnormalVitals && (
                  <p className="text-red-400 font-black text-xs uppercase mb-3 flex items-center gap-2 animate-pulse"><FiAlertTriangle /> Abnormal Vitals Detected</p>
                )}
                <div className="flex justify-between items-center mb-1">
                  <p className="text-[10px] font-black text-blue-300 uppercase tracking-widest">Target Dry Weight</p>
                  <p className="text-sm font-bold text-slate-300">{prescription.target_dry_weight} kg</p>
                </div>
                <div className="flex justify-between items-end border-t border-blue-500/30 pt-3 mt-3">
                  <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Machine UF Goal</p>
                  <p className="text-3xl font-black text-emerald-400">{ufGoal > 0 ? ufGoal.toFixed(2) : '0.00'} <span className="text-sm text-emerald-600">Liters</span></p>
                </div>
                <p className="text-[9px] text-blue-300/50 font-medium mt-2 text-right">*Includes 0.3L washback allowance</p>
            </div>

            {/* EXCEPTION PATHWAY BUTTONS */}
            <div className="mt-6 space-y-3">
              <button 
                onClick={handleStartSession}
                type="button" 
                disabled={isSubmitting || !isFormValid || hasAbnormalVitals}
                className="w-full py-4 bg-blue-600 text-white font-black rounded-xl shadow-lg shadow-blue-900 hover:bg-blue-500 transition-colors disabled:bg-slate-700 disabled:text-slate-500 flex items-center justify-center gap-2"
              >
                {isSubmitting && !hasAbnormalVitals ? 'Starting...' : <><FiPlayCircle className="text-xl" /> Commence Treatment</>}
              </button>
              
              {hasAbnormalVitals && (
                <button 
                  onClick={handleHoldTreatment}
                  type="button" 
                  disabled={isSubmitting}
                  className="w-full py-4 bg-red-600 text-white font-black rounded-xl shadow-lg shadow-red-900/50 hover:bg-red-500 transition-colors flex items-center justify-center gap-2"
                >
                  <FiAlertTriangle className="text-xl" /> Hold Treatment & Consult Doctor
                </button>
              )}
            </div>
            
            {!isFormValid && !hasAbnormalVitals && <p className="text-center text-[10px] text-red-400 font-bold uppercase mt-2">* Complete pre-flight checks and valid vitals to unlock</p>}
          </form>
        </div>

      </div>
    </main>
  );
}