import React, { useState, useEffect, useRef } from 'react';
import { X, Image as ImageIcon, Video, Music, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import type { User, UserStatus } from '../types';
import { socket, getUploadUrl, BACKEND_URL } from '../socket';

interface StatusFeedProps {
  currentUser: User;
  statuses: UserStatus[];
  showPostModal: boolean;
  onClosePostModal: () => void;
  activeStoryUserId: string | null;
  initialStoryIndex?: number;
  onCloseStoryPlayer: () => void;
}

export const StatusFeed: React.FC<StatusFeedProps> = ({
  currentUser,
  statuses,
  showPostModal,
  onClosePostModal,
  activeStoryUserId,
  initialStoryIndex = 0,
  onCloseStoryPlayer,
}) => {
  // ----------------------------------------------------
  // Post Status State
  // ----------------------------------------------------
  const [mediaType, setMediaType] = useState<'photo' | 'video' | 'music'>('photo');
  const [textContent, setTextContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ----------------------------------------------------
  // Story Player State
  // ----------------------------------------------------
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [storyDuration, setStoryDuration] = useState(5000);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<number | null>(null);

  // Get active user's stories
  const userStories = React.useMemo(() => {
    if (!activeStoryUserId) return [];
    return statuses.filter((s) => s.creator_id === activeStoryUserId);
  }, [statuses, activeStoryUserId]);

  const safeStoryIndex = currentStoryIndex < userStories.length ? currentStoryIndex : 0;
  const activeStory = userStories[safeStoryIndex];

  // Reset indices when active user changes
  useEffect(() => {
    if (activeStoryUserId) {
      setCurrentStoryIndex(initialStoryIndex);
      setProgress(0);
      setIsPaused(false);
      setStoryDuration(5000);
    }
  }, [activeStoryUserId, initialStoryIndex]);

  // Set default durations when active story changes
  useEffect(() => {
    if (activeStory) {
      setStoryDuration(activeStory.media_type === 'photo' ? 5000 : 10000);
      setProgress(0);
      setIsPaused(false); // Reset isPaused on story transition
    }
  }, [safeStoryIndex, activeStoryUserId, activeStory]);

  const handleNextStory = React.useCallback(() => {
    setCurrentStoryIndex((prev) => {
      if (prev < userStories.length - 1) {
        return prev + 1;
      } else {
        setTimeout(() => {
          onCloseStoryPlayer();
        }, 0);
        return prev;
      }
    });
  }, [userStories.length, onCloseStoryPlayer]);

  const handlePrevStory = React.useCallback(() => {
    setCurrentStoryIndex((prev) => {
      if (prev > 0) {
        return prev - 1;
      }
      return prev;
    });
  }, []);

  const nextStoryRef = useRef(handleNextStory);
  useEffect(() => {
    nextStoryRef.current = handleNextStory;
  });

  // Story player logic (auto progress bar)
  useEffect(() => {
    if (!activeStory) return;

    const intervalTime = 100;
    const dur = storyDuration && !isNaN(storyDuration) && storyDuration > 0 ? storyDuration : 5000;
    const step = (intervalTime / dur) * 100;

    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

    progressIntervalRef.current = window.setInterval(() => {
      if (isPaused) return;

      setProgress((prev) => {
        if (prev >= 100) {
          nextStoryRef.current();
          return 0;
        }
        return prev + step;
      });
    }, intervalTime);

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [safeStoryIndex, activeStoryUserId, isPaused, activeStory, storyDuration]);

  // Sync video duration with progress bar
  const handleVideoMetadata = () => {
    if (videoRef.current && videoRef.current.duration && !isNaN(videoRef.current.duration) && isFinite(videoRef.current.duration)) {
      setStoryDuration(videoRef.current.duration * 1000);
    }
  };

  // Sync audio duration with progress bar
  const handleAudioMetadata = () => {
    if (audioRef.current && audioRef.current.duration && !isNaN(audioRef.current.duration) && isFinite(audioRef.current.duration)) {
      setStoryDuration(audioRef.current.duration * 1000);
    }
  };

  // ----------------------------------------------------
  // Post Story Actions
  // ----------------------------------------------------
  const handleSelectMedia = (type: 'photo' | 'video' | 'music') => {
    setMediaType(type);
    setFile(null);
    setPreviewUrl(null);
  };

  const handleFileDrop = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    const url = URL.createObjectURL(selected);
    setPreviewUrl(url);
  };

  const handlePostStatus = async () => {
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
        const payload = {
          id: Math.random().toString(36).substring(2, 11),
          creator_id: currentUser.tag,
          creator_name: currentUser.username,
          creator_avatar: currentUser.avatar,
          media_type: mediaType,
          media_url: uploadData.url,
          text_content: textContent,
        };

        socket.emit('post_status', payload);
        
        // Reset states
        setTextContent('');
        setFile(null);
        setPreviewUrl(null);
        onClosePostModal();
      }
    } catch (err) {
      console.error('Failed to post status', err);
    } finally {
      setIsUploading(false);
    }
  };

  // Pause on click hold
  const handleMouseDown = () => {
    setIsPaused(true);
    if (videoRef.current) videoRef.current.pause();
    if (audioRef.current) audioRef.current.pause();
  };

  const handleMouseUp = () => {
    setIsPaused(false);
    if (videoRef.current) videoRef.current.play().catch(() => {});
    if (audioRef.current) audioRef.current.play().catch(() => {});
  };

  return (
    <>
      {/* 1. Modal for Posting a new Status Story */}
      {showPostModal && (
        <div className="status-modal-backdrop" onClick={onClosePostModal}>
          <div className="status-modal" onClick={(e) => e.stopPropagation()}>
            <div className="status-modal-header">
              <span className="status-modal-title">Create Status Update</span>
              <button className="status-modal-close" onClick={onClosePostModal}>
                <X size={20} />
              </button>
            </div>

            <div className="status-modal-body">
              {/* Media Type Tabs */}
              <div className="media-type-selector">
                <button
                  className={`media-type-btn ${mediaType === 'photo' ? 'active' : ''}`}
                  onClick={() => handleSelectMedia('photo')}
                >
                  <ImageIcon size={16} /> Photo
                </button>
                <button
                  className={`media-type-btn ${mediaType === 'video' ? 'active' : ''}`}
                  onClick={() => handleSelectMedia('video')}
                >
                  <Video size={16} /> Video
                </button>
                <button
                  className={`media-type-btn ${mediaType === 'music' ? 'active' : ''}`}
                  onClick={() => handleSelectMedia('music')}
                >
                  <Music size={16} /> Music
                </button>
              </div>

              {/* File Upload Box */}
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileDrop}
                accept={
                  mediaType === 'photo'
                    ? 'image/*'
                    : mediaType === 'video'
                    ? 'video/*'
                    : 'audio/*'
                }
              />

              {!previewUrl ? (
                <div className="status-file-uploader" onClick={() => fileInputRef.current?.click()}>
                  <Plus size={24} style={{ color: 'var(--accent-purple)', marginBottom: '8px' }} />
                  <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>Upload Media File</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Select a {mediaType} to share with others
                  </div>
                </div>
              ) : (
                <div className="file-preview-box">
                  {mediaType === 'photo' && (
                    <img src={previewUrl} alt="preview" className="file-preview-image" />
                  )}
                  {mediaType === 'video' && (
                    <video src={previewUrl} className="file-preview-video" controls muted />
                  )}
                  {mediaType === 'music' && (
                    <div className="file-preview-music">
                      <div className="music-spinning-vinyl"></div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                        {file ? file.name : 'Audio track uploaded'}
                      </div>
                    </div>
                  )}
                  <button
                    className="chat-action-btn"
                    style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.6)' }}
                    onClick={() => {
                      setFile(null);
                      setPreviewUrl(null);
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Text Input Caption */}
              <div className="form-group">
                <label className="form-label">Add a Caption (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Loving this view!"
                  className="form-input"
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  disabled={isUploading}
                />
              </div>

              {/* Submit btn */}
              <button
                className="btn-primary"
                onClick={handlePostStatus}
                disabled={isUploading || !file}
              >
                {isUploading ? 'Uploading...' : 'Share Status Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Fullscreen Instagram/WhatsApp Story Player */}
      {activeStoryUserId && activeStory && (
        <div className="story-player-backdrop">
          <div className="story-player">
            {/* Top Progress Segmented bars */}
            <div className="story-progress-bars">
              {userStories.map((story, index) => {
                let width = '0%';
                if (index < safeStoryIndex) width = '100%';
                else if (index === safeStoryIndex) width = `${Math.min(progress, 100)}%`;

                return (
                  <div key={story.id} className="story-progress-bg">
                    <div className="story-progress-fill" style={{ width }} />
                  </div>
                );
              })}
            </div>

            {/* Header / Profile */}
            <div className="story-player-header">
              <div className="story-player-author">
                <div className="story-player-avatar">{activeStory.creator_avatar}</div>
                <div>
                  <div className="story-player-name">{activeStory.creator_name}</div>
                  <div className="story-player-time">
                    {new Date(activeStory.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
              <button className="story-player-close" onClick={onCloseStoryPlayer}>
                <X size={24} />
              </button>
            </div>

            {/* Media Content Player Area */}
            <div 
              className="story-player-content"
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleMouseDown}
              onTouchEnd={handleMouseUp}
              onTouchCancel={handleMouseUp}
            >
              {/* Click triggers to skip */}
              <div className="story-click-zones">
                <div className="story-click-left" onClick={(e) => { e.stopPropagation(); handlePrevStory(); }} />
                <div className="story-click-right" onClick={(e) => { e.stopPropagation(); handleNextStory(); }} />
              </div>

              {/* Media Renderers */}
              <div className="story-player-media-container">
                {activeStory.media_type === 'photo' && (
                  <img src={getUploadUrl(activeStory.media_url)} alt="status" className="story-image" />
                )}

                {activeStory.media_type === 'video' && (
                  <video
                    ref={(el) => {
                      videoRef.current = el;
                    }}
                    src={getUploadUrl(activeStory.media_url)}
                    className="story-video"
                    autoPlay
                    playsInline
                    muted={false}
                    onLoadedMetadata={handleVideoMetadata}
                  />
                )}

                {activeStory.media_type === 'music' && (
                  <div className="story-music-container">
                    <audio
                      ref={(el) => {
                        audioRef.current = el;
                      }}
                      src={getUploadUrl(activeStory.media_url)}
                      autoPlay
                      onLoadedMetadata={handleAudioMetadata}
                    />
                    <div className={`music-spinning-record-player ${!isPaused ? 'playing' : ''}`}>
                      <div className="music-record-glow"></div>
                      <div className="music-center-label">🎵</div>
                    </div>
                    <div className="music-details">
                      <div className="music-track-title">{activeStory.text_content || 'Unknown Track'}</div>
                      <div className="music-player-status">{isPaused ? 'Paused' : 'Playing Track'}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Caption Overlay (except for music which renders caption in center) */}
              {activeStory.media_type !== 'music' && activeStory.text_content && (
                <div className="story-caption-overlay">
                  {activeStory.text_content}
                </div>
              )}
            </div>

            {/* Left/Right floating skip buttons for accessibility */}
            <button
              className="chat-action-btn"
              style={{ position: 'absolute', left: '-60px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.05)', color: 'white' }}
              onClick={handlePrevStory}
              disabled={safeStoryIndex === 0}
            >
              <ChevronLeft size={20} />
            </button>
            <button
              className="chat-action-btn"
              style={{ position: 'absolute', right: '-60px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.05)', color: 'white' }}
              onClick={handleNextStory}
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
