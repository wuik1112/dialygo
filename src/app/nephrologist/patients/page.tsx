'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { 
  FiSearch, FiEdit2, FiSave, FiX, FiActivity, 
  FiDroplet, FiFileText, FiUploadCloud, FiLoader, FiCheckCircle 
} from 'react-icons/fi';

export default function PrescriptionManagement() {
  const [patients, setPatients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [nephrologistId, setNephrologistId] = useState<number | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [prescriptionForm, setPrescriptionForm] = useState({
    target_dry_weight: '',
    target_duration: '',
    heparin_dosage: '',
    treatment_modality: 'HD',
    is_heparin_free: false
  });

  const fetchData = async () => {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return;

    const { data: user } = await supabase.from('users').select('user_id, branch_id').eq('user_email', session.session.user.email).single();
    if (!user) return;
    
    setNephrologistId(user.user_id);

    // Fetch Home Patients
    const { data: homePatients } = await supabase
      .from('patients')
      .select(`
        *,
        users!inner(user_fullname, user_ic, user_gender),
        prescriptions(*)
      `)
      .eq('home_branch_id', user.branch_id);

    // Fetch Traveling Patients for today
    const today = new Date().toISOString().split('T')[0];
    const { data: visitingBookings } = await supabase
      .from('bookings')
      .select(`
        patient_id,
        patients (
          *,
          users!inner(user_fullname, user_ic, user_gender),
          prescriptions(*)
        )
      `)
      .eq('branch_id', user.branch_id)
      .eq('booking_date', today);

    let combinedPatients = [...(homePatients || [])];
    if (visitingBookings) {
      visitingBookings.forEach((booking: any) => {
        const isDuplicate = combinedPatients.some(p => p.patient_id === booking.patients?.patient_id);
        if (!isDuplicate && booking.patients) {
          combinedPatients.push({ ...booking.patients, is_traveler: true });
        }
      });
    }
    setPatients(combinedPatients);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSelectPatient = (patient: any) => {
    setSelectedPatient(patient);
    setIsEditing(false);
    const rx = patient.prescriptions?.find((p: any) => p.status === 'Active') || null;
    if (rx) {
      setPrescriptionForm({
        target_dry_weight: rx.target_dry_weight?.toString() || '',
        target_duration: rx.target_duration?.toString() || '',
        heparin_dosage: rx.heparin_dosage?.toString() || '',
        treatment_modality: rx.treatment_modality || 'HD',
        is_heparin_free: rx.is_heparin_free || false
      });
    } else {
      setPrescriptionForm({ target_dry_weight: '', target_duration: '240', heparin_dosage: '', treatment_modality: 'HD', is_heparin_free: false });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !selectedPatient) return;
    
    const file = e.target.files[0];
    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `serology_${selectedPatient.patient_id}_${Date.now()}.${fileExt}`;
      const filePath = `${selectedPatient.patient_id}/${fileName}`;

      // CRITICAL: Updated to use 'patient_documents' bucket
      const { error: uploadError } = await supabase.storage
        .from('patient_documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('patient_documents')
        .getPublicUrl(filePath);

      // Update patient record with new document link
      const { error: updateError } = await supabase
        .from('patients')
        .update({ 
          serology_report_url: publicUrl,
          serology_document_status: 'Verified',
          last_serology_date: new Date().toISOString().split('T')[0]
        })
        .eq('patient_id', selectedPatient.patient_id);

      if (updateError) throw updateError;

      alert("Serology report uploaded to patient_documents successfully!");
      fetchData(); // Refresh list to update UI
      setSelectedPatient({...selectedPatient, serology_report_url: publicUrl});
    } catch (err: any) {
      alert("Upload failed: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSavePrescription = async () => {
    if (!selectedPatient || !nephrologistId) return;

    const payload = {
      patient_id: selectedPatient.patient_id,
      nephrologist_id: nephrologistId,
      target_dry_weight: parseFloat(prescriptionForm.target_dry_weight),
      target_duration: parseInt(prescriptionForm.target_duration),
      heparin_dosage: prescriptionForm.is_heparin_free ? 0 : parseFloat(prescriptionForm.heparin_dosage),
      treatment_modality: prescriptionForm.treatment_modality,
      is_heparin_free: prescriptionForm.is_heparin_free,
      updated_at: new Date().toISOString(),
      status: 'Active' 
    };

    const existingActiveRx = selectedPatient.prescriptions?.find((p: any) => p.status === 'Active');
    if (existingActiveRx) {
      await supabase.from('prescriptions').update({ status: 'Archived' }).eq('id', existingActiveRx.id);
    } 
    
    const { error } = await supabase.from('prescriptions').insert([payload]);

    if (!error) {
      alert("Prescription officially signed and saved.");
      setIsEditing(false);
      fetchData();
    } else {
      alert("Clinical Error: " + error.message);
    }
  };

  const filteredPatients = patients.filter(p => p.users.user_fullname.toLowerCase().includes(search.toLowerCase()));

  // Requirement: Unified Loading Screen
  if (isLoading) {
    return (
      <div className='min-h-screen bg-slate-50 flex items-center justify-center'>
        <div className='flex flex-col items-center text-blue-600 font-bold'>
          <FiActivity className='text-4xl mb-4 animate-spin' />
          <span>Loading Patient Directory...</span>
        </div>
      </div>
    );
  }

  return (
    <main className="p-4 sm:p-8 max-w-7xl mx-auto flex gap-6 h-[calc(100vh-4rem)]">
      {/* SIDEBAR DIRECTORY */}
      <div className="w-1/3 bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <div className="relative">
            <FiSearch className="absolute left-3 top-3.5 text-slate-400" />
            <input type="text" placeholder="Filter clinical records..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-blue-500 outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filteredPatients.map(p => (
            <button key={p.patient_id} onClick={() => handleSelectPatient(p)} className={`w-full text-left p-4 rounded-xl mb-2 transition-all ${selectedPatient?.patient_id === p.patient_id ? 'bg-blue-50 border-blue-200 border' : 'hover:bg-slate-50 border border-transparent'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-slate-900">{p.users.user_fullname}</p>
                  <p className="text-[10px] text-slate-400 mt-1 uppercase font-black tracking-widest">{p.users.user_ic}</p>
                </div>
                {p.is_traveler && <span className="text-[10px] bg-purple-100 text-purple-700 font-bold px-2 py-1 rounded">TRAVEL</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* CLINICAL WORKSTATION */}
      <div className="w-2/3 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
        {selectedPatient ? (
          <>
            <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
              <div className="flex-1">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">{selectedPatient.users.user_fullname}</h2>
                <div className="flex items-center mt-2 text-sm text-slate-600 font-medium gap-4">
                  <span className="flex items-center gap-1"><FiDroplet className="text-red-500" /> {selectedPatient.patient_blood_type}</span>
                  <span className="flex items-center gap-1"><FiActivity className="text-amber-500" /> Hep B: {selectedPatient.hepatitis_b_status}</span>
                </div>
                
                {/* SEROLOGY UPLOAD/VIEW SECTION */}
                <div className="flex gap-2 mt-4">
                  {selectedPatient.serology_report_url ? (
                    <a href={selectedPatient.serology_report_url} target="_blank" rel="noreferrer" className="text-xs px-4 py-2 bg-emerald-50 text-emerald-700 font-bold rounded-xl border border-emerald-100 hover:bg-emerald-100 flex items-center gap-2">
                      <FiCheckCircle /> View Serology
                    </a>
                  ) : (
                    <span className="text-xs px-4 py-2 bg-red-50 text-red-600 font-bold rounded-xl border border-red-100 flex items-center gap-2">
                       Missing Report
                    </span>
                  )}
                  
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,application/pdf" />
                  <button 
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs px-4 py-2 bg-slate-900 text-white font-bold rounded-xl hover:bg-black flex items-center gap-2 transition-all active:scale-95 disabled:bg-slate-400"
                  >
                    {isUploading ? <FiLoader className="animate-spin" /> : <FiUploadCloud />}
                    {selectedPatient.serology_report_url ? "Update Serology" : "Upload Report"}
                  </button>
                </div>
              </div>
              
              {!isEditing ? (
                <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20">
                  <FiEdit2 /> Update RX
                </button>
              ) : (
                <button onClick={() => setIsEditing(false)} className="flex items-center gap-2 px-6 py-2.5 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300">
                  <FiX /> Cancel
                </button>
              )}
            </div>

            <div className="p-8 flex-1 overflow-y-auto bg-white">
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Dry Weight (kg)</label>
                  <input type="number" step="0.1" disabled={!isEditing} value={prescriptionForm.target_dry_weight} onChange={e => setPrescriptionForm({...prescriptionForm, target_dry_weight: e.target.value})} className="w-full p-4 rounded-2xl border border-slate-100 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none font-bold text-lg transition-all" />
                </div>
                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Duration</label>
                  <select disabled={!isEditing} value={prescriptionForm.target_duration} onChange={e => setPrescriptionForm({...prescriptionForm, target_duration: e.target.value})} className="w-full p-4 rounded-2xl border border-slate-100 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none font-bold text-lg transition-all">
                    <option value="180">3 Hours (180m)</option>
                    <option value="240">4 Hours (240m)</option>
                    <option value="300">5 Hours (300m)</option>
                  </select>
                </div>
                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Dialysis Modality</label>
                  <select disabled={!isEditing} value={prescriptionForm.treatment_modality} onChange={e => setPrescriptionForm({...prescriptionForm, treatment_modality: e.target.value})} className="w-full p-4 rounded-2xl border border-slate-100 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none font-bold text-lg transition-all">
                    <option value="HD">Standard HD</option>
                    <option value="HDF">HemoDiaFiltration (HDF)</option>
                  </select>
                </div>
                <div className="flex flex-col justify-end pb-1">
                   <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors">
                      <input type="checkbox" disabled={!isEditing} checked={prescriptionForm.is_heparin_free} onChange={e => setPrescriptionForm({...prescriptionForm, is_heparin_free: e.target.checked, heparin_dosage: ''})} className="w-6 h-6 rounded-lg text-blue-600 border-slate-300" />
                      <span className="font-bold text-slate-700">Heparin-Free</span>
                   </label>
                </div>
                {!prescriptionForm.is_heparin_free && (
                  <div className="space-y-3 col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Heparin Dosage (IU)</label>
                    <input type="number" disabled={!isEditing} value={prescriptionForm.heparin_dosage} onChange={e => setPrescriptionForm({...prescriptionForm, heparin_dosage: e.target.value})} className="w-full p-4 rounded-2xl border border-slate-100 bg-slate-50 focus:bg-white focus:border-blue-500 outline-none font-bold text-lg transition-all" />
                  </div>
                )}
              </div>

              {isEditing && (
                <div className="mt-12 flex justify-end">
                  <button onClick={handleSavePrescription} className="px-10 py-4 bg-emerald-600 text-white font-black rounded-2xl shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center gap-3">
                    <FiSave className="text-xl" /> Confirm & Authorize RX
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-200">
            <FiFileText className="text-8xl mb-4 opacity-10" />
            <p className="font-black uppercase tracking-widest text-xs">Patient File Not Selected</p>
          </div>
        )}
      </div>
    </main>
  );
}