import React, { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Bot, User, RotateCcw, Sparkles, Lock } from 'lucide-react';
import { useAuth } from '../../../AuthContext';
import { hasPermission } from '../../../components/PermissionTree';
import { getApiErrorDetail, sendProductAnalysisChat } from '../services/productAnalysisApi';
import { useProductAnalysisStrings } from '../i18n';
import type { ChatMessage } from '../types';

interface AiChatPanelProps {
  shopId: string;
  /** 传入则以单品上下文对话；省略为整店汇总模式。from/to 缺省时后端默认近 7 天 */
  itemId?: string;
  itemTitle?: string;
}

const ITEM_NAME_SNIPPET_LENGTH = 40;

/** GLM AI 对话面板：非流式，130s 超时，聊天记录仅存前端 state */
export const AiChatPanel: React.FC<AiChatPanelProps> = ({ shopId, itemId, itemTitle }) => {
  const { user } = useAuth();
  const strings = useProductAnalysisStrings();
  const hasAiPermission =
    !user || user.role === 'owner' || hasPermission(user.permissions || [], 'product-analysis.aiChat');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending || !hasAiPermission) return;
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setError(null);
    setIsSending(true);
    try {
      const result = await sendProductAnalysisChat({
        shopId,
        ...(itemId ? { itemId } : {}),
        messages: nextMessages,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: result.content }]);
    } catch (err) {
      setError(getApiErrorDetail(err));
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  if (!hasAiPermission) {
    return (
      <div
        className="rounded-2xl border p-10 flex flex-col items-center gap-3"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)', color: 'var(--text-tertiary)' }}
      >
        <Lock size={28} />
        <p className="text-sm">{strings.aiDisabled}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}>
      {/* 上下文指示 */}
      <div className="px-4 py-2.5 border-b flex items-center gap-2 text-xs" style={{ borderColor: 'var(--border-light)', color: 'var(--text-tertiary)' }}>
        <Sparkles size={13} style={{ color: 'var(--primary)' }} />
        <span className="truncate">
          {itemId
            ? `${strings.ai.contextItem}：${(itemTitle ?? '').slice(0, ITEM_NAME_SNIPPET_LENGTH)}`
            : strings.ai.contextReport}
        </span>
      </div>

      {/* 消息区 */}
      <div className="flex-1 min-h-[240px] max-h-[380px] overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Bot size={28} style={{ color: 'var(--text-tertiary)' }} />
            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              {strings.ai.suggest.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => sendMessage(suggestion)}
                  className="px-3 py-1.5 rounded-full border text-xs transition-colors duration-200"
                  style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex items-start gap-2 max-w-[92%] ${message.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'}`}
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
              style={{
                backgroundColor: message.role === 'user' ? 'var(--primary)' : 'var(--border-light)',
                color: message.role === 'user' ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {message.role === 'user' ? <User size={13} /> : <Bot size={13} />}
            </div>
            <div
              className="px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words"
              style={{
                backgroundColor: message.role === 'user' ? 'var(--primary)' : 'var(--bg-card-hover)',
                color: message.role === 'user' ? '#fff' : 'var(--text-primary)',
                borderBottomRightRadius: message.role === 'user' ? 6 : undefined,
                borderBottomLeftRadius: message.role === 'assistant' ? 6 : undefined,
              }}
            >
              {message.content}
            </div>
          </div>
        ))}
        {isSending && (
          <div className="flex items-center gap-2 self-start text-xs" style={{ color: 'var(--text-tertiary)' }}>
            <Loader2 size={14} className="animate-spin" />
            {strings.ai.thinking}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 错误 + 输入区 */}
      {error && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-xl text-xs flex items-center justify-between gap-2" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#dc2626' }}>
          <span className="truncate" title={error}>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 flex items-center gap-1 font-medium">
            <RotateCcw size={12} />
            {strings.ai.retry}
          </button>
        </div>
      )}
      <div className="px-4 pb-4 flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            // isComposing：中文输入法候选词确认的 Enter 不发送
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              sendMessage(input);
            }
          }}
          rows={2}
          placeholder={strings.ai.placeholder}
          disabled={isSending}
          className="flex-1 rounded-xl border px-3 py-2 text-sm resize-none"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-light)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          type="button"
          onClick={() => sendMessage(input)}
          disabled={isSending || !input.trim()}
          className="p-2.5 rounded-xl shrink-0 transition-opacity duration-200 disabled:opacity-40"
          style={{ backgroundColor: 'var(--primary)', color: '#fff' }}
          aria-label={strings.ai.send}
        >
          {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
};
