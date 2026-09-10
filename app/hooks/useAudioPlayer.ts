"use client";
import { useState, useRef, useCallback, useEffect } from "react";

export function useAudioPlayer(initialDuration: number = 0) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const seekTo = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, time);
    }
  }, []);

  const skipTime = useCallback((seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime + seconds);
    }
  }, []);

  const togglePlaybackRate = useCallback(() => {
    setPlaybackRate((prev) => {
      if (prev === 1.0) return 1.25;
      if (prev === 1.25) return 1.5;
      if (prev === 1.5) return 2.0;
      return 1.0;
    });
  }, []);

  const formatTime = useCallback((time: number) => {
    if (!time || isNaN(time) || !Number.isFinite(time)) return "00:00";
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }, []);

  return {
    audioRef,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    setCurrentTime,
    setDuration,
    togglePlay,
    seekTo,
    skipTime,
    togglePlaybackRate,
    formatTime,
  };
}
