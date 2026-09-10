import { db } from "../firebase";
import {
  doc, setDoc, getDoc, updateDoc, onSnapshot
} from "firebase/firestore";
import { Segment } from "../mockData";

export interface LiveSession {
  id: string;
  hostId: string;
  title: string;
  language?: "vi" | "en";
  segments: Segment[];
  summary: string;
  status: "live" | "ended";
  startedAt: number;
}

const LIVE_COLLECTION = "live_sessions";

export const createLiveSession = async (session: LiveSession) => {
  try {
    const docRef = doc(db, LIVE_COLLECTION, session.id);
    const cleanData = { ...structuredClone(session), expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000) };
    await setDoc(docRef, cleanData);
  } catch (error) {
    console.error("Lỗi tạo Live Session:", error);
    throw error;
  }
};

export const updateLiveSession = async (sessionId: string, segments: Segment[], summary: string) => {
  try {
    const docRef = doc(db, LIVE_COLLECTION, sessionId);
    const cleanSegments = structuredClone(segments);
    await updateDoc(docRef, {
      segments: cleanSegments,
      summary: summary
    });
  } catch (error) {
    console.warn("⚠️ Lỗi cập nhật Live Session (có thể do limit 1MB). Đang thử giảm dung lượng...", error);
    try {
      const docRef = doc(db, LIVE_COLLECTION, sessionId);
      const lightSegments = segments.map((s: Segment) => {
        const { words, ...rest } = s;
        return rest;
      });
      const cleanLightSegments = structuredClone(lightSegments);
      await updateDoc(docRef, {
        segments: cleanLightSegments,
        summary: summary
      });
    } catch (fallbackError) {
      console.error("Vẫn lỗi sau khi giảm dung lượng Live Session:", fallbackError);
    }
  }
};

export const endLiveSession = async (sessionId: string) => {
  if (!sessionId) return;
  try {
    const docRef = doc(db, LIVE_COLLECTION, sessionId);
    await updateDoc(docRef, { status: "ended" });
  } catch (error) {
    console.error("Lỗi kết thúc Live Session:", error);
  }
};

export const subscribeToLiveSession = (sessionId: string, onUpdate: (data: LiveSession | null) => void) => {
  const docRef = doc(db, LIVE_COLLECTION, sessionId);
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      onUpdate(docSnap.data() as LiveSession);
    } else {
      onUpdate(null);
    }
  }, (error) => {
    console.error("Lỗi lắng nghe Live Session:", error);
    onUpdate(null);
  });
};
