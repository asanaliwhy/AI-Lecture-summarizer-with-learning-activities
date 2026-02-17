import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle, X, Send, Loader2, Bot, User, Trash2 } from 'lucide-react'
import DOMPurify from 'dompurify'
import { api } from '../lib/api'

interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
}

interface SummaryChatPanelProps {
    summaryId: string
    summaryTitle: string
}

export function SummaryChatPanel({ summaryId, summaryTitle }: SummaryChatPanelProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [])

    useEffect(() => {
        scrollToBottom()
    }, [messages, scrollToBottom])

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus()
        }
    }, [isOpen])

    const handleSend = async () => {
        const trimmed = input.trim()
        if (!trimmed || isLoading) return

        const userMessage: ChatMessage = { role: 'user', content: trimmed }
        const updatedMessages = [...messages, userMessage]
        setMessages(updatedMessages)
        setInput('')
        setIsLoading(true)

        try {
            const { reply } = await api.summaries.chat(summaryId, trimmed, messages)
            setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
        } catch {
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: 'Sorry, I couldn\'t process your question. Please try again.' },
            ])
        } finally {
            setIsLoading(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const handleClear = () => {
        setMessages([])
    }

    const formatMessage = useCallback((text: string) => {
        // Safety net: strip any residual markdown Gemini might slip in
        const cleaned = text
            .replace(/^#{1,6}\s+/gm, '')          // headers
            .replace(/\*\*(.*?)\*\*/g, '$1')       // bold
            .replace(/\*(.*?)\*/g, '$1')           // italic
            .replace(/`{1,3}[^`]*`{1,3}/g, (m) => // code blocks/inline
                m.replace(/`/g, ''))
            .replace(/^[\s]*[-*+]\s+/gm, '')       // bullet points
            .replace(/^[\s]*\d+\.\s+/gm, '')       // numbered lists
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
        return DOMPurify.sanitize(cleaned.replace(/\n/g, '<br />'))
    }, [])

    return (
        <>
            {/* Floating Chat Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 group"
                    style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}
                >
                    <MessageCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">Ask AI</span>
                    {messages.length > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                            {messages.filter((m) => m.role === 'user').length}
                        </span>
                    )}
                </button>
            )}

            {/* Chat Panel */}
            {isOpen &&
                createPortal(
                    <div className="fixed bottom-6 right-6 z-50 flex flex-col w-[400px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-4rem)] rounded-2xl border border-border bg-background shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
                        {/* Header */}
                        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-muted/50">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10">
                                    <Bot className="h-4 w-4 text-primary" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-sm font-semibold truncate">AI Study Assistant</h3>
                                    <p className="text-[11px] text-muted-foreground truncate">
                                        Ask about: {summaryTitle}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {messages.length > 0 && (
                                    <button
                                        onClick={handleClear}
                                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                        title="Clear chat"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                )}
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                            {messages.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                                    <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-4">
                                        <Bot className="h-7 w-7 text-primary" />
                                    </div>
                                    <h4 className="text-sm font-semibold mb-1.5">Ask anything about this summary</h4>
                                    <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                                        I can explain concepts, answer questions, or help you study the content.
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 justify-center">
                                        {[
                                            'What are the key points?',
                                            'Explain the main concept',
                                            'Give me a quick overview',
                                        ].map((suggestion) => (
                                            <button
                                                key={suggestion}
                                                onClick={() => {
                                                    setInput(suggestion)
                                                    inputRef.current?.focus()
                                                }}
                                                className="text-[11px] px-2.5 py-1.5 rounded-full border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                            >
                                                {suggestion}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {messages.map((msg, i) => (
                                <div
                                    key={i}
                                    className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    {msg.role === 'assistant' && (
                                        <div className="flex-shrink-0 mt-0.5">
                                            <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10">
                                                <Bot className="h-3.5 w-3.5 text-primary" />
                                            </div>
                                        </div>
                                    )}
                                    <div
                                        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${msg.role === 'user'
                                            ? 'bg-primary text-primary-foreground rounded-br-md'
                                            : 'bg-muted text-foreground rounded-bl-md chat-prose'
                                            }`}
                                        dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
                                    />
                                    {msg.role === 'user' && (
                                        <div className="flex-shrink-0 mt-0.5">
                                            <div className="flex items-center justify-center h-6 w-6 rounded-full bg-muted">
                                                <User className="h-3.5 w-3.5 text-muted-foreground" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {isLoading && (
                                <div className="flex gap-2 justify-start">
                                    <div className="flex-shrink-0 mt-0.5">
                                        <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10">
                                            <Bot className="h-3.5 w-3.5 text-primary" />
                                        </div>
                                    </div>
                                    <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                                        <div className="flex items-center gap-1.5">
                                            <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.3s]" />
                                            <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.15s]" />
                                            <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div className="border-t border-border px-3 py-2.5 bg-background">
                            <div className="flex items-center gap-2">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Ask a question..."
                                    disabled={isLoading}
                                    className="flex-1 bg-muted/50 border border-border rounded-xl px-3.5 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 transition-all"
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!input.trim() || isLoading}
                                    className="flex items-center justify-center h-9 w-9 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                >
                                    {isLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Send className="h-4 w-4" />
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    )
}
