'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../../lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { FiArrowLeft, FiAlertTriangle, FiDroplet, FiShield, FiPlayCircle, FiCheckSquare } from 'react-icons/fi';

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

  const [vitals, setVitals] = useState({ pre_weight: '', bp_sys: '', bp_dia: '', pre_hr: '', pre_temp: '36.5' });

  const [preFlight, setPreFlight] = useState({
    machine_id: '', dialyser_model: '', dialysate_k: '', accessChecked: false, heparinAdministered: false
  });

  const [ufGoal, setUfGoal] = useState<number>(0);

  useEffect(() => {
    async function fetchSetupData() {
      if (!patientId) return router.push('/nurse');
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) return;

        const { data: userData } = await supabase.from('users').select('user_id, branch_id').eq('user_email', session.session.user.email).single();
        setNurseData(userData);

        const { data: patientData } = await supabase.from('patients').select(`*, users!inner(user_fullname, user_ic), prescriptions(*)`).eq('patient_id', patientId).single();
        
        if (patientData) {
          setPatient(patientData);
          const activeRx = patientData.prescriptions?.find((p: any) => p.status === 'Active');
          setPrescription(activeRx);
          if (activeRx && (activeRx.heparin_dosage === 0 || activeRx.is_heparin_free)) {
            setPreFlight(prev => ({ ...prev, heparinAdministered: true }));
          }
        }

        const { data: machinesData } = await supabase.from('machines').select('id, model, asset_tag').eq('branch_id', userData?.branch_id).eq('status', 'Active');
        setAvailableMachines(machinesData || []);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSetupData();
  }, [patientId, router]);

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
    if (!nurseData) return;

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

      if (bookingId) {
        await supabase.from('bookings').update({ booking_status: 'In Progress', machine_id: parseInt(preFlight.machine_id) }).eq('id', bookingId);
      }
      router.push('/nurse/treatments'); 
    } catch (error: any) {
      alert("Database Error: " + error.message);
      setIsSubmitting(false);
    }
  };

  const isFormValid = ufGoal > 0 && preFlight.machine_id !== '' && preFlight.dialyser_model !== '' && preFlight.dialysate_k !== '' && preFlight.accessChecked && preFlight.heparinAdministered;
  const hasAbnormalVitals = parseInt(vitals.bp_sys) > 180 || parseInt(vitals.bp_dia) > 110 || parseFloat(vitals.pre_temp) >= 37.8;

  if (isLoading) return <div className="p-8 text-center text-blue-600 font-bold animate-pulse">Loading Clinical Profile...</div>;

  return (
    <main className="p-4 sm:p-8 max-w-5xl mx-auto pb-24">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/nurse" className="h-10 w-10 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 shadow-sm"><FiArrowLeft className="text-xl" /></Link>
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Commence Treatment</h1>
          <p className="text-sm font-bold text-slate-500">Clinical Pre-Flight Verification</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-5">
            <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl font-black text-slate-500">{patient?.users?.user_fullname.charAt(0)}</div>
            <div>
              <h2 className="text-xl font-black text-slate-900">{patient?.users?.user_fullname}</h2>
              <div className="flex gap-3 mt-1 text-xs font-bold text-slate-500"><span>IC: {patient?.users?.user_ic}</span><span className="flex items-center gap-1 text-red-600"><FiDroplet /> {patient?.patient_blood_type}</span></div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-6 border-b border-slate-100 pb-4"><FiShield className="text-emerald-500" /> Authorized Parameters</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              <div><p className="text-[10px] font-black text-slate-400 uppercase">Modality</p><p className="font-black text-xl text-slate-900 mt-1">{prescription?.treatment_modality}</p></div>
              <div><p className="text-[10px] font-black text-slate-400 uppercase">Duration</p><p className="font-black text-xl text-slate-900 mt-1">{prescription?.target_duration} min</p></div>
              <div><p className="text-[10px] font-black text-slate-400 uppercase">Blood (Qb)</p><p className="font-black text-xl text-slate-900 mt-1">{prescription?.blood_flow_rate}</p></div>
              <div><p className="text-[10px] font-black text-slate-400 uppercase">Dialysate (Qd)</p><p className="font-black text-xl text-slate-900 mt-1">{prescription?.dialysate_flow_rate}</p></div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-3xl shadow-xl p-6 text-white flex flex-col h-full sticky top-8">
          <form className="flex-1 flex flex-col space-y-6">
            
            <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700 space-y-4">
              <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2"><FiCheckSquare /> Required Setup Parameters</p>
              
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Machine</label>
                <select required value={preFlight.machine_id} onChange={e => setPreFlight({...preFlight, machine_id: e.target.value})} className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl font-bold text-white outline-none">
                  <option value="" disabled>Select Machine...</option>
                  {availableMachines.map(m => (<option key={m.id} value={m.id}>{m.asset_tag || m.model}</option>))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Dialyser</label>
                  <input type="text" required placeholder="e.g. F.17H" value={preFlight.dialyser_model} onChange={e => setPreFlight({...preFlight, dialyser_model: e.target.value})} className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl font-bold text-white outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Dialysate</label>
                  <select required value={preFlight.dialysate_k} onChange={e => setPreFlight({...preFlight, dialysate_k: e.target.value})} className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl font-bold text-white outline-none">
                    <option value="" disabled>Select...</option>
                    <option value="K2">K2</option><option value="K3">K3</option><option value="K5">K5</option><option value="K6">K6</option>
                  </select>
                </div>
              </div>

              <label className="flex items-start gap-3 cursor-pointer group pt-2">
                <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${preFlight.accessChecked ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-900 border-slate-600'}`}>
                  {preFlight.accessChecked && <FiCheckSquare className="text-white text-xs" />}
                </div>
                <span className="text-xs font-bold text-slate-300">Vascular access assessed & Cannulated safely.</span>
                <input type="checkbox" className="hidden" checked={preFlight.accessChecked} onChange={e => setPreFlight({...preFlight, accessChecked: e.target.checked})} />
              </label>
              
              {prescription?.heparin_dosage > 0 && (
                <label className="flex items-start gap-3 cursor-pointer group pt-2">
                  <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${preFlight.heparinAdministered ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-900 border-slate-600'}`}>
                    {preFlight.heparinAdministered && <FiCheckSquare className="text-white text-xs" />}
                  </div>
                  <span className="text-xs font-bold text-slate-300">Initial Heparin ({prescription?.heparin_dosage} IU) given.</span>
                  <input type="checkbox" className="hidden" checked={preFlight.heparinAdministered} onChange={e => setPreFlight({...preFlight, heparinAdministered: e.target.checked})} />
                </label>
              )}
            </div>

            <div className={`p-4 rounded-2xl border ${hasAbnormalVitals ? 'bg-red-900/20 border-red-500/50' : 'bg-slate-800 border-slate-700'}`}>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Pre-Weight (kg)</label>
              <input type="number" step="0.1" required value={vitals.pre_weight} onChange={e => setVitals({...vitals, pre_weight: e.target.value})} className="w-full bg-transparent text-3xl font-black text-white outline-none placeholder:text-slate-600" placeholder="00.0" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-800 p-3 rounded-xl border border-slate-700"><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">BP(Sys)</label><input type="number" required value={vitals.bp_sys} onChange={e => setVitals({...vitals, bp_sys: e.target.value})} className="w-full bg-transparent text-sm font-black text-white outline-none" /></div>
              <div className="bg-slate-800 p-3 rounded-xl border border-slate-700"><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">BP(Dia)</label><input type="number" required value={vitals.bp_dia} onChange={e => setVitals({...vitals, bp_dia: e.target.value})} className="w-full bg-transparent text-sm font-black text-white outline-none" /></div>
              <div className="bg-slate-800 p-3 rounded-xl border border-slate-700"><label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Heart Rate</label><input type="number" required value={vitals.pre_hr} onChange={e => setVitals({...vitals, pre_hr: e.target.value})} className="w-full bg-transparent text-sm font-black text-white outline-none" /></div>
            </div>

            <div className="mt-6 space-y-3">
              <button onClick={handleStartSession} type="button" disabled={isSubmitting || !isFormValid || hasAbnormalVitals} className="w-full py-4 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-500 disabled:bg-slate-700 flex justify-center gap-2">
                {isSubmitting && !hasAbnormalVitals ? 'Starting...' : <><FiPlayCircle className="text-xl" /> Commence Treatment</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}