import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import TranscriptRow from "@/app/components/TranscriptRow";
import { mockSegment, mockSpeaker } from "@/tests/helpers/fixtures";

it("allows an unknown speaker to be renamed from the transcript", () => {
  const rename = vi.fn();
  const speaker = mockSpeaker({ id: "SPEAKER_-1", name: "Chưa xác định" });
  render(<TranscriptRow segment={mockSegment({ speakerId: speaker.id })} speaker={speaker} allSpeakers={[speaker]}
    isActive={false} isAudioPlaying={false} activeWordIndex={-1}
    onTogglePlay={vi.fn()} onSeek={vi.fn()} onTextChange={vi.fn()} onSpeakerChange={vi.fn()}
    onSplit={vi.fn()} onMerge={vi.fn()} onAddRow={vi.fn()} onTimeChange={vi.fn()} onRenameSpeaker={rename} />);
  fireEvent.click(screen.getByRole("button", { name: "Chưa xác định" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Tên người nói" }), { target: { value: "Nguyễn Lan" } });
  fireEvent.click(screen.getByRole("button", { name: "Lưu tên người nói" }));
  expect(rename).toHaveBeenCalledWith("SPEAKER_-1", "Nguyễn Lan");
});
