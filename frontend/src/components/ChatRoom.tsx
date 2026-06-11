import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, Paperclip, Mic, X, Check, CheckCheck, 
  FileText, Download, Play, Pause, Volume2, Phone
} from 'lucide-react';
import type { User, Message, DirectMessage } from '../types';
import { socket, getUploadUrl, BACKEND_URL } from '../socket';

interface ChatRoomProps {
  currentUser: User;
  activeTag: string | null;
  activeDirectUser: User | null;
  messages: Message[];
  directMessages: DirectMessage[];
  onBackToSidebar: () => void;
  onStartCall?: (target: User) => void;
}

const formatMessageDate = (timestamp: number) => {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString([], {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
};

export const ChatRoom: React.FC<ChatRoomProps> = ({
  currentUser,
  activeTag,
  activeDirectUser,
  messages,
  directMessages,
  onBackToSidebar,
  onStartCall,
}) => {
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showPermissionAlert, setShowPermissionAlert] = useState(false);

  const isDirect = activeDirectUser !== null;
  const activeMessages = isDirect ? directMessages : messages;

  useEffect(() => {
    if (isDirect && activeDirectUser && currentUser) {
      const hasSentMessage = directMessages.some(
        (m) => m.sender_tag === activeDirectUser.tag && m.receiver_tag === currentUser.tag
      );

      if (hasSentMessage) {
        fetch(`${BACKEND_URL}/api/status-permissions/check?user_tag=${currentUser.tag}&viewer_tag=${activeDirectUser.tag}`)
          .then((res) => {
            if (res.ok) return res.json();
            throw new Error('Failed to check permission');
          })
          .then((data) => {
            if (!data.decided) {
              setShowPermissionAlert(true);
            }
          })
          .catch((err) => console.error(err));
      }
    } else {
      setShowPermissionAlert(false);
    }
  }, [activeDirectUser, directMessages, currentUser, isDirect]);

  const handlePermissionDecision = async (allow: boolean) => {
    if (!activeDirectUser || !currentUser) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/status-permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_tag: currentUser.tag,
          viewer_tag: activeDirectUser.tag,
          allowed: allow,
        }),
      });
      if (res.ok) {
        setShowPermissionAlert(false);
      }
    } catch (err) {
      console.error('Failed to save permission decision', err);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const isCancelledRef = useRef<boolean>(false);



  // Auto scroll to bottom and send read seen updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    
    if (activeMessages.length > 0) {
      if (isDirect && activeDirectUser) {
        socket.emit('direct_msg_seen', {
          sender_tag: activeDirectUser.tag,
          receiver_tag: currentUser.tag,
        });
      } else if (!isDirect && activeTag) {
        socket.emit('msg_seen', {
          room_tag: activeTag,
          user_id: currentUser.tag,
        });
      }
    }
  }, [activeMessages.length, activeTag, activeDirectUser?.tag, currentUser.tag, isDirect]);

  // Handle send text message
  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const messageId = Math.random().toString(36).substring(2, 11);

    if (isDirect && activeDirectUser) {
      const msgPayload = {
        id: messageId,
        sender_tag: currentUser.tag,
        receiver_tag: activeDirectUser.tag,
        msg_type: 'text' as const,
        content: inputText.trim(),
      };
      socket.emit('send_direct_msg', msgPayload);
    } else if (activeTag) {
      const msgPayload = {
        id: messageId,
        room_tag: activeTag,
        sender_id: currentUser.tag,
        sender_name: currentUser.username,
        msg_type: 'text' as const,
        content: inputText.trim(),
      };
      socket.emit('send_msg', msgPayload);
    }
    
    setInputText('');
  };

  // Trigger file upload selector
  const handleAttachmentClick = () => {
    fileInputRef.current?.click();
  };

  // Process file upload (photo / file)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${BACKEND_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const uploadData = await res.json();
        const isPhoto = file.type.startsWith('image/');
        const messageId = Math.random().toString(36).substring(2, 11);

        if (isDirect && activeDirectUser) {
          const msgPayload = {
            id: messageId,
            sender_tag: currentUser.tag,
            receiver_tag: activeDirectUser.tag,
            msg_type: (isPhoto ? 'photo' : 'file') as 'photo' | 'file',
            content: isPhoto ? 'Sent a photo' : `Sent a file: ${file.name}`,
            file_url: uploadData.url,
            file_name: uploadData.name,
            file_size: uploadData.size,
          };
          socket.emit('send_direct_msg', msgPayload);
        } else if (activeTag) {
          const msgPayload = {
            id: messageId,
            room_tag: activeTag,
            sender_id: currentUser.tag,
            sender_name: currentUser.username,
            msg_type: (isPhoto ? 'photo' : 'file') as 'photo' | 'file',
            content: isPhoto ? 'Sent a photo' : `Sent a file: ${file.name}`,
            file_url: uploadData.url,
            file_name: uploadData.name,
            file_size: uploadData.size,
          };
          socket.emit('send_msg', msgPayload);
        }
      }
    } catch (err) {
      console.error('File upload failed', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Start voice note recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      isCancelledRef.current = false;
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (isCancelledRef.current) {
          audioChunksRef.current = [];
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const formData = new FormData();
        formData.append('file', audioBlob, 'voice_message.wav');

        try {
          const res = await fetch(`${BACKEND_URL}/api/upload`, {
            method: 'POST',
            body: formData,
          });

          if (res.ok) {
            const uploadData = await res.json();
            const messageId = Math.random().toString(36).substring(2, 11);

            if (isDirect && activeDirectUser) {
              const msgPayload = {
                id: messageId,
                sender_tag: currentUser.tag,
                receiver_tag: activeDirectUser.tag,
                msg_type: 'audio' as const,
                content: 'Voice note',
                file_url: uploadData.url,
                file_name: 'Voice Note.wav',
                file_size: uploadData.size,
              };
              socket.emit('send_direct_msg', msgPayload);
            } else if (activeTag) {
              const msgPayload = {
                id: messageId,
                room_tag: activeTag,
                sender_id: currentUser.tag,
                sender_name: currentUser.username,
                msg_type: 'audio' as const,
                content: 'Voice note',
                file_url: uploadData.url,
                file_name: 'Voice Note.wav',
                file_size: uploadData.size,
              };
              socket.emit('send_msg', msgPayload);
            }
          }
        } catch (err) {
          console.error('Audio upload failed', err);
        }
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access failed', err);
      alert('Could not access microphone for voice message');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      isCancelledRef.current = true;
      audioChunksRef.current = [];
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="chat-pane">
      {/* Header */}
      <div className="chat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <div className="chat-header-info">
          <button className="mobile-back-btn" onClick={onBackToSidebar}>
            <X size={24} />
          </button>
          {isDirect ? (
            <div className="user-avatar" style={{ width: '40px', height: '40px', fontSize: '1.4rem' }}>
              {activeDirectUser.avatar}
            </div>
          ) : (
            <div className="tag-hash-icon">#</div>
          )}
          <div>
            <div className="chat-header-title">
              {isDirect ? activeDirectUser.username : `#${activeTag}`}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {isDirect ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  @{activeDirectUser.tag} •{' '}
                  <span style={{ color: activeDirectUser.online ? '#2ec4b6' : 'var(--text-muted)' }}>
                    {activeDirectUser.online ? 'Online' : 'Offline'}
                  </span>
                </span>
              ) : (
                `Tag chatroom (${activeMessages.length} messages)`
              )}
            </div>
          </div>
        </div>

        {isDirect && activeDirectUser && onStartCall && (
          <button 
            className="call-header-btn" 
            onClick={() => onStartCall(activeDirectUser)}
            title={`Call ${activeDirectUser.username}`}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              cursor: 'pointer',
              padding: '10px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
              marginRight: '8px'
            }}
          >
            <Phone size={22} />
          </button>
        )}
      </div>

      {/* Messages Feed */}
      <div className="chat-messages">
        {activeMessages.map((msg, index) => {
          const isOutgoing = isDirect
            ? (msg as DirectMessage).sender_tag === currentUser.tag
            : (msg as Message).sender_id === currentUser.tag;

          const senderName = isDirect
            ? (isOutgoing ? currentUser.username : activeDirectUser?.username)
            : (msg as Message).sender_name;

          const timeString = new Date(msg.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });

          // Determine if we need to show a date separator
          const prevMsg = index > 0 ? activeMessages[index - 1] : null;
          const showDateSeparator = !prevMsg || 
            new Date(msg.timestamp).toDateString() !== new Date(prevMsg.timestamp).toDateString();

          return (
            <React.Fragment key={msg.id}>
              {showDateSeparator && (
                <div className="date-separator">
                  <span>{formatMessageDate(msg.timestamp)}</span>
                </div>
              )}
              
              <div
                className={`message-row ${isOutgoing ? 'outgoing' : 'incoming'}`}
              >
                {!isOutgoing && !isDirect && <div className="message-sender">{senderName}</div>}
                
                <div className="message-bubble">
                  {/* 1. Text Message */}
                  {msg.msg_type === 'text' && <div>{msg.content}</div>}

                  {/* 2. Photo Message */}
                  {msg.msg_type === 'photo' && msg.file_url && (
                    <img
                      src={getUploadUrl(msg.file_url)}
                      alt="attachment"
                      className="media-message-photo"
                      onClick={() => setSelectedPhoto(getUploadUrl(msg.file_url))}
                    />
                  )}

                  {/* 3. Audio Message (Voice Note) */}
                  {msg.msg_type === 'audio' && msg.file_url && (
                    <CustomAudioMessage url={getUploadUrl(msg.file_url)} />
                  )}

                  {/* 4. File Attachment Message */}
                  {msg.msg_type === 'file' && msg.file_url && (
                    <a
                      href={getUploadUrl(msg.file_url)}
                      download={msg.file_name}
                      target="_blank"
                      rel="noreferrer"
                      className="media-message-file"
                    >
                      <div className="file-icon-wrapper">
                        <FileText size={20} />
                      </div>
                      <div className="file-info">
                        <div className="file-name">{msg.file_name}</div>
                        <div className="file-size">
                          {msg.file_size ? `${(msg.file_size / 1024).toFixed(1)} KB` : 'Unknown size'}
                        </div>
                      </div>
                      <Download size={16} style={{ color: 'var(--text-muted)', marginLeft: '8px' }} />
                    </a>
                  )}

                  {/* Metadata & Status checkmarks */}
                  <div className="message-meta">
                    <span>{timeString}</span>
                    {isOutgoing && (
                      <span className={`message-status ${msg.status}`}>
                        {msg.status === 'sent' && <Check className="checkmark-icon" />}
                        {(msg.status === 'delivered' || msg.status === 'seen') && (
                          <CheckCheck className={`checkmark-icon ${msg.status === 'seen' ? 'seen' : ''}`} />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Panel */}
      <div className="chat-input-panel">
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {isRecording ? (
          /* Voice Recording UI */
          <div className="recording-bar">
            <div className="recording-timer">
              <div className="recording-dot"></div>
              <span>Recording: {formatTime(recordingTime)}</span>
            </div>
            <button className="recording-cancel" onClick={cancelRecording}>
              Cancel
            </button>
          </div>
        ) : (
          /* Standard Input Buttons */
          <div className="chat-input-actions">
            <button 
              className="chat-action-btn" 
              onClick={handleAttachmentClick}
              disabled={isUploading}
            >
              <Paperclip size={20} />
            </button>
            <button className="chat-action-btn" onClick={startRecording}>
              <Mic size={20} />
            </button>
          </div>
        )}

        {/* Input Text Form */}
        {!isRecording && (
          <form onSubmit={handleSendText} className="chat-input-wrapper">
            <input
              type="text"
              placeholder={isUploading ? 'Uploading file...' : 'Type a message...'}
              className="chat-input"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isUploading}
            />
            <button type="submit" className="chat-send-btn" style={{ marginLeft: '12px' }}>
              <Send size={18} />
            </button>
          </form>
        )}

        {/* Stop Voice note & Send */}
        {isRecording && (
          <button className="chat-send-btn" onClick={stopRecording}>
            <Send size={18} />
          </button>
        )}
      </div>

      {/* Privacy Alert Modal */}
      {showPermissionAlert && activeDirectUser && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 999,
          padding: '24px'
        }}>
          <div style={{
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '28px',
            maxWidth: '400px',
            width: '100%',
            textAlign: 'center',
            boxShadow: 'var(--shadow-lg)',
            animation: 'fadeIn 0.3s ease'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔒</div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1.3rem', fontWeight: 600, color: 'var(--accent-purple)' }}>
              Status Privacy Request
            </h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
              <strong>{activeDirectUser.username}</strong> (@{activeDirectUser.tag}) has messaged you. Do you want to allow them to see your status updates?
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => handlePermissionDecision(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  color: 'var(--text-main)',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)')}
              >
                Don't Allow
              </button>
              <button
                onClick={() => handlePermissionDecision(true)}
                className="btn-primary"
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  width: 'auto'
                }}
              >
                Allow View
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedPhoto && (
        <div className="lightbox-modal" onClick={() => setSelectedPhoto(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setSelectedPhoto(null)}>
              <X size={28} />
            </button>
            <img src={selectedPhoto} alt="expanded" className="lightbox-image" />
          </div>
        </div>
      )}
    </div>
  );
};

// Custom Audio Player component for voice notes
const CustomAudioMessage: React.FC<{ url: string }> = ({ url }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(url);
    audioRef.current = audio;

    const onLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, [url]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(e => console.error(e));
      setIsPlaying(true);
    }
  };

  const formatAudioTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const barCount = 15;
  const bars = Array.from({ length: barCount });

  return (
    <div className="custom-audio-player">
      <button className="audio-play-btn" onClick={togglePlay}>
        {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" style={{ marginLeft: '2px' }} />}
      </button>

      <div className="audio-wave-visualizer">
        {bars.map((_, index) => {
          const ratio = (index + 1) / barCount;
          const isActive = isPlaying && (currentTime / (duration || 1)) >= ratio;
          const heightPercent = 20 + Math.abs(Math.sin(index * 1.5)) * 80;

          return (
            <div
              key={index}
              className={`audio-wave-bar ${isActive ? 'active' : ''}`}
              style={{ height: `${heightPercent}%` }}
            />
          );
        })}
      </div>

      <span className="audio-duration">
        {isPlaying ? formatAudioTime(currentTime) : formatAudioTime(duration)}
      </span>
      <Volume2 size={14} style={{ color: 'var(--text-muted)' }} />
    </div>
  );
};
