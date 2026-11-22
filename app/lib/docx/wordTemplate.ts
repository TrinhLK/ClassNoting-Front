import JSZip from "jszip";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export type WordSource = { path: string; name: string; formIndex?: number };
export type WordSlot = { id: string; text: string };
export type WordEdit = { id: string; find: string; text: string; offset?: number; literal?: boolean };
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const decodeXml = (text: string) => text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
  if (entity.startsWith("#")) return String.fromCodePoint(parseInt(entity.slice(entity[1] === "x" ? 2 : 1), entity[1] === "x" ? 16 : 10));
  return ({amp:"&",lt:"<",gt:">",quot:'"',apos:"'"} as Record<string,string>)[entity];
});
const reEscape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordPrefix = (document: Document) => document.documentElement.lookupPrefix?.(W)
  || Array.from(document.documentElement.attributes).find(a=>a.name.startsWith("xmlns:") && a.value===W)?.name.slice(6);
const wordElements = (node: Document | Element, name: string, prefix: string) => Array.from(node.getElementsByTagName(`${prefix}:${name}`));

/** Locate leaf paragraphs without serializing the XML or touching namespace declarations. */
function paragraphs(xml: string) {
  const root = new DOMParser().parseFromString(xml, "application/xml");
  if (root.getElementsByTagName("parsererror").length) throw new Error("Mẫu Word có XML không hợp lệ.");
  const prefix = wordPrefix(root);
  if (!prefix) throw new Error("Không đọc được cấu trúc Word của mẫu.");
  const q = reEscape(prefix);
  const tags = new RegExp(`<(/?)${q}:p(?=[\\s/>])[^>]*>`, "g");
  const stack: {start:number;index:number;nested:boolean}[] = [];
  const result: {id:string;start:number;end:number;xml:string;prefix:string}[] = [];
  let index = 0;
  for (const match of xml.matchAll(tags)) {
    if (!match[1]) {
      if (stack.length) stack[stack.length-1].nested = true;
      const item = {start:match.index!,index:index++,nested:false};
      if (match[0].endsWith("/>")) result.push({id:`p${item.index}`,start:item.start,end:item.start+match[0].length,xml:match[0],prefix});
      else stack.push(item);
    } else {
      const item = stack.pop();
      if (item && !item.nested) result.push({id:`p${item.index}`,start:item.start,end:match.index!+match[0].length,xml:xml.slice(item.start,match.index!+match[0].length),prefix});
    }
  }
  return result.sort((a,b)=>a.start-b.start);
}
function textNodes(xml:string,prefix:string) {
  const regex = new RegExp(`<${reEscape(prefix)}:t(?=[\\s>])[^>]*>([\\s\\S]*?)</${reEscape(prefix)}:t>`,"g");
  return [...xml.matchAll(regex)].map(match=>({start:match.index!,end:match.index!+match[0].length,text:decodeXml(match[1])}));
}
const isEditable = (xml:string,prefix:string) => !new RegExp(`<${reEscape(prefix)}:(?:fldChar|fldSimple|instrText|drawing|pict|del|sdt)(?=[\\s/>])`).test(xml);

async function openWord(file:Blob) {
  if (file.size > 5*1024*1024) throw new Error("File mẫu tối đa 5 MB.");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  let unpacked=0;
  const entries=Object.values(zip.files);
  if(entries.length>2000) throw new Error("Mẫu Word quá lớn.");
  for(const entry of entries) unpacked+=(entry as unknown as {_data?:{uncompressedSize?:number}})._data?.uncompressedSize||0;
  if(unpacked>20*1024*1024) throw new Error("Mẫu Word quá lớn sau giải nén.");
  const part=zip.file("word/document.xml");
  if(!part) throw new Error("Mẫu Word thiếu nội dung gốc.");
  return {zip,xml:await part.async("string")};
}
export async function wordTemplateSlots(file:Blob):Promise<WordSlot[]> {
  const {xml}=await openWord(file);
  return paragraphs(xml).filter(p=>isEditable(p.xml,p.prefix)).map(p=>({id:p.id,text:textNodes(p.xml,p.prefix).map(n=>n.text).join("")}));
}
function plainText(text:string) {
  return text.replace(/<br\s*\/?\s*>/gi,"\n").replace(/<\/?(?:b|strong|i|em|p|div|span)(?:\s[^>]*)?>/gi,"")
    .replace(/^\s*#{1,6}\s+/gm,"").replace(/\*\*([^*]+)\*\*/g,"$1").replace(/__([^_]+)__/g,"$1")
    .replace(/^[ \t]*[-*+]\s+/gm,"")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,"");
}
function textElement(text:string,prefix:string) {
  return text.split(/\r?\n/).map(line=>`<${prefix}:t xml:space="preserve">${escapeXml(line)}</${prefix}:t>`).join(`<${prefix}:br/>`);
}
function replaceInParagraph(xml:string,prefix:string,edit:WordEdit) {
  const nodes=textNodes(xml,prefix),old=nodes.map(n=>n.text).join("");
  // Diff fragments are already plain text. A fragment such as " - 01:51"
  // is a time range, not a Markdown bullet, and must be inserted verbatim.
  const value=edit.literal ? edit.text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'') : plainText(edit.text);
  if(edit.find==="" && edit.offset===undefined) {
    if(old.trim()) throw new Error("Không thể điền vào đoạn Word không trống.");
    const content=textElement(value,prefix);
    if(nodes.length) return xml.slice(0,nodes[0].start)+content+xml.slice(nodes[0].end);
    const propertiesEnd=xml.indexOf(`</${prefix}:pPr>`);
    const runStart=propertiesEnd<0?0:propertiesEnd+`</${prefix}:pPr>`.length;
    const tabMatch=new RegExp(`<${reEscape(prefix)}:tab(?=[\\s/>])[^>]*/>`).exec(xml.slice(runStart));
    // A ruled blank is a tab stop, not extra content after the inserted answer.
    if(tabMatch) {const tab=runStart+tabMatch.index;return xml.slice(0,tab)+content+xml.slice(tab+tabMatch[0].length);}
    const endRun=xml.lastIndexOf(`</${prefix}:r>`);
    if(endRun>=0) return xml.slice(0,endRun)+content+xml.slice(endRun);
    const end=xml.lastIndexOf(`</${prefix}:p>`);
    if(end<0) return xml.replace(/\s*\/>$/,`><${prefix}:r>${content}</${prefix}:r></${prefix}:p>`);
    return xml.slice(0,end)+`<${prefix}:r>${content}</${prefix}:r>`+xml.slice(end);
  }
  const start=edit.offset ?? old.indexOf(edit.find);
  if(!Number.isInteger(start) || start<0 || start>old.length || old.slice(start,start+edit.find.length)!==edit.find
    || (edit.offset===undefined && old.indexOf(edit.find,start+edit.find.length)>=0)) throw new Error("AI trả vị trí điền Word không khớp hoặc không duy nhất. Hãy thử lại.");
  if(edit.find==='') {
    let at=0;
    const target=nodes.find((node,index)=>{const next=at+node.text.length;const found=start<next || index===nodes.length-1; if(!found)at=next; return found;});
    if(!target) throw new Error('Không tìm thấy vùng chữ Word để chèn.');
    const local=start-at;
    return xml.slice(0,target.start)+textElement(target.text.slice(0,local)+value+target.text.slice(local),prefix)+xml.slice(target.end);
  }
  const end=start+edit.find.length;
  let offset=0,inserted=false;
  const patches:{start:number;end:number;text:string}[]=[];
  for(const node of nodes) {
    const next=offset+node.text.length;
    if(next>start && offset<end) {
      const before=node.text.slice(0,Math.max(0,start-offset));
      const after=node.text.slice(Math.min(node.text.length,Math.max(0,end-offset)));
      patches.push({start:node.start,end:node.end,text:textElement(before+(!inserted?value:"")+after,prefix)});
      inserted=true;
    }
    offset=next;
  }
  for(const patch of patches.reverse()) xml=xml.slice(0,patch.start)+patch.text+xml.slice(patch.end);
  return xml;
}
/** Change only named text spans in document.xml. Every other ZIP part stays byte-identical. */
export async function fillWordTemplate(file:Blob,edits:WordEdit[]):Promise<Blob> {
  const {zip,xml}=await openWord(file);
  const source=paragraphs(xml),byId=new Map(source.map(p=>[p.id,p]));
  const grouped=new Map<string,WordEdit[]>();
  for(const edit of edits) {
    const p=byId.get(edit?.id);
    if(!p || !isEditable(p.xml,p.prefix) || typeof edit.find!=="string" || typeof edit.text!=="string") throw new Error("Kết quả điền mẫu Word không hợp lệ.");
    if(edit.find===edit.text) continue;
    const list=grouped.get(edit.id)||[];list.push(edit);grouped.set(edit.id,list);
  }
  let output=xml;
  const consumedBlanks=new Set<string>();
  let blankGroup:typeof source=[];
  const consumeGroup=()=>{
    if(blankGroup.some(p=>grouped.has(p.id))) for(const p of blankGroup) if(!grouped.has(p.id)) consumedBlanks.add(p.id);
    blankGroup=[];
  };
  for(const p of source) {
    // Ruled lines are space for handwriting, consumed by the typed answers.
    // Keep all untouched forms and signature whitespace; only shrink filled ruled zones.
    const blank=!textNodes(p.xml,p.prefix).some(n=>n.text.trim())
      && new RegExp(`<${reEscape(p.prefix)}:tab\\s*/>`).test(p.xml) && /\b\w+:leader=["']dot["']/.test(p.xml);
    if(blank) {
      const previous=blankGroup.at(-1);
      if(previous && xml.slice(previous.end,p.start).trim()) consumeGroup();
      blankGroup.push(p);
    } else consumeGroup();
  }
  consumeGroup();
  for(const p of [...source].reverse()) {
    if(consumedBlanks.has(p.id)) {output=output.slice(0,p.start)+output.slice(p.end);continue;}
    const changes=grouped.get(p.id);
    if(!changes) continue;
    // Apply ranges from right to left so replacement text cannot become another search target.
    const original=textNodes(p.xml,p.prefix).map(n=>n.text).join("");
    const ranges=changes.map(e=>({e,at:e.offset ?? (e.find===""?0:original.indexOf(e.find))})).sort((a,b)=>b.at-a.at);
    for(let i=1;i<ranges.length;i++) if(ranges[i].at+ranges[i].e.find.length>ranges[i-1].at || ranges[i].at===ranges[i-1].at) throw new Error("Các vị trí điền Word bị trùng.");
    let changed=p.xml;
    for(const {e} of ranges) changed=replaceInParagraph(changed,p.prefix,e);
    output=output.slice(0,p.start)+changed+output.slice(p.end);
  }
  zip.file("word/document.xml",output);
  // DOTX and DOCX share WordprocessingML, but the download must identify itself as a document.
  const types=zip.file("[Content_Types].xml");
  if(types) {
    const content=await types.async("string");
    if(content.includes("wordprocessingml.template.main+xml")) zip.file("[Content_Types].xml",content.replace("wordprocessingml.template.main+xml","wordprocessingml.document.main+xml"));
  }
  return zip.generateAsync({type:"blob",mimeType:DOCX_MIME});
}

/** Detect a packet of repeated forms, so one meeting does not inherit unrelated example records. */
function formStructure(xml:string) {
  const document=new DOMParser().parseFromString(xml,"application/xml");
  const prefix=wordPrefix(document) || "w";
  const body=wordElements(document,"body",prefix)[0];
  if(!body) throw new Error("Mẫu Word không có phần thân tài liệu.");
  const elements=Array.from(body.children);
  const text=(node:Element)=>wordElements(node,"t",prefix).map(n=>n.textContent).join("").replace(/\s+/g," ").trim();
  const first=elements.findIndex(n=>text(n).length>50);
  const heading=first>=0?text(elements[first]):"";
  const starts=heading?elements.flatMap((node,index)=>node.localName===elements[first].localName && text(node)===heading?[index]:[]):[];
  if(starts.length<2) return {prefix,elements,starts:[],labels:[]};
  const labels=starts.map((start,index)=>({index,label:text(elements[start+2]||elements[start+1]).slice(0,180)}));
  return {prefix,elements,starts,labels};
}
export async function wordTemplateForms(file:Blob) {
  const {xml}=await openWord(file);
  return formStructure(xml).labels;
}
export async function selectWordForm(file:Blob,index:number):Promise<Blob> {
  const {zip,xml}=await openWord(file);
  const {prefix,elements,starts}=formStructure(xml);
  if(!starts.length || !Number.isInteger(index) || index<0 || index>=starts.length) throw new Error("Không tìm thấy biên bản con trong file mẫu.");
  const bodyStart=new RegExp(`<${reEscape(prefix)}:body\\b[^>]*>`).exec(xml)!;
  const offset=bodyStart.index+bodyStart[0].length;
  const tokens=/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(?:[^>"']|"[^"]*"|'[^']*')*>/g;
  tokens.lastIndex=offset;
  const spans:{start:number;end:number}[]=[];
  let depth=0,start=offset;
  for(let token=tokens.exec(xml);token;token=tokens.exec(xml)) {
    const tag=token[0];
    if(tag.startsWith("<!--") || tag.startsWith("<?")) continue;
    if(tag.startsWith("</")) {
      if(depth===0) break;
      depth--;
      if(depth===0) spans.push({start,end:tokens.lastIndex});
    } else {
      if(depth===0) start=token.index;
      if(tag.endsWith("/>")) { if(depth===0) spans.push({start,end:tokens.lastIndex}); }
      else depth++;
    }
  }
  if(spans.length!==elements.length) throw new Error("Không thể tách mẫu Word an toàn.");
  const localName=(node:Element)=>node.tagName.split(":").pop();
  const from=starts[index],to=starts[index+1]??elements.findIndex(n=>localName(n)==="sectPr");
  let last=to<0?elements.length:to;
  // A form packet ends each record with section-transition paragraphs; keep its actual page settings.
  let section="";
  while(last>from && localName(elements[last-1])==="p" && !wordElements(elements[last-1],"t",prefix).length) {
    const raw=xml.slice(spans[last-1].start,spans[last-1].end);
    const found=raw.match(new RegExp(`<${reEscape(prefix)}:sectPr\\b[\\s\\S]*?</${reEscape(prefix)}:sectPr>`));
    if(found) section=found[0];
    last--;
  }
  const finalIndex=elements.findIndex(n=>localName(n)==="sectPr");
  if(!section && finalIndex>=0) section=xml.slice(spans[finalIndex].start,spans[finalIndex].end);
  const bodyEnd=xml.lastIndexOf(`</${prefix}:body>`);
  zip.file("word/document.xml",xml.slice(0,offset)+xml.slice(spans[from].start,spans[last-1].end)+section+xml.slice(bodyEnd));
  return zip.generateAsync({type:"blob",mimeType:DOCX_MIME});
}
