import { validateDischargeVitals } from '@/utils/validationHelpers';

describe('Unit Test: Nurse UI Discharge Safety Lock (T036)', () => {
  
  it('should disable discharge if Post-BP Systolic is impossible', () => {
    const impossibleSystolic = '50000';
    const normalDiastolic = '80';
    const result = validateDischargeVitals(impossibleSystolic, normalDiastolic);
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Vitals exceed safe limits.');
  });

  it('should accept normal post-dialysis vitals', () => {
    const result = validateDischargeVitals('120', '80');
    expect(result.isValid).toBe(true);
  });
});