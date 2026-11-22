import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, auth } from "../firebase";
import { DOCX_MIME, type WordSource } from "./wordTemplate";
export const wordExportIdentity = () => auth.currentUser?.uid;

export async function saveWordFile(file: Blob, name: string): Promise<WordSource> {
  const uid=auth.currentUser?.uid;
  if(!uid) throw new Error("Vui lòng đăng nhập để lưu mẫu Word.");
  const path=`users/${uid}/uploads/word/${crypto.randomUUID()}.docx`;
  await uploadBytes(ref(storage,path),file,{contentType:DOCX_MIME});
  return {path,name};
}
export async function loadWordFile(source:WordSource):Promise<Blob> {
  if(!/^users\/[^/]+\/uploads\/word\/[\w-]+\.docx$/.test(source.path)) throw new Error("Không tìm thấy file Word gốc. Hãy tải lại mẫu Word.");
  const url=await getDownloadURL(ref(storage,source.path));
  const response=await fetch(`/api/proxy-file?url=${encodeURIComponent(url)}`);
  if(!response.ok) throw new Error("Không tải được file Word gốc. Hãy thử lại.");
  return response.blob();
}
export async function wordSummaryHash(summary:string):Promise<string> {
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(summary));
  return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("");
}
