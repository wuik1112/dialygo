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

export function validateDischargeVitals(bpSys: string, bpDia: string) {
  // If fields are empty, we let the HTML 'required' tag handle it, so we return true
  if (!bpSys || !bpDia) return { isValid: true, errorMessage: '' };

  const sys = parseInt(bpSys);
  const dia = parseInt(bpDia);

  // Impossible Systolic Blood Pressure
  if (sys > 300 || sys < 40) {
    return { isValid: false, errorMessage: 'Vitals exceed safe limits.' };
  }
  
  // Impossible Diastolic Blood Pressure
  if (dia > 200 || dia < 20) {
    return { isValid: false, errorMessage: 'Vitals exceed safe limits.' };
  }

  return { isValid: true, errorMessage: '' };
}


// src/utils/validationHelpers.ts

export function validateManagerApproval(
  bookingType: string, 
  serologyUrl: string | null | undefined, 
  referralUrl: string | null | undefined, 
  isCancelRequest: boolean, 
  selectedMachineId: string
) {
  
  // Rule 1: Travel bookings MUST have both documents
  if (bookingType === 'Travel') {
    if (!serologyUrl || !referralUrl) {
      return { 
        isValid: false, 
        errorMessage: 'Missing mandatory medical documents' 
      };
    }
  }

  // Rule 2: If it's not a cancellation, a machine MUST be assigned
  if (!isCancelRequest && !selectedMachineId) {
    return { 
      isValid: false, 
      errorMessage: 'Please assign a machine slot' 
    };
  }

  // If all rules pass
  return { isValid: true, errorMessage: '' };
}

// src/utils/validationHelpers.ts

export function validateMachineDeactivation(activeTreatmentsCount: number, futureBookingsCount: number) {
  // EXCEPTION 6(a): Active Treatment Check
  if (activeTreatmentsCount > 0) {
    return { 
      isValid: false, 
      errorMessage: 'Safety Violation: Cannot update status while treatment is in progress.' 
    };
  }

  // EXCEPTION 8(a): Conflicting Upcoming Bookings Check
  if (futureBookingsCount > 0) {
    return { 
      isValid: false, 
      errorMessage: `Cannot deactivate machine. There are ${futureBookingsCount} upcoming bookings. Please reschedule them first.` 
    };
  }

  return { isValid: true, errorMessage: '' };
}