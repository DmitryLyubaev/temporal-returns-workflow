import {historyToJSON,History} from '@temporalio/common/lib/proto-utils';
export function encodeHistory(history:History):unknown{return JSON.parse(historyToJSON(history));}
