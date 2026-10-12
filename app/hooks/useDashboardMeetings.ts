"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Meeting } from "../lib/db";

export function useDashboardMeetings(uid: string | undefined, refreshSignal: number, onDrafts: (count: number) => void) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const cloud = useRef<Meeting[]>([]);
  const drafts = useRef<Meeting[]>([]);
  const notify = useRef(onDrafts);
  notify.current = onDrafts;
  const publish = useCallback(() => {
    const items = new Map(drafts.current.map(m => [m.id, m]));
    for (const meeting of cloud.current) items.set(meeting.id, meeting);
    setMeetings([...items.values()].filter(m => !m.isMinuteOnly || m.isDeleted).sort((a, b) => b.createdAt - a.createdAt));
  }, []);

  useEffect(() => {
    cloud.current = [];
    drafts.current = [];
    setMeetings([]);
    setError("");
    setLoading(!!uid);
    if (!uid) return;
    let active = true;
    const unsubscribe = onSnapshot(query(collection(db, "meetings"), where("userId", "==", uid)), snapshot => {
      if (!active) return;
      cloud.current = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Meeting));
      publish();
      setLoading(false);
      setError("");
    }, () => {
      if (!active) return;
      setError("Không thể tải danh sách cuộc họp. Vui lòng kiểm tra kết nối và tải lại trang.");
      setLoading(false);
    });
    return () => { active = false; unsubscribe(); };
  }, [uid, publish]);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    void import("../lib/indexedDB").then(mod => mod.getAllDraftsMeta(uid)).then(items => {
      if (!active) return;
      drafts.current = items;
      publish();
      if (items.length) notify.current(items.length);
    }).catch(err => console.warn("Không thể đọc bản nháp trên máy", err));
    return () => { active = false; };
  }, [uid, refreshSignal, revision, publish]);

  // Cloud writes arrive through the existing listener; only local drafts need reloading.
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  const updateTitle = useCallback((id: string, title: string) => {
    const rename = (m: Meeting) => m.id === id ? { ...m, title } : m;
    cloud.current = cloud.current.map(rename);
    drafts.current = drafts.current.map(rename);
    publish();
  }, [publish]);
  return { meetings, loading, error, refresh, updateTitle };
}
