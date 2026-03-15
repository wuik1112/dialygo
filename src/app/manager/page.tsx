"use client";
import { useState, useEffect } from 'react';
import { bookingService } from '../../services/bookingService';

export default function ManagerDashboard() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch data on page load
  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      const data = await bookingService.getPendingBookings();
      setBookings(data || []);
    } catch (error: any) {
      console.error("Detailed Error:", error);
      alert("Database Error: " + error.message); // This will show us the exact issue
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (bookingId: number) => {
    try {
      await bookingService.approveBooking(bookingId);
      // Refresh list after approval
      fetchBookings();
      alert("Booking successfully confirmed!");
    } catch (error) {
      alert("Error confirming booking.");
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-800 mb-6">Branch Manager Portal</h1>
        
        <div className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
          <div className="bg-slate-800 p-4 text-white">
            <h2 className="font-semibold text-lg">Pending Clinical Reviews</h2>
          </div>
          
          <div className="p-0">
            {loading ? (
              <p className="p-6 text-slate-500">Loading system data...</p>
            ) : bookings.length === 0 ? (
              <p className="p-6 text-slate-500">No pending requests at this time.</p>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200">
                    <th className="p-4 font-semibold text-slate-600">Patient</th>
                    <th className="p-4 font-semibold text-slate-600">Serology Date</th>
                    <th className="p-4 font-semibold text-slate-600">Branch</th>
                    <th className="p-4 font-semibold text-slate-600">Status</th>
                    <th className="p-4 font-semibold text-slate-600">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="p-4 text-slate-800 font-medium">{b.patients?.patient_name}</td>
                      <td className="p-4 text-slate-600">{b.patients?.last_serology_date}</td>
                      <td className="p-4 text-slate-600">{b.branches?.branch_name}</td>
                      <td className="p-4">
                        <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-3 py-1 rounded-full">
                          {b.status}
                        </span>
                      </td>
                      <td className="p-4">
                        <button 
                          onClick={() => handleApprove(b.id)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded shadow-sm text-sm font-bold transition-colors"
                        >
                          Approve
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}