import { db } from "../firebase";
import {
  collection, doc, setDoc, getDocs, deleteDoc,
  query, orderBy
} from "firebase/firestore";

export interface Folder {
  id: string;
  userId: string;
  name: string;
  createdAt: number;
}

const getFolderCollection = (userId: string) => {
  return collection(db, "users", userId, "folders");
};

export const saveFolder = async (userId: string, folder: Folder) => {
  if (!userId) return;
  try {
    const folderRef = folder.id
      ? doc(db, "users", userId, "folders", folder.id)
      : doc(getFolderCollection(userId));
    const folderData = { ...folder, id: folderRef.id };
    await setDoc(folderRef, folderData, { merge: true });
    return folderData.id;
  } catch (error) {
    console.error("Lỗi lưu folder:", error);
    throw error;
  }
};

export const getFolders = async (userId: string): Promise<Folder[]> => {
  if (!userId) return [];
  try {
    const q = query(getFolderCollection(userId), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Folder));
  } catch (error) {
    console.error("Lỗi lấy danh sách folder:", error);
    return [];
  }
};

export const deleteFolder = async (userId: string, folderId: string) => {
  if (!userId || !folderId) return;
  try {
    const folderRef = doc(db, "users", userId, "folders", folderId);
    await deleteDoc(folderRef);
  } catch (error) {
    console.error("Lỗi xóa folder:", error);
    throw error;
  }
};
