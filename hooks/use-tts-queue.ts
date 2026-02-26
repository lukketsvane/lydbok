import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { get, set } from 'idb-keyval';

export type ChunkStatus = 'idle' | 'generating' | 'ready' | 'error';

export interface TTSChunk {
  id: string; // unique ID for caching
  text: string;
  status: ChunkStatus;
  audioUrl?: string;
  error?: string;
}

interface UseTTSQueueProps {
  chunks: { id: string; text: string }[];
  voice: string;
  prompt: string;
  apiKey: string;
  autoPlay?: boolean;
}

export function useTTSQueue({ chunks, voice, prompt, apiKey, autoPlay = true }: UseTTSQueueProps) {
  const [queue, setQueue] = useState<TTSChunk[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const generatingRef = useRef<Set<number>>(new Set());
  const queueRef = useRef<TTSChunk[]>([]);

  // Sync queueRef with queue
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // Initialize queue when chunks change
  useEffect(() => {
    if (chunks.length === 0) {
      setQueue([]);
      return;
    }
    const newQueue = chunks.map(c => ({ ...c, status: 'idle' as ChunkStatus }));
    setQueue(newQueue);
    queueRef.current = newQueue;
    setCurrentIndex(0);
    setIsPlaying(false);
    generatingRef.current.clear();
  }, [chunks, voice, prompt]);

  const generateAudio = useCallback(async (index: number) => {
    const currentQueue = queueRef.current;
    if (index >= currentQueue.length || index < 0) return;
    
    const chunk = currentQueue[index];
    if (chunk.status === 'ready' || chunk.status === 'generating' || generatingRef.current.has(index)) {
      return;
    }

    generatingRef.current.add(index);
    setQueue(q => q.map((c, i) => i === index ? { ...c, status: 'generating' } : c));

    const cacheKey = `tts_${chunk.id}_${voice}_${prompt}`;
    
    try {
      // Check cache first
      const cachedBase64 = await get<string>(cacheKey);
      if (cachedBase64) {
        const audioUrl = `data:audio/wav;base64,${cachedBase64}`;
        setQueue(q => q.map((c, i) => i === index ? { ...c, status: 'ready', audioUrl } : c));
        generatingRef.current.delete(index);
        return;
      }

      // Generate with Gemini
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [
          {
            role: 'user',
            parts: [
              { text: `[Voice Prompt: ${prompt}]\n\nText to read:\n${chunk.text}` }
            ]
          }
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        await set(cacheKey, base64Audio);
        const audioUrl = `data:audio/wav;base64,${base64Audio}`;
        setQueue(q => q.map((c, i) => i === index ? { ...c, status: 'ready', audioUrl } : c));
      } else {
        throw new Error('No audio generated');
      }
    } catch (error: any) {
      console.error(`Error generating audio for chunk ${index}:`, error);
      setQueue(q => q.map((c, i) => i === index ? { ...c, status: 'error', error: error.message } : c));
    } finally {
      generatingRef.current.delete(index);
    }
  }, [voice, prompt, apiKey]);

  // Pre-fetch logic: always try to generate current and next 2 chunks
  useEffect(() => {
    if (queue.length === 0) return;
    
    // Generate current chunk if needed
    generateAudio(currentIndex);
    
    // Pre-generate next chunks
    if (currentIndex + 1 < queue.length) generateAudio(currentIndex + 1);
    if (currentIndex + 2 < queue.length) generateAudio(currentIndex + 2);
    
  }, [currentIndex, queue.length, generateAudio]);

  // Playback logic
  useEffect(() => {
    if (!autoPlay || !isPlaying || queue.length === 0) return;

    const currentChunk = queue[currentIndex];
    
    if (currentChunk.status === 'ready' && currentChunk.audioUrl) {
      if (!audioRef.current) {
        audioRef.current = new Audio(currentChunk.audioUrl);
      } else if (audioRef.current.src !== currentChunk.audioUrl) {
        audioRef.current.src = currentChunk.audioUrl;
      }
      
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          console.error("Playback prevented:", e);
          setIsPlaying(false);
        });
      }

      const handleEnded = () => {
        if (currentIndex + 1 < queue.length) {
          setCurrentIndex(prev => prev + 1);
        } else {
          setIsPlaying(false); // Finished all chunks
        }
      };

      audioRef.current.addEventListener('ended', handleEnded);
      return () => {
        audioRef.current?.removeEventListener('ended', handleEnded);
      };
    }
  }, [currentIndex, queue, isPlaying, autoPlay]);

  const togglePlayPause = () => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
    }
  };

  const skipTo = (index: number) => {
    if (index >= 0 && index < queue.length) {
      audioRef.current?.pause();
      setCurrentIndex(index);
      setIsPlaying(true);
    }
  };

  return {
    queue,
    currentIndex,
    isPlaying,
    togglePlayPause,
    skipTo,
    audioRef
  };
}
