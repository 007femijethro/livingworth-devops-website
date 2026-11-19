import test from 'node:test';
import assert from 'node:assert/strict';
import {intakeQuote} from '../dist/intake-offer.js';
import {validateSettings} from '../dist/academy-settings.js';
const settings={applicationCohort:'C',onlineFee:150000,physicalFee:300000,offerClosingDate:'2027-01-15'};
test('Cohort C quotes physical and hybrid equally and uses WAT closing boundary',()=>{
 const before=new Date('2027-01-15T22:59:59.999Z');
 assert.equal(intakeQuote(settings,'Online',before).fee,150000);
 for(const mode of ['Physical (In-person)','Hybrid (Mix of online & physical)'])assert.deepEqual(intakeQuote(settings,mode,before),{fee:300000,currency:'NGN',offerClosesAt:before.toISOString()});
 assert.equal(intakeQuote(settings,'Online',new Date('2027-01-15T23:00:00Z')).fee,null);
 assert.equal(intakeQuote({...settings,applicationCohort:'B'},'Online',before).fee,null);
 assert.throws(()=>intakeQuote(settings,'made-up',before));
});
test('offer controls reject invalid dates and fees',()=>{
 assert.deepEqual(validateSettings({onlineFee:150000,physicalFee:300000,offerClosingDate:'2027-01-15'}),{onlineFee:150000,physicalFee:300000,offerClosingDate:'2027-01-15'});
 for(const input of [{offerClosingDate:'2027-02-30'},{offerClosingDate:'15 January'},{onlineFee:-1},{physicalFee:0},{onlineFee:'150000'}])assert.throws(()=>validateSettings(input));
});
