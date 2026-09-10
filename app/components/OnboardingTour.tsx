"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { driver, DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import TourFloatingButton from "./TourFloatingButton";

const DASHBOARD_STEPS: DriveStep[] = [
  { element: "#upload-action", popover: { title: "Tải file ghi âm", description: "Nếu bạn đã có sẵn file MP3 hoặc WAV, hãy kéo thả vào đây để AI tiến hành bóc tách văn bản và tóm tắt.", side: "bottom", align: "start" } },
  { element: "#live-action", popover: { title: "Ghi âm trực tiếp", description: "Bạn có thể ghi âm trực tiếp cuộc họp ngay tại đây. AI sẽ hiển thị văn bản theo thời gian thực.", side: "bottom", align: "start" } },
  { element: "#tour-list", popover: { title: "Quản lý cuộc họp", description: "Tất cả các cuộc họp của bạn (bao gồm cả bản nháp) sẽ được lưu trữ và quản lý tập trung tại đây.", side: "top", align: "start" } },
];

const MINUTES_STEPS: DriveStep[] = [
  { element: "#tour-minutes-ai-panel", popover: { title: "Trò chuyện với AI", description: "Hỏi AI về nội dung của các biên bản đã chọn.", side: "top", align: "center" } },
];

const EDITOR_STEPS: DriveStep[] = [
  { element: "#editor-header", popover: { title: "Header Editor", description: "Đổi tên cuộc họp, chọn mẫu tóm tắt, lưu thay đổi.", side: "bottom", align: "start" } },
  { element: "#editor-transcript", popover: { title: "Vùng chỉnh sửa", description: "Sửa text, thay đổi người nói, tách/gộp câu.", side: "top", align: "start" } },
  { element: "#editor-player", popover: { title: "Audio player", description: "Phát audio, tua nhanh, chỉnh tốc độ.", side: "top", align: "center" } },
];

const TASKS_STEPS: DriveStep[] = [
  { element: "#tasks-list", popover: { title: "Danh sách cuộc họp", description: "Mỗi cuộc họp có 1 nút 'Trích xuất Task' để AI phân tích action items.", side: "top", align: "start" } },
];

const TOUR_CONFIG: Record<string, { key: string; steps: DriveStep[] }> = {
  "/":      { key: "hasSeenDashboardTour", steps: DASHBOARD_STEPS },
  "/minutes": { key: "hasSeenMinutesTour", steps: MINUTES_STEPS },
  "/edit":  { key: "hasSeenEditorTour", steps: EDITOR_STEPS },
  "/tasks": { key: "hasSeenTasksTour", steps: TASKS_STEPS },
};

export default function OnboardingTour() {
  const pathname = usePathname();
  const [showSkip, setShowSkip] = useState(false);

  useEffect(() => {
    const normalized = pathname.replace(/\/$/, "") || "/";
    const config = TOUR_CONFIG[normalized];
    if (!config) { setShowSkip(false); return; }

    const { key, steps } = config;
    const hasSeen = localStorage.getItem(key);
    const force = new URLSearchParams(window.location.search).get("forceTour")?.toLowerCase() === "true";

    if (hasSeen && !force) { setShowSkip(false); return; }

    const driverObj = driver({
      showProgress: true,
      animate: true,
      overlayColor: "rgba(15, 23, 42, 0.8)",
      allowClose: true,
      popoverClass: "tour-popover",
      stagePadding: 8,
      stageRadius: 12,
      onHighlightStarted: (el: Element | undefined) => {
        el?.setAttribute("style", "outline: 3px solid #6366f1 !important; outline-offset: 4px !important; box-shadow: 0 0 0 6px rgba(99,102,241,0.2) !important;");
      },
      onDeselected: (el: Element | undefined) => {
        el?.removeAttribute("style");
      },
      doneBtnText: "Hoàn thành",
      nextBtnText: "Tiếp theo",
      prevBtnText: "Quay lại",
      steps,
      onDestroyStarted: (_, __, { driver }) => {
        if (!driver.hasNextStep() || confirm("Bạn có chắc chắn muốn bỏ qua hướng dẫn?")) {
          localStorage.setItem(key, "true");
          driver.destroy();
        }
      },
    });

    setShowSkip(true);
    const timer = setTimeout(() => {
      const el = typeof steps[0]?.element === "string" ? document.querySelector(steps[0].element as string) : null;
      if (el) driverObj.drive();
    }, 500);

    return () => { clearTimeout(timer); driverObj.destroy(); setShowSkip(false); };
  }, [pathname]);

  return showSkip ? <TourFloatingButton /> : null;
}
