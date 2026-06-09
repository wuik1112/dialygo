'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import Link from 'next/link';
import { 
  FiSearch, FiFilter, FiDatabase, FiUsers, FiLock, 
  FiSettings, FiInbox, FiImage, FiShield, FiAlertTriangle, 
  FiEye, FiDroplet, FiCamera, FiCheckCircle, FiZoomIn, FiX, FiActivity, FiMapPin, FiUser
} from 'react-icons/fi';

const formatDateDisplay = (dateStr: string | null) => {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-MY', { 
    day: 'numeric', month: 'short', year: 'numeric' 
  });
};

export default function ManagerMachineStatus() {
  const [isLoading, setIsLoading] = useState(true);
  const [branchData, setBranchData] = useState<any>(null);
  const [machines, setMachines] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]); 
  const [managerId, setManagerId] = useState<number | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingMachine, setEditingMachine] = useState<any>(null);
  
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [allocationFilter, setAllocationFilter] = useState('All');
  const [capabilityFilter, setCapabilityFilter] = useState('All'); 

  const hasActiveFilters = searchTerm !== '' || statusFilter !== 'All' || allocationFilter !== 'All' || capabilityFilter !== 'All';
  const clearFilters = () => {
    setSearchTerm(''); setStatusFilter('All'); setAllocationFilter('All'); setCapabilityFilter('All');
  };

  const [formData, setFormData] = useState({
    serial_number: '', asset_tag: '', manufacturer: '', model: '', software_version: '',
    status: 'Active', operating_hours: '0', commission_date: '', warranty_expiry: '',
    vendor_name: '', vendor_contact: '', last_calibration_date: '', last_maintenance_date: '', 
    next_maintenance_date: '', photo_url: '', 
    supports_hdf: false, has_bvm: false, has_endotoxin_filter: false, reason: '' 
  });
  
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isSaving, setIsSaving] = useState(false);

  const runMaintenanceCheck = async (machinesList: any[], mId: number) => {
    const today = new Date();
    const upcoming = machinesList.filter(m => {
      if (!m.next_maintenance_date || m.status === 'Retired') return false;
      const mDate = new Date(m.next_maintenance_date);
      const diffDays = Math.ceil((mDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
      return diffDays > 0 && diffDays <= 14;
    });

    for (const m of upcoming) {
      const { data: existing } = await supabase.from('notifications')
        .select('id').eq('user_id', mId).like('title', `%${m.serial_number}%`).eq('is_read', false);
        
      if (!existing || existing.length === 0) {
        await supabase.from('notifications').insert({
          user_id: mId, title: `Maintenance Alert: SN-${m.serial_number}`,
          message: `Machine ${m.manufacturer} ${m.model} is due for scheduled maintenance on ${formatDateDisplay(m.next_maintenance_date)}. Please prepare the maintenance log.`
        });
      }
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Authentication failed.");
      
      const { data: managerProfile } = await supabase
        .from('users').select('user_id, branch_id').eq('user_email', sessionData.session.user.email).single();
        
      if (!managerProfile?.branch_id) throw new Error("No branch assigned.");
      
      const branchId = managerProfile.branch_id;
      setManagerId(managerProfile.user_id);

      const [branchRes, machinesRes, patientsRes] = await Promise.all([
        supabase.from('branches').select('*').eq('id', branchId).single(),
        supabase.from('machines').select('*').eq('branch_id', branchId).order('id', { ascending: true }),
        supabase.from('patients').select(`
          patient_id, assigned_machine_id, schedule_pattern, preferred_shift,
          hepatitis_b_status, hepatitis_c_status, hiv_status, 
          users!inner(user_fullname)
        `).eq('home_branch_id', branchId)
      ]);

      setBranchData(branchRes.data);
      setMachines(machinesRes.data || []);
      setPatients(patientsRes.data || []);

      if (machinesRes.data && managerProfile.user_id) {
        runMaintenanceCheck(machinesRes.data, managerProfile.user_id);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const modelMemoryMap = machines.reduce((acc, m) => {
    if (m.model) {
      acc[m.model] = { 
        supports_hdf: m.supports_hdf, 
        has_bvm: m.has_bvm, 
        has_endotoxin_filter: m.has_endotoxin_filter 
      };
    }
    return acc;
  }, {} as Record<string, any>);

  const vendorMemoryMap = machines.reduce((acc, m) => {
    if (m.vendor_name && m.vendor_contact) {
      acc[m.vendor_name] = m.vendor_contact;
    }
    return acc;
  }, {} as Record<string, string>);

  const uniqueManufacturers = Array.from(new Set(machines.map(m => m.manufacturer).filter(Boolean)));
  const uniqueModels = Array.from(new Set(machines.map(m => m.model).filter(Boolean)));
  const uniqueVendors = Array.from(new Set(machines.map(m => m.vendor_name).filter(Boolean)));

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) throw new Error("Image must be smaller than 2MB.");
      
      setIsUploadingPhoto(true);
      setMessage({ type: '', text: '' });
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage.from('machine-photos').upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('machine-photos').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, photo_url: data.publicUrl }));

    } catch (error: any) {
      setMessage({ type: 'error', text: `Upload failed: ${error.message}` });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleAddClick = () => {
    setFormData({ 
      serial_number: '', asset_tag: '', manufacturer: '', model: '', software_version: '',
      status: 'Active', operating_hours: '0', commission_date: new Date().toISOString().split('T')[0], warranty_expiry: '',
      vendor_name: '', vendor_contact: '', last_calibration_date: '', last_maintenance_date: '', next_maintenance_date: '', 
      photo_url: '', supports_hdf: false, has_bvm: false, has_endotoxin_filter: false, reason: '' 
    });
    setModalMode('add');
    setMessage({ type: '', text: '' });
    setIsModalOpen(true);
  };

  const handleEditClick = (machine: any) => {
    setEditingMachine(machine);
    setFormData({ 
      serial_number: machine.serial_number, asset_tag: machine.asset_tag || '', manufacturer: machine.manufacturer || '', 
      model: machine.model || '', software_version: machine.software_version || '', status: machine.status || 'Active', 
      operating_hours: machine.operating_hours?.toString() || '0', commission_date: machine.commission_date || '', warranty_expiry: machine.warranty_expiry || '',
      vendor_name: machine.vendor_name || '', vendor_contact: machine.vendor_contact || '',
      last_calibration_date: machine.last_calibration_date || '', last_maintenance_date: machine.last_maintenance_date || '', 
      next_maintenance_date: machine.next_maintenance_date || '', photo_url: machine.photo_url || '', 
      supports_hdf: machine.supports_hdf || false, has_bvm: machine.has_bvm || false, has_endotoxin_filter: machine.has_endotoxin_filter || false, reason: ''
    });
    setModalMode('edit');
    setMessage({ type: '', text: '' });
    setIsModalOpen(true);
  };

  const handleSaveMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage({ type: '', text: '' });

    try {
      if (!formData.serial_number.trim()) throw new Error("Serial Number is required.");
      if (formData.status === 'Active' && !formData.last_calibration_date) {
         throw new Error("Activation blocked. Missing required calibration records.");
      }

      const isReactivating = modalMode === 'edit' && editingMachine.status === 'Under Maintenance' && formData.status === 'Active';
      
      if ((isReactivating || formData.status === 'Active') && parseInt(formData.operating_hours) >= 4000 && !formData.last_maintenance_date) {
         throw new Error("Activation blocked. Machine has exceeded maximum operating hours without documented maintenance.");
      }

      let finalLastMaint = formData.last_maintenance_date || null;
      let finalNextMaint = formData.next_maintenance_date || null;

      if (isReactivating) {
        // The manager confirms maintenance is complete
        const confirmAutoDate = window.confirm("Maintenance complete. Do you want the system to automatically set the Last Maintenance to today, and schedule the Next Maintenance for 6 months from now?");
        if (confirmAutoDate) {
          const today = new Date();
          finalLastMaint = today.toISOString().split('T')[0];
          const nextPM = new Date(today.setMonth(today.getMonth() + 6));
          finalNextMaint = nextPM.toISOString().split('T')[0];
        }
      }

      if (modalMode === 'edit' && formData.status !== 'Active' && editingMachine.status === 'Active') {
        
        const { count: activeTreatments, error: treatErr } = await supabase
          .from('treatments')
          .select('*', { count: 'exact', head: true })
          .eq('machine_id', editingMachine.id)
          .eq('status', 'IN_PROGRESS');
          
        if (activeTreatments && activeTreatments > 0) {
          throw new Error("Safety Violation: Cannot update status while treatment is in progress.");
        }

        // EXCEPTION 8(a): Conflicting Upcoming Bookings
        const todayStr = new Date().toISOString().split('T')[0];
        const { count: futureBookings, error: bookErr } = await supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_machine_id', editingMachine.id) 
          .gte('booking_date', todayStr)
          .in('status', ['CONFIRMED', 'PENDING_REVIEW']);

        if (futureBookings && futureBookings > 0) {
          throw new Error(`Cannot deactivate machine. There are ${futureBookings} upcoming bookings. Please reschedule them first.`);
        }
      }

      // ==========================================
      // DATABASE PAYLOAD & EXECUTION
      // ==========================================
      const payload = {
        branch_id: branchData.id, serial_number: formData.serial_number.trim(), asset_tag: formData.asset_tag.trim() || null,
        manufacturer: formData.manufacturer.trim(), model: formData.model.trim(), software_version: formData.software_version.trim() || null,
        status: formData.status, operating_hours: parseInt(formData.operating_hours) || 0,
        commission_date: formData.commission_date || null, warranty_expiry: formData.warranty_expiry || null,
        vendor_name: formData.vendor_name.trim() || null, vendor_contact: formData.vendor_contact.trim() || null,
        last_calibration_date: formData.last_calibration_date || null, last_maintenance_date: finalLastMaint, next_maintenance_date: finalNextMaint,
        photo_url: formData.photo_url.trim() || null,
        supports_hdf: formData.supports_hdf, has_bvm: formData.has_bvm, has_endotoxin_filter: formData.has_endotoxin_filter
      };

      if (modalMode === 'add') {
        const { error } = await supabase.from('machines').insert([payload]);
        if (error) {
          if (error.code === '23505') throw new Error("A machine with this Serial Number already exists.");
          throw error;
        }
      } else {
        const { error } = await supabase.from('machines').update(payload).eq('id', editingMachine.id);
        if (error) {
          if (error.code === '23505') throw new Error("This Serial Number is already in use.");
          throw error;
        }
      }

      // AUDIT LOG CREATION
      if (managerId && modalMode === 'edit' && editingMachine.status !== formData.status) {
        await supabase.from('notifications').insert({
          user_id: managerId, title: 'Audit Log: Machine Status Changed',
          message: `${formData.serial_number} status updated from ${editingMachine.status} to ${formData.status}. ${formData.reason ? `Reason: ${formData.reason}` : ''}`
        });
      }

      setMessage({ type: 'success', text: "Machine status updated successfully." });
      
      fetchData(); 
      setTimeout(() => setIsModalOpen(false), 1500);

    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading && !branchData) {
    return (
      <div className='min-h-screen bg-slate-50 flex items-center justify-center'>
        <div className='flex flex-col items-center text-blue-600 font-bold'>
          <FiActivity className='text-4xl mb-4 animate-spin' />
          <span>Loading Machine Inventory...</span>
        </div>
      </div>
    );
  }

  const totalMachines = machines.length;
  const visitorPoolCount = machines.filter(m => {
    return patients.filter(p => p.assigned_machine_id === m.id).length === 0;
  }).length;
  const dedicatedPoolCount = totalMachines - visitorPoolCount;
  const maintenanceCount = machines.filter(m => m.status === 'Under Maintenance').length;

  const getPatientDetails = (id: number) => patients.find(p => p.patient_id === id);

  const getMaintenanceHealth = (nextDateStr: string) => {
    if (!nextDateStr) return { color: 'text-slate-500', bg: 'bg-slate-100', label: 'Not Scheduled' };
    const nextDate = new Date(nextDateStr);
    const today = new Date();
    const daysLeft = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
    
    if (daysLeft < 0) return { color: 'text-rose-700', bg: 'bg-rose-100 border-rose-300', label: `OVERDUE by ${Math.abs(daysLeft)} days` };
    if (daysLeft <= 14) return { color: 'text-amber-700', bg: 'bg-amber-100 border-amber-300', label: `Due in ${daysLeft} days` };
    return { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', label: 'Healthy' };
  };

  const filteredMachines = machines.filter(m => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      (m.serial_number?.toLowerCase() || '').includes(term) || 
      (m.asset_tag?.toLowerCase() || '').includes(term) ||
      (m.model?.toLowerCase() || '').includes(term);
    
    const matchesStatus = statusFilter === 'All' || m.status === statusFilter;
    
    const assignedPatients = patients.filter(p => p.assigned_machine_id === m.id);
    const matchesAllocation = allocationFilter === 'All' || 
                              (allocationFilter === 'Dedicated' && assignedPatients.length > 0) || 
                              (allocationFilter === 'Visitor' && assignedPatients.length === 0);

    const matchesCapability = capabilityFilter === 'All' ||
                              (capabilityFilter === 'HDF' && m.supports_hdf) ||
                              (capabilityFilter === 'BVM' && m.has_bvm) ||
                              (capabilityFilter === 'EF' && m.has_endotoxin_filter);
    
    return matchesSearch && matchesStatus && matchesAllocation && matchesCapability;
  });

  return (
    <main className='p-8 bg-slate-50 min-h-screen font-sans pb-24'>
      <div className='max-w-7xl mx-auto'>
        
        {/* --- Header --- */}
        <div className='mb-6 flex items-center text-sm font-bold text-slate-400'>

        </div>

        <div className='flex flex-col md:flex-row justify-between items-end mb-8 gap-4'>
          <div>
            <h1 className='text-3xl font-bold text-slate-800 tracking-tight'>Machine Inventory</h1>

          </div>
          <button onClick={handleAddClick} className='px-6 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 shadow-lg transition-all shrink-0'>
            + Register New Machine
          </button>
        </div>

        {/* KPI SUMMARY WIDGET */}
        <div className='grid grid-cols-1 md:grid-cols-4 gap-4 mb-8'>
          <div className='bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between'>
            <div><p className='text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1'>Total Units</p><p className='text-2xl font-black text-slate-800'>{totalMachines}</p></div>
            <div className='h-10 w-10 rounded-full bg-slate-50 text-slate-500 flex items-center justify-center text-lg'><FiDatabase /></div>
          </div>
          <div className='bg-white p-5 rounded-2xl border border-indigo-200 shadow-sm flex items-center justify-between ring-1 ring-indigo-50'>
            <div><p className='text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1'>Free Pool</p><p className='text-2xl font-black text-indigo-700'>{visitorPoolCount}</p></div>
            <div className='h-10 w-10 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center text-lg'><FiUsers /></div>
          </div>
          <div className='bg-white p-5 rounded-2xl border border-blue-200 shadow-sm flex items-center justify-between'>
            <div><p className='text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1'>Allocated</p><p className='text-2xl font-black text-blue-700'>{dedicatedPoolCount}</p></div>
            <div className='h-10 w-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-lg'><FiLock /></div>
          </div>
          <div className='bg-white p-5 rounded-2xl border border-amber-200 shadow-sm flex items-center justify-between'>
            <div><p className='text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1'>Maintenance</p><p className='text-2xl font-black text-amber-600'>{maintenanceCount}</p></div>
            <div className='h-10 w-10 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center text-lg'><FiSettings /></div>
          </div>
        </div>

        {/* --- DYNAMIC FILTER BAR --- */}
        <div className='bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-col xl:flex-row gap-4 items-center'>
          
          <div className='flex-1 w-full'>
            <div className='relative'>
              <FiSearch className='absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg' />
              <input 
                type="text" 
                placeholder="Search Serial No, Asset Tag, or Model..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className='w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-medium text-slate-800 text-sm transition-colors'
              />
            </div>
          </div>

          <div className='flex flex-wrap md:flex-nowrap gap-4 w-full xl:w-auto items-center'>
            <select value={capabilityFilter} onChange={e => setCapabilityFilter(e.target.value)} className='flex-1 xl:w-48 p-2.5 bg-purple-50/50 border border-purple-200 rounded-lg outline-none focus:border-purple-500 font-bold text-purple-800 text-sm cursor-pointer'>
              <option value="All">All Capabilities</option>
              <option value="HDF">HDF Capable</option>
              <option value="BVM">BVM Equipped</option>
              <option value="EF">Endotoxin Filter</option>
            </select>

            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className='flex-1 xl:w-48 p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-bold text-slate-700 text-sm cursor-pointer'>
              <option value="All">All Statuses</option>
              <option value="Active">Active & Ready</option>
              <option value="Reserved">Reserved</option>
              <option value="Under Maintenance">Under Maintenance</option>
              <option value="Faulty">Faulty</option>
            </select>

            {/* FIX: Escaped the greater-than symbol to fix the JSX parsing error */}
            <select value={allocationFilter} onChange={e => setAllocationFilter(e.target.value)} className='flex-1 xl:w-48 p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-bold text-slate-700 text-sm cursor-pointer'>
              <option value="All">All Allocations</option>
              <option value="Visitor">Floating Pool (0 Patients)</option>
              <option value="Dedicated">Allocated (&gt;0 Patients)</option>
            </select>

            {hasActiveFilters && (
              <button onClick={clearFilters} className='flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors shrink-0' title="Clear all filters">
                <FiX className='text-base' /> Clear
              </button>
            )}
          </div>
        </div>

        {/* --- CLINICAL MACHINE CARDS --- */}
        {filteredMachines.length === 0 ? (
          <div className='bg-white border border-slate-200 rounded-2xl py-16 text-center shadow-sm flex flex-col items-center justify-center'>
            <FiInbox className='text-5xl mb-4 text-slate-400 opacity-50' />
            <h3 className='text-lg font-bold text-slate-700'>No machines found</h3>
            <p className='text-slate-500 text-sm mt-1'>Try adjusting your filters or search terms.</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className='mt-4 text-xs font-bold text-blue-600 hover:underline'>
                Clear filters to see all machines
              </button>
            )}
          </div>
        ) : (
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {filteredMachines.map(machine => {
              const health = getMaintenanceHealth(machine.next_maintenance_date);
              
              const assignedPatients = patients.filter(p => p.assigned_machine_id === machine.id);
              const isInfectious = assignedPatients.some(p => p.hepatitis_b_status === 'Positive' || p.hepatitis_c_status === 'Positive' || p.hiv_status === 'Positive');

              return (
                <div key={machine.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col transition-all ${isInfectious ? 'border-rose-300 ring-1 ring-rose-50' : 'border-slate-200 hover:border-blue-300 hover:shadow-md'}`}>
                  
                  <div className={`px-5 py-2.5 text-[11px] font-black uppercase tracking-widest flex justify-between items-center
                    ${isInfectious ? 'bg-rose-600 text-white' : assignedPatients.length > 0 ? 'bg-blue-600 text-white' : 'bg-indigo-50 text-indigo-700 border-b border-indigo-100'}`}>
                    <span className='flex items-center gap-1.5'>
                      {assignedPatients.length > 0 ? <><FiLock /> {assignedPatients.length}/6 Slots Filled</> : <><FiUsers /> Floating Pool (0/6)</>}
                    </span>
                    <span className={`px-2 py-0.5 rounded shadow-sm ${machine.status === 'Active' ? 'bg-emerald-400 text-white' : machine.status === 'Under Maintenance' ? 'bg-amber-400 text-white' : machine.status === 'Reserved' ? 'bg-blue-400 text-white' : 'bg-rose-400 text-white'}`}>{machine.status}</span>
                  </div>

                  <div className='p-5 flex flex-col sm:flex-row gap-5'>
                    <div className='w-full sm:w-32 flex flex-col gap-2 shrink-0'>
                      <div 
                        className={`h-32 bg-slate-100 rounded-xl border border-slate-200 overflow-hidden flex flex-col items-center justify-center text-slate-300 ${machine.photo_url ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                        onClick={() => machine.photo_url && setEnlargedPhoto(machine.photo_url)}
                        title={machine.photo_url ? "Click to enlarge" : ""}
                      >
                        {machine.photo_url ? (
                          <img src={machine.photo_url} alt={machine.model} className='w-full h-full object-cover' />
                        ) : (
                          <>
                            <FiImage className='text-3xl mb-1' />
                            <span className='text-[9px] font-bold uppercase'>No Image</span>
                          </>
                        )}
                      </div>
                      <div className='flex gap-1 justify-center flex-wrap'>
                        {machine.supports_hdf && <span className='px-1.5 py-0.5 bg-purple-100 text-purple-700 border border-purple-200 text-[9px] font-black rounded uppercase tracking-wider' title="Hemodiafiltration">HDF</span>}
                        {machine.has_bvm && <span className='px-1.5 py-0.5 bg-teal-100 text-teal-700 border border-teal-200 text-[9px] font-black rounded uppercase tracking-wider' title="Blood Volume Monitor">BVM</span>}
                        {machine.has_endotoxin_filter && <span className='flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 border border-blue-200 text-[9px] font-black rounded uppercase tracking-wider' title="Endotoxin / Diasafe Filter"><FiShield /> EF</span>}
                      </div>
                    </div>

                    <div className='flex-1 flex flex-col justify-between'>
                      <div>
                        <div className='flex justify-between items-start'>
                          <div>
                            <p className='text-2xl font-black text-slate-800 tracking-tight'>SN: {machine.serial_number}</p>
                            <p className='text-xs font-bold text-slate-500'>{machine.manufacturer} {machine.model} {machine.asset_tag && <span className='text-blue-500 ml-1'>[{machine.asset_tag}]</span>}</p>
                          </div>
                          <button onClick={() => handleEditClick(machine)} className='text-xs font-bold text-slate-400 hover:text-blue-600 underline'>Edit</button>
                        </div>
                      </div>

                      {assignedPatients.length > 0 && (
                        <div className={`mt-3 p-3 rounded-lg border ${isInfectious ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                          <p className='text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2'>Assigned Roster</p>
                          <div className='flex flex-col gap-1.5 max-h-24 overflow-y-auto custom-scrollbar pr-1'>
                            {assignedPatients.map(p => (
                              <div key={p.patient_id} className='flex items-center justify-between bg-white px-2 py-1.5 rounded border border-slate-100 shadow-sm'>
                                <div className='flex items-center gap-1.5 truncate'>
                                  <FiUser className='text-blue-400 shrink-0 text-xs' />
                                  <span className='text-xs font-bold text-slate-700 truncate'>{p.users?.user_fullname}</span>
                                  
                                  {(p.hepatitis_b_status === 'Positive' || p.hepatitis_c_status === 'Positive' || p.hiv_status === 'Positive') && (
                                    <FiAlertTriangle className='text-rose-500 text-[10px] shrink-0' title="Infectious Status" />
                                  )}
                                </div>
                                <span className='text-[9px] font-black text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase shrink-0'>
                                  {p.schedule_pattern} {p.preferred_shift ? p.preferred_shift.split(' (')[0].substring(0, 3) : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className='grid grid-cols-3 gap-3 mt-4'>
                        <div className='bg-slate-50 p-2.5 rounded-lg border border-slate-100'>
                          <p className='text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5'>Op. Hours</p>
                          <p className='text-xs font-bold text-slate-700'>{machine.operating_hours ? machine.operating_hours.toLocaleString() : '0'}h</p>
                        </div>
                        <div className='bg-slate-50 p-2.5 rounded-lg border border-slate-100'>
                          <p className='text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5'>Last Calib.</p>
                          <p className='text-xs font-bold text-slate-700'>{formatDateDisplay(machine.last_calibration_date)}</p>
                        </div>
                        <div className={`p-2.5 rounded-lg border ${health.bg}`}>
                          <p className='text-[9px] font-bold uppercase tracking-widest mb-0.5 opacity-70'>Next Maint.</p>
                          <p className={`text-xs font-black ${health.color}`}>
                            {formatDateDisplay(machine.next_maintenance_date)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* LIGHTBOX OVERLAY */}
      {enlargedPhoto && (
        <div className='fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[100] flex items-center justify-center p-4 sm:p-8 animate-in fade-in zoom-in-95 cursor-pointer' onClick={() => setEnlargedPhoto(null)}>
          <div className='relative max-w-5xl max-h-[90vh] w-full h-full flex flex-col items-center justify-center'>
            <button onClick={() => setEnlargedPhoto(null)} className='absolute top-0 right-0 sm:top-4 sm:right-4 text-white hover:text-red-400 text-4xl font-black bg-slate-900/50 hover:bg-slate-800 w-14 h-14 rounded-full flex items-center justify-center transition-all'><FiX /></button>
            <img src={enlargedPhoto} alt="Enlarged Detail" className='max-w-full max-h-full object-contain rounded-xl shadow-2xl ring-1 ring-white/10 cursor-auto' onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}

      {/* MASTER EDIT MODAL */}
      {isModalOpen && (
        <div className='fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in overflow-y-auto'>
          <div className='bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden my-8'>
            <div className='px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10'>
              <h3 className='font-bold text-slate-800'>{modalMode === 'add' ? 'Register New Machine' : 'Update Machine'}</h3>
              <button onClick={() => setIsModalOpen(false)} className='text-slate-400 hover:text-slate-600 text-xl font-bold'><FiX /></button>
            </div>
            
            <form onSubmit={handleSaveMachine} className='p-6'>
              
              <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
                <div className='space-y-6'>
                  <div>
                    <div className={`w-full bg-slate-50 border-2 border-dashed rounded-xl p-2 transition-all group relative ${isUploadingPhoto ? 'border-blue-400 bg-blue-50/50' : 'border-slate-300 hover:border-blue-400'}`}>
                      {formData.photo_url ? (
                        <div className='w-full h-40 bg-white rounded-lg overflow-hidden flex items-center justify-center relative cursor-pointer group-hover:opacity-90 transition-opacity' onClick={() => setEnlargedPhoto(formData.photo_url)}>
                          <img src={formData.photo_url} alt="Preview" className='max-w-full max-h-full object-contain drop-shadow-sm' />
                          <div className='absolute inset-0 bg-black/0 group-hover:bg-black/10 flex items-center justify-center transition-all'>
                            <FiZoomIn className='text-3xl text-white opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all drop-shadow-md' />
                          </div>
                        </div>
                      ) : (
                        <div className='w-full h-40 bg-white rounded-lg flex flex-col items-center justify-center text-slate-400 group-hover:text-blue-500 transition-colors'>
                          <FiCamera className='text-3xl mb-2' />
                          <span className='text-xs font-bold'>Upload Machine Photo</span>
                        </div>
                      )}
                      <div className='mt-2 px-1'>
                        <input type="file" accept="image/*" onChange={handlePhotoUpload} disabled={isUploadingPhoto} className='w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-200 file:text-slate-700 hover:file:bg-slate-300 transition-all cursor-pointer' />
                        {isUploadingPhoto && <p className='text-xs font-bold text-blue-600 flex items-center justify-center gap-1 mt-2'><FiActivity className='animate-spin' /> Uploading to secure storage...</p>}
                      </div>
                    </div>
                  </div>

                  <div className='p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4'>
                    <h4 className='text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2'>Hardware Identity</h4>
                    
                    <datalist id="manufacturer-options">
                      {uniqueManufacturers.map(m => <option key={m} value={m} />)}
                    </datalist>
                    <datalist id="model-options">
                      {uniqueModels.map(m => <option key={m} value={m} />)}
                    </datalist>
                    <datalist id="vendor-options">
                      {uniqueVendors.map(v => <option key={v} value={v} />)}
                    </datalist>

                    <div className='grid grid-cols-2 gap-4'>
                      <div className='col-span-2'><label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Serial Number *</label><input type="text" required value={formData.serial_number} onChange={e => setFormData({...formData, serial_number: e.target.value})} className='w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500 font-bold text-slate-800 uppercase' /></div>
                      <div><label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Asset Tag</label><input type="text" placeholder="e.g. BME-HD-001" value={formData.asset_tag} onChange={e => setFormData({...formData, asset_tag: e.target.value})} className='w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500 font-medium text-slate-800' /></div>
                      <div><label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Software Version</label><input type="text" placeholder="e.g. V 4.2.1" value={formData.software_version} onChange={e => setFormData({...formData, software_version: e.target.value})} className='w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500 font-medium text-slate-800' /></div>
                      
                      <div>
                        <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Manufacturer</label>
                        <input type="text" list="manufacturer-options" value={formData.manufacturer} onChange={e => setFormData({...formData, manufacturer: e.target.value})} className='w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500 font-medium text-slate-800' />
                      </div>
                      <div>
                        <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Model</label>
                        <input 
                          type="text" list="model-options" value={formData.model} 
                          onChange={e => {
                            const newModel = e.target.value;
                            setFormData(prev => {
                              const updates = { ...prev, model: newModel };
                              if (modelMemoryMap[newModel]) {
                                updates.supports_hdf = modelMemoryMap[newModel].supports_hdf;
                                updates.has_bvm = modelMemoryMap[newModel].has_bvm;
                                updates.has_endotoxin_filter = modelMemoryMap[newModel].has_endotoxin_filter;
                              }
                              return updates;
                            });
                          }} 
                          className='w-full p-2.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500 font-medium text-slate-800' 
                        />
                      </div>
                    </div>
                  </div>

                  <div className='p-4 bg-purple-50 border border-purple-100 rounded-xl space-y-4'>
                    <h4 className='text-xs font-black text-purple-400 uppercase tracking-widest border-b border-purple-200 pb-2'>Clinical Capabilities</h4>
                    <div className='flex flex-col gap-3'>
                      <label className='flex items-center gap-3 cursor-pointer group'><input type="checkbox" checked={formData.supports_hdf} onChange={e => setFormData({...formData, supports_hdf: e.target.checked})} className='w-5 h-5 rounded text-purple-600 focus:ring-purple-500' /><div><p className='font-bold text-slate-800 text-sm'>Supports HDF Therapy</p></div></label>
                      <label className='flex items-center gap-3 cursor-pointer group'><input type="checkbox" checked={formData.has_bvm} onChange={e => setFormData({...formData, has_bvm: e.target.checked})} className='w-5 h-5 rounded text-purple-600 focus:ring-purple-500' /><div><p className='font-bold text-slate-800 text-sm'>Equipped with BVM</p></div></label>
                      <label className='flex items-center gap-3 cursor-pointer group'><input type="checkbox" checked={formData.has_endotoxin_filter} onChange={e => setFormData({...formData, has_endotoxin_filter: e.target.checked})} className='w-5 h-5 rounded text-purple-600 focus:ring-purple-500' /><div><p className='font-bold text-slate-800 text-sm'>Endotoxin / Diasafe Filter</p></div></label>
                    </div>
                  </div>
                </div>

                <div className='space-y-6'>
                  <div className='grid grid-cols-1 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200'>
                    <div>
                      <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Operational Status</label>
                      <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className={`w-full p-3 border rounded-xl outline-none font-bold text-sm ${formData.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : formData.status === 'Under Maintenance' ? 'bg-amber-50 text-amber-700 border-amber-200' : formData.status === 'Reserved' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                        <option value="Active">Active & Ready</option>
                        <option value="Under Maintenance">Under Maintenance</option>
                        <option value="Faulty">Faulty</option>
                      </select>
                    </div>
                    {(formData.status === 'Under Maintenance' || formData.status === 'Faulty') && (
                      <div className='animate-in slide-in-from-top-2'>
                        <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Downtime Reason (Required)</label>
                        <textarea required placeholder="Provide details for audit log..." value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})} className='w-full p-3 bg-white border border-slate-300 rounded-xl outline-none focus:border-blue-500 font-medium text-slate-800 resize-none h-16' />
                      </div>
                    )}
                  </div>

                  <div className='p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-4'>
                    <h4 className='text-xs font-black text-blue-400 uppercase tracking-widest border-b border-blue-200 pb-2'>Lifecycle & Calibration</h4>
                    <div className='grid grid-cols-2 gap-4'>
                      <div><label className='block text-xs font-bold text-blue-800 uppercase mb-2'>Commission Date</label><input type="date" value={formData.commission_date} onChange={e => setFormData({...formData, commission_date: e.target.value})} className='w-full p-2.5 bg-white border border-blue-200 rounded-lg outline-none focus:border-blue-500 font-medium text-slate-800' /></div>
                      <div><label className='block text-xs font-bold text-blue-800 uppercase mb-2'>Operating Hours</label><input type="number" min="0" value={formData.operating_hours} onChange={e => setFormData({...formData, operating_hours: e.target.value})} className='w-full p-2.5 bg-white border border-blue-200 rounded-lg outline-none focus:border-blue-500 font-medium text-slate-800' /></div>
                      <div><label className='block text-xs font-bold text-blue-800 uppercase mb-2'>Last Calibration</label><input type="date" value={formData.last_calibration_date} onChange={e => setFormData({...formData, last_calibration_date: e.target.value})} className='w-full p-2.5 bg-white border border-blue-200 rounded-lg outline-none focus:border-blue-500 font-medium text-slate-800' /></div>
                      <div><label className='block text-xs font-bold text-blue-800 uppercase mb-2'>Last Maintenance</label><input type="date" value={formData.last_maintenance_date} onChange={e => setFormData({...formData, last_maintenance_date: e.target.value})} className='w-full p-2.5 bg-white border border-blue-200 rounded-lg outline-none focus:border-blue-500 font-medium text-slate-800' /></div>
                      <div className='col-span-2'><label className='block text-xs font-bold text-blue-800 uppercase mb-2'>Next Maintenance Due</label><input type="date" value={formData.next_maintenance_date} onChange={e => setFormData({...formData, next_maintenance_date: e.target.value})} className='w-full p-2.5 bg-white border border-blue-200 rounded-lg outline-none focus:border-blue-500 font-medium text-slate-800' /></div>
                    </div>
                  </div>

                  <div className='p-4 bg-amber-50 border border-amber-100 rounded-xl space-y-4'>
                    <h4 className='text-xs font-black text-amber-500 uppercase tracking-widest border-b border-amber-200 pb-2'>Vendor & Warranty</h4>
                    <div className='grid grid-cols-2 gap-4'>
                      <div className='col-span-2'>
                        <label className='block text-xs font-bold text-amber-800 uppercase mb-2'>Service Vendor</label>
                        <input 
                          type="text" list="vendor-options" placeholder="e.g. Mediserve Sdn Bhd" value={formData.vendor_name} 
                          onChange={e => {
                            const newVendor = e.target.value;
                            setFormData(prev => {
                              const updates = { ...prev, vendor_name: newVendor };
                              if (vendorMemoryMap[newVendor]) {
                                updates.vendor_contact = vendorMemoryMap[newVendor];
                              }
                              return updates;
                            });
                          }} 
                          className='w-full p-2.5 bg-white border border-amber-200 rounded-lg outline-none focus:border-amber-500 font-medium text-slate-800' 
                        />
                      </div>
                      <div><label className='block text-xs font-bold text-amber-800 uppercase mb-2'>Vendor Contact</label><input type="text" placeholder="Phone or Email" value={formData.vendor_contact} onChange={e => setFormData({...formData, vendor_contact: e.target.value})} className='w-full p-2.5 bg-white border border-amber-200 rounded-lg outline-none focus:border-amber-500 font-medium text-slate-800' /></div>
                      <div><label className='block text-xs font-bold text-amber-800 uppercase mb-2'>Warranty Expiry</label><input type="date" value={formData.warranty_expiry} onChange={e => setFormData({...formData, warranty_expiry: e.target.value})} className='w-full p-2.5 bg-white border border-amber-200 rounded-lg outline-none focus:border-amber-500 font-medium text-slate-800' /></div>
                    </div>
                  </div>

                </div>
              </div>

              {message.text && (
                <div className={`mt-6 p-4 rounded-xl font-bold text-sm border flex items-start gap-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                  <span className='mt-0.5 text-lg'>{message.type === 'success' ? <FiCheckCircle /> : <FiAlertTriangle />}</span>
                  <span>{message.text}</span>
                </div>
              )}

              <div className='pt-6 flex justify-end gap-3 border-t border-slate-100 mt-6'>
                <button type="button" onClick={() => setIsModalOpen(false)} className='px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors'>Cancel</button>
                <button type="submit" disabled={isSaving || isUploadingPhoto} className='px-8 py-2.5 text-white bg-blue-600 font-bold rounded-xl shadow-md transition-colors hover:bg-blue-700 disabled:bg-blue-300'>
                  {isSaving ? 'Validating & Saving...' : 'Save Machine'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </main>
  );
}