/**
 * VoiceInput — PC 端语音识别输入组件
 *
 * 使用浏览器内置 Web Speech API (SpeechRecognition)
 * - Chrome/Edge 完全支持，免费，无需第三方
 * - 仅在桌面端显示（手机端微信/Safari 支持有限）
 * - 不可用时静默降级（按钮不显示）
 */

import { useState, useRef, useCallback } from 'react';

interface VoiceInputProps {
  onResult: (text: string) => void;
}

// 检查浏览器是否支持
const SpeechRecognitionAPI =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function VoiceInput({ onResult }: VoiceInputProps) {
  const [listening, setListening] = useState(false);
  const [supported] = useState(() => !!SpeechRecognitionAPI);
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(() => {
    if (!SpeechRecognitionAPI) return;
    const rec = new SpeechRecognitionAPI();
    rec.lang = 'zh-CN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      if (text) onResult(text);
    };

    rec.onerror = (event: any) => {
      console.warn('[voice] 语音识别错误:', event.error);
      setListening(false);
    };

    rec.onend = () => setListening(false);

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [onResult]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  // 不支持时不渲染
  if (!supported) return null;

  return (
    <button
      onClick={listening ? stopListening : startListening}
      className={`shrink-0 w-10 h-10 rounded-xl border transition-all flex items-center justify-center text-lg active:scale-95
        ${listening
          ? 'bg-red-500/20 border-red-500/40 animate-pulse'
          : 'bg-surface-card border-white/10 hover:border-white/20'}`}
      title={listening ? '点击停止录音' : '语音输入（普通话）'}
    >
      🎤
    </button>
  );
}

/** 检测是否为移动设备 */
export function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
}
