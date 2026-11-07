import { it, expect } from 'vitest';
import { addonQuantity } from '../../src/lib/customer/addon-input';
it('interprets empty only on submission and validates integer quantities', () => {
  for (const [raw, expected] of [['',0],['0',0],['1',1],['10',10],['01',1]] as const)
    expect(addonQuantity(raw)).toBe(expected);
  for (const raw of ['-1','1.5','11','abc','1e1',' 1','Infinity'])
    expect(addonQuantity(raw)).toBeUndefined();
});
