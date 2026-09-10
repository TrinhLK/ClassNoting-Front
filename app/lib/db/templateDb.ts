import { db } from "../firebase";
import {
  collection, doc, setDoc, getDocs, deleteDoc,
  query, orderBy
} from "firebase/firestore";
import { MeetingTemplate } from "../templates";

const getTemplateCollection = (userId: string) => {
  return collection(db, "users", userId, "templates");
};

export const getCustomTemplates = async (userId: string): Promise<MeetingTemplate[]> => {
  if (!userId) return [];
  try {
    const q = query(getTemplateCollection(userId), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      isCustom: true,
      userId
    } as MeetingTemplate));
  } catch (error) {
    console.error("Lỗi lấy custom templates:", error);
    return [];
  }
};

export const saveCustomTemplate = async (userId: string, template: Partial<MeetingTemplate>) => {
  if (!userId) return;
  try {
    const templateRef = template.id
      ? doc(db, "users", userId, "templates", template.id)
      : doc(getTemplateCollection(userId));
    const dataToSave = {
      name: template.name,
      description: template.description || "",
      structure: template.structure,
      updatedAt: Date.now()
    };
    await setDoc(templateRef, dataToSave, { merge: true });
    return templateRef.id;
  } catch (error) {
    console.error("Lỗi lưu template:", error);
    throw error;
  }
};

export const deleteCustomTemplate = async (userId: string, templateId: string) => {
  if (!userId || !templateId) return;
  try {
    const docRef = doc(db, "users", userId, "templates", templateId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Lỗi xóa template:", error);
    throw error;
  }
};
