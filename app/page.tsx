'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Pause, Loader2, Settings2, Volume2, AlertCircle, SkipForward, SkipBack } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { extractTextFromPDF } from '@/lib/pdf';
import { useTTSQueue } from '@/hooks/use-tts-queue';

const VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];

// Helper to chunk text to avoid 8192 token limit
function chunkText(text: string, maxLength: number = 2000): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxLength) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += ' ' + sentence;
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [voice, setVoice] = useState('Fenrir');
  const [prompt, setPrompt] = useState('dramatisk og dynamisk innlevelse, lest på BERGENSK gammel mann');
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chunks, setChunks] = useState<{ id: string; text: string; pageNum: number }[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    queue,
    currentIndex,
    isPlaying,
    togglePlayPause,
    skipTo
  } = useTTSQueue({
    chunks,
    voice,
    prompt,
    apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || '',
    autoPlay: true
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf') {
        await processFile(droppedFile);
      } else {
        setError('Please upload a PDF file.');
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setIsExtracting(true);
    setChunks([]);

    try {
      const pages = await extractTextFromPDF(selectedFile);
      
      let allChunks: { id: string; text: string; pageNum: number }[] = [];
      
      // Hash the filename to use as part of the cache ID
      const fileId = selectedFile.name.replace(/[^a-zA-Z0-9]/g, '_');

      pages.forEach((pageText, pageNum) => {
        const pageChunks = chunkText(pageText);
        pageChunks.forEach((text, i) => {
          allChunks.push({
            id: `${fileId}_p${pageNum}_c${i}`,
            text,
            pageNum: pageNum + 1
          });
        });
      });

      if (allChunks.length === 0) {
        throw new Error("No text found in the PDF.");
      }

      setChunks(allChunks);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to extract text from PDF.');
    } finally {
      setIsExtracting(false);
    }
  };

  const currentChunk = queue[currentIndex];

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-stone-900 font-serif flex flex-col">
      {/* Top Bar */}
      <header className="p-6 flex justify-between items-center border-b border-stone-200/50 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#5A5A40] text-white rounded-full flex items-center justify-center">
            <Volume2 className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">AudioReader</h1>
        </div>
        
        {chunks.length > 0 && (
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 text-stone-500 hover:text-stone-900 transition-colors rounded-full hover:bg-stone-200/50"
          >
            <Settings2 className="w-6 h-6" />
          </button>
        )}
      </header>

      <main className="flex-1 flex flex-col max-w-4xl w-full mx-auto p-6 md:p-12">
        {chunks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center max-w-xl mx-auto w-full space-y-8">
            <div className="text-center space-y-4">
              <h2 className="text-4xl md:text-5xl font-light tracking-tight">Listen to any document.</h2>
              <p className="text-stone-500 text-lg md:text-xl font-sans">Upload a PDF and let our expressive AI voices read it to you, page by page.</p>
            </div>

            <div 
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full border-2 border-dashed rounded-[32px] p-12 text-center cursor-pointer transition-all duration-300 bg-white shadow-sm hover:shadow-md
                ${isExtracting ? 'border-[#5A5A40]/30' : 'border-stone-200 hover:border-[#5A5A40]/50'}`}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".pdf" 
                className="hidden" 
              />
              {isExtracting ? (
                <div className="flex flex-col items-center gap-4 text-[#5A5A40]">
                  <Loader2 className="w-10 h-10 animate-spin" />
                  <span className="font-medium font-sans text-lg">Extracting text from PDF...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 text-stone-500">
                  <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mb-2">
                    <Upload className="w-8 h-8 text-stone-400" />
                  </div>
                  <span className="font-medium text-stone-900 text-xl">Click to upload or drag and drop</span>
                  <span className="text-stone-500 font-sans">PDF files only</span>
                </div>
              )}
            </div>

            {/* Settings (shown before upload) */}
            <div className="w-full bg-white p-8 rounded-[32px] shadow-sm border border-stone-100 space-y-6 font-sans">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-stone-700 uppercase tracking-wider">Voice</label>
                  <select 
                    value={voice}
                    onChange={(e) => setVoice(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 text-stone-900 rounded-xl focus:ring-[#5A5A40] focus:border-[#5A5A40] block p-3 outline-none"
                  >
                    {VOICES.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-stone-700 uppercase tracking-wider">Direction</label>
                  <input 
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 text-stone-900 rounded-xl focus:ring-[#5A5A40] focus:border-[#5A5A40] block p-3 outline-none"
                    placeholder="e.g. dramatic, calm, energetic..."
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-50 text-red-700 rounded-xl flex items-start gap-3 text-sm font-sans w-full">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col relative">
            
            <AnimatePresence>
              {showSettings && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="absolute top-0 left-0 right-0 bg-white p-6 rounded-[24px] shadow-lg border border-stone-100 z-20 font-sans space-y-4 mb-8"
                >
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold text-lg">Settings</h3>
                    <button onClick={() => setShowSettings(false)} className="text-stone-400 hover:text-stone-900">Close</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-stone-700 uppercase tracking-wider">Voice</label>
                      <select 
                        value={voice}
                        onChange={(e) => setVoice(e.target.value)}
                        className="w-full bg-stone-50 border border-stone-200 text-stone-900 rounded-xl focus:ring-[#5A5A40] focus:border-[#5A5A40] block p-3 outline-none"
                      >
                        {VOICES.map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-stone-700 uppercase tracking-wider">Direction</label>
                      <input 
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        className="w-full bg-stone-50 border border-stone-200 text-stone-900 rounded-xl focus:ring-[#5A5A40] focus:border-[#5A5A40] block p-3 outline-none"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Reading Area */}
            <div className="flex-1 flex flex-col justify-center items-center py-12">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentIndex}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                  className="max-w-3xl w-full"
                >
                  <div className="text-center mb-8">
                    <span className="text-sm font-sans font-semibold text-stone-400 uppercase tracking-widest">
                      Page {chunks[currentIndex]?.pageNum}
                    </span>
                  </div>
                  
                  <p className="text-2xl md:text-3xl leading-relaxed text-stone-800 text-center">
                    {currentChunk?.text}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Player Controls - Fixed at bottom */}
            <div className="mt-auto pt-8 pb-4">
              <div className="bg-white rounded-full shadow-lg border border-stone-100 p-4 flex items-center justify-between max-w-md mx-auto">
                <button 
                  onClick={() => skipTo(currentIndex - 1)}
                  disabled={currentIndex === 0}
                  className="w-12 h-12 flex items-center justify-center text-stone-400 hover:text-stone-900 disabled:opacity-30 transition-colors"
                >
                  <SkipBack className="w-6 h-6" />
                </button>
                
                <button 
                  onClick={togglePlayPause}
                  className="w-16 h-16 bg-[#5A5A40] hover:bg-[#4A4A30] text-white rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-md"
                >
                  {currentChunk?.status === 'generating' ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="w-6 h-6 fill-current" />
                  ) : (
                    <Play className="w-6 h-6 fill-current ml-1" />
                  )}
                </button>
                
                <button 
                  onClick={() => skipTo(currentIndex + 1)}
                  disabled={currentIndex === queue.length - 1}
                  className="w-12 h-12 flex items-center justify-center text-stone-400 hover:text-stone-900 disabled:opacity-30 transition-colors"
                >
                  <SkipForward className="w-6 h-6" />
                </button>
              </div>
              
              <div className="text-center mt-4 font-sans text-sm text-stone-400">
                {currentIndex + 1} of {queue.length} parts
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
