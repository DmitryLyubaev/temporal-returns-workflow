import {Pool} from 'pg';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function migrate(pool: Pool):Promise<void>{
  const c=await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(await readFile(resolve('src/db/001-initial.sql'),'utf8'));
    const password=decodeURIComponent(new URL(process.env.DATABASE_URL!).password);
    await c.query("SELECT set_config('p28.password',$1,true)",[password]);
    await c.query(`DO $body$ DECLARE r text; BEGIN
      FOREACH r IN ARRAY ARRAY['p28_worker','p28_receiver','p28_reader'] LOOP
        IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=r) THEN EXECUTE format('CREATE ROLE %I LOGIN',r); END IF;
        EXECUTE format('ALTER ROLE %I PASSWORD %L',r,current_setting('p28.password'));
      END LOOP;
    END $body$`);
    await c.query(`GRANT USAGE ON SCHEMA public TO p28_worker,p28_receiver,p28_reader;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO p28_worker,p28_receiver,p28_reader;
      GRANT INSERT,UPDATE ON reservations,fixture_control TO p28_worker;
      GRANT INSERT ON activity_attempts TO p28_worker;
      GRANT INSERT ON receiver_outcomes,receiver_effects,wire_attempts TO p28_receiver;
      GRANT UPDATE ON fixture_control TO p28_receiver;`);
    await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
if(require.main===module){const p=new Pool({connectionString:process.env.DATABASE_URL});migrate(p).then(()=>p.end()).catch(e=>{console.error(e.message);process.exitCode=1;return p.end();});}
