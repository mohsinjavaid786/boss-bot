import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type {Agent,Task} from '../../../packages/core/src/index.ts';
export class Store {
 private db:DatabaseSync;
 constructor(path:string){
  this.db=new DatabaseSync(path);
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
   CREATE TABLE IF NOT EXISTS agents(id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL,instructions TEXT NOT NULL,memory TEXT NOT NULL DEFAULT '',color TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,agentId TEXT NOT NULL REFERENCES agents(id),prompt TEXT NOT NULL,runtimeId TEXT NOT NULL,status TEXT NOT NULL,output TEXT NOT NULL DEFAULT '',createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,taskId TEXT NOT NULL,event TEXT NOT NULL,createdAt TEXT NOT NULL);
   PRAGMA user_version=1;`);
  if(!this.agents().length){
   this.addAgent('Atlas','Research & strategy','Produce clear, sourced research. Separate facts from assumptions.','blue');
   this.addAgent('Nova','Writing & communication','Write concise, thoughtful drafts. Never claim a message was sent.','violet');
   this.addAgent('Milo','Operations & planning','Turn broad goals into concrete, actionable plans.','teal');
  }
  for(const task of this.tasks().filter(t=>t.status==='running'))this.finish(task.id,'interrupted','Server restarted during execution. Review before creating a new task.');
 }
 agents():Agent[]{return this.db.prepare('SELECT * FROM agents ORDER BY rowid').all() as unknown as Agent[];}
 addAgent(name:string,role:string,instructions:string,color='blue'){const id=randomUUID();this.db.prepare('INSERT INTO agents(id,name,role,instructions,color) VALUES(?,?,?,?,?)').run(id,name,role,instructions,color);return id;}
 memory(id:string,memory:string){const result=this.db.prepare('UPDATE agents SET memory=? WHERE id=?').run(memory,id);if(!result.changes)throw new Error('Agent not found');}
 tasks():Task[]{return this.db.prepare('SELECT * FROM tasks ORDER BY createdAt DESC,rowid DESC').all() as unknown as Task[];}
 createTask(agentId:string,prompt:string,runtimeId:string):Task{
  const now=new Date().toISOString();const id=randomUUID();
  this.transaction(()=>{this.db.prepare("INSERT INTO tasks VALUES(?,?,?,?,'awaiting_approval','',?,?)").run(id,agentId,prompt,runtimeId,now,now);this.event(id,'created');});
  return this.tasks().find(t=>t.id===id)!;
 }
 private transaction(fn:()=>void){this.db.exec('BEGIN IMMEDIATE');try{fn();this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
 private event(id:string,event:string){this.db.prepare('INSERT INTO events(taskId,event,createdAt) VALUES(?,?,?)').run(id,event,new Date().toISOString());}
 claim(id:string){let claimed=false;this.transaction(()=>{claimed=!!this.db.prepare("UPDATE tasks SET status='running',updatedAt=? WHERE id=? AND status='awaiting_approval'").run(new Date().toISOString(),id).changes;if(claimed)this.event(id,'approved');});return claimed;}
 reject(id:string){let changed=false;this.transaction(()=>{changed=!!this.db.prepare("UPDATE tasks SET status='rejected',updatedAt=? WHERE id=? AND status='awaiting_approval'").run(new Date().toISOString(),id).changes;if(changed)this.event(id,'rejected');});return changed;}
 finish(id:string,status:'completed'|'failed'|'interrupted',output:string){this.transaction(()=>{const result=this.db.prepare("UPDATE tasks SET status=?,output=?,updatedAt=? WHERE id=? AND status='running'").run(status,output,new Date().toISOString(),id);if(result.changes)this.event(id,status);});}
 events(id:string){return this.db.prepare('SELECT event,createdAt FROM events WHERE taskId=? ORDER BY id').all(id);}
 close(){this.db.close();}
}
