'use client';

import { Bot, User } from 'lucide-react';
import { ToolInvocation, ToolResult } from './tool-result';
import type { Message } from '@ai-sdk/react';

interface MessageProps {
  message: Message;
}

export function MessageBubble({ message }: MessageProps) {
  const isAssistant = message.role === 'assistant';
  const _isUser = message.role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        padding: '1rem 1.25rem',
        maxWidth: '100%',
      }}
    >
      {/* Avatar */}
      <div
        style={{
          flexShrink: 0,
          width: '2rem',
          height: '2rem',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isAssistant ? 'var(--primary)' : 'var(--muted)',
          color: isAssistant ? 'white' : 'var(--foreground)',
        }}
      >
        {isAssistant ? <Bot size={16} /> : <User size={16} />}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--muted-foreground)',
            marginBottom: '0.25rem',
          }}
        >
          {isAssistant ? 'LeadsPlease Assistant' : 'You'}
        </div>

        {/* Tool invocations */}
        {message.parts?.map((part, index) => {
          if (part.type === 'tool-invocation') {
            const toolPart = part as {
              type: 'tool-invocation';
              toolInvocation: {
                toolName: string;
                args: Record<string, unknown>;
                state: string;
                result?: unknown;
              };
            };

            if (toolPart.toolInvocation.state === 'result') {
              return (
                <ToolResult
                  key={index}
                  toolName={toolPart.toolInvocation.toolName}
                  result={
                    typeof toolPart.toolInvocation.result === 'string'
                      ? toolPart.toolInvocation.result
                      : JSON.stringify(toolPart.toolInvocation.result)
                  }
                  args={toolPart.toolInvocation.args}
                />
              );
            }

            return (
              <ToolInvocation
                key={index}
                toolName={toolPart.toolInvocation.toolName}
                args={toolPart.toolInvocation.args}
              />
            );
          }

          if (part.type === 'text' && (part as { type: 'text'; text: string }).text) {
            return (
              <div
                key={index}
                className="message-content"
                style={{
                  fontSize: '0.9375rem',
                  lineHeight: 1.6,
                }}
                dangerouslySetInnerHTML={{
                  __html: formatMessage((part as { type: 'text'; text: string }).text),
                }}
              />
            );
          }

          return null;
        })}

        {/* Fallback: if no parts, show content directly */}
        {(!message.parts || message.parts.length === 0) && message.content && (
          <div
            className="message-content"
            style={{
              fontSize: '0.9375rem',
              lineHeight: 1.6,
            }}
            dangerouslySetInnerHTML={{
              __html: formatMessage(message.content),
            }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Basic markdown-like formatting for messages.
 * Converts **bold**, *italic*, `code`, newlines, and lists.
 */
function formatMessage(text: string): string {
  return text
    // Escape HTML first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Unordered lists
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
    // Paragraphs (double newlines)
    .replace(/\n\n/g, '</p><p>')
    // Single newlines within paragraphs
    .replace(/\n/g, '<br/>')
    // Wrap in paragraph
    .replace(/^(.+)$/, '<p>$1</p>')
    // Clean up empty paragraphs
    .replace(/<p><\/p>/g, '')
    .replace(/<p><br\/><\/p>/g, '');
}

export function TypingIndicator() {
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        padding: '1rem 1.25rem',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: '2rem',
          height: '2rem',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--primary)',
          color: 'white',
        }}
      >
        <Bot size={16} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.5rem 0' }}>
        <div className="typing-dot" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--muted-foreground)' }} />
        <div className="typing-dot" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--muted-foreground)' }} />
        <div className="typing-dot" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--muted-foreground)' }} />
      </div>
    </div>
  );
}
