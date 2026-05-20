import { validateDischargeVitals, validateHourlyVitals } from '@/utils/validationHelpers';

describe('Unit Test: Clinical Safety Locks', () => {
  describe('Discharge Vitals (T036)', () => {
    it('should disable discharge if Post-BP or Weight is impossible', () => {
      const result = validateDischargeVitals('50000', '80', '75', '65.5');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Blood pressure exceeds safe limits.');

      const weightResult = validateDischargeVitals('120', '80', '75', '500');
      expect(weightResult.isValid).toBe(false);
      expect(weightResult.errorMessage).toBe('Patient weight exceeds safe limits.');
    });

    it('should accept normal post-dialysis vitals', () => {
      const result = validateDischargeVitals('120', '80', '75', '65.5');
      expect(result.isValid).toBe(true);
    });
  });

  describe('Hourly Flow Sheet Vitals (T034)', () => {
    it('should block hourly chart if machine pressures are impossible', () => {
      const result = validateHourlyVitals('120', '80', '9000', '98', '0.80', '299'); 
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('Venous Pressure (V/P) out of range.');
    });

    it('should accept the normal flow sheet vitals', () => {
      const result = validateHourlyVitals('120', '80', '149', '98', '0.80', '299');
      expect(result.isValid).toBe(true);
    });
  });
});