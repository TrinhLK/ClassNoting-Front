import type {WordEdit,WordSlot} from './wordTemplate';
export type ParagraphReplacement={id:string;text:string};
export const WORD_PLAN_RESPONSE_FORMAT={type:'json_schema',json_schema:{name:'word_paragraph_edits',strict:true,schema:{type:'object',properties:{edits:{type:'array',items:{type:'object',properties:{id:{type:'string'},text:{type:'string'}},required:['id','text'],additionalProperties:false}}},required:['edits'],additionalProperties:false}}};
export function validateParagraphPlan(value:unknown,slots:WordSlot[]):ParagraphReplacement[]{
 const rows=Array.isArray(value)?value:(value as {edits?:unknown})?.edits;
 if(!Array.isArray(rows)||rows.length>slots.length)throw new Error('AI chưa trả kế hoạch điền Word hợp lệ.');
 const ids=new Set(slots.map(s=>s.id)),seen=new Set<string>();let chars=0;
 for(const row of rows){
  if(!row||!ids.has(row.id)||seen.has(row.id)||typeof row.text!=='string'||row.text.length>30000)throw new Error('AI trả vị trí điền Word không hợp lệ.');
  if(/<\/?(?:thought|thinking|reasoning|br|p|div|table)\b/i.test(row.text))throw new Error('Nội dung Word chứa mã định dạng không hợp lệ.');
  seen.add(row.id);chars+=row.text.length;
 }
 if(chars>200000)throw new Error('Nội dung điền Word quá dài.');
 return rows;
}

/** Diff on the client: AI never has to reproduce exact source strings or compute offsets. */
export function paragraphPlanEdits(plan:ParagraphReplacement[],slots:WordSlot[]):WordEdit[]{
 const source=new Map(slots.map(s=>[s.id,s.text]));
 return validateParagraphPlan(plan,slots).flatMap(({id,text})=>{
  const old=source.get(id)!;
  if(old===text)return [];
  if(!old.trim())return [{id,find:'',text,literal:true}];
  const tokens=/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;
  const a=old.match(tokens)||[],b=text.match(tokens)||[];
  // Large rewritten paragraphs use a bounded common-prefix/suffix edit.
  if(a.length*b.length>500000){
   let start=0,end=old.length,newEnd=text.length;
   while(start<end&&start<newEnd&&old[start]===text[start])start++;
   while(end>start&&newEnd>start&&old[end-1]===text[newEnd-1]){end--;newEnd--;}
   return [{id,find:old.slice(start,end),text:text.slice(start,newEnd),offset:start,literal:true}];
  }
  const width=b.length+1,dp=new Uint16Array((a.length+1)*width);
  for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)dp[i*width+j]=a[i]===b[j]?1+dp[(i+1)*width+j+1]:Math.max(dp[(i+1)*width+j],dp[i*width+j+1]);
  const edits:WordEdit[]=[];let i=0,j=0,offset=0,start=-1,find='',replacement='';
  const flush=()=>{if(start>=0){edits.push({id,find,text:replacement,offset:start,literal:true});start=-1;find='';replacement='';}};
  while(i<a.length||j<b.length){
   if(i<a.length&&j<b.length&&a[i]===b[j]){flush();offset+=a[i++].length;j++;}
   else{if(start<0)start=offset;
    if(i<a.length&&(j===b.length||dp[(i+1)*width+j]>=dp[i*width+j+1])){find+=a[i];offset+=a[i++].length;}
    else replacement+=b[j++];
   }
  }
  flush();return edits;
 });
}
