'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { FiPhone, FiMapPin, FiLock, FiArrowUp, FiArrowDown, FiMinus, FiActivity } from 'react-icons/fi';

const roleMap: Record<number, string> = {
  1: 'HQ Admin',
  2: 'Branch Manager',
  3: 'Nephrologist',
  4: 'Nurse',
  5: 'Patient'
};

export default function UserManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [filterRole, setFilterRole] = useState<number | 'All'>('All');
  const [filterBranch, setFilterBranch] = useState<number | 'All' | 'Network'>('All');

  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'user_fullname', direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullname: '',
    ic: '',
    gender: '',
    contact_number: '',
    role_id: '',
    branch_id: '',
    patient_address: '',
    blood_type: '',
    license_number: '',
    max_hours: '48',
    employment_status: 'Full-Time'
  });

  async function fetchData() {
    setIsLoading(true);
    const [usersRes, branchesRes] = await Promise.all([
      supabase.from('users').select('*, patients(*), staff(*)').order('user_id', { ascending: false }),
      supabase.from('branches').select('id, branch_name')
    ]);

    if (usersRes.data) setUsers(usersRes.data);
    if (branchesRes.data) setBranches(branchesRes.data);
    setIsLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus, filterRole, filterBranch]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({ 
      email: '', password: '', fullname: '', ic: '', gender: '', contact_number: '', role_id: '', branch_id: '',
      patient_address: '', blood_type: '', license_number: '', max_hours: '48', employment_status: 'Full-Time'
    });
    setError('');
    setIsModalOpen(true);
  };

  const openEditModal = (user: any) => {
    setEditingId(user.user_id);
    const patientData = user.patients && user.patients.length > 0 ? user.patients[0] : null;
    const staffData = user.staff && user.staff.length > 0 ? user.staff[0] : null;

    setFormData({
      email: user.user_email || '',
      password: '', 
      fullname: user.user_fullname || '',
      ic: user.user_ic || '',
      gender: user.user_gender || '',
      contact_number: user.user_contact_number || '',
      role_id: user.role_id ? user.role_id.toString() : '',
      branch_id: user.branch_id ? user.branch_id.toString() : '',
      
      patient_address: patientData?.patient_address || '',
      blood_type: patientData?.patient_blood_type || '',
      
      license_number: staffData?.professional_license_number || '',
      max_hours: staffData?.max_weekly_hours?.toString() || '48',
      employment_status: staffData?.employment_status || 'Full-Time'
    });
    setError('');
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    if (!formData.email || !formData.fullname || !formData.ic || !formData.role_id || !formData.contact_number) {
      setError('Error: Email, Full Name, Contact Number, IC, and Role are mandatory fields.');
      setIsSubmitting(false);
      return;
    }

    const isDuplicateEmail = users.some(u => u.user_id !== editingId && u.user_email.toLowerCase() === formData.email.trim().toLowerCase());
    if (isDuplicateEmail) {
      setError('Email address is already registered.');
      setIsSubmitting(false);
      return;
    }

    const isDuplicateIC = users.some(u => u.user_id !== editingId && u.user_ic.toLowerCase() === formData.ic.trim().toLowerCase());
    if (isDuplicateIC) {
      setError('IC number is already registered.');
      setIsSubmitting(false);
      return;
    }

    const roleIdNum = parseInt(formData.role_id);
    const userPayload: any = {
      user_email: formData.email.trim(),
      user_fullname: formData.fullname.trim(),
      user_ic: formData.ic.trim(),
      user_gender: formData.gender || null,
      user_contact_number: formData.contact_number.trim(),
      role_id: roleIdNum,
      branch_id: formData.branch_id ? parseInt(formData.branch_id) : null
    };

    try {
      let targetUserId = editingId;

      if (editingId) {
        if (formData.password.trim()) {
          const authRes = await fetch('/api/admin/update-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: formData.email.trim(), password: formData.password.trim() })
          });
          if (!authRes.ok) throw new Error("Failed to update password in secure auth.");
        }

        const { error: updateError } = await supabase.from('users').update(userPayload).eq('user_id', editingId);
        if (updateError) throw updateError;
        
      } else {
        if (!formData.password) throw new Error('Password is required for new users.');
        userPayload.user_is_active = true; 

        const authRes = await fetch('/api/admin/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formData.email.trim(), password: formData.password.trim() })
        });
        
        if (!authRes.ok) {
          const errData = await authRes.json();
          throw new Error(errData.error || "Failed to create user in secure auth. Ensure password is > 6 characters.");
        }

        const { data: newUser, error: insertError } = await supabase.from('users').insert([userPayload]).select();
        if (insertError) throw insertError;
        targetUserId = newUser[0].user_id;
      }

      if (roleIdNum === 5) {
        const patientPayload = {
          user_id: targetUserId,
          home_branch_id: formData.branch_id ? parseInt(formData.branch_id) : null,
          patient_address: formData.patient_address.trim() || null,
          patient_blood_type: formData.blood_type || null
        };

        const existingUser = users.find(u => u.user_id === targetUserId);
        const hasPatientRecord = existingUser?.patients && existingUser.patients.length > 0;

        if (hasPatientRecord) {
          const { error: patientErr } = await supabase.from('patients').update(patientPayload).eq('user_id', targetUserId);
          if (patientErr) throw patientErr;
        } else {
          const { error: patientErr } = await supabase.from('patients').insert([patientPayload]);
          if (patientErr) throw patientErr;
        }

      } else {
        const staffPayload = {
          user_id: targetUserId,
          professional_license_number: formData.license_number.trim() || null,
          max_weekly_hours: parseInt(formData.max_hours),
          employment_status: formData.employment_status
        };

        const existingUser = users.find(u => u.user_id === targetUserId);
        const hasStaffRecord = existingUser?.staff && existingUser.staff.length > 0;

        if (hasStaffRecord) {
          const { error: staffErr } = await supabase.from('staff').update(staffPayload).eq('user_id', targetUserId);
          if (staffErr) throw staffErr;
        } else {
          const { error: staffErr } = await supabase.from('staff').insert([staffPayload]);
          if (staffErr) throw staffErr;
        }
      }

      if (!editingId) {
        alert("Account securely created! They can now log in via the Supabase Auth system.");
      }

      setIsModalOpen(false);
      setIsSubmitting(false);
      await fetchData();

    } catch (err: any) {
      setError(`Transaction failed: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  const toggleUserStatus = async (user: any) => {
    const isCurrentlyActive = user.user_is_active;
    const actionText = isCurrentlyActive ? 'deactivate' : 'reactivate';
    
    if (window.confirm(`Are you sure you want to ${actionText} this user account?`)) {
      await supabase.from('users').update({ user_is_active: !isCurrentlyActive }).eq('user_id', user.user_id);
      if (!isCurrentlyActive) {
        alert(`System simulated action: Sent reactivation notification email to ${user.user_email}.`);
      }
      await fetchData();
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.user_fullname.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          u.user_ic.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          u.user_email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'All' ? true : filterStatus === 'Active' ? u.user_is_active === true : u.user_is_active === false;
    const matchesRole = filterRole === 'All' ? true : u.role_id === filterRole;
    const matchesBranch = filterBranch === 'All' ? true : filterBranch === 'Network' ? u.branch_id === null : u.branch_id === filterBranch;

    return matchesSearch && matchesStatus && matchesRole && matchesBranch;
  });

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    let aValue = a[sortConfig.key];
    let bValue = b[sortConfig.key];
    if (typeof aValue === 'string') aValue = aValue.toLowerCase();
    if (typeof bValue === 'string') bValue = bValue.toLowerCase();
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sortedUsers.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentUsers = sortedUsers.slice(indexOfFirstItem, indexOfLastItem);

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig.key !== columnKey) return <FiMinus className="text-slate-300 ml-1 inline-block" />;
    return sortConfig.direction === 'asc' ? <FiArrowUp className="text-blue-600 ml-1 inline-block" /> : <FiArrowDown className="text-blue-600 ml-1 inline-block" />;
  };

  if (isLoading) {
    return (
      <div className='min-h-screen bg-slate-50 flex items-center justify-center'>
        <div className='flex flex-col items-center text-blue-600 font-bold'>
          <FiActivity className='text-4xl mb-4 animate-spin' />
          <span>Loading User Accounts...</span>
        </div>
      </div>
    );
  }

  return (
    <main className='p-8 bg-slate-50 min-h-screen font-sans relative'>
      <div className='max-w-7xl mx-auto'>
        <div className='flex justify-between items-center mb-8'>
          <div>
            <h1 className='text-3xl font-bold text-slate-800 tracking-tight'>User Accounts Management</h1>
            <p className='text-slate-500 mt-1 font-medium'>Control system access and assign roles</p>
          </div>
          <button onClick={openAddModal} className='bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-sm'>
            + Add User
          </button>
        </div>

        <div className='bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-6'>
          <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
            <div className='md:col-span-1'>
              <label className='block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5'>Search Directory</label>
              <input type="text" placeholder="Name, email, or IC..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className='w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-sm font-medium' />
            </div>
            <div>
              <label className='block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5'>Account Status</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className='w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-sm font-medium cursor-pointer'>
                <option value="All">All Statuses</option>
                <option value="Active">Active Only</option>
                <option value="Inactive">Inactive Only</option>
              </select>
            </div>
            <div>
              <label className='block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5'>System Role</label>
              <select value={filterRole} onChange={(e) => setFilterRole(e.target.value === 'All' ? 'All' : parseInt(e.target.value))} className='w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-sm font-medium cursor-pointer'>
                <option value="All">All Roles</option>
                {Object.entries(roleMap).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className='block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5'>Branch Assignment</label>
              <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value === 'All' || e.target.value === 'Network' ? e.target.value : parseInt(e.target.value))} className='w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-sm font-medium cursor-pointer'>
                <option value="All">All Assignments</option>
                <option value="Network">Network Wide (HQ)</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.branch_name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className='bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden'>
          <div className='overflow-x-auto'>
            <table className='min-w-full divide-y divide-slate-200'>
              <thead className='bg-slate-50'>
                <tr>
                  <th onClick={() => handleSort('user_fullname')} className='px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none'>
                    User Profile <SortIcon columnKey="user_fullname" />
                  </th>
                  <th onClick={() => handleSort('user_ic')} className='px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none'>
                    Identity <SortIcon columnKey="user_ic" />
                  </th>
                  <th onClick={() => handleSort('role_id')} className='px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none'>
                    Role & Branch <SortIcon columnKey="role_id" />
                  </th>
                  <th onClick={() => handleSort('user_is_active')} className='px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none'>
                    Status <SortIcon columnKey="user_is_active" />
                  </th>
                  <th className='px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider'>Actions</th>
                </tr>
              </thead>
              <tbody className='bg-white divide-y divide-slate-100'>
                {currentUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500 font-medium">No user accounts match your active filters.</td>
                  </tr>
                ) : (
                  currentUsers.map((user) => {
                    const branchName = branches.find(b => b.id === user.branch_id)?.branch_name || 'Network Wide';
                    
                    return (
                      <tr key={user.user_id} className='hover:bg-slate-50/50 transition-colors'>
                        <td className='px-6 py-4 whitespace-nowrap'>
                          <div className='flex items-center'>
                            <div className='h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold'>
                              {user.user_fullname.charAt(0).toUpperCase()}
                            </div>
                            <div className='ml-4'>
                              <div className='text-sm font-bold text-slate-900'>{user.user_fullname}</div>
                              <div className='text-sm text-slate-500'>{user.user_email}</div>
                              <div className='text-xs text-slate-400 mt-0.5 flex items-center gap-1.5'><FiPhone /> {user.user_contact_number || 'No Contact'}</div>
                            </div>
                          </div>
                        </td>
                        <td className='px-6 py-4 whitespace-nowrap'>
                          <div className='text-sm text-slate-900 font-medium'>{user.user_ic}</div>
                          <div className='text-xs text-slate-400'>{user.user_gender || 'Unspecified'}</div>
                        </td>
                        <td className='px-6 py-4 whitespace-nowrap'>
                          <span className='px-2.5 py-1 inline-flex text-xs leading-5 font-bold rounded-md bg-blue-50 text-blue-700 mb-1 border border-blue-100'>
                            {roleMap[user.role_id] || 'Unknown Role'}
                          </span>
                          <div className='text-xs text-slate-500 font-medium truncate max-w-[200px] flex items-center gap-1.5'><FiMapPin /> {branchName}</div>
                        </td>
                        <td className='px-6 py-4 whitespace-nowrap'>
                          <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-bold rounded-full ${user.user_is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {user.user_is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className='px-6 py-4 whitespace-nowrap text-right text-sm font-medium'>
                          <button onClick={() => openEditModal(user)} className='text-blue-600 hover:text-blue-900 font-bold mr-4'>Edit</button>
                          <button onClick={() => toggleUserStatus(user)} className={`${user.user_is_active ? 'text-red-600 hover:text-red-900' : 'text-emerald-600 hover:text-emerald-900'} font-bold`}>
                            {user.user_is_active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className='px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between'>
              <div className='text-sm text-slate-600 font-medium'>
                Showing <span className='font-bold text-slate-900'>{indexOfFirstItem + 1}</span> to <span className='font-bold text-slate-900'>{Math.min(indexOfLastItem, sortedUsers.length)}</span> of <span className='font-bold text-slate-900'>{sortedUsers.length}</span> users
              </div>
              <div className='flex gap-2'>
                <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className='px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors'>Previous</button>
                <div className='flex items-center px-3 text-sm font-bold text-slate-700'>Page {currentPage} of {totalPages}</div>
                <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className='px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors'>Next</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className='fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4'>
          <div className='bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in duration-200'>
            <div className='px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50'>
              <h2 className='text-xl font-extrabold text-slate-900'>
                {editingId ? 'Edit User Profile' : 'Add User'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className='text-slate-400 hover:text-slate-600 text-2xl'>&times;</button>
            </div>
            
            <form onSubmit={handleSaveUser} className='p-8 overflow-y-auto max-h-[75vh]'>
              
              <div className='mb-6'>
                <h3 className='text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4'>Core Identity</h3>
                <div className='grid grid-cols-2 gap-5'>
                  <div className='col-span-2 md:col-span-1'>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Full Name (As per IC)</label>
                    <input type='text' name='fullname' required className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500' value={formData.fullname} onChange={handleInputChange} />
                  </div>
                  <div className='col-span-2 md:col-span-1'>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Email Address</label>
                    <input type='email' name='email' required className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500' value={formData.email} onChange={handleInputChange} />
                  </div>
                  <div>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Identity Card (IC)</label>
                    <input type='text' name='ic' required className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500' value={formData.ic} onChange={handleInputChange} />
                  </div>
                  <div>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Contact Number</label>
                    <input type='text' name='contact_number' required className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500' value={formData.contact_number} onChange={handleInputChange} />
                  </div>
                  <div>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Gender</label>
                    <select name='gender' className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 appearance-none' value={formData.gender} onChange={handleInputChange}>
                      <option value=''>Select...</option>
                      <option value='Male'>Male</option>
                      <option value='Female'>Female</option>
                    </select>
                  </div>
                  <div>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Temporary Login Password</label>
                    <input type='password' name='password' required={!editingId} placeholder={editingId ? '(Leave blank to keep current)' : ''} className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500' value={formData.password} onChange={handleInputChange} />
                  </div>
                </div>
              </div>

              <div className='mb-6'>
                <h3 className='text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4'>System Access</h3>
                <div className='grid grid-cols-2 gap-5'>
                  <div>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Assign User Role</label>
                    <select name='role_id' required className='w-full p-3 bg-blue-50 border border-blue-200 text-blue-800 font-semibold rounded-xl outline-none focus:border-blue-500 appearance-none' value={formData.role_id} onChange={handleInputChange}>
                      <option value=''>Select a role...</option>
                      {Object.entries(roleMap).map(([id, name]) => (
                        <option key={id} value={id}>{name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>{formData.role_id === '5' ? 'Home Branch' : 'Branch Assignment'}</label>
                    <select name='branch_id' required={formData.role_id === '5'} className='w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 appearance-none' value={formData.branch_id} onChange={handleInputChange}>
                      <option value=''>Network Wide (HQ)</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id.toString()}>{b.branch_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {['1', '2', '3', '4'].includes(formData.role_id) && (
                <div className='mb-6 animate-in fade-in slide-in-from-top-4 duration-300'>
                  <h3 className='text-sm font-bold text-blue-800 border-b border-blue-200 pb-2 mb-4'>Professional Profile</h3>
                  <div className='bg-blue-50/50 p-5 rounded-2xl border border-blue-100 grid grid-cols-3 gap-5'>
                    <div className='col-span-3 md:col-span-1'>
                      <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>License Number</label>
                      <input type='text' name='license_number' placeholder="e.g. MMC-12345" className='w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500' value={formData.license_number} onChange={handleInputChange} />
                    </div>
                    <div className='col-span-3 md:col-span-1'>
                      <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Max Weekly Hours</label>
                      <input type='number' name='max_hours' required className='w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500' value={formData.max_hours} onChange={handleInputChange} />
                    </div>
                    <div className='col-span-3 md:col-span-1'>
                      <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Employment Status</label>
                      <select name='employment_status' required className='w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 appearance-none' value={formData.employment_status} onChange={handleInputChange}>
                        <option value='Full-Time'>Full-Time</option>
                        <option value='Part-Time'>Part-Time</option>
                        <option value='Contract'>Contract</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {formData.role_id === '5' && (
                <div className='mb-6 animate-in fade-in slide-in-from-top-4 duration-300'>
                  <h3 className='text-sm font-bold text-emerald-700 border-b border-emerald-200 pb-2 mb-4'>Patient Logistics</h3>
                  <div className='bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100 grid grid-cols-2 gap-5'>
                    <div className='col-span-2 md:col-span-1'>
                      <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Residential Address</label>
                      <input type='text' name='patient_address' required className='w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-500' value={formData.patient_address} onChange={handleInputChange} />
                    </div>
                    <div className='col-span-2 md:col-span-1'>
                      <label className='block text-xs font-bold text-slate-500 uppercase mb-2'>Blood Type</label>
                      <select name='blood_type' required className='w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-500 appearance-none' value={formData.blood_type} onChange={handleInputChange}>
                        <option value=''>Select...</option>
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>

                    <div className='col-span-2 mt-2 bg-slate-100/70 p-4 rounded-xl border border-slate-200 flex items-center gap-4'>
                      <div className='text-2xl text-slate-400'><FiLock /></div>
                      <div>
                        <p className='text-sm font-bold text-slate-700'>Clinical Data Restricted</p>
                        <p className='text-xs text-slate-500 mt-1'>Hepatitis Serology and medical clearance inputs are masked for administrative staff in compliance with PDPA. Clinical staff will update these records separately.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {error && <div className='p-3 bg-red-50 text-red-600 text-xs font-bold rounded-lg border border-red-100 mt-2'>{error}</div>}

              <div className='pt-6 border-t border-slate-100 flex gap-3'>
                <button type='button' onClick={() => setIsModalOpen(false)} className='flex-1 py-3.5 border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors'>Cancel</button>
                <button type='submit' disabled={isSubmitting} className='flex-1 bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 disabled:bg-blue-300 shadow-lg shadow-blue-500/20 transition-all'>
                  {isSubmitting ? 'Processing...' : editingId ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}