import { validateMachineDeactivation } from '@/utils/validationHelpers'; 

describe('Unit Test: Machine Status Safety Lock (T021)', () => {
  
  it('should prevent setting a machine to Under Maintenance if an active session is ongoing', () => {
    const activeTreatmentsCount = 1; 
    const futureBookingsCount = 0;

    const result = validateMachineDeactivation(activeTreatmentsCount, futureBookingsCount);

    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Safety Violation: Cannot update status while treatment is in progress.');
  });

  it('should allow deactivation if the machine is completely free', () => {
    const result = validateMachineDeactivation(0, 0);
    expect(result.isValid).toBe(true);
  });
});
