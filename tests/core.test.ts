import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route, type RuntimeInfo } from '../packages/core/src/index.ts';
import { Store } from '../apps/server/src/store.ts';
const candidate: RuntimeInfo = {id:'api',name:'API',ownerId:'local',available:true,capabilities:['text'],billing:'api',description:''};
test('routing prevents cross-owner credential use',()=>assert.throws(()=>route([candidate], 'other','api',['text'])));
test('routing refuses unavailable providers and unsupported capabilities',()=>{
 assert.throws(()=>route([{...candidate,available:false}],'local','api',['text']));
 assert.throws(()=>route([candidate],'local','api',['browser']));
});
test('routing uses only explicitly selected runtime',()=>assert.equal(route([candidate],'local','api',['text']).id,'api'));
test('approval claims are atomic, rejected tasks cannot execute',()=>{
 const s=new Store(':memory:');const a=s.agents()[0];
 const t=s.createTask(a.id,'Write a brief','api');
 assert.equal(s.claim(t.id),true); assert.equal(s.claim(t.id),false);
 const rejected=s.createTask(a.id,'Another brief','api');s.reject(rejected.id);
 assert.equal(s.claim(rejected.id),false);s.close();
});
test('memory survives reopening; in-flight tasks become interrupted',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');
 const dir=mkdtempSync(tmpdir()+'/boss-test-');const file=dir+'/state.db';
 const s=new Store(file);const a=s.agents()[0];s.memory(a.id,'Use concise summaries');
 const t=s.createTask(a.id,'Draft brief','api');s.claim(t.id);s.close();
 const reopened=new Store(file);assert.equal(reopened.agents()[0].memory,'Use concise summaries');
 assert.equal(reopened.tasks()[0].status,'interrupted');reopened.close();rmSync(dir,{recursive:true});
});
