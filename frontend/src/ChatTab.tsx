import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import api from './api';

interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: Date;
  isMe: boolean;
}

export default function ChatTab() {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch chat history on mount
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await api.get('/chat/history');
        const history = res.data.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }));
        
        if (history.length > 0) {
          setMessages(history);
        } else {
          // Default greeting if no history
          setMessages([
            { id: '1', sender: 'AI Assistant', text: 'Hello! How can I help you with your jobs and tasks today?', timestamp: new Date(), isMe: false },
          ]);
        }
      } catch (error) {
        console.error('Failed to fetch chat history:', error);
        setMessages([
          { id: '1', sender: 'AI Assistant', text: 'Hello! How can I help you with your jobs and tasks today?', timestamp: new Date(), isMe: false },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isTyping) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'You',
      text: inputText,
      timestamp: new Date(),
      isMe: true,
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputText('');
    setIsTyping(true);

    try {
      const res = await api.post('/chat', { messages: updatedMessages });
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'AI Assistant',
        text: res.data.text,
        timestamp: new Date(),
        isMe: false,
      };

      setMessages(prev => [...prev, aiMessage]);

      // Invalidate queries to refresh UI in other tabs
      queryClient.invalidateQueries();
    } catch (error) {
      console.error('Chat Error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'System',
        text: 'Sorry, I encountered an error. Please try again later.',
        timestamp: new Date(),
        isMe: false,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="w-full max-w-5xl flex flex-col h-full bg-white border border-slate-200 rounded shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
        <h2 className="font-bold text-lg">AI Support Chat</h2>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4 bg-slate-50">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm italic">
            Loading conversation history...
          </div>
        ) : messages.map((msg) => (
          <div
            key={msg.id}
            className={clsx(
              "flex flex-col max-w-[80%]",
              msg.isMe ? "ml-auto items-end" : "mr-auto items-start"
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-slate-500">{msg.sender}</span>
              <span className="text-[10px] text-slate-400">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div
              className={clsx(
                "px-4 py-2 rounded-2xl text-sm shadow-sm whitespace-pre-wrap",
                msg.isMe 
                  ? "bg-blue-600 text-white rounded-tr-none" 
                  : "bg-white border border-slate-200 text-slate-800 rounded-tl-none"
              )}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex flex-col items-start mr-auto animate-pulse">
            <span className="text-xs font-bold text-slate-500 mb-1">AI Assistant</span>
            <div className="px-4 py-2 rounded-2xl text-sm bg-white border border-slate-200 text-slate-400 rounded-tl-none">
              Typing...
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="p-4 bg-white border-t border-slate-200 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Ask me anything..."
          className="flex-1 border border-slate-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          disabled={isTyping}
        />
        <button
          type="submit"
          disabled={isTyping}
          className="bg-blue-600 text-white px-6 py-2 rounded-full text-sm font-bold hover:bg-blue-700 transition-colors disabled:bg-slate-400"
        >
          Send
        </button>
      </form>
    </div>
  );
}
