import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** AI 回复的 Markdown 渲染（标题/加粗/列表/代码/表格等），样式跟随主题 CSS 变量 */
export const MarkdownText: React.FC<{ content: string }> = ({ content }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      h1: ({ children }) => <p className="font-semibold text-base mt-2 mb-1 first:mt-0">{children}</p>,
      h2: ({ children }) => <p className="font-semibold text-[15px] mt-2 mb-1 first:mt-0">{children}</p>,
      h3: ({ children }) => <p className="font-semibold text-sm mt-2 mb-0.5 first:mt-0">{children}</p>,
      h4: ({ children }) => <p className="font-semibold text-sm mt-1.5 mb-0.5 first:mt-0">{children}</p>,
      h5: ({ children }) => <p className="font-semibold text-sm mt-1.5 mb-0.5 first:mt-0">{children}</p>,
      h6: ({ children }) => <p className="font-semibold text-sm mt-1.5 mb-0.5 first:mt-0">{children}</p>,
      p: ({ children }) => <p className="leading-relaxed my-1 first:mt-0 last:mb-0">{children}</p>,
      ul: ({ children }) => <ul className="list-disc pl-4 my-1 space-y-0.5">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal pl-4 my-1 space-y-0.5">{children}</ol>,
      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      a: ({ children, href }) => (
        <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }} className="underline underline-offset-2">
          {children}
        </a>
      ),
      blockquote: ({ children }) => (
        <blockquote className="my-1.5 pl-2.5 border-l-2" style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}>
          {children}
        </blockquote>
      ),
      hr: () => <hr className="my-2" style={{ borderColor: 'var(--border-light)' }} />,
      code: ({ className, children }) => {
        // 有 language- 类名的是代码块内的 <code>，交给 pre 统一着色
        if (className) return <code className="font-mono text-xs">{children}</code>;
        return (
          <code
            className="font-mono text-xs px-1 py-0.5 rounded"
            style={{ backgroundColor: 'var(--bg-primary)' }}
          >
            {children}
          </code>
        );
      },
      pre: ({ children }) => (
        <pre
          className="my-1.5 p-2.5 rounded-lg overflow-x-auto text-xs leading-relaxed"
          style={{ backgroundColor: 'var(--bg-primary)' }}
        >
          {children}
        </pre>
      ),
      table: ({ children }) => (
        <div className="my-1.5 overflow-x-auto">
          <table className="w-full text-xs border-collapse">{children}</table>
        </div>
      ),
      th: ({ children }) => (
        <th className="px-2 py-1 text-left font-semibold border" style={{ borderColor: 'var(--border-light)' }}>
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td className="px-2 py-1 border" style={{ borderColor: 'var(--border-light)' }}>
          {children}
        </td>
      ),
      img: ({ src, alt }) => <img src={src} alt={alt ?? ''} className="max-w-full rounded-lg my-1" />,
    }}
  >
    {content}
  </ReactMarkdown>
);
