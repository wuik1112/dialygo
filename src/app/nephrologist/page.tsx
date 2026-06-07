'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  FiSearch, FiEdit2, FiSave, FiActivity, FiDroplet, 
  FiFileText, FiUploadCloud, FiTrendingUp, FiShield, FiClipboard,
  FiAlertCircle, FiCheckCircle, FiLoader, FiPrinter, FiMapPin, FiClock, FiAlertTriangle
} from 'react-icons/fi';

export default function ClinicalPatientRecord() {
  const [activeTab, setActiveTab] = useState<'rx' | 'clinical' | 'history'>('rx');
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [serologyDate, setSerologyDate] = useState('');
  const [nephrologistId, setNephrologistId] = useState<number | null>(null);

  const [isUploadingSerology, setIsUploadingSerology] = useState(false);
  const [isUploadingReferral, setIsUploadingReferral] = useState(false);
  const serologyInputRef = useRef<HTMLInputElement>(null);
  const referralInputRef = useRef<HTMLInputElement>(null);

  const [branches, setBranches] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState('All');
  const [prescriptionFilter, setPrescriptionFilter] = useState('All');

  const [isClinicalModalOpen, setIsClinicalModalOpen] = useState(false);
  const [isUpdatingClinical, setIsUpdatingClinical] = useState(false);
  const [clinicalFormData, setClinicalFormData] = useState({
    patient_id: null as number | null,
    blood_type: '',
    vascular_access: '',
    vascular_access_location: '',
    preferred_machine: '',
    preferred_shift: ''
  });

  const [rxForm, setRxForm] = useState({
    session_frequency: '3', target_duration: '240', blood_flow_rate: '300',
    dialysate_flow_rate: '500', dialyser_type: '', target_ktv: '1.2',
    target_dry_weight: '', treatment_modality: 'HD', dialysate_sodium: '138',
    dialysate_potassium: '2.0', dialysate_calcium: '1.25', dialysate_bicarbonate: '32',
    dialysate_temp: '36.5', anticoagulation_profile: 'Standard Heparin', heparin_dosage: '',
    nursing_instructions: ''
  });

  const fetchClinicalData = async () => {
    setIsLoading(true);
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session) return;
    
    const { data: user, error: userError } = await supabase.from('users').select('user_id').eq('user_email', session.session.user.email).single();
    if (userError || !user) {
      setIsLoading(false);
      return;
    }
    
    setNephrologistId(user.user_id);

    const { data: branchData } = await supabase.from('branches').select('id, branch_name');
    if (branchData) setBranches(branchData);

    const { data: allPatients, error: patientError } = await supabase
      .from('patients')
      .select(`
        *,
        users!inner(user_fullname, user_ic, user_date_of_birth),
        branches(branch_name),
        prescriptions(*),
        treatments(session_date, session_status, fluid_removed, session_complications)
      `)
      .order('patient_id', { ascending: false });

    if (patientError) console.error("Error fetching patients:", patientError);

    // --- NEW: BACKEND LOGIC FOR 6-MONTH OVERDUE RULE ---
    const processedPatients = allPatients?.map(p => {
      const activeRx = Array.isArray(p.prescriptions) ? p.prescriptions.find((rx: any) => rx.status === 'Active') : null;
      let calculatedRxStatus = 'Missing/Expired';

      if (activeRx) {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const rxUpdatedDate = new Date(activeRx.updated_at);

        if (rxUpdatedDate < sixMonthsAgo) {
          calculatedRxStatus = 'Overdue for Review'; // Yellow Warning
        } else {
          calculatedRxStatus = 'Active'; // Green OK
        }
      }

      return { ...p, rxStatus: calculatedRxStatus };
    });

    setPatients(processedPatients || []);
    
    if (selectedPatient) {
      const updatedSelected = processedPatients?.find(p => p.patient_id === selectedPatient.patient_id);
      if (updatedSelected) setSelectedPatient(updatedSelected);
    }
    
    setIsLoading(false);
  };

  useEffect(() => { fetchClinicalData(); }, []);

  const handleSelectPatient = (patient: any) => {
    setSelectedPatient(patient);
    setIsEditing(false);
    
    setSerologyDate(patient.last_serology_date || ''); 
    
    const rx = patient.prescriptions?.find((p: any) => p.status === 'Active');
    if (rx) {
      setRxForm({
        session_frequency: rx.session_frequency?.toString() || '3',
        target_duration: rx.target_duration?.toString() || '240',
        blood_flow_rate: rx.blood_flow_rate?.toString() || '300',
        dialysate_flow_rate: rx.dialysate_flow_rate?.toString() || '500',
        dialyser_type: rx.dialyser_type || '',
        target_ktv: rx.target_ktv?.toString() || '1.2',
        target_dry_weight: rx.target_dry_weight?.toString() || '',
        treatment_modality: rx.treatment_modality || 'HD',
        dialysate_sodium: rx.dialysate_sodium?.toString() || '138',
        dialysate_potassium: rx.dialysate_potassium?.toString() || '2.0',
        dialysate_calcium: rx.dialysate_calcium?.toString() || '1.25',
        dialysate_bicarbonate: rx.dialysate_bicarbonate?.toString() || '32',
        dialysate_temp: rx.dialysate_temp?.toString() || '36.5',
        anticoagulation_profile: rx.anticoagulation_profile || 'Standard Heparin',
        heparin_dosage: rx.heparin_dosage?.toString() || '',
        nursing_instructions: rx.nursing_instructions || '',
      });
    } else {
      setRxForm({ ...rxForm, target_dry_weight: '' }); 
    }
  };

  const openClinicalModal = (patient: any) => {
    setClinicalFormData({
      patient_id: patient.patient_id,
      blood_type: patient.patient_blood_type || '',
      preferred_machine: patient.preferred_machine_model || '',
      preferred_shift: patient.preferred_shift || '',
      vascular_access: patient.prescriptions?.find((p: any) => p.status === 'Active')?.vascular_access_type || '',
      vascular_access_location: patient.prescriptions?.find((p: any) => p.status === 'Active')?.vascular_access_location || ''
    });
    setIsClinicalModalOpen(true);
  };

  const handleUpdateClinicalProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicalFormData.patient_id) return;
    setIsUpdatingClinical(true);

    try {
      const { error: patientError } = await supabase
        .from('patients')
        .update({
          patient_blood_type: clinicalFormData.blood_type,
          preferred_machine_model: clinicalFormData.preferred_machine,
          preferred_shift: clinicalFormData.preferred_shift
        })
        .eq('patient_id', clinicalFormData.patient_id);

      if (patientError) throw patientError;

      const { error: prescriptionError } = await supabase
        .from('prescriptions')
        .update({ 
          vascular_access_type: clinicalFormData.vascular_access,
          vascular_access_location: clinicalFormData.vascular_access_location
        })
        .eq('patient_id', clinicalFormData.patient_id)
        .eq('status', 'Active'); 

      if (prescriptionError) throw prescriptionError;

      alert("Clinical Profile updated successfully!");
      setIsClinicalModalOpen(false);
      await fetchClinicalData();
    } catch (error: any) {
      alert("Error updating profile: " + error.message);
    } finally {
      setIsUpdatingClinical(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'serology' | 'referral') => {
    if (!e.target.files || e.target.files.length === 0 || !selectedPatient) return;
    
    if (type === 'serology' && !serologyDate) {
      alert("Clinical Error: Please input the actual Serology Test Date from the lab report before uploading the document.");
      return;
    }

    const file = e.target.files[0];
    const isSero = type === 'serology';
    isSero ? setIsUploadingSerology(true) : setIsUploadingReferral(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${type}_${selectedPatient.patient_id}_${Date.now()}.${fileExt}`;
      const filePath = `${selectedPatient.patient_id}/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('patient_documents').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('patient_documents').getPublicUrl(filePath);

      const updatePayload: any = {};
      if (isSero) {
        updatePayload.serology_report_url = publicUrl;
        updatePayload.serology_document_status = 'Verified';
        updatePayload.last_serology_date = serologyDate;
        updatePayload.travel_status = 'Active';
      } else {
        updatePayload.referral_letter_url = publicUrl;
        updatePayload.referral_document_status = 'Verified';
      }

      const { error: updateError } = await supabase
        .from('patients')
        .update(updatePayload)
        .eq('patient_id', selectedPatient.patient_id);

      if (updateError) throw updateError;

      alert(`${isSero ? 'Serology report' : 'Referral letter'} uploaded successfully!`);
      fetchClinicalData();
    } catch (err: any) {
      alert("Upload failed: " + err.message);
    } finally {
      isSero ? setIsUploadingSerology(false) : setIsUploadingReferral(false);
    }
  };

  const handleSavePrescription = async () => {
    if (!selectedPatient || !nephrologistId) return;

    const checkKtv = parseFloat(rxForm.target_ktv);
    const checkWeight = parseFloat(rxForm.target_dry_weight);
    const checkDuration = parseInt(rxForm.target_duration);

    if (checkKtv < 0.8 || checkKtv > 2.5) return alert("Clinical Warning: Target Kt/V is outside safety limits.");
    if (checkWeight < 20 || checkWeight > 250) return alert("Clinical Warning: Target Dry Weight is outside safety limits.");
    if (checkDuration < 120 || checkDuration > 480) return alert("Clinical Warning: Target Duration is outside safety limits.");

    const payload = {
      patient_id: selectedPatient.patient_id,
      nephrologist_id: nephrologistId,
      ...rxForm,
      target_dry_weight: checkWeight,
      updated_at: new Date().toISOString(), // This resets the 6-month clock!
      status: 'Active' 
    };

    const existingActiveRx = selectedPatient.prescriptions?.find((p: any) => p.status === 'Active');
    if (existingActiveRx) {
      await supabase.from('prescriptions').update({ status: 'Archived' }).eq('id', existingActiveRx.id);
    } 
    
    const { error } = await supabase.from('prescriptions').insert([payload]);

    if (!error) {
      alert("Prescription officially signed. The 6-month review clock has been reset.");
      setIsEditing(false);
      fetchClinicalData();
    } else {
      alert("Clinical Error: " + error.message);
    }
  };

  const handlePrint = () => window.print();

  const filteredPatients = patients.filter(patient => {
    const matchesSearch = patient.users?.user_fullname.toLowerCase().includes(searchTerm.toLowerCase()) || patient.users?.user_ic.includes(searchTerm);
    const matchesBranch = branchFilter === 'All' || patient.home_branch_id?.toString() === branchFilter;
    const matchesRx = prescriptionFilter === 'All' || patient.rxStatus === prescriptionFilter;
    return matchesSearch && matchesBranch && matchesRx;
  });

  if (isLoading) return <div className="p-8 text-center font-bold text-blue-600"><FiActivity className="animate-spin mx-auto text-3xl mb-2" /> Loading Clinical Workstation...</div>;

  const isUndergoingDialysis = selectedPatient?.treatments?.some((t: any) => t.session_status === 'Ongoing');
  const archivedPrescriptions = selectedPatient?.prescriptions?.filter((p: any) => p.status === 'Archived')?.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const activeRx = selectedPatient?.prescriptions?.find((p: any) => p.status === 'Active');

  return (
    <main className="p-8 max-w-[1600px] mx-auto flex gap-8 h-[calc(100vh-2rem)] print:p-0 print:m-0 print:h-auto">
      
      {/* DIRECTORY SIDEBAR */}
      <div className="w-1/4 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden print:hidden min-w-[320px]">
        <div className="p-5 border-b border-slate-100 bg-slate-50 space-y-3">
          <h3 className="font-black text-slate-900 text-sm uppercase tracking-tighter flex items-center justify-between">
            Clinical Directory
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px]">{filteredPatients.length}</span>
          </h3>
          
          <div className="relative">
            <FiSearch className="absolute left-3 top-3 text-slate-400" />
            <input 
              type="text" placeholder="Search name or IC..." 
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-xs font-bold text-slate-700 shadow-sm"
            />
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <FiMapPin className="absolute left-2.5 top-2.5 text-slate-400" />
              <select 
                value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
                className="w-full pl-8 pr-2 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-[10px] font-bold text-slate-700 appearance-none shadow-sm"
              >
                <option value="All">All Branches</option>
                {branches.map(b => <option key={b.id} value={b.id.toString()}>{b.branch_name}</option>)}
              </select>
            </div>
            
            <div className="relative flex-1">
              <FiFileText className="absolute left-2.5 top-2.5 text-slate-400" />
              {/* NEW: Updated Filter Dropdown */}
              <select 
                value={prescriptionFilter} onChange={e => setPrescriptionFilter(e.target.value)}
                className="w-full pl-8 pr-2 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-[10px] font-bold text-slate-700 appearance-none shadow-sm"
              >
                <option value="All">All Rx Status</option>
                <option value="Active">Active (Green)</option>
                <option value="Overdue for Review">Overdue (Yellow)</option>
                <option value="Missing/Expired">Missing (Red)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
          {filteredPatients.map(p => (
            <button key={p.patient_id} onClick={() => handleSelectPatient(p)} className={`w-full text-left p-4 rounded-2xl mb-2 transition-all border ${selectedPatient?.patient_id === p.patient_id ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-50'}`}>
              <div className="flex justify-between items-start">
                <p className="font-bold leading-tight truncate pr-2">{p.users.user_fullname}</p>
                {/* NEW: Dynamic Warning Badges */}
                {p.rxStatus === 'Missing/Expired' && <FiAlertCircle className="text-red-500 shrink-0" title="No Active Prescription" />}
                {p.rxStatus === 'Overdue for Review' && <FiAlertTriangle className="text-amber-500 shrink-0" title="Overdue for 6-Month Review" />}
              </div>
              <p className={`text-[10px] font-black uppercase mt-1 flex gap-2 ${selectedPatient?.patient_id === p.patient_id ? 'text-slate-400' : 'text-slate-500'}`}>
                <span>{p.users.user_ic}</span> • <span>{p.branches?.branch_name || 'Unassigned'}</span>
              </p>
            </button>
          ))}
          {filteredPatients.length === 0 && (
            <div className="p-8 text-center text-xs font-bold text-slate-400">No patients match filters.</div>
          )}
        </div>
      </div>

      {/* WORKSTATION AREA */}
      <div className="flex-1 flex flex-col gap-6 print:w-full print:block min-w-0">
        {selectedPatient ? (
          <>
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm print:border-black print:rounded-none print:shadow-none">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-3xl font-black print:hidden">
                    {selectedPatient.users.user_fullname[0]}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 print:text-black flex items-center gap-3">
                      {selectedPatient.users.user_fullname}
                      
                      {/* NEW: Explicit Status Badge in Profile Header */}
                      {selectedPatient.rxStatus === 'Overdue for Review' && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-1 rounded-md uppercase tracking-wider font-black flex items-center gap-1 border border-amber-200">
                          <FiAlertTriangle /> Review Overdue (6+ Mos)
                        </span>
                      )}
                    </h2>
                    <div className="flex gap-4 mt-1 text-xs font-bold text-slate-500 print:text-black">
                      <span>IC: {selectedPatient.users.user_ic}</span>
                      <span>DOB: {selectedPatient.users.user_date_of_birth || 'N/A'}</span>
                      <span>Vintage: {selectedPatient.dialysis_start_date || 'N/A'}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <span className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-widest block print:border print:border-black print:bg-white print:text-black">
                    Blood: {selectedPatient.patient_blood_type || 'Unknown'} | HepB: {selectedPatient.hepatitis_b_status || 'Unknown'}
                  </span>
                  
                  <button 
                    onClick={() => openClinicalModal(selectedPatient)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-[10px] font-bold rounded-lg hover:bg-slate-50 transition-colors print:hidden"
                  >
                    <FiEdit2 /> Edit Clinical Profile
                  </button>
                  
                  <p className="text-xs font-bold text-slate-600 print:text-black mt-1">Primary Dx: <span className="text-slate-900 print:text-black">{activeRx?.primary_diagnosis || 'Not recorded'}</span></p>
                </div>
              </div>
            </div>

            <div className="flex gap-2 print:hidden overflow-x-auto pb-2">
              {[
                { id: 'rx', label: 'Dialysis Prescription', icon: <FiEdit2 /> },
                { id: 'clinical', label: 'Labs, Access & RKF', icon: <FiTrendingUp /> },
                { id: 'history', label: 'Intradialytic Tolerance', icon: <FiActivity /> }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'}`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-y-auto p-8 print:border-none print:shadow-none print:p-0 print:overflow-visible custom-scrollbar">
              
              {activeTab === 'rx' && (
                <section>
                  <div className="flex justify-between items-start mb-8 pb-4 border-b border-slate-100 print:border-black print:mt-8">
                    <div>
                      <h3 className="text-xl font-black text-slate-900 print:text-black">Official Dialysis Prescription</h3>
                      <div className="flex items-center gap-3 mt-2">
                        <p className="text-xs font-bold text-slate-500 flex items-center gap-1 print:text-black"><FiShield className="text-emerald-500 print:hidden"/> Clinical Document</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-3 print:hidden">
                      <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors">
                        <FiPrinter /> Export PDF
                      </button>
                      
                      {isUndergoingDialysis ? (
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-700 rounded-xl font-bold text-sm border border-red-200">
                           <FiAlertCircle /> Locked: Active Dialysis in Progress
                        </div>
                      ) : !isEditing ? (
                        <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-200">
                          <FiEdit2 /> Modify Parameters
                        </button>
                      ) : (
                        <>
                          <button onClick={() => setIsEditing(false)} className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm">Cancel</button>
                          <button onClick={handleSavePrescription} className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-black text-sm shadow-md shadow-emerald-200">
                            <FiSave /> Authorize & Sign
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Warning Banner if Overdue */}
                  {selectedPatient.rxStatus === 'Overdue for Review' && !isEditing && (
                    <div className="mb-6 bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3 print:hidden">
                      <FiAlertTriangle className="text-amber-600 text-xl shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-black text-amber-900">Clinical Review Required</h4>
                        <p className="text-xs text-amber-800 font-medium mt-1">This prescription was signed over 6 months ago. Please review the parameters and click "Modify Parameters" and "Authorize & Sign" to recertify it for another 6 months.</p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10 print:grid-cols-4 print:gap-y-6">
                    <div className="col-span-2 lg:col-span-4 grid grid-cols-4 gap-6 print:gap-2">
                      <div className="col-span-4"><p className="text-[10px] font-black text-blue-600 uppercase tracking-widest border-b border-blue-100 pb-2 print:text-black print:border-black">A. Dialysis Dose Parameters</p></div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 print:text-black">Frequency</label>
                        <select disabled={!isEditing} value={rxForm.session_frequency} onChange={e => setRxForm({...rxForm, session_frequency: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-700 print:border-black print:bg-white print:p-1">
                          <option value="2">2x / Week</option>
                          <option value="3">3x / Week</option>
                          <option value="4">4x / Week</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 print:text-black">Duration (mins)</label>
                        <input type="number" disabled={!isEditing} value={rxForm.target_duration} onChange={e => setRxForm({...rxForm, target_duration: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-700 print:border-black print:bg-white print:p-1" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 print:text-black">Blood Flow (Qb)</label>
                        <input type="number" disabled={!isEditing} value={rxForm.blood_flow_rate} onChange={e => setRxForm({...rxForm, blood_flow_rate: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-700 print:border-black print:bg-white print:p-1" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 print:text-black">Target Kt/V</label>
                        <input type="number" step="0.1" disabled={!isEditing} value={rxForm.target_ktv} onChange={e => setRxForm({...rxForm, target_ktv: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-700 print:border-black print:bg-white print:p-1" />
                      </div>
                    </div>

                    <div className="col-span-2 lg:col-span-4 grid grid-cols-2 gap-6 print:gap-2">
                      <div className="col-span-2"><p className="text-[10px] font-black text-amber-600 uppercase tracking-widest border-b border-amber-100 pb-2 print:text-black print:border-black">B. Ultrafiltration & Volume Control</p></div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 print:text-black">Target Dry Weight (kg)</label>
                        <input type="number" step="0.1" disabled={!isEditing} value={rxForm.target_dry_weight} onChange={e => setRxForm({...rxForm, target_dry_weight: e.target.value})} className="w-full p-4 bg-amber-50 border border-amber-200 rounded-xl font-black text-amber-900 text-lg shadow-inner print:border-black print:bg-white print:p-1 print:shadow-none" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 print:text-black">Modality</label>
                        <select disabled={!isEditing} value={rxForm.treatment_modality} onChange={e => setRxForm({...rxForm, treatment_modality: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-700 print:border-black print:bg-white print:p-1">
                          <option value="HD">Standard HD</option>
                          <option value="HDF">HemoDiaFiltration (HDF)</option>
                        </select>
                      </div>
                    </div>

                    <div className="col-span-2 lg:col-span-4 grid grid-cols-5 gap-4 print:gap-2">
                      <div className="col-span-5"><p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest border-b border-emerald-100 pb-2 print:text-black print:border-black">C. Dialysate Composition</p></div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 print:text-black">Sodium (Na)</label>
                        <input type="number" disabled={!isEditing} value={rxForm.dialysate_sodium} onChange={e => setRxForm({...rxForm, dialysate_sodium: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-700 print:border-black print:bg-white print:p-1" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 print:text-black">Potassium (K)</label>
                        <input type="number" step="0.1" disabled={!isEditing} value={rxForm.dialysate_potassium} onChange={e => setRxForm({...rxForm, dialysate_potassium: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-700 print:border-black print:bg-white print:p-1" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 print:text-black">Calcium (Ca)</label>
                        <input type="number" step="0.01" disabled={!isEditing} value={rxForm.dialysate_calcium} onChange={e => setRxForm({...rxForm, dialysate_calcium: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-700 print:border-black print:bg-white print:p-1" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 print:text-black">Bicarbonate</label>
                        <input type="number" step="0.1" disabled={!isEditing} value={rxForm.dialysate_bicarbonate} onChange={e => setRxForm({...rxForm, dialysate_bicarbonate: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-700 print:border-black print:bg-white print:p-1" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 print:text-black">Temp (°C)</label>
                        <input type="number" step="0.5" disabled={!isEditing} value={rxForm.dialysate_temp} onChange={e => setRxForm({...rxForm, dialysate_temp: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-700 print:border-black print:bg-white print:p-1" />
                      </div>
                    </div>

                    <div className="col-span-2 lg:col-span-4 grid grid-cols-2 gap-6 print:gap-2">
                      <div className="col-span-2"><p className="text-[10px] font-black text-purple-600 uppercase tracking-widest border-b border-purple-100 pb-2 print:text-black print:border-black">D. Anticoagulation</p></div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 print:text-black">Regimen Type</label>
                        <select disabled={!isEditing} value={rxForm.anticoagulation_profile} onChange={e => setRxForm({...rxForm, anticoagulation_profile: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-700 print:border-black print:bg-white print:p-1">
                          <option value="Standard Heparin">Standard Heparin</option>
                          <option value="LMWH">Low Molecular Weight Heparin (LMWH)</option>
                          <option value="Heparin-Free">Heparin-Free</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 print:text-black">Dosage (IU)</label>
                        <input type="text" disabled={!isEditing || rxForm.anticoagulation_profile === 'Heparin-Free'} value={rxForm.anticoagulation_profile === 'Heparin-Free' ? '0' : rxForm.heparin_dosage} onChange={e => setRxForm({...rxForm, heparin_dosage: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-700 disabled:opacity-50 print:border-black print:bg-white print:p-1" />
                      </div>
                    </div>

                    <div className="col-span-2 lg:col-span-4 grid grid-cols-1 gap-6 print:gap-2 mt-4">
                      <div>
                        <p className="text-[10px] font-black text-red-600 uppercase tracking-widest border-b border-red-100 pb-2 print:text-black print:border-black flex items-center gap-2">
                          <FiAlertCircle /> E. Special Nursing Instructions & Cautions
                        </p>
                        <textarea 
                          disabled={!isEditing} 
                          value={rxForm.nursing_instructions} 
                          onChange={e => setRxForm({...rxForm, nursing_instructions: e.target.value})} 
                          placeholder="Type any specific warnings, reminders, or monitoring instructions for the nursing staff here..."
                          className="w-full mt-4 p-4 bg-red-50/30 border border-red-100 rounded-xl font-bold text-slate-700 h-24 resize-none focus:border-red-400 focus:bg-white outline-none transition-colors print:border-black print:bg-white print:h-auto print:min-h-[60px]" 
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="hidden print:block mt-16 pt-8 border-t border-black">
                    <p className="text-sm font-bold text-black mb-16">Prescribing Nephrologist Signature:</p>
                    <div className="w-64 border-b border-black"></div>
                    <p className="text-xs text-black mt-2">Date: ____________________</p>
                  </div>

                  {archivedPrescriptions && archivedPrescriptions.length > 0 && (
                    <div className="mt-16 pt-8 border-t border-slate-200 print:hidden">
                      <h4 className="font-black text-slate-800 mb-6 flex items-center gap-2">
                        <FiClock className="text-slate-400"/> Historical Prescriptions (Audit Trail)
                      </h4>
                      <div className="grid grid-cols-1 gap-4">
                        {archivedPrescriptions.map((archived: any) => (
                          <div key={archived.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                              <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">
                                Signed: {new Date(archived.updated_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </p>
                              <div className="flex gap-4 text-sm font-bold text-slate-800">
                                <span>Dry Wt: {archived.target_dry_weight || 'N/A'} kg</span>
                                <span className="text-slate-300">|</span>
                                <span>Modality: {archived.treatment_modality}</span>
                                <span className="text-slate-300">|</span>
                                <span>Qb: {archived.blood_flow_rate}</span>
                                <span className="text-slate-300">|</span>
                                <span>Heparin: {archived.is_heparin_free ? 'Free' : `${archived.heparin_dosage} IU`}</span>
                              </div>
                            </div>
                            <span className="px-3 py-1.5 bg-slate-200 text-slate-600 text-[10px] font-black uppercase rounded-lg">Archived Version</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </section>
              )}

              {activeTab === 'clinical' && (
                <section className="space-y-8 animate-in fade-in print:hidden">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 flex flex-col justify-between">
                      <div>
                        <h4 className="font-black text-blue-900 flex items-center gap-2 mb-1"><FiFileText /> Lab & Serology Reports</h4>
                        <p className="text-xs text-blue-700 font-medium">Status: {selectedPatient.serology_document_status || 'Missing'}</p>
                      </div>
                      
                      <div className="mt-4 flex flex-col gap-3">
                        <div className="flex flex-col">
                          <label className="text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1">Actual Lab Date</label>
                          <input 
                            type="date" 
                            max={new Date().toISOString().split("T")[0]} 
                            value={serologyDate} 
                            onChange={(e) => setSerologyDate(e.target.value)} 
                            className="px-3 py-2 text-xs font-bold text-slate-700 rounded-xl border border-blue-200 outline-none focus:border-blue-500 w-full md:w-auto"
                          />
                        </div>

                        <div className="flex gap-2">
                          {selectedPatient.serology_report_url && (
                            <a href={selectedPatient.serology_report_url} target="_blank" rel="noreferrer" className="text-xs px-4 py-2.5 bg-white text-blue-700 font-bold rounded-xl border border-blue-200 hover:bg-blue-100 flex items-center gap-2 transition-colors flex-1 justify-center">
                              <FiCheckCircle /> View Active File
                            </a>
                          )}
                          
                          <input type="file" ref={serologyInputRef} onChange={(e) => handleFileUpload(e, 'serology')} className="hidden" accept="image/*,application/pdf" />
                          <button 
                            disabled={isUploadingSerology || !serologyDate} 
                            onClick={() => serologyInputRef.current?.click()}
                            className="text-xs px-4 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 flex items-center gap-2 transition-all active:scale-95 disabled:bg-blue-300 disabled:cursor-not-allowed flex-1 justify-center"
                          >
                            {isUploadingSerology ? <FiLoader className="animate-spin" /> : <FiUploadCloud />}
                            {selectedPatient.serology_report_url ? "Update Document" : "Upload Document"}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="bg-purple-50 border border-purple-100 rounded-2xl p-6 flex flex-col justify-between">
                      <div>
                        <h4 className="font-black text-purple-900 flex items-center gap-2 mb-1"><FiFileText /> Referral Letter</h4>
                        <p className="text-xs text-purple-700 font-medium">Status: {selectedPatient.referral_document_status || 'Missing'}</p>
                      </div>

                      <div className="mt-4 flex flex-col gap-3 justify-end h-full">
                        <div className="flex gap-2 mt-auto">
                          {selectedPatient.referral_letter_url && (
                            <a href={selectedPatient.referral_letter_url} target="_blank" rel="noreferrer" className="text-xs px-4 py-2.5 bg-white text-purple-700 font-bold rounded-xl border border-purple-200 hover:bg-purple-100 flex items-center gap-2 transition-colors flex-1 justify-center">
                              <FiCheckCircle /> View Active File
                            </a>
                          )}
                          
                          <input type="file" ref={referralInputRef} onChange={(e) => handleFileUpload(e, 'referral')} className="hidden" accept="image/*,application/pdf" />
                          <button 
                            disabled={isUploadingReferral} 
                            onClick={() => referralInputRef.current?.click()}
                            className="text-xs px-4 py-2.5 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 flex items-center gap-2 transition-all active:scale-95 disabled:bg-purple-300 disabled:cursor-not-allowed flex-1 justify-center"
                          >
                            {isUploadingReferral ? <FiLoader className="animate-spin" /> : <FiUploadCloud />}
                            {selectedPatient.referral_letter_url ? "Update Document" : "Upload Document"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                      <h4 className="font-black text-slate-900 flex items-center gap-2 mb-4"><FiActivity className="text-blue-500"/> Vascular Access Status</h4>
                      <div className="space-y-3">
                        <p className="text-sm"><span className="text-slate-500 font-bold">Type:</span> <span className="font-black">{activeRx?.vascular_access_type || 'Unknown'}</span></p>
                        <p className="text-sm"><span className="text-slate-500 font-bold">Location:</span> <span className="font-black">{activeRx?.vascular_access_location || 'Unknown'}</span></p>
                        <p className="text-sm"><span className="text-slate-500 font-bold">Known Complications:</span> <span className="font-black text-red-600">{activeRx?.vascular_access_complications || 'None reported'}</span></p>
                      </div>
                    </div>
                    <div className="bg-amber-50 p-6 rounded-2xl border border-amber-200">
                      <h4 className="font-black text-amber-900 flex items-center gap-2 mb-4"><FiDroplet className="text-amber-500"/> Residual Kidney Function</h4>
                      <div className="space-y-3">
                        <p className="text-sm"><span className="text-amber-700 font-bold">24h Urine Output:</span> <span className="font-black text-amber-900">{activeRx?.residual_urine_output || 0} mL/day</span></p>
                        <p className="text-sm"><span className="text-amber-700 font-bold">Last Assessed:</span> <span className="font-black">{activeRx?.last_rkf_assessment || 'No data'}</span></p>
                      </div>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-2xl p-6">
                    <h4 className="font-black text-slate-900 mb-4 text-sm uppercase tracking-widest">Active Medication Profile</h4>
                    <p className="text-sm font-bold text-slate-600 bg-slate-50 p-4 rounded-xl">{activeRx?.current_medications || 'No current medications logged.'}</p>
                  </div>
                </section>
              )}

              {activeTab === 'history' && (
                <section className="animate-in fade-in print:hidden">
                  <h4 className="font-black text-slate-900 mb-6 flex items-center gap-2"><FiClipboard className="text-slate-400"/> Recent Session Tolerance (Nursing Logs)</h4>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                    {selectedPatient.treatments && selectedPatient.treatments.length > 0 ? (
                      selectedPatient.treatments.slice(0, 5).map((t: any, i: number) => (
                        <div key={i} className="p-4 bg-slate-50 hover:bg-white transition-colors flex justify-between items-center">
                          <div>
                            <p className="font-black text-slate-800">{new Date(t.session_date).toLocaleDateString()}</p>
                            <p className="text-xs font-bold text-slate-500 mt-1">UF Removed: {t.fluid_removed || 0} L</p>
                          </div>
                          <div className="text-right">
                            {t.session_complications ? (
                              <span className="px-3 py-1 bg-red-100 text-red-700 text-[10px] font-black uppercase rounded-lg flex items-center gap-1"><FiAlertCircle /> {t.session_complications}</span>
                            ) : (
                              <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase rounded-lg">Tolerated Well</span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-slate-400 font-bold text-sm">No historical treatment logs found.</div>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-4 font-bold flex items-center gap-1"><FiAlertCircle /> Note: Session logs are recorded securely by nursing staff and cannot be modified here.</p>
                </section>
              )}

            </div>
          </>
        ) : (
          <div className="flex-1 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300 print:hidden">
            <FiActivity className="text-6xl mb-4" />
            <p className="font-black uppercase tracking-widest text-sm">Select Patient for Clinical Review</p>
          </div>
        )}
      </div>

      {isClinicalModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-bold text-slate-800">Update Clinical Profile</h2>
              <button onClick={() => setIsClinicalModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
            </div>
            
            <form onSubmit={handleUpdateClinicalProfile} className="p-6 space-y-4">
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Blood Type</label>
                <select 
                  required
                  value={clinicalFormData.blood_type} 
                  onChange={e => setClinicalFormData({...clinicalFormData, blood_type: e.target.value})}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-700"
                >
                  <option value="">Select Blood Type...</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="Unknown">Unknown</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Vascular Access Type</label>
                  <select 
                    required
                    value={clinicalFormData.vascular_access} 
                    onChange={e => setClinicalFormData({...clinicalFormData, vascular_access: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-700"
                  >
                    <option value="">Select Access Type...</option>
                    <option value="AV Fistula">AV Fistula</option>
                    <option value="AV Graft">AV Graft</option>
                    <option value="Central Venous Catheter">Central Venous Catheter</option>
                    <option value="Unknown">Unknown / Pending</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Access Location</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Left Forearm"
                    value={clinicalFormData.vascular_access_location} 
                    onChange={e => setClinicalFormData({...clinicalFormData, vascular_access_location: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Usual Machine</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Fresenius 5008S"
                    value={clinicalFormData.preferred_machine} 
                    onChange={e => setClinicalFormData({...clinicalFormData, preferred_machine: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Usual Shift</label>
                  <select 
                    value={clinicalFormData.preferred_shift} 
                    onChange={e => setClinicalFormData({...clinicalFormData, preferred_shift: e.target.value})}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-700"
                  >
                    <option value="">Select Shift...</option>
                    <option value="Morning (08:00 - 12:00)">Morning (08:00 - 12:00)</option>
                    <option value="Afternoon (13:00 - 17:00)">Afternoon (13:00 - 17:00)</option>
                    <option value="Evening (18:00 - 22:00)">Evening (18:00 - 22:00)</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsClinicalModalOpen(false)} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={isUpdatingClinical} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 disabled:bg-blue-300 transition-all shadow-md shadow-blue-500/20">
                  {isUpdatingClinical ? 'Saving...' : 'Save Clinical Profile'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </main>
  );
}