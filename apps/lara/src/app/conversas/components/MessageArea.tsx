'use client';

import { Send, Loader, UserCircle } from 'lucide-react';
import { AudioPlayer } from './AudioPlayer';
import type { Conversation } from '../hooks/useConversations';
import type { Message } from '../hooks/useMessages';
import { format } from 'date-fns';

interface MessageAreaProps {
  selectedConversation: Conversation | null;
  messages: Message[];
  isLoadingMessages: boolean;
  newMessage: string;
  onNewMessageChange: (val: string) => void;
  onSendMessage: () => void;
  sendStatus: 'idle' | 'sending' | 'error';
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function MessageArea({
  selectedConversation,
  messages,
  isLoadingMessages,
  newMessage,
  onNewMessageChange,
  onSendMessage,
  sendStatus,
  messagesEndRef
}: MessageAreaProps) {
  if (!selectedConversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[hsl(var(--chat-bg))]">
        <p className="text-gray-500">Selecione uma conversa para começar</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[hsl(var(--chat-bg))] relative h-full">
      {/* Header */}
      <div className="h-[72px] border-b border-[hsl(var(--chat-border))] flex items-center px-6 gap-3 shrink-0">
        <UserCircle className="h-10 w-10 text-gray-400" />
        <div>
          <h2 className="font-medium text-sm">{selectedConversation.lead_name}</h2>
          <p className="text-xs text-gray-400">{selectedConversation.phone}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
        {isLoadingMessages ? (
          <div className="text-center text-gray-500 text-sm">Carregando mensagens...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm mt-10">Nenhuma mensagem ainda.</div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div key={msg.id} className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                  isUser 
                    ? 'bg-[hsl(var(--chat-msg-user))] text-[hsl(var(--chat-msg-user-text))] rounded-tl-sm' 
                    : 'bg-[hsl(var(--chat-msg-bot))] text-[hsl(var(--chat-msg-bot-text))] rounded-tr-sm'
                }`}>
                  <div className={`text-[12px] font-bold mb-1 pb-0.5 ${isUser ? 'text-[#ff9f43]' : 'text-[#10ac84]'}`}>
                    {isUser 
                      ? (selectedConversation.lead_name || 'Paciente')
                      : (msg.isManual ? 'Atendente Humano 👩‍⚕️' : 'Lara 🤖')
                    }
                  </div>
                  {msg.type === 'image' && msg.mediaUrl && (
                    <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="block w-full mb-2 cursor-pointer transition-transform hover:opacity-90 mt-1">
                      <img src={msg.mediaUrl} alt="Mídia" className="rounded-xl w-full h-auto object-contain" />
                    </a>
                  )}
                  {msg.type === 'audio' && msg.mediaUrl && (
                    <div className="mb-1">
                      <AudioPlayer src={msg.mediaUrl} isUser={isUser} />
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  <div className="flex items-center justify-end gap-1 mt-1 block">
                    {msg.isManual && !isUser && <span className="text-[10px] opacity-70">Humano</span>}
                    <span className="text-[10px] opacity-70">{format(new Date(msg.createdAt), 'HH:mm')}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <div className="p-4 border-t border-[hsl(var(--chat-border))] shrink-0 bg-[hsl(var(--chat-bg))]">
        {selectedConversation.ai_enabled && (
           <div className="mb-2 text-xs text-blue-500 flex items-center justify-center bg-blue-500/10 py-1 rounded-md">
             A Inteligência Artificial está ativa nesta conversa. Ao enviar mensagem, ela será pausada por 30m.
           </div>
        )}
        
        <div className="flex items-end gap-3 rounded-lg border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-2 focus-within:ring-1 ring-[hsl(var(--ring))]">
          <textarea
            value={newMessage}
            onChange={(e) => onNewMessageChange(e.target.value)}
            placeholder="Digite sua mensagem (Pausa a IA)..."
            className="flex-1 bg-transparent border-none focus:outline-none resize-none min-h-[44px] max-h-32 text-sm p-2 scrollbar-thin"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSendMessage();
              }
            }}
          />
          <button 
            onClick={onSendMessage}
            disabled={!newMessage.trim() || sendStatus === 'sending'}
            className="h-10 w-10 shrink-0 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center disabled:opacity-50 transition-colors"
          >
            {sendStatus === 'sending' ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
