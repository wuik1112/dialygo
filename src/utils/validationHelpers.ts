export function checkSerologyEligibility(lastSerologyDate: string, draftDate: string, travelStatus: string) {
  const serologyDate = new Date(lastSerologyDate);
  const expiryDate = new Date(serologyDate);
  expiryDate.setMonth(expiryDate.getMonth() + 6); 
  
  const expiryDateString = expiryDate.toLocaleDateString('en-GB', { 
    day: '2-digit', month: 'short', year: 'numeric' 
  });

  const selectedBDate = new Date(draftDate);
  const isEligibleForSelectedDate = travelStatus === 'Active' && selectedBDate <= expiryDate; 

  return { isEligibleForSelectedDate, expiryDateString };
}

// src/utils/validationHelpers.ts

export function validatePreFlightData(
  bpSys: string, bpDia: string, hr: string, temp: string, preWeight: string, 
  dialyser: string, dialysate: string
) {
  if (!dialyser.trim() || !dialysate.trim()) {
    return { isValid: false, errorMessage: 'Missing Dialyser or Dialysate configuration.' };
  }

  if (!bpSys || !bpDia || !hr || !temp || !preWeight) {
    return { isValid: true, errorMessage: '' }; 
  }

  const sys = parseInt(bpSys);
  const dia = parseInt(bpDia);
  const heartRate = parseInt(hr);
  const temperature = parseFloat(temp);
  const weight = parseFloat(preWeight);

  // ---------------------------------------------------------
  // LAYER 1: DATA ENTRY ERROR LOCKS (Physically Impossible)
  // ---------------------------------------------------------
  if (sys > 300 || sys < 40 || dia > 200 || dia < 20) {
    return { isValid: false, errorMessage: 'Data Error: Blood pressure values are physically impossible.' };
  }
  if (heartRate > 250 || heartRate < 30) {
    return { isValid: false, errorMessage: 'Data Error: Heart rate values are physically impossible.' };
  }
  if (temperature > 43.0 || temperature < 30.0) {
    return { isValid: false, errorMessage: 'Data Error: Temperature value is impossible.' };
  }
  if (weight < 20 || weight > 350) {
    return { isValid: false, errorMessage: 'Data Error: Patient weight is out of standard range.' };
  }

  // ---------------------------------------------------------
  // LAYER 2: CLINICAL SAFETY LOCKS (Dangerous but possible)
  // ---------------------------------------------------------
  if (sys > 180 || dia > 110) {
    return { isValid: false, errorMessage: 'Clinical Lock: Vitals exceed safe limits (Hypertension).' };
  }
  if (temperature >= 37.8) {
    return { isValid: false, errorMessage: 'Clinical Lock: Vitals exceed safe limits (Fever detected).' };
  }
  
  // ---> THE NEW HEART RATE LOCK <---
  // Normal resting HR is 60-100. We block below 50 (severe bradycardia) or above 130 (severe tachycardia)
  if (heartRate < 50 || heartRate > 130) {
    return { isValid: false, errorMessage: 'Clinical Lock: Abnormal heart rate detected. Doctor clearance required.' };
  }

  return { isValid: true, errorMessage: '' };
}

export function validateBookingRule(ruleName: string, value: number) {
  if (ruleName === 'cancellation_cutoff') {
    if (value <= 0) {
      return { 
        isValid: false, 
        errorMessage: 'Error: Value must be a positive integer greater than zero.' 
      };
    }
    if (value > 168) {
      return { 
        isValid: false, 
        errorMessage: 'Error: Cancellation cut-off cannot exceed 168 hours (7 days).' 
      };
    }
  }
  
  return { isValid: true, errorMessage: '' };
}


export function validateDischargeVitals(bpSys: string, bpDia: string, hr: string, weight: string) {
  if (!bpSys || !bpDia || !hr || !weight) return { isValid: true, errorMessage: '' };

  const sys = parseInt(bpSys);
  const dia = parseInt(bpDia);
  const heartRate = parseInt(hr);
  const postWeight = parseFloat(weight);

  if (sys > 300 || sys < 40 || dia > 200 || dia < 20) {
    return { isValid: false, errorMessage: 'Blood pressure exceeds safe limits.' };
  }
  if (heartRate > 220 || heartRate < 30) {
    return { isValid: false, errorMessage: 'Heart rate exceeds safe limits.' };
  }
  if (postWeight > 300 || postWeight < 20) {
    return { isValid: false, errorMessage: 'Patient weight exceeds safe limits.' };
  }

  return { isValid: true, errorMessage: '' };
}

export function validateHourlyVitals(bpSys: string, bpDia: string, vp: string, tmp: string, uf: string, bf: string) {
  if (!bpSys || !bpDia || !vp || !tmp || !uf || !bf) return { isValid: true, errorMessage: '' };

  if (parseInt(bpSys) > 300 || parseInt(bpSys) < 40 || parseInt(bpDia) > 200 || parseInt(bpDia) < 20) {
    return { isValid: false, errorMessage: 'Blood pressure exceeds safe limits.' };
  }

  if (parseFloat(vp) > 400 || parseFloat(vp) < -100) return { isValid: false, errorMessage: 'Venous Pressure (V/P) out of range.' };
  if (parseFloat(tmp) > 500 || parseFloat(tmp) < -100) return { isValid: false, errorMessage: 'Transmembrane Pressure (TMP) out of range.' };
  

  if (parseFloat(uf) > 4.0 || parseFloat(uf) < 0) return { isValid: false, errorMessage: 'UF Rate is clinically unsafe.' };
  if (parseInt(bf) > 600 || parseInt(bf) < 0) return { isValid: false, errorMessage: 'Blood Flow (B/F) is clinically unsafe.' };

  return { isValid: true, errorMessage: '' };
}

export function validateManagerApproval(
  bookingType: string, 
  serologyUrl: string | null | undefined, 
  referralUrl: string | null | undefined, 
  isCancelRequest: boolean, 
  selectedMachineId: string
) {

  if (bookingType === 'Travel') {
    if (!serologyUrl || !referralUrl) {
      return { 
        isValid: false, 
        errorMessage: 'Missing mandatory medical documents' 
      };
    }
  }

  if (!isCancelRequest && !selectedMachineId) {
    return { 
      isValid: false, 
      errorMessage: 'Please assign a machine slot' 
    };
  }

  return { isValid: true, errorMessage: '' };
}

export function validateMachineDeactivation(activeTreatmentsCount: number, futureBookingsCount: number) {
  if (activeTreatmentsCount > 0) {
    return { 
      isValid: false, 
      errorMessage: 'Safety Violation: Cannot update status while treatment is in progress.' 
    };
  }

  if (futureBookingsCount > 0) {
    return { 
      isValid: false, 
      errorMessage: `Cannot deactivate machine. There are ${futureBookingsCount} upcoming bookings. Please reschedule them first.` 
    };
  }

  return { isValid: true, errorMessage: '' };
}

