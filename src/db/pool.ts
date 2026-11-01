import {Pool} from 'pg';
export function openPool(role?:'p28_worker'|'p28_receiver'|'p28_reader'):Pool{
  const url=new URL(process.env.DATABASE_URL!); if(role)url.username=role;
  return new Pool({connectionString:url.toString(),max:4,statement_timeout:1000,lock_timeout:500,connectionTimeoutMillis:2000});
}
