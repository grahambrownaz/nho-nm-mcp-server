'use client';

import { useChat } from '@ai-sdk/react';
import { useRef, useEffect } from 'react';
import { Send, RotateCcw } from 'lucide-react';
import { Header } from './header';
import { MessageBubble, TypingIndicator } from './message';

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, reload, error } =
    useChat({
      api: '/api/chat',
      initialMessages: [],
    });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle Enter to submit, Shift+Enter for newline
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
      }
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        maxWidth: '52rem',
        margin: '0 auto',
        backgroundColor: 'var(--card)',
        borderLeft: '1px solid var(--border)',
        borderRight: '1px solid var(--border)',
      }}
    >
      <Header />

      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {messages.length === 0 && (
          <WelcomeScreen onSuggestionClick={(text) => {
            handleInputChange({ target: { value: text } } as React.ChangeEvent<HTMLTextAreaElement>);
            // Small delay to let state update, then submit
            setTimeout(() => {
              const form = document.getElementById('chat-form') as HTMLFormElement;
              if (form) form.requestSubmit();
            }, 50);
          }} />
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <TypingIndicator />
        )}

        {error && (
          <div
            style={{
              margin: '1rem 1.25rem',
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>Something went wrong. </span>
            <button
              onClick={() => reload()}
              style={{
                background: 'none',
                border: 'none',
                color: '#dc2626',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              <RotateCcw size={14} />
              Retry
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          padding: '0.75rem 1rem',
          backgroundColor: 'var(--card)',
        }}
      >
        <form
          id="chat-form"
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'flex-end',
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about data lists, pricing, campaigns..."
            rows={1}
            style={{
              flex: 1,
              resize: 'none',
              padding: '0.625rem 0.875rem',
              borderRadius: '0.75rem',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '0.9375rem',
              lineHeight: 1.5,
              outline: 'none',
              minHeight: '2.75rem',
              maxHeight: '8rem',
              overflow: 'auto',
              fontFamily: 'inherit',
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 128) + 'px';
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            style={{
              padding: '0.625rem',
              borderRadius: '0.75rem',
              border: 'none',
              backgroundColor: input.trim() && !isLoading ? 'var(--primary)' : 'var(--muted)',
              color: input.trim() && !isLoading ? 'white' : 'var(--muted-foreground)',
              cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s',
              width: '2.75rem',
              height: '2.75rem',
              flexShrink: 0,
            }}
          >
            <Send size={18} />
          </button>
        </form>
        <p
          style={{
            fontSize: '0.6875rem',
            color: 'var(--muted-foreground)',
            textAlign: 'center',
            margin: '0.5rem 0 0',
          }}
        >
          AI assistant using demo data. Responses may not be accurate.
        </p>
      </div>
    </div>
  );
}

function WelcomeScreen({ onSuggestionClick }: { onSuggestionClick: (text: string) => void }) {
  const suggestions = [
    {
      title: 'Find leads',
      text: 'I need sales leads for my business',
      emoji: '🔍',
    },
    {
      title: 'Direct mail',
      text: 'I want to send postcards to new homeowners',
      emoji: '📬',
    },
    {
      title: 'Check pricing',
      text: 'What does a list of 1,000 records cost?',
      emoji: '💰',
    },
    {
      title: 'See sample data',
      text: 'Show me sample new homeowner records in 85255',
      emoji: '📊',
    },
  ];

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
        gap: '2rem',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h2
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            margin: '0 0 0.5rem',
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Welcome to LeadsPlease
        </h2>
        <p style={{ fontSize: '1rem', color: 'var(--muted-foreground)', margin: 0 }}>
          Your AI assistant for consumer &amp; business data
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '0.75rem',
          maxWidth: '32rem',
          width: '100%',
        }}
      >
        {suggestions.map((s) => (
          <button
            key={s.title}
            onClick={() => onSuggestionClick(s.text)}
            style={{
              padding: '1rem',
              borderRadius: '0.75rem',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--card)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'border-color 0.15s, background-color 0.15s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary)';
              e.currentTarget.style.backgroundColor = 'var(--accent)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.backgroundColor = 'var(--card)';
            }}
          >
            <div style={{ fontSize: '1.25rem', marginBottom: '0.375rem' }}>{s.emoji}</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--foreground)' }}>
              {s.title}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', marginTop: '0.125rem' }}>
              {s.text}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
