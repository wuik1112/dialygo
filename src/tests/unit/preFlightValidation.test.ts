import { validatePreFlightData } from '@/utils/validationHelpers';

describe('Unit Test: Nurse UI Pre-Flight Safety Lock (T032)', () => {
  
  it('should accept the exact clinical data provided by the nurse', () => {
    const result = validatePreFlightData('122', '82', '72', '36.5', '75.2', 'F.17H', 'K2');
    expect(result.isValid).toBe(true);
    expect(result.errorMessage).toBe('');
  });

  it('should block physically impossible blood pressure typos', () => {
    const result = validatePreFlightData('1000', '82', '72', '36.5', '75.2', 'F.17H', 'K2');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Data Error: Blood pressure values are physically impossible.');
  });

  it('should block physically impossible weight typos', () => {
    const result = validatePreFlightData('122', '82', '72', '36.5', '7500', 'F.17H', 'K2');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Data Error: Patient weight is out of standard range.');
  });

  it('should trigger Clinical Lock if Systolic BP indicates severe hypertension', () => {
    const result = validatePreFlightData('190', '82', '72', '36.5', '75.2', 'F.17H', 'K2');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Clinical Lock: Vitals exceed safe limits (Hypertension).');
  });

  it('should block commencement if equipment fields are missing', () => {
    const result = validatePreFlightData('122', '82', '72', '36.5', '75.2', '', 'K2');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Missing Dialyser or Dialysate configuration.');
  });
});

it('should trigger Clinical Lock if Heart Rate indicates severe Tachycardia', () => {
    const result = validatePreFlightData('122', '82', '145', '36.5', '75.2', 'F.17H', 'K2');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Clinical Lock: Abnormal heart rate detected. Doctor clearance required.');
  });

  it('should trigger Clinical Lock if Heart Rate indicates severe Bradycardia', () => {
    const result = validatePreFlightData('122', '82', '45', '36.5', '75.2', 'F.17H', 'K2');
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Clinical Lock: Abnormal heart rate detected. Doctor clearance required.');
  });