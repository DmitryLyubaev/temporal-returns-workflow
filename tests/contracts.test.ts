import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseReturn, makeRequest, parseDecision} from '../src/contracts';
const valid = {captureId:'test', returnId:'R01', currency:'AUD', amountCents:1000};
test('reject_unsafe_identity', () => {
  for (const v of [{...valid, amountCents: Number.MAX_SAFE_INTEGER + 1}, {...valid, amountCents:'1000'}, {...valid, amountCents:0}, {...valid, captureId:'a/b'}, {...valid,currency:'USD'}, null]) {
    assert.throws(() => parseReturn(v));
  }
});
test('stable independently specified refund identity and input binding', () => {
  const r = makeRequest(parseReturn(valid));
  assert.equal(r.refundKey, 'refund/test/R01');
  assert.match(r.inputHash,/^[a-f0-9]{64}$/);
  assert.notEqual(makeRequest(parseReturn({...valid, amountCents:999})).inputHash,r.inputHash);
});
test('decision shape rejects coercion and invalid choice', () => {
  assert.throws(() => parseDecision({decisionId:'d',returnId:'R01',reviewerId:'reviewer-demo',choice:'yes'}));
});
