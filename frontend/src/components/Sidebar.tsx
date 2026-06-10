import React, { useState, useEffect } from 'react';
import { MessageSquare, Users, Plus, Search, Image, LogOut, Edit3, Trash2, Settings, Eye, EyeOff } from 'lucide-react';
import type { User, UserStatus, Room, StatusPermission } from '../types';
import { socket, BACKEND_URL } from '../socket';

interface SidebarProps {
  currentUser: User;
  activeTab: 'chats' | 'groups' | 'status';
  setActiveTab: (tab: 'chats' | 'groups' | 'status') => void;
  rooms: Room[];
  activeTag: string | null;
  setActiveTag: (tag: string | null) => void;
  onAddTag: (tag: string) => void;
  statuses: UserStatus[];
  onOpenStatusModal: () => void;
  onSelectUserStatus: (userId: string, initialIndex?: number) => void;
  allUsers: User[];
  chattedUserTags: string[];
  activeDirectUser: User | null;
  setActiveDirectUser: (user: User | null) => void;
  onLogout: () => void;
  fetchRooms: () => Promise<void>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  activeTab,
  setActiveTab,
  rooms,
  activeTag,
  setActiveTag,
  onAddTag,
  statuses,
  onOpenStatusModal,
  onSelectUserStatus,
  allUsers,
  chattedUserTags,
  activeDirectUser,
  setActiveDirectUser,
  onLogout,
  fetchRooms,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [newTag, setNewTag] = useState('');
  const [showAddTag, setShowAddTag] = useState(false);

  // Status settings state
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [permissionsList, setPermissionsList] = useState<StatusPermission[]>([]);

  // Group statuses by creator_id
  const groupedStatuses = React.useMemo(() => {
    const groups: { [key: string]: UserStatus[] } = {};
    statuses.forEach((status) => {
      // Don't show our own statuses in the main list
      if (status.creator_id !== currentUser.tag) {
        if (!groups[status.creator_id]) {
          groups[status.creator_id] = [];
        }
        groups[status.creator_id].push(status);
      }
    });
    return groups;
  }, [statuses, currentUser.tag]);

  const handleCreateTag = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTag = newTag.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (cleanTag) {
      onAddTag(cleanTag);
      setNewTag('');
      setShowAddTag(false);
    }
  };

  const filteredRooms = rooms.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const otherUsers = allUsers.filter((u) => u.tag !== currentUser.tag);

  const filteredUsers = otherUsers.filter((u) => {
    const matchesSearch =
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.tag.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (searchQuery.trim() === '') {
      return chattedUserTags.includes(u.tag) || (activeDirectUser && activeDirectUser.tag === u.tag);
    }

    return true;
  });

  // Status Permissions & Deletion Helpers
  const fetchPermissions = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/status-permissions?user_tag=${currentUser.tag}`);
      if (res.ok) {
        const data = await res.json();
        setPermissionsList(data);
      }
    } catch (err) {
      console.error('Failed to fetch status permissions', err);
    }
  };

  useEffect(() => {
    if (showPrivacyModal) {
      fetchPermissions();
    }
  }, [showPrivacyModal]);

  const handleTogglePermission = async (viewerTag: string, currentlyAllowed: boolean) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/status-permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_tag: currentUser.tag,
          viewer_tag: viewerTag,
          allowed: !currentlyAllowed,
        }),
      });
      if (res.ok) {
        fetchPermissions();
      }
    } catch (err) {
      console.error('Failed to toggle status permission', err);
    }
  };

  const handleDeleteStatus = async (statusId: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/statuses/${statusId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creator_tag: currentUser.tag }),
      });
      if (res.ok) {
        socket.emit('get_statuses');
      }
    } catch (err) {
      console.error('Failed to delete status', err);
    }
  };

  // Group editing/deletion
  const handleEditRoom = async (roomName: string) => {
    const newName = prompt(`Enter a new name for the group #${roomName}:`);
    if (!newName) return;
    const cleanNewName = newName.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (!cleanNewName || cleanNewName === roomName) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/rooms/${roomName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_name: cleanNewName,
          user_tag: currentUser.tag,
        }),
      });
      if (res.ok) {
        fetchRooms();
        if (activeTag === roomName) {
          setActiveTag(cleanNewName);
        }
      } else {
        alert('Failed to rename group. You may not be authorized.');
      }
    } catch (err) {
      console.error('Failed to rename group', err);
    }
  };

  const handleDeleteRoom = async (roomName: string) => {
    if (!confirm(`Are you sure you want to delete group #${roomName}? All messages inside will be permanently deleted.`)) {
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/rooms/${roomName}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_tag: currentUser.tag,
        }),
      });
      if (res.ok) {
        fetchRooms();
        if (activeTag === roomName) {
          setActiveTag(null);
        }
      } else {
        alert('Failed to delete group. You may not be authorized.');
      }
    } catch (err) {
      console.error('Failed to delete group', err);
    }
  };

  return (
    <aside className="sidebar">
      {/* User profile header */}
      <div className="sidebar-header">
        <div className="user-profile">
          <div className="user-avatar">{currentUser.avatar}</div>
          <div className="user-info">
            <div className="username">{currentUser.username}</div>
            <div className="tagline">@{currentUser.tag}</div>
          </div>
        </div>
      </div>

      {/* Navigation tabs */}
      <nav className="nav-tabs">
        <button
          className={`nav-tab ${activeTab === 'chats' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('chats');
            setSearchQuery('');
          }}
        >
          <MessageSquare size={18} />
          Chats
        </button>
        <button
          className={`nav-tab ${activeTab === 'groups' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('groups');
            setSearchQuery('');
          }}
        >
          <Users size={18} />
          Groups
        </button>
        <button
          className={`nav-tab ${activeTab === 'status' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('status');
            setSearchQuery('');
          }}
        >
          <Image size={18} />
          Status
        </button>
      </nav>

      {/* Main Sidebar Contents */}
      <div className="sidebar-content">
        {activeTab === 'chats' ? (
          <>
            {/* Search */}
            <div className="search-container">
              <Search className="search-icon" size={18} />
              <input
                type="text"
                placeholder="Search users..."
                className="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Direct Messages list */}
            <div className="tag-list-label">Direct Messages</div>
            <div className="tag-items">
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => (
                  <div
                    key={user.tag}
                    className={`tag-item ${activeDirectUser?.tag === user.tag ? 'active' : ''}`}
                    onClick={() => setActiveDirectUser(user)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                      <div style={{ position: 'relative' }}>
                        <div className="user-avatar" style={{ width: '36px', height: '36px', fontSize: '1.2rem' }}>
                          {user.avatar}
                        </div>
                        {user.online && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '-2px',
                              right: '-2px',
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              backgroundColor: '#2ec4b6',
                              border: '2px solid var(--bg-dark)',
                              boxShadow: '0 0 8px #2ec4b6',
                            }}
                          />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {user.username}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          @{user.tag}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No other users found.
                </div>
              )}
            </div>
          </>
        ) : activeTab === 'groups' ? (
          <>
            {/* Search */}
            <div className="search-container">
              <Search className="search-icon" size={18} />
              <input
                type="text"
                placeholder="Search groups..."
                className="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Create tag */}
            {showAddTag ? (
              <form onSubmit={handleCreateTag} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input
                  type="text"
                  placeholder="e.g. tech, movies"
                  className="form-input"
                  style={{ padding: '10px 14px' }}
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="btn-primary" style={{ padding: '0 16px', width: 'auto' }}>
                  Add
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{
                    padding: '0 16px',
                    width: 'auto',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-main)',
                    boxShadow: 'none',
                  }}
                  onClick={() => setShowAddTag(false)}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button className="create-tag-btn" onClick={() => setShowAddTag(true)}>
                <Plus size={18} />
                Create New Group Tag
              </button>
            )}

            {/* Tags list */}
            <div className="tag-list-label">Group Tag channels</div>
            <div className="tag-items" style={{ marginBottom: '20px' }}>
              {filteredRooms.length > 0 ? (
                filteredRooms.map((room) => (
                  <div
                    key={room.name}
                    className={`tag-item ${activeTag === room.name ? 'active' : ''}`}
                    onClick={() => setActiveTag(room.name)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}
                  >
                    <div className="tag-name-container">
                      <div className="tag-hash-icon">#</div>
                      <span className="tag-title">#{room.name}</span>
                    </div>
                    {room.creator_tag === currentUser.tag && (
                      <div style={{ display: 'flex', gap: '8px', paddingRight: '4px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditRoom(room.name);
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                          title="Rename Group"
                          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-main)')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRoom(room.name);
                          }}
                          style={{ background: 'none', border: 'none', color: '#ff5c5c', cursor: 'pointer', padding: '2px' }}
                          title="Delete Group"
                          onMouseEnter={(e) => (e.currentTarget.style.color = '#ff3333')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = '#ff5c5c')}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '10px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No tag rooms found.
                </div>
              )}
            </div>
          </>
        ) : (
          /* Status Feed Tab */
          <div className="status-feed-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
            {/* My Status header */}
            <div className="status-my-story" style={{ marginBottom: '16px' }}>
              <div className="status-my-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div 
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: statuses.some(s => s.creator_id === currentUser.tag) ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (statuses.some(s => s.creator_id === currentUser.tag)) {
                      onSelectUserStatus(currentUser.tag, 0);
                    }
                  }}
                >
                  <div className="my-story-avatar-container">
                    {statuses.filter(s => s.creator_id === currentUser.tag).length > 0 ? (
                      <div className="story-ring-container" style={{ width: '44px', height: '44px' }}>
                        <svg className="story-ring-svg" style={{ width: '44px', height: '44px' }}>
                          <circle
                            cx="22"
                            cy="22"
                            r="19"
                            fill="transparent"
                            stroke="var(--accent-purple)"
                            strokeWidth="2.5"
                            strokeDasharray={`${(2 * Math.PI * 19) / statuses.filter(s => s.creator_id === currentUser.tag).length - 2} 2`}
                          />
                        </svg>
                        <div className="story-avatar" style={{ width: '36px', height: '36px', fontSize: '1.2rem' }}>
                          {currentUser.avatar}
                        </div>
                      </div>
                    ) : (
                      <div className="user-avatar" style={{ border: '2px dashed var(--accent-purple)' }}>
                        {currentUser.avatar}
                      </div>
                    )}
                    <div 
                      className="add-story-icon" 
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenStatusModal();
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <Plus size={10} strokeWidth={3} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.95rem' }}>My Status</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {statuses.filter(s => s.creator_id === currentUser.tag).length > 0 
                        ? 'Tap to view your status updates' 
                        : 'Tap + to post a new story'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowPrivacyModal(true)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '8px',
                    color: 'var(--text-main)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Status Privacy Settings"
                >
                  <Settings size={16} />
                </button>
              </div>

              {/* My active stories list */}
              {statuses.filter(s => s.creator_id === currentUser.tag).length > 0 && (
                <div className="my-active-statuses-container">
                  <div className="my-active-statuses-title">
                    My Active Statuses
                  </div>
                  <div className="my-active-status-list">
                    {statuses.filter(s => s.creator_id === currentUser.tag).map((status, idx) => (
                      <div
                        key={status.id}
                        onClick={() => onSelectUserStatus(currentUser.tag, idx)}
                        className="my-active-status-item"
                      >
                        <div className="my-active-status-item-info">
                          <span style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center' }}>
                            {status.media_type === 'photo' ? '🖼️' : status.media_type === 'video' ? '🎥' : '🎵'}
                          </span>
                          <span className="my-active-status-item-text">
                            {status.text_content || `${status.media_type.toUpperCase()} Story`}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteStatus(status.id);
                          }}
                          className="my-active-status-delete-btn"
                          title="Delete status"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="status-feed-header">Recent Status Stories</div>
            <div className="status-stories-list" style={{ flex: 1 }}>
              {Object.keys(groupedStatuses).length > 0 ? (
                Object.entries(groupedStatuses).map(([userId, userStories]) => {
                  const latestStory = userStories[userStories.length - 1];
                  const timeString = new Date(latestStory.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={userId}
                      className="status-story-item"
                      onClick={() => onSelectUserStatus(userId, 0)}
                    >
                      <div className="story-ring-container">
                        <svg className="story-ring-svg">
                          <circle
                            cx="25"
                            cy="25"
                            r="22"
                            fill="transparent"
                            stroke="var(--accent-green)"
                            strokeWidth="2.5"
                            strokeDasharray={`${(2 * Math.PI * 22) / userStories.length - 2} 2`}
                          />
                        </svg>
                        <div className="story-avatar">{latestStory.creator_avatar}</div>
                      </div>
                      <div className="story-details">
                        <div className="story-author">{latestStory.creator_name}</div>
                        <div className="story-time">{timeString}</div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  No active statuses. Be the first to share!
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Privacy Settings Modal */}
      {showPrivacyModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(20px)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '450px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--accent-purple)' }}>
                Status Privacy Settings
              </h3>
              <button
                onClick={() => setShowPrivacyModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1
                }}
              >
                &times;
              </button>
            </div>

            <div style={{ padding: '16px 20px', fontSize: '0.85rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
              Choose who can view the statuses you post. By default, viewers must be granted permission.
            </div>

            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {otherUsers.length > 0 ? (
                otherUsers.map(user => {
                  const perm = permissionsList.find(p => p.viewer_tag === user.tag);
                  const isAllowed = perm ? perm.allowed : false;

                  return (
                    <div
                      key={user.tag}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        borderRadius: '10px',
                        border: '1px solid rgba(255, 255, 255, 0.04)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '1.5rem' }}>{user.avatar}</span>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{user.username}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>@{user.tag}</div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleTogglePermission(user.tag, isAllowed)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          border: isAllowed ? '1px solid var(--accent-green)' : '1px solid var(--border-color)',
                          background: isAllowed ? 'rgba(46, 196, 182, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                          color: isAllowed ? 'var(--accent-green)' : 'var(--text-muted)',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          transition: 'all 0.2s'
                        }}
                      >
                        {isAllowed ? (
                          <>
                            <Eye size={14} />
                            Allowed
                          </>
                        ) : (
                          <>
                            <EyeOff size={14} />
                            Denied
                          </>
                        )}
                      </button>
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                  No other users found in the system.
                </div>
              )}
            </div>

            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'flex-end',
              background: 'rgba(255, 255, 255, 0.01)'
            }}>
              <button
                className="btn-primary"
                onClick={() => setShowPrivacyModal(false)}
                style={{ width: 'auto', padding: '10px 24px' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar Footer with Logout */}
      <div
        style={{
          padding: '16px',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
        }}
      >
        <button
          onClick={onLogout}
          style={{
            background: 'none',
            border: 'none',
            color: '#ff5c5c',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.9rem',
            fontWeight: 500,
            padding: '4px 8px',
            borderRadius: '4px',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 92, 92, 0.1)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  );
};
