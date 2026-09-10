import { db } from "../firebase";
import {
  collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, limit, startAfter, onSnapshot,
  type QueryConstraint, type QueryDocumentSnapshot
} from "firebase/firestore";
import { Segment, Speaker, RAW_TRANSCRIPT_FILE, RAW_SUMMARY_FILE } from "../mockData";
export type { Segment, Speaker };
import { parseTranscriptFile } from "../parser";
import { MeetingTemplate } from "../templates";
import { MEETING_STATUS, MeetingStatus, ActionItemStatus } from "../constants";

export interface TaskItem {
  id: number;
  task: string;
  assigneeName: string;
  department?: string;
  team?: string;
  email: string[];
  deadline: string;
}

export interface Meeting {
  id: string;
  userId: string;
  jobId?: string;
  jobStartedAt?: number;
  title: string;
  createdAt: number;
  duration: number;
  audioUrl?: string;
  segments: Segment[];
  speakers: Speaker[];
  summary?: string;
  status: MeetingStatus;
  isDeleted: boolean;
  errorMessage?: string;
  actionItems?: TaskItem[];
  actionStatus?: ActionItemStatus;
  isMinuteOnly?: boolean;
  language?: "vi" | "en";
  folderId?: string | null;
  shareToken?: string;
  objectives?: string;
}

const COLLECTION_NAME = "meetings";

const stripUndefined = (obj: Record<string, unknown>): Record<string, unknown> => {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  );
};

export const saveMeeting = async (meeting: Meeting) => {
  try {
    const docRef = doc(db, COLLECTION_NAME, meeting.id);
    const cleanData = structuredClone(meeting) as unknown as Record<string, unknown>;
    await setDoc(docRef, stripUndefined(cleanData));
  } catch (error) {
    console.warn("⚠️ Lỗi lưu meeting (có thể do limit 1MB). Đang thử giảm dung lượng...", error);
    try {
      const docRef = doc(db, COLLECTION_NAME, meeting.id);
      const lightSegments = meeting.segments.map((s: Segment) => {
        const { words, ...rest } = s;
        return rest;
      });
      const lightMeeting = { ...meeting, segments: lightSegments };
      const cleanData = structuredClone(lightMeeting) as unknown as Record<string, unknown>;
      await setDoc(docRef, stripUndefined(cleanData));
    } catch (fallbackError) {
      console.error("Vẫn lỗi sau khi giảm dung lượng:", fallbackError);
      throw fallbackError;
    }
  }
};

export const PAGE_SIZE = 20;

export const getMeetingsPaginated = async (
  userId: string,
  cursor?: QueryDocumentSnapshot,
  deleted?: boolean
): Promise<{ meetings: Meeting[]; lastDoc: QueryDocumentSnapshot | null; hasMore: boolean }> => {
  const constraints: QueryConstraint[] = [
    where("userId", "==", userId),
  ];
  if (deleted !== undefined) {
    constraints.push(where("isDeleted", "==", deleted));
  }
  constraints.push(orderBy("createdAt", "desc"));
  constraints.push(limit(PAGE_SIZE + 1));
  if (cursor) constraints.push(startAfter(cursor));

  const q = query(collection(db, COLLECTION_NAME), ...constraints);
  const snap = await getDocs(q);
  const docs = snap.docs;
  const hasMore = docs.length > PAGE_SIZE;
  const visible = hasMore ? docs.slice(0, PAGE_SIZE) : docs;

  return {
    meetings: visible.map(d => d.data() as Meeting),
    lastDoc: visible[visible.length - 1] ?? null,
    hasMore
  };
};

export const getAllMeetings = async (userId: string): Promise<Meeting[]> => {
  try {
    const meetingsRef = collection(db, COLLECTION_NAME);
    const q = query(
      meetingsRef,
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Meeting);
  } catch (error) {
    console.error("Lỗi lấy danh sách:", error);
    return [];
  }
};

export const getMeetingById = async (id: string): Promise<Meeting | undefined> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as Meeting;
    }
    return undefined;
  } catch (error) {
    // Firestore trả "Missing or insufficient permissions" khi doc không tồn tại
    // (vì rule không cho phép đọc doc không tồn tại). Đây là flow bình thường
    // (vd draft chỉ có ở IndexedDB), không phải lỗi thật → chỉ log debug.
    console.debug("getMeetingById: no doc or no permission:", error);
    return undefined;
  }
};

export const getMeetingByShareId = async (shareId: string): Promise<Meeting | undefined> => {
  try {
    const q = query(collection(db, COLLECTION_NAME), where("shareToken", "==", shareId));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return snapshot.docs[0].data() as Meeting;
    }
    // KHÔNG fallback sang getMeetingById: nếu shareToken không match → không truy cập được.
    // Trước đây fallback này cho phép ai biết meeting ID cũng xem được meeting private.
    return undefined;
  } catch (error) {
    console.error("Lỗi lấy từ share link:", error);
    return undefined;
  }
};

export const updateMeetingProcess = async (id: string, updates: Partial<Meeting>) => {
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, stripUndefined(updates as unknown as Record<string, unknown>));
};

export const toggleTrashMeeting = async (id: string, isDeleted: boolean) => {
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, { isDeleted });
};

export const deleteMeetingPermanent = async (id: string) => {
  const docRef = doc(db, COLLECTION_NAME, id);
  await deleteDoc(docRef);
};

export const updateMeetingTitle = async (id: string, newTitle: string) => {
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, { title: newTitle });
};

export const updateMeetingFolder = async (meetingId: string, folderId: string | null) => {
  const docRef = doc(db, COLLECTION_NAME, meetingId);
  await updateDoc(docRef, { folderId: folderId });
};

export const generateMeetingShareToken = async (id: string) => {
  const token = Math.random().toString(36).substring(2, 10) + '-' + Math.random().toString(36).substring(2, 10);
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, { shareToken: token });
  return token;
};

export const subscribeToActiveMeetings = (userId: string, onUpdate: (meetings: Meeting[]) => void) => {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("userId", "==", userId),
    where("status", "==", MEETING_STATUS.TRANSCRIBING)
  );
  return onSnapshot(q, (snapshot) => {
    const meetings = snapshot.docs.map(doc => doc.data() as Meeting);
    onUpdate(meetings);
  }, (error) => {
    console.error("Lỗi listen active meetings:", error);
  });
};

export const getActiveTranscribingMeetings = async (userId: string): Promise<Meeting[]> => {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("userId", "==", userId),
    where("status", "==", MEETING_STATUS.TRANSCRIBING)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as Meeting);
};

export const seedInitialData = async (userId: string) => {
  if (!userId) return;
  const meetings = await getAllMeetings(userId);
  if (meetings.length === 0) {
    try {
      const parsedData = parseTranscriptFile(RAW_TRANSCRIPT_FILE);
      const seedMeeting: Meeting = {
        id: `demo-${userId}`,
        userId: userId,
        title: "Talkshow: Tương lai ngành xuất bản (Demo)",
        createdAt: Date.now(),
        duration: 480,
        audioUrl: "/demo.mp3",
        segments: parsedData.segments,
        speakers: parsedData.speakers,
        summary: RAW_SUMMARY_FILE,
        status: MEETING_STATUS.COMPLETED,
        isDeleted: false
      };
      await saveMeeting(seedMeeting);
      return true;
    } catch (e) {
      console.error("Lỗi tạo data mẫu:", e);
    }
    return false;
  }
};
