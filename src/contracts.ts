export type ReturnInput = {captureId: string; returnId: string; currency: 'AUD'; amountCents: number};
export type RefundRequest = ReturnInput & {refundKey: string; inputHash: string};
export type Decision = {decisionId: string; returnId: string; reviewerId: string; choice: 'approve' | 'reject'};
export type Receipt = {refundKey: string; inputHash: string; status: 'committed' | 'rejected'; receiptId: string};
export type Outcome = 'refunded' | 'rejected' | 'expired' | 'cancelled' | 'failed_compensated' | 'uncertain' | 'reconciliation_required';
export type ReturnResult = {outcome: Outcome; request: RefundRequest; decision: Decision | null; cancellationRequested: boolean; receiver: Receipt | null; reservation: 'open' | 'held' | 'released' | 'consumed' | 'unconfirmed'; ignoredDecisions: number};
export class PermanentError extends Error {constructor(public code:string){super(code);}}
function record(v:unknown):Record<string,unknown>{if(!v || typeof v!=='object' || Array.isArray(v))throw new PermanentError('invalid_input');return v as Record<string,unknown>;}
export function validId(v:unknown):v is string{return typeof v==='string' && /^[A-Za-z0-9_-]{1,48}$/.test(v);}
export function parseReturn(value: unknown): ReturnInput {
  const r=record(value);
  if(!validId(r.captureId)||!validId(r.returnId)||r.currency!=='AUD'||!Number.isSafeInteger(r.amountCents)||(r.amountCents as number)<=0)throw new PermanentError('invalid_input');
  return {captureId:r.captureId,returnId:r.returnId,currency:'AUD',amountCents:r.amountCents as number};
}
export function makeRequest(input: ReturnInput): RefundRequest {
  const r=parseReturn(input);
  const {createHash}=require('node:crypto') as typeof import('node:crypto');
  return {...r,refundKey:`refund/${r.captureId}/${r.returnId}`,inputHash:createHash('sha256').update(JSON.stringify(r)).digest('hex')};
}
export function validateRequest(value:unknown):RefundRequest {
  const r=record(value), expected=makeRequest(parseReturn(value));
  if(r.refundKey!==expected.refundKey||r.inputHash!==expected.inputHash)throw new PermanentError('identity_conflict');
  return expected;
}
export function parseDecision(value: unknown): Decision {
  const d=record(value);
  if(!validId(d.decisionId)||!validId(d.returnId)||!validId(d.reviewerId)||!['approve','reject'].includes(d.choice as string))throw new PermanentError('invalid_decision');
  return d as Decision;
}
