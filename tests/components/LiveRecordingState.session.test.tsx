import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import LiveRecordingState from "@/app/components/LiveRecordingState";
import { requestSegmentSummary } from "@/app/lib/api";

const transcription = vi.hoisted(() => ({
  onFinal: (() => {}) as (event: { speaker: number; content: string }) => void,
  listening: true,
}));
vi.mock("@/app/hooks/useLocalTranscription", () => ({ default: (callback: (event: { speaker: number; content: string }) => void) => {
  transcription.onFinal = callback;
  return { segments: [], interimContent: "", isListening: transcription.listening,
    connectionError: null, startListening: vi.fn(), stopListening: vi.fn(), resetTranscript: vi.fn() };
} }));
vi.mock("@/app/lib/api", () => ({ requestSegmentSummary: vi.fn(), uploadAudioToFirebase: vi.fn() }));
vi.mock("@/app/context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/app/context/GlobalUIProvider", () => ({ useGlobalUI: () => ({
  toast: { warning: vi.fn(), error: vi.fn() }, confirm: vi.fn(async () => true),
}) }));
vi.mock("@/app/components/Live/TranscriptView", () => ({ default: ({ onClear }: { onClear: () => void }) => <button onClick={onClear}>Clear transcript</button> }));
vi.mock("@/app/components/Live/Controls", () => ({ default: () => null }));
vi.mock("@/app/components/Live/Header", () => ({ default: () => null }));
vi.mock("@/app/components/Live/StatusBar", () => ({ default: () => null }));
vi.mock("@/app/components/Live/LVSummaryPanel", () => ({ default: () => null }));

beforeEach(() => {
  vi.useFakeTimers();
  transcription.listening = true;
  vi.mocked(requestSegmentSummary).mockReset().mockResolvedValue("Summary");
});
afterEach(() => vi.useRealTimers());

it("live segments retain ID through listening transitions, rotating on clear and new recording mount", async () => {
  const props = { onFinish: vi.fn(), onBack: vi.fn() };
  const first = render(<LiveRecordingState {...props} />);
  const segment = async () => {
    // More than 80 words flushes synchronously, without timers/media devices.
    await act(async () => transcription.onFinal({ speaker: 0, content: "word ".repeat(81) }));
  };
  await segment();
  await segment();
  transcription.listening = false;
  first.rerender(<LiveRecordingState {...props} />);
  transcription.listening = true;
  first.rerender(<LiveRecordingState {...props} />);
  await segment();
  const firstId = vi.mocked(requestSegmentSummary).mock.calls[0][1];
  expect(firstId).toMatch(/^live-[0-9a-f-]{36}$/);
  expect(vi.mocked(requestSegmentSummary).mock.calls.map(call => call[1])).toEqual([firstId, firstId, firstId]);
  await act(async () => fireEvent.click(screen.getByText("Clear transcript")));
  await segment();
  const clearedId = vi.mocked(requestSegmentSummary).mock.calls[3][1];
  expect(clearedId).not.toBe(firstId);
  first.unmount();
  render(<LiveRecordingState {...props} />);
  await segment();
  const newId = vi.mocked(requestSegmentSummary).mock.calls[4][1];
  expect(newId).not.toBe(firstId);
  expect(newId).not.toBe(clearedId);
});
