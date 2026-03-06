"use client";
import { useState } from 'react';
import { bookingService } from '../services/bookingService';

export default function Dashboard() {
  const [log, setLog] = useState<string>("System idle.");

  const handleBooking = async (branchId: number, patientId: number) => {
    setLog("Initiating atomic capacity check...");
    const today = new Date().toISOString().split('T')[0];

    try {
      const result = await bookingService.requestBooking(branchId, patientId, today);
      setLog(`✅ Success: ${result}`);
    } catch (error: any) {
      setLog(`❌ Rejected: ${error.message}`);
    }
  };

  return (
    <main className="p-8 font-sans">
      <h1 className="text-2xl font-bold mb-4">DialyGo System Test</h1>
      
      <div className="flex gap-4 mb-8">
        <button 
          onClick={() => handleBooking(1, 1)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Test Valid Patient Transfer
        </button>
        
        <button 
          onClick={() => handleBooking(1, 2)}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          Test Expired Serology Transfer
        </button>
      </div>

      <div className="bg-gray-100 p-4 border border-gray-300 rounded">
        <h3 className="font-semibold text-sm text-gray-500 mb-2">SYSTEM LOG</h3>
        <p className="font-mono text-sm">{log}</p>
      </div>
    </main>
  );
}