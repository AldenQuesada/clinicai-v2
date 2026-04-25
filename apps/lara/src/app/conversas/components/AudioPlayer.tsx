'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  isUser: boolean; // true = lead (blue bubble), false = lara (dark bubble)
}

/**
 * Gera barras de waveform pseudo-randômicas mas determinísticas (baseadas no src).
 * Simula visualmente a waveform do WhatsApp.
 */
function generateWaveformBars(src: string, count: number): number[] {
  let hash = 0;
  for (let i = 0; i < src.length; i++) {
    hash = ((hash << 5) - hash + src.charCodeAt(i)) | 0;
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    // Pseudo-random deterministic based on hash + index
    hash = ((hash << 13) ^ hash) | 0;
    const raw = ((hash >>> 0) % 100) / 100;
    // Clamp between 0.15 and 1.0 for visual appeal
    bars.push(0.15 + raw * 0.85);
  }
  return bars;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioPlayer({ src, isUser }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const animRef = useRef<number>(0);

  const BAR_COUNT = 40;
  const bars = useRef(generateWaveformBars(src, BAR_COUNT)).current;

  const progress = duration > 0 ? currentTime / duration : 0;

  // Animation loop for smooth progress
  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      setCurrentTime(audio.currentTime);
      animRef.current = requestAnimationFrame(tick);
    }
  }, []);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
      setIsLoaded(true);
    });

    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setCurrentTime(0);
      cancelAnimationFrame(animRef.current);
    });

    audio.addEventListener('pause', () => {
      cancelAnimationFrame(animRef.current);
    });

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', () => {});
      audio.removeEventListener('ended', () => {});
      audio.removeEventListener('pause', () => {});
      cancelAnimationFrame(animRef.current);
    };
  }, [src, tick]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => {});
      setIsPlaying(true);
      animRef.current = requestAnimationFrame(tick);
    }
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !isLoaded) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    audio.currentTime = pct * duration;
    setCurrentTime(audio.currentTime);
  };

  const cycleSpeed = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const speeds = [1, 1.5, 2];
    const idx = speeds.indexOf(playbackRate);
    const next = speeds[(idx + 1) % speeds.length];
    audio.playbackRate = next;
    setPlaybackRate(next);
  };

  // Colors based on bubble type
  const accentColor = isUser ? 'rgba(255,255,255,0.9)' : 'rgba(99,160,255,0.95)';
  const dimColor = isUser ? 'rgba(255,255,255,0.3)' : 'rgba(99,160,255,0.25)';
  const playBtnBg = isUser ? 'rgba(255,255,255,0.15)' : 'rgba(99,160,255,0.12)';
  const playBtnHover = isUser ? 'rgba(255,255,255,0.25)' : 'rgba(99,160,255,0.22)';
  const timeColor = isUser ? 'rgba(255,255,255,0.6)' : 'rgba(160,180,220,0.8)';
  const speedBg = isUser ? 'rgba(255,255,255,0.12)' : 'rgba(99,160,255,0.10)';
  const speedText = isUser ? 'rgba(255,255,255,0.7)' : 'rgba(140,170,230,0.9)';

  return (
    <div className="flex items-center gap-2.5 py-1.5 select-none" style={{ minWidth: 220, maxWidth: 300 }}>
      {/* Play/Pause Button */}
      <button
        onClick={togglePlay}
        className="shrink-0 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90"
        style={{
          width: 36,
          height: 36,
          background: playBtnBg,
          color: accentColor,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = playBtnHover)}
        onMouseLeave={(e) => (e.currentTarget.style.background = playBtnBg)}
        aria-label={isPlaying ? 'Pausar áudio' : 'Reproduzir áudio'}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4" fill="currentColor" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
        )}
      </button>

      {/* Center: Waveform + Time */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        {/* Waveform */}
        <div
          className="flex items-end h-[28px] cursor-pointer w-full"
          style={{ gap: 0 }}
          onClick={handleWaveformClick}
          role="slider"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
        >
          {bars.map((height, i) => {
            const barProgress = i / BAR_COUNT;
            const isPlayed = barProgress <= progress;
            return (
              <div
                key={i}
                className="rounded-full transition-colors duration-100"
                style={{
                  flex: 1,
                  marginLeft: i === 0 ? 0 : 1.5,
                  height: `${Math.max(4, height * 24)}px`,
                  backgroundColor: isPlayed ? accentColor : dimColor,
                }}
              />
            );
          })}
        </div>

        {/* Time */}
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[10px] font-medium tabular-nums" style={{ color: timeColor }}>
            {isPlaying || currentTime > 0 ? formatTime(currentTime) : formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Speed Button */}
      {isLoaded && (
        <button
          onClick={cycleSpeed}
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold transition-all duration-150 active:scale-90"
          style={{
            background: speedBg,
            color: speedText,
            minWidth: 28,
          }}
          title="Velocidade de reprodução"
        >
          {playbackRate}x
        </button>
      )}

    </div>
  );
}
