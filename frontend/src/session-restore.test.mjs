import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionRestoreAction} from './session-restore.ts';
test('only rejected authentication clears a saved session; outages and invalid gateway payloads permit retry',()=>{
 for(const status of [401,403])assert.equal(sessionRestoreAction(Object.assign(new Error('Rejected'),{status})),'sign-in');
 for(const status of [0,408,429,500,502,503,504])assert.equal(sessionRestoreAction(Object.assign(new Error('Unavailable'),{status})),'retry');
 for(const error of [new TypeError('Failed to fetch'),new SyntaxError('Unexpected HTML'),new Error('Offline'),null])assert.equal(sessionRestoreAction(error),'retry');
});
