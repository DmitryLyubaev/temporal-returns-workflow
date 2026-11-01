import {Pool} from 'pg';
import {Context} from '@temporalio/activity';
import {reservationActivities,ActivityRuntime} from './reservations';
import {paymentActivities} from './payment';
export function createActivities(pool:Pool,base:string,runtime:ActivityRuntime={attempt:()=>Context.current().info.attempt,heartbeat:()=>Context.current().heartbeat(),cancelled:()=>Context.current().cancellationSignal.aborted}){return {...reservationActivities(pool,runtime),...paymentActivities(pool,base,runtime)};}
