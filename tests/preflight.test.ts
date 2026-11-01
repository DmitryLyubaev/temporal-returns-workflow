import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requireReady,requireOwned} from '../src/config.ts';
test('preflight_refuses_busy_port',()=>{assert.throws(()=>requireReady({freeRamGiB:8,freeHostRamGiB:2,freeDiskGiB:20,busyPorts:[5488]}));});
test('preflight refuses full startup when memory or disk unavailable',()=>{
 assert.throws(()=>requireReady({freeRamGiB:5,freeHostRamGiB:2,freeDiskGiB:20,busyPorts:[]}));
 assert.throws(()=>requireReady({freeRamGiB:8,freeHostRamGiB:2,freeDiskGiB:9,busyPorts:[]}));
 assert.throws(()=>requireReady({freeRamGiB:8,freeHostRamGiB:0.25,freeDiskGiB:20,busyPorts:[]}));
});
test('resident WSL cache headroom permits bounded work with a host margin',()=>{assert.doesNotThrow(()=>requireReady({freeRamGiB:8,freeHostRamGiB:0.75,freeDiskGiB:20,busyPorts:[]}));});
test('cleanup_does_not_touch_other_project',()=>{
 assert.throws(()=>requireOwned({Id:'owned-id',Config:{Labels:{'com.docker.compose.project':'someone-else'}}},'p28-test','owned-id'));
 assert.throws(()=>requireOwned({Id:'wrong-id',Config:{Labels:{'com.docker.compose.project':'p28-test'}}},'p28-test','owned-id'));
});
