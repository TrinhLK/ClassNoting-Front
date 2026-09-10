import { db } from "../firebase";
import {
  collection, doc, setDoc, getDocs, deleteDoc,
  query, orderBy
} from "firebase/firestore";

export interface Member {
  id: string;
  name: string;
  email: string;
  department?: string;
  team?: string;
}

const getMemberCollection = (userId: string) => {
  return collection(db, "users", userId, "members");
};

export const getMembers = async (userId: string): Promise<Member[]> => {
  if (!userId) return [];
  try {
    const q = query(getMemberCollection(userId), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Member));
  } catch (error) {
    console.error("Lỗi lấy danh sách member:", error);
    return [];
  }
};

export const saveMember = async (userId: string, member: Member) => {
  if (!userId) return;
  try {
    const memberRef = member.id
      ? doc(db, "users", userId, "members", member.id)
      : doc(getMemberCollection(userId));
    const memberData = { ...member, id: memberRef.id };
    await setDoc(memberRef, memberData, { merge: true });
    return memberData.id;
  } catch (error) {
    console.error("Lỗi lưu member:", error);
    throw error;
  }
};

export const deleteMember = async (userId: string, memberId: string) => {
  if (!userId || !memberId) return;
  try {
    const memberRef = doc(db, "users", userId, "members", memberId);
    await deleteDoc(memberRef);
  } catch (error) {
    console.error("Lỗi xóa member:", error);
    throw error;
  }
};

export const getExistingDepartments = async (userId: string): Promise<string[]> => {
  const members = await getMembers(userId);
  const depts = members.map(m => m.department).filter((d): d is string => Boolean(d));
  return Array.from(new Set(depts)).sort();
};

export const getExistingTeams = async (userId: string): Promise<string[]> => {
  const members = await getMembers(userId);
  const teams = members.map(m => m.team).filter(Boolean) as string[];
  return Array.from(new Set(teams)).sort();
};
