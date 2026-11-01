import {test} from 'node:test';
import assert from 'node:assert/strict';
import Long from 'long';
import {historyFromJSON} from '@temporalio/common/lib/proto-utils';
import {encodeHistory} from '../src/acceptance/history';
import {finishResources} from '../src/acceptance/lifecycle';
test('history JSON preserves nanosecond timestamps and large event IDs for SDK replay',()=>{
 const source={events:[{
  eventId:Long.fromString('9007199254740993'),
  eventTime:{seconds:Long.fromString('1793491200'),nanos:123456789},
  workflowExecutionStartedEventAttributes:{input:{payloads:[{metadata:{encoding:Buffer.from('json/plain')},data:Buffer.from('{"ok":true}')}]}},
 }]};
 const json=encodeHistory(source) as any;assert.equal(typeof json.events[0].eventTime,'string');
 const parsed=historyFromJSON(json),first=parsed.events![0];
 assert.equal(first.eventId!.toString(),'9007199254740993');assert.equal(first.eventTime!.nanos,123456789);
 assert.equal(Buffer.from(first.workflowExecutionStartedEventAttributes!.input!.payloads![0].data!).toString(),'{"ok":true}');
});
test('capture connections close before backend shutdown',async()=>{
 let live=true,persisted=false;const errors:unknown[]=[];
 await assert.doesNotReject(()=>finishResources(async()=>{live=false;},async()=>{if(live)throw Error('connection_terminated');},async()=>{persisted=true;},e=>errors.push(e)));
 assert.equal(persisted,true);assert.equal(live,false);assert.deepEqual(errors,[]);
});
test('backend stop failure is retained and final report still persists',async()=>{
 let persisted=false;const errors:unknown[]=[];
 await assert.doesNotReject(()=>finishResources(async()=>{},async()=>{throw Error('backend_shutdown_error');},async()=>{persisted=true;},e=>errors.push(e)));
 assert.equal(persisted,true);assert.equal(errors.length,1);
});
