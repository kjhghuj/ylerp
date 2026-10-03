import React, { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Bot, User, RotateCcw, Sparkles, Lock, Brain, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../../../AuthContext';
import { hasPermission } from '../../../components/PermissionTree';
import { fetchProductChatHistory, getApiErrorDetail, sendProductAnalysisChatStream } from '../services/productAnalysisApi';
import { MarkdownText } from '../components/MarkdownText';
import { useProductAnalysisStrings } from '../i18n';
import type { ChatMessage } from '../types';

interface AiChatPanelProps {
  shopId: string;
  /** 传入则以单品上下文对话；省略为整店汇总模式。 */
  itemId?: string;
  itemTitle?: string;
  /** 分析区间（与详情页一致）。提供时随请求发送并展示；省略时后端默认近 7 天 */
  from?: string;
  to?: string;
}

const ITEM_NAME_SNIPPET_LENGTH = 40;

/** 单品对话恢复服务器近 30 天历史，完成的问答自动保存；整店模式仍是临时对话。
 *  上下文变化中止旧流并重新恢复当前商品记录，迟到结果不能写入新上下文。 */
export const AiChatPanel: React.FC<AiChatPanelProps> = ({ shopId, itemId, itemTitle, from, to }) => {
  const { user } = useAuth();
  const strings = useProductAnalysisStrings();
  const hasAiPermission =
    !user || user.role === 'owner' || hasPermission(user.permissions || [], 'product-analysis.aiChat');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(Boolean(itemId));
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyRetry, setHistoryRetry] = useState(0);
  const [saveStatus, setSaveStatus] = useState<'ready' | 'saved' | 'unsaved'>('ready');
  const [deepThinking, setDeepThinking] = useState(true);
  /** 各消息思考区的手动展开状态（未设置时：思考流式中展开、出正文后折叠） */
  const [expandedReasoning, setExpandedReasoning] = useState<Record<number, boolean>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** 上下文令牌：发送时快照，回调/收尾时与当前值比对，过期上下文的流不写入 state */
  const contextTokenRef = useRef(0);
  /** 在途流的 AbortController：上下文切换 / 卸载时中止 */
  const abortRef = useRef<AbortController | null>(null);

  // 区间不属于保存键：变更区间后仍恢复同一商品；请求令牌包含账号与权限变化。
  useEffect(() => {
    contextTokenRef.current += 1;
    const token = contextTokenRef.current;
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setError(null);
    setInput('');
    setIsSending(false);
    setExpandedReasoning({});
    setHistoryError(null);
    setSaveStatus('ready');
    setHistoryLoading(Boolean(itemId && hasAiPermission));
    if (itemId && hasAiPermission) {
      void fetchProductChatHistory(shopId, itemId).then(result => {
        if (contextTokenRef.current === token) setMessages(result.messages);
      }).catch(err => {
        if (contextTokenRef.current === token) setHistoryError(getApiErrorDetail(err));
      }).finally(() => {
        if (contextTokenRef.current === token) setHistoryLoading(false);
      });
    }
    return () => { contextTokenRef.current += 1; abortRef.current?.abort(); };
  }, [shopId, itemId, from, to, user?.id, hasAiPermission, historyRetry]);

  // 卸载时同样中止在途流
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending || historyLoading || historyError || !hasAiPermission) return;
    const contextToken = contextTokenRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    // 先放置空的助手占位消息，思考与正文增量逐段填充
    const assistantIndex = nextMessages.length;
    setMessages([...nextMessages, { role: 'assistant', content: '' }]);
    setInput('');
    setError(null);
    setIsSending(true);
    setSaveStatus('unsaved');
    const startedAt = Date.now();
    let streamed = '';
    let reasoning = '';
    let contentStartedAt = 0;
    const isStale = () => contextTokenRef.current !== contextToken;
    const patchAssistant = (patch: Partial<ChatMessage>) => {
      if (isStale()) return; // 上下文已切换：旧流不写入新上下文
      setMessages((prev) => {
        const copy = [...prev];
        copy[assistantIndex] = { ...copy[assistantIndex], ...patch };
        return copy;
      });
    };
    try {
      await sendProductAnalysisChatStream(
        {
          shopId,
          ...(itemId ? { itemId } : {}),
          ...(from !== undefined && to !== undefined ? { from, to } : {}),
          // 界面展示完整保留期；请求仅带最近消息，单品上下文由服务端恢复。
          messages: nextMessages.slice(-8).map(({ role, content }) => ({ role, content })),
          deepThinking,
          ...(itemId ? { persistHistory: true } : {}),
        },
        {
          onReasoning: (chunk) => {
            reasoning += chunk;
            patchAssistant({ reasoning });
          },
          onDelta: (delta) => {
            if (!contentStartedAt) {
              contentStartedAt = Date.now();
              patchAssistant({ reasoningMs: contentStartedAt - startedAt });
            }
            streamed += delta;
            patchAssistant({ content: streamed });
          },
          onDone: () => { if (!isStale()) setSaveStatus('saved'); },
        },
        { signal: controller.signal }
      );
      if (!streamed && !isStale()) {
        setMessages((prev) => prev.filter((_, index) => index !== assistantIndex));
      }
    } catch (err) {
      // 上下文切换导致的主动中止静默处理；真实错误仅在当前上下文内提示
      if (!controller.signal.aborted) {
        if (!streamed && !isStale()) {
          setMessages((prev) => prev.filter((_, index) => index !== assistantIndex));
        }
        if (!isStale()) setError(getApiErrorDetail(err));
      }
    } finally {
      if (!isStale()) {
        setIsSending(false);
        inputRef.current?.focus();
      }
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  if (!hasAiPermission) {
    return (
      <div
        className="rounded-2xl border p-10 flex flex-col items-center gap-3"
        style={{ backgroundColor: 'var(--pa-card)', borderColor: 'var(--pa-card-border)', color: 'var(--text-tertiary)' }}
      >
        <Lock size={28} />
        <p className="text-sm">{strings.aiDisabled}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--pa-card)', borderColor: 'var(--pa-card-border)' }}>
      {/* 上下文指示 + 深度思考开关 */}
      <div className="px-4 py-2.5 border-b flex items-center gap-2 text-xs" style={{ borderColor: 'var(--pa-card-border)', color: 'var(--text-tertiary)' }}>
        <Sparkles size={13} style={{ color: 'var(--pa-accent-text)' }} />
        <span className="truncate">
          {itemId
            ? `${strings.ai.contextItem}：${(itemTitle ?? '').slice(0, ITEM_NAME_SNIPPET_LENGTH)}`
            : strings.ai.contextReport}
        </span>
        {from !== undefined && to !== undefined && (
          <span className="shrink-0 font-mono" title={strings.ai.contextRange.replace('{from}', from).replace('{to}', to)}>
            {from} ~ {to}
          </span>
        )}
        <button
          type="button"
          onClick={() => setDeepThinking((value) => !value)}
          disabled={isSending}
          aria-pressed={deepThinking}
          title={strings.ai.deepThinkingHint}
          className="ml-auto shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full border transition-colors"
          style={{
            borderColor: deepThinking ? 'var(--pa-accent-ui)' : 'var(--pa-card-border)',
            color: deepThinking ? 'var(--pa-accent-text)' : 'var(--text-tertiary)',
          }}
        >
          <Brain size={12} />
          {strings.ai.deepThinking}
        </button>
      </div>

      {itemId && <div className="px-4 py-2 text-xs border-b" role="status" style={{ borderColor: 'var(--pa-card-border)', color: 'var(--text-tertiary)' }}>
        {historyLoading ? strings.ai.historyLoading : isSending ? strings.ai.thinking :
          saveStatus === 'saved' ? strings.ai.historySaved : saveStatus === 'unsaved' ? strings.ai.historyUnsaved : strings.ai.historyReady}
      </div>}
      {historyError && <div className="px-4 py-2 text-xs flex flex-wrap items-center gap-2" role="alert" style={{ color: '#dc2626' }}>
        <span>{historyError}</span>
        <button type="button" onClick={() => setHistoryRetry(value => value + 1)}>{strings.ai.historyRetry}</button>
      </div>}

      {/* 消息区 */}
      <div className="flex-1 min-h-[240px] max-h-[380px] overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {messages.length === 0 && !historyLoading && !historyError && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Bot size={28} style={{ color: 'var(--text-tertiary)' }} />
            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              {strings.ai.suggest.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => sendMessage(suggestion)}
                  className="px-3 py-1.5 rounded-full border text-xs transition-colors duration-200"
                  style={{ borderColor: 'var(--pa-card-border)', color: 'var(--text-secondary)' }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message, index) => {
          const isStreamingLast =
            isSending && index === messages.length - 1 && message.role === 'assistant';
          const thinkingStreaming = isStreamingLast && !message.content;
          // 思考流式期间自动展开；正文出现后自动折叠为摘要条（用户手动展开的除外）
          const reasoningExpanded = expandedReasoning[index] ?? thinkingStreaming;
          return (
          <React.Fragment key={index}>
          {message.role === 'assistant' && message.reasoning && (
            <div className="self-start ml-8 w-full max-w-[92%]">
              {reasoningExpanded ? (
                <div
                  className="rounded-xl border px-3 py-2"
                  style={{ borderColor: 'var(--pa-card-border)', backgroundColor: 'var(--pa-canvas)' }}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedReasoning((prev) => ({ ...prev, [index]: !reasoningExpanded }))}
                    className="w-full flex items-center justify-between text-[11px] mb-1"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    <span className="inline-flex items-center gap-1 font-medium">
                      {thinkingStreaming ? <Loader2 size={11} className="animate-spin" /> : <Brain size={11} />}
                      {thinkingStreaming ? strings.ai.thinkingNow : strings.ai.reasoningLabel}
                    </span>
                    {!thinkingStreaming && <ChevronUp size={12} />}
                  </button>
                  <div
                    className="max-h-28 overflow-y-auto text-[11px] leading-relaxed whitespace-pre-wrap break-words"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {message.reasoning}
                    {thinkingStreaming && <span className="animate-pulse">▍</span>}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setExpandedReasoning((prev) => ({ ...prev, [index]: true }))}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors"
                  style={{ borderColor: 'var(--pa-card-border)', color: 'var(--text-tertiary)' }}
                >
                  <Brain size={11} />
                  {strings.ai.thoughtFor.replace(
                    '{seconds}',
                    String(Math.max(1, Math.round((message.reasoningMs ?? 0) / 1000)))
                  )}
                  <ChevronDown size={11} />
                </button>
              )}
            </div>
          )}
          <div
            className={`flex items-start gap-2 max-w-[92%] ${message.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'}`}
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
              style={{
                backgroundColor: message.role === 'user' ? 'var(--pa-accent-ui)' : 'var(--pa-card-border)',
                color: message.role === 'user' ? 'var(--pa-on-accent)' : 'var(--text-secondary)',
              }}
            >
              {message.role === 'user' ? <User size={13} /> : <Bot size={13} />}
            </div>
            <div
              className={`rounded-2xl text-sm ${
                message.role === 'user'
                  ? 'px-3.5 py-2.5 whitespace-pre-wrap break-words'
                  : 'px-3.5 py-2.5 break-words min-w-0'
              }`}
              style={{
                backgroundColor: message.role === 'user' ? 'var(--pa-accent-ui)' : 'var(--bg-card-hover)',
                color: message.role === 'user' ? 'var(--pa-on-accent)' : 'var(--text-primary)',
                borderBottomRightRadius: message.role === 'user' ? 6 : undefined,
                borderBottomLeftRadius: message.role === 'assistant' ? 6 : undefined,
              }}
            >
              {message.role === 'assistant' ? <MarkdownText content={message.content} /> : message.content}
              {message.role === 'user' && message.analysisFrom && message.analysisTo && <p className="text-[10px] mt-1 opacity-70">
                {message.analysisFrom} ~ {message.analysisTo}
              </p>}
              {isStreamingLast && message.content && <span className="animate-pulse">▍</span>}
            </div>
          </div>
          </React.Fragment>
          );
        })}
        {isSending && !messages[messages.length - 1]?.content && !messages[messages.length - 1]?.reasoning && (
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
          disabled={isSending || historyLoading || Boolean(historyError)}
          className="flex-1 rounded-xl border px-3 py-2 text-sm resize-none"
          style={{
            backgroundColor: 'var(--pa-canvas)',
            borderColor: 'var(--pa-card-border)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          type="button"
          onClick={() => sendMessage(input)}
          disabled={isSending || historyLoading || Boolean(historyError) || !input.trim()}
          className="p-2.5 rounded-xl shrink-0 transition-opacity duration-200 disabled:opacity-40"
          style={{ backgroundColor: 'var(--pa-accent-ui)', color: 'var(--pa-on-accent)' }}
          aria-label={strings.ai.send}
        >
          {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
};
