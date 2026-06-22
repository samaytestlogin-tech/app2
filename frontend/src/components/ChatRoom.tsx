import React, { useState, useEffect, useRef } from 'react';
import {
  Send, Paperclip, Mic, X, Check, CheckCheck,
  FileText, Download, Play, Pause, Volume2, Phone,
  Settings, Users, ShieldAlert,
  QrCode, UserPlus, Trash2, Pin, PinOff, Search,
  Share2, Info, Edit3, Sparkles
} from 'lucide-react';
import type { User, Message, DirectMessage, Room, RoomMember, RoomInvitation } from '../types';
import { socket, getUploadUrl, BACKEND_URL } from '../socket';

interface ChatRoomProps {
  currentUser: User;
  activeTag: string | null;
  activeDirectUser: User | null;
  messages: Message[];
  directMessages: DirectMessage[];
  onBackToSidebar: () => void;
  onStartCall?: (target: User) => void;
  showAlert?: (title: string, message: string) => Promise<boolean>;
  rooms: Room[];
  fetchRooms: () => Promise<void>;
  allUsers: User[];
  onSetActiveTag?: (tag: string | null) => void;
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

const getChannelGradient = (name: string) => {
  const clean = name.trim().toLowerCase();
  if (clean === 'music') return 'linear-gradient(135deg, #a855f7, #ec4899)'; // Purple to Pink
  if (clean === 'gaming') return 'linear-gradient(135deg, #f97316, #eab308)'; // Orange to Yellow
  if (clean === 'test_room') return 'linear-gradient(135deg, #06b6d4, #3b82f6)'; // Cyan to Blue

  const gradients = [
    'linear-gradient(135deg, #3b82f6, #06b6d4)', // Blue-Cyan
    'linear-gradient(135deg, #10b981, #059669)', // Emerald
    'linear-gradient(135deg, #8b5cf6, #d946ef)', // Purple-Magenta
    'linear-gradient(135deg, #f43f5e, #fb7185)', // Rose
    'linear-gradient(135deg, #f59e0b, #d97706)', // Amber
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
};

const getChannelInitials = (name: string) => {
  const clean = name.replace(/^#+/, '').trim().toUpperCase();
  if (clean.length === 0) return '#';
  if (clean.length <= 2) return clean;
  const parts = clean.split(/[\s_-]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).substring(0, 2);
  }
  return clean.substring(0, 2);
};

const cleanRoomName = (name: string) => {
  const clean = name.replace(/^#+/, '').trim();
  return clean
    .split(/[\s_-]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

export const ChatRoom: React.FC<ChatRoomProps> = ({
  currentUser,
  activeTag,
  activeDirectUser,
  messages,
  directMessages,
  onBackToSidebar,
  onStartCall,
  showAlert,
  rooms,
  fetchRooms,
  allUsers,
  onSetActiveTag,
}) => {
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showPermissionAlert, setShowPermissionAlert] = useState(false);

  // Group Features state
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [newRoomNameInput, setNewRoomNameInput] = useState('');

  const [roomVisibility, setRoomVisibility] = useState<'public' | 'private' | 'invite_only'>('public');
  const [bannedWordsInput, setBannedWordsInput] = useState('');
  const [roomDescriptionInput, setRoomDescriptionInput] = useState('');
  const [inviteTargetUser, setInviteTargetUser] = useState('');

  // Pinned Messages state
  const [showPins, setShowPins] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<(Message | DirectMessage)[]>([]);
  const [pinSearchQuery, setPinSearchQuery] = useState('');
  const [pinPinnerFilter, setPinPinnerFilter] = useState('');
  const [pinTypeFilter, setPinTypeFilter] = useState<'all' | 'text' | 'photo' | 'audio' | 'file'>('all');
  const [pinSortOrder, setPinSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [pinDateFilter, setPinDateFilter] = useState('');

  // Delete message state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteMsgData, setDeleteMsgData] = useState<{ id: string, sender_tag: string, room_tag?: string, receiver_tag?: string } | null>(null);

  const handleDeleteMessage = (deleteType: 'for_me' | 'for_everyone') => {
    if (!deleteMsgData) return;
    socket.emit('delete_message', {
      message_id: deleteMsgData.id,
      room_tag: deleteMsgData.room_tag,
      receiver_tag: deleteMsgData.receiver_tag,
      delete_type: deleteType,
      user_tag: currentUser.tag,
    });
    setShowDeleteModal(false);
    setDeleteMsgData(null);
  };

  const isDirect = activeDirectUser !== null;
  const activeRoom = rooms.find(r => r.name === activeTag);
  const isRoomCreator = activeRoom && activeRoom.creator_tag === currentUser.tag;
  const userMember = members.find(m => m.user_tag === currentUser.tag);

  const fetchMembers = async () => {
    if (!activeTag || isDirect) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/rooms/${activeTag}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data);
      }
    } catch (e) {
      console.error("Error fetching members:", e);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [activeTag, isDirect]);

  useEffect(() => {
    if (!activeTag && !activeDirectUser) {
      setPinnedMessages([]);
      return;
    }

    const fetchPinned = async () => {
      try {
        let res;
        if (isDirect && activeDirectUser) {
          res = await fetch(`${BACKEND_URL}/api/dms/${activeDirectUser.tag}/pins`, {
            headers: {
              'X-User-Tag': currentUser.tag
            }
          });
        } else if (activeTag) {
          res = await fetch(`${BACKEND_URL}/api/rooms/${activeTag}/pins`);
        }
        
        if (res && res.ok) {
          const data = await res.json();
          setPinnedMessages(data);
        }
      } catch (err) {
        console.error('Failed to fetch pinned messages:', err);
      }
    };

    fetchPinned();

    const handleMsgPinned = (pinnedMsg: Message | DirectMessage) => {
      if ('room_tag' in pinnedMsg && pinnedMsg.room_tag === activeTag) {
        setPinnedMessages((prev) => {
          if (prev.some((m) => m.id === pinnedMsg.id)) {
            return prev.map((m) => m.id === pinnedMsg.id ? pinnedMsg : m);
          }
          return [pinnedMsg, ...prev];
        });
      } else if ('receiver_tag' in pinnedMsg && isDirect && activeDirectUser) {
        if (pinnedMsg.receiver_tag === activeDirectUser.tag || pinnedMsg.receiver_tag === currentUser.tag) {
          setPinnedMessages((prev) => {
            if (prev.some((m) => m.id === pinnedMsg.id)) {
              return prev.map((m) => m.id === pinnedMsg.id ? pinnedMsg : m);
            }
            return [pinnedMsg, ...prev];
          });
        }
      }
    };

    const handleMsgUnpinned = (data: { message_id: string; room_tag?: string; receiver_tag?: string }) => {
      if (data.room_tag && data.room_tag === activeTag) {
        setPinnedMessages((prev) => prev.filter((m) => m.id !== data.message_id));
      } else if (data.receiver_tag && isDirect && activeDirectUser) {
        if (data.receiver_tag === activeDirectUser.tag || data.receiver_tag === currentUser.tag) {
          setPinnedMessages((prev) => prev.filter((m) => m.id !== data.message_id));
        }
      }
    };

    const handleMsgDeleted = (data: { message_id: string; room_tag?: string; receiver_tag?: string; delete_type: string; user_tag: string; deleted_by_role?: string }) => {
      if (data.delete_type === 'for_everyone') {
        setPinnedMessages((prev) => prev.map(m => m.id === data.message_id ? { ...m, is_deleted: true, content: '', deleted_by: data.deleted_by_role } : m));
      } else if (data.delete_type === 'for_me' && data.user_tag === currentUser.tag) {
        setPinnedMessages((prev) => prev.filter((m) => m.id !== data.message_id));
      }
    };

    socket.on('message_pinned', handleMsgPinned);
    socket.on('message_unpinned', handleMsgUnpinned);
    socket.on('message_deleted', handleMsgDeleted);

    return () => {
      socket.off('message_pinned', handleMsgPinned);
      socket.off('message_unpinned', handleMsgUnpinned);
      socket.off('message_deleted', handleMsgDeleted);
    };
  }, [activeTag, isDirect, activeDirectUser, currentUser.tag]);

  const handleAcceptInvite = async () => {
    if (!activeTag) return;
    try {
      const isPublic = !activeRoom?.visibility || activeRoom?.visibility === 'public';
      if (isPublic) {
        const res = await fetch(`${BACKEND_URL}/api/rooms/${activeTag}/join_public`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_tag: currentUser.tag }),
        });
        if (res.ok) {
          fetchMembers();
          fetchRooms();
          showAlert && showAlert('Joined Group!', 'You have successfully joined the group.');
        } else {
          showAlert && showAlert('Error', 'Failed to join group.');
        }
        return;
      }

      const invRes = await fetch(`${BACKEND_URL}/api/users/${currentUser.tag}/invitations`);
      if (invRes.ok) {
        const invites: RoomInvitation[] = await invRes.json();
        const pendingInv = invites.find(i => i.room_tag === activeTag && i.status === 'pending');
        if (pendingInv) {
          const res = await fetch(`${BACKEND_URL}/api/invitations/${pendingInv.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accept: true, user_tag: currentUser.tag }),
          });
          if (res.ok) {
            fetchMembers();
            fetchRooms();
            showAlert && showAlert('Joined Group!', 'You have successfully joined the group.');
          } else {
            showAlert && showAlert('Error', 'Failed to join group.');
          }
        } else {
          showAlert && showAlert('Preview Mode', 'You must be invited to join this private/invite-only room.');
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getQRCodeUrl = () => {
    if (!activeRoom) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`${window.location.origin}/join?code=${activeRoom?.invite_code || ''}`)}`;
  };

  const handleDownloadQRCode = async () => {
    const url = getQRCodeUrl();
    if (!url) return;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `group_qr_${activeTag}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      showAlert && showAlert('Downloaded', 'QR Code saved to downloads.');
    } catch (e) {
      console.error(e);
      showAlert && showAlert('Error', 'Failed to download QR code.');
    }
  };

  const handleShareQRCode = async () => {
    const url = getQRCodeUrl();
    if (!url || !activeRoom) return;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], `group_qr_${activeTag}.png`, { type: 'image/png' });

      const shareData = {
        title: `Join our Group #${activeTag}`,
        text: `Scan this QR Code to join our group #${activeTag}!`,
        files: [file],
      };

      if (navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        showAlert && showAlert('Shared', 'QR Code shared successfully.');
      } else {
        const link = `${window.location.origin}/join?code=${activeRoom?.invite_code || ''}`;
        navigator.clipboard.writeText(link);
        showAlert && showAlert('Copied Link', 'Sharing not supported on this device. Invite link copied to clipboard.');
      }
    } catch (e) {
      console.error('Sharing failed:', e);
      const link = `${window.location.origin}/join?code=${activeRoom?.invite_code || ''}`;
      navigator.clipboard.writeText(link);
      showAlert && showAlert('Copied Link', 'Invite link copied to clipboard.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTag) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/rooms/${activeTag}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibility: roomVisibility,
          banned_words: bannedWordsInput,
          description: roomDescriptionInput,
          req_by: currentUser.tag,
        }),
      });
      if (res.ok) {
        setShowSettingsModal(false);
        fetchRooms();
        showAlert && showAlert('Settings Saved', 'Group settings updated successfully.');
      } else if (res.status === 403) {
        showAlert && showAlert('Forbidden', 'You do not have permission to update settings.');
      } else {
        showAlert && showAlert('Error', 'Failed to update group settings.');
      }
    } catch (e) {
      console.error(e);
      showAlert && showAlert('Error', 'Failed to connect to backend.');
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTag || !inviteTargetUser.trim()) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/rooms/${activeTag}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_tag: currentUser.tag,
          receiver_tag: inviteTargetUser.trim(),
        }),
      });
      if (res.ok) {
        setInviteTargetUser('');
        showAlert && showAlert('Invite Sent', `Sent invitation to @${inviteTargetUser}`);
      } else {
        showAlert && showAlert('Error', 'Failed to send invite. Check if the user exists or is already invited.');
      }
    } catch (e) {
      console.error(e);
      showAlert && showAlert('Error', 'Failed to send invite.');
    }
  };

  const handleUpdateMemberRole = async (targetUserTag: string, newRole: string) => {
    if (!activeTag) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/rooms/${activeTag}/members/${targetUserTag}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: newRole,
          custom_title: null,
          req_by: currentUser.tag,
        }),
      });
      if (res.ok) {
        fetchMembers();
        showAlert && showAlert('Role Updated', `Updated role of @${targetUserTag} to ${newRole}`);
      } else {
        showAlert && showAlert('Forbidden', 'You do not have permission to modify roles.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveMember = async (targetUserTag: string) => {
    if (!activeTag) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/rooms/${activeTag}/members/${targetUserTag}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          req_by: currentUser.tag,
        }),
      });
      if (res.ok) {
        fetchMembers();
        showAlert && showAlert('Member Removed', `Removed @${targetUserTag} from the group.`);
      } else {
        showAlert && showAlert('Forbidden', 'You do not have permission to remove members.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRenameRoom = () => {
    setNewRoomNameInput(activeTag || '');
    setShowRenameModal(true);
  };

  const submitRenameRoom = async () => {
    if (!activeRoom || !activeTag || !newRoomNameInput.trim()) return;
    const cleanNewName = newRoomNameInput.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (!cleanNewName || cleanNewName === activeTag) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/rooms/${activeTag}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_name: cleanNewName,
          user_tag: currentUser.tag,
        }),
      });
      if (res.ok) {
        setShowRenameModal(false);
        setShowSettingsModal(false);
        setNewRoomNameInput('');
        await fetchRooms();
        if (onSetActiveTag) {
          onSetActiveTag(cleanNewName);
        }
      } else {
        showAlert && showAlert('Rename Failed', 'Failed to rename group. You may not be authorized.');
      }
    } catch (err) {
      console.error('Failed to rename group', err);
    }
  };

  const handleDeleteRoom = async () => {
    if (!activeRoom || !activeTag) return;
    const confirmed = await (showAlert ? showAlert(
      "Delete Group",
      `Are you sure you want to delete group #${activeTag}?\nAll messages inside will be permanently deleted.`
    ) : confirm(`Are you sure you want to delete group #${activeTag}?`));
    if (!confirmed) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/rooms/${activeTag}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_tag: currentUser.tag,
        }),
      });
      if (res.ok) {
        setShowSettingsModal(false);
        await fetchRooms();
        onBackToSidebar();
      } else {
        showAlert && showAlert('Delete Failed', 'Failed to delete group. You may not be authorized.');
      }
    } catch (err) {
      console.error('Failed to delete group', err);
    }
  };

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

  const handlePinMessage = (messageId: string) => {
    if (isDirect && activeDirectUser) {
      socket.emit('pin_message', {
        message_id: messageId,
        receiver_tag: activeDirectUser.tag,
        user_id: currentUser.tag,
      });
    } else if (activeTag) {
      socket.emit('pin_message', {
        message_id: messageId,
        room_tag: activeTag,
        user_id: currentUser.tag,
      });
    }
  };

  const handleUnpinMessage = (messageId: string) => {
    if (isDirect && activeDirectUser) {
      socket.emit('unpin_message', {
        message_id: messageId,
        receiver_tag: activeDirectUser.tag,
        user_id: currentUser.tag,
      });
    } else if (activeTag) {
      socket.emit('unpin_message', {
        message_id: messageId,
        room_tag: activeTag,
        user_id: currentUser.tag,
      });
    }
  };

  const handleJumpToMessage = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('message-highlight');
      setTimeout(() => {
        el.classList.remove('message-highlight');
      }, 2000);
    } else {
      showAlert && showAlert('Message Not Found', 'This message is too old to be in the local feed cache.');
    }
  };

  // Helper to get sender name for pin display
  const getPinSenderName = (msg: Message | DirectMessage) => {
    if ('sender_name' in msg) {
      return msg.sender_name;
    }
    return msg.sender_tag === currentUser.tag ? currentUser.username : activeDirectUser?.username || msg.sender_tag;
  };

  // Helper to get name of user who pinned the message
  const getPinnerName = (msg: Message | DirectMessage) => {
    if (!msg.pinned_by) return 'Unknown';
    if (msg.pinned_by === currentUser.tag) {
      return currentUser.username;
    }
    const user = allUsers.find(u => u.tag === msg.pinned_by);
    return user ? user.username : msg.pinned_by;
  };

  // Get all unique users who pinned to populate a filter dropdown
  const pinPinners = Array.from(new Set(pinnedMessages.map(m => getPinnerName(m)).filter(name => name !== 'Unknown')));

  // Filter & Sort pinned messages
  const filteredPins = pinnedMessages
    .filter(msg => {
      // Filter out messages deleted for me
      if (msg.deleted_for_me?.split(',').includes(currentUser.tag)) {
        return false;
      }
      const senderName = getPinSenderName(msg);
      const pinnerName = getPinnerName(msg);
      // 1. Search Query
      if (pinSearchQuery.trim()) {
        const query = pinSearchQuery.toLowerCase();
        const contentMatch = msg.content?.toLowerCase().includes(query);
        const nameMatch = senderName?.toLowerCase().includes(query);
        const fileMatch = msg.file_name?.toLowerCase().includes(query);
        if (!contentMatch && !nameMatch && !fileMatch) return false;
      }

      // 2. Pinner Filter
      if (pinPinnerFilter && pinnerName !== pinPinnerFilter) {
        return false;
      }

      // 3. Type Filter
      if (pinTypeFilter !== 'all' && msg.msg_type !== pinTypeFilter) {
        return false;
      }

      // 4. Date Filter
      if (pinDateFilter) {
        const msgDate = new Date(msg.timestamp).toDateString();
        const filterDate = new Date(pinDateFilter).toDateString();
        if (msgDate !== filterDate) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (pinSortOrder === 'newest') {
        return b.timestamp - a.timestamp;
      } else {
        return a.timestamp - b.timestamp;
      }
    });

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
      if (showAlert) {
        showAlert('Audio Error', 'Could not access microphone for voice message');
      } else {
        alert('Could not access microphone for voice message');
      }
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
            <div className="room-avatar" style={{
              background: activeTag ? getChannelGradient(activeTag) : 'var(--bg-tertiary)',
              color: 'white',
              fontWeight: 700,
              fontSize: '0.9rem',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              letterSpacing: '0.5px'
            }}>
              {activeTag ? getChannelInitials(activeTag) : '#'}
            </div>
          )}
          <div>
            <div className="chat-header-title">
              {isDirect ? activeDirectUser.username : cleanRoomName(activeTag || '')}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {isDirect ? (
                <>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    @{activeDirectUser.tag} •{' '}
                    <span style={{ color: activeDirectUser.online ? '#2ec4b6' : 'var(--text-muted)' }}>
                      {activeDirectUser.online ? 'Online' : 'Offline'}
                    </span>
                  </span>
                  {activeDirectUser.bio && (
                    <div
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '6px',
                        maxWidth: '500px',
                        marginTop: '4px',
                        cursor: 'default',
                        fontStyle: 'italic'
                      }}
                      title={activeDirectUser.bio}
                    >
                      <Sparkles size={14} style={{ flexShrink: 0, color: 'var(--text-muted)', marginTop: '2px', opacity: 0.7 }} />
                      <span style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        lineHeight: '1.4',
                        opacity: 0.85
                      }}>
                        {activeDirectUser.bio}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--accent-cyan)', fontWeight: 500 }}>#{activeTag?.toLowerCase()}</span>
                    <span>•</span>
                    <span>{activeMessages.length} {activeMessages.length === 1 ? 'message' : 'messages'}</span>
                  </span>
                  {!isDirect && activeRoom?.description && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', maxWidth: '350px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', marginTop: '2px' }} title={activeRoom?.description}>
                      <Info size={11} style={{ flexShrink: 0, color: 'var(--accent)' }} />
                      <span>{activeRoom?.description}</span>
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
              }}
            >
              <Phone size={22} />
            </button>
          )}
          {((!isDirect && activeTag) || (isDirect && activeDirectUser)) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                className={`call-header-btn ${showPins ? 'active' : ''}`}
                onClick={() => setShowPins(!showPins)}
                title="Pinned Messages & Files"
                style={{
                  background: showPins ? 'rgba(0, 168, 204, 0.15)' : 'none',
                  border: 'none',
                  color: showPins ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '10px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                }}
              >
                <Pin size={22} fill={showPins ? "var(--accent-cyan)" : "none"} />
              </button>

              {!isDirect && (
                <button
                  className="call-header-btn"
                  onClick={() => {
                    if (activeRoom) {
                      setRoomVisibility(activeRoom.visibility || 'public');
                      setBannedWordsInput(activeRoom.banned_words || '');
                      setRoomDescriptionInput(activeRoom.description || '');
                    }
                    setShowSettingsModal(true);
                  }}
                  title="Group settings & management"
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
                  }}
                >
                  <Settings size={22} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 24-Hour Preview Mode Banner */}
      {!isDirect && !userMember && (
        <div style={{
          background: 'rgba(230, 74, 25, 0.12)',
          borderBottom: '1px solid rgba(230, 74, 25, 0.2)',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', width: '100%' }}>
            <div style={{ fontSize: '0.85rem', color: '#ff7043', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={16} />
              <span>You are viewing a 24-hour message preview. Join this group to view complete history and participate.</span>
            </div>
            <button
              onClick={handleAcceptInvite}
              className="btn-primary"
              style={{ width: 'auto', padding: '6px 12px', fontSize: '0.8rem', height: 'auto', background: '#e64a19', border: 'none', whiteSpace: 'nowrap' }}
            >
              Join Group
            </button>
          </div>
          {activeRoom?.description && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px dashed rgba(230, 74, 25, 0.2)', paddingTop: '6px' }}>
              <strong>About Group:</strong> {activeRoom?.description}
            </div>
          )}
        </div>
      )}

      {/* Workspace Row (Messages Feed + Input side-by-side with Pinned Sidebar) */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', width: '100%', position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', height: '100%', position: 'relative' }}>
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
                    id={`msg-${msg.id}`}
                  >
                    {!isOutgoing && !isDirect && <div className="message-sender">{senderName}</div>}

                    {!msg.is_deleted && (
                      <div className="message-actions" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        opacity: 0,
                        transition: 'opacity 0.2s',
                        marginRight: isOutgoing ? '8px' : '0',
                        marginLeft: !isOutgoing ? '8px' : '0',
                        alignSelf: 'center',
                        order: !isOutgoing ? 1 : 0
                      }}>
                        {msg.pinned ? (
                          ((!isDirect && (userMember?.role === 'admin' || userMember?.role === 'co_admin' || userMember?.role === 'moderator')) || msg.pinned_by === currentUser.tag || (isDirect && (('sender_tag' in msg && msg.sender_tag === currentUser.tag) || ('receiver_tag' in msg && msg.receiver_tag === currentUser.tag)))) && (
                            <button
                              onClick={() => handleUnpinMessage(msg.id)}
                              style={{
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '50%',
                                width: '28px',
                                height: '28px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: 'var(--text-main)',
                                transition: 'all 0.2s'
                              }}
                              title="Unpin Message"
                              className="hover-action-btn"
                            >
                              <PinOff size={14} />
                            </button>
                          )
                        ) : (
                          ((!isDirect && userMember) || isDirect) && (
                            <button
                              onClick={() => handlePinMessage(msg.id)}
                              style={{
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '50%',
                                width: '28px',
                                height: '28px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: 'var(--text-muted)',
                                transition: 'all 0.2s'
                              }}
                              title="Pin Message"
                              className="hover-action-btn"
                            >
                              <Pin size={14} />
                            </button>
                          )
                        )}
                        <button
                          onClick={() => {
                            setDeleteMsgData({
                              id: msg.id,
                              sender_tag: isDirect ? (msg as DirectMessage).sender_tag : (msg as Message).sender_id,
                              room_tag: isDirect ? undefined : (msg as Message).room_tag,
                              receiver_tag: isDirect ? (msg as DirectMessage).receiver_tag : undefined,
                            });
                            setShowDeleteModal(true);
                          }}
                          style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '50%',
                            width: '28px',
                            height: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: 'var(--accent-glow)',
                            transition: 'all 0.2s'
                          }}
                          title="Delete Message"
                          className="hover-action-btn"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}

                    <div className="message-bubble" style={{ position: 'relative' }}>
                      {/* Pin badge indicator */}
                      {msg.pinned && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--accent-glow)', marginBottom: '4px', opacity: 0.8 }}>
                          <Pin size={10} fill="var(--accent-glow)" />
                          <span>Pinned by @{msg.pinned_by}</span>
                        </div>
                      )}

                      {msg.is_deleted ? (
                        <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '1rem' }}>🚫</span>
                          {msg.deleted_by === 'admin' ? 'This message was deleted by admin' : msg.deleted_by === 'moderator' ? 'This message was deleted by moderator' : 'This message was deleted'}
                        </div>
                      ) : (
                        <>
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
                        </>
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
            {!isDirect && !userMember ? (
              <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: '0.9rem', width: '100%' }}>
                You must be a member to send messages to this group. Click "Join Group" above.
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>

        {/* Pinned Messages Sidebar Dashboard */}
        {showPins && (
          <div className="pinned-sidebar" style={{
            width: '380px',
            borderLeft: '1px solid var(--border-color)',
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(20px)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            animation: 'slideInRight 0.3s ease',
            zIndex: 10
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Pin size={18} fill="var(--accent-cyan)" />
                  Pinned Messages
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {filteredPins.length} of {pinnedMessages.length} pinned items
                </span>
              </div>
              <button
                onClick={() => setShowPins(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '50%'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Filters Dashboard */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              background: 'rgba(0,0,0,0.1)'
            }}>
              {/* Search */}
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search pins..."
                  value={pinSearchQuery}
                  onChange={(e) => setPinSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 32px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'rgba(255,255,255,0.03)',
                    color: 'var(--text-main)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              {/* Multi-row filters */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {/* Pinned By Filter */}
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Pinned By</label>
                  <select
                    value={pinPinnerFilter}
                    onChange={(e) => setPinPinnerFilter(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-main)',
                      fontSize: '0.8rem'
                    }}
                  >
                    <option value="">All Users</option>
                    {pinPinners.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {/* Type Filter */}
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Content Type</label>
                  <select
                    value={pinTypeFilter}
                    onChange={(e) => setPinTypeFilter(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '6px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-main)',
                      fontSize: '0.8rem'
                    }}
                  >
                    <option value="all">All Types</option>
                    <option value="text">Text Messages</option>
                    <option value="photo">Photos / Images</option>
                    <option value="audio">Voice Notes</option>
                    <option value="file">Shared Files</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {/* Date Filter */}
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Date</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="date"
                      value={pinDateFilter}
                      onChange={(e) => setPinDateFilter(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '5px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-main)',
                        fontSize: '0.8rem'
                      }}
                    />
                  </div>
                </div>

                {/* Sort Order */}
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Sort By</label>
                  <select
                    value={pinSortOrder}
                    onChange={(e) => setPinSortOrder(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '6px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-main)',
                      fontSize: '0.8rem'
                    }}
                  >
                    <option value="newest">Newest Pin</option>
                    <option value="oldest">Oldest Pin</option>
                  </select>
                </div>
              </div>

              {/* Reset Filters Link */}
              {(pinSearchQuery || pinPinnerFilter || pinTypeFilter !== 'all' || pinDateFilter) && (
                <button
                  onClick={() => {
                    setPinSearchQuery('');
                    setPinPinnerFilter('');
                    setPinTypeFilter('all');
                    setPinDateFilter('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-cyan)',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    textAlign: 'left',
                    padding: 0,
                    alignSelf: 'flex-start'
                  }}
                >
                  Clear Filters
                </button>
              )}
            </div>

            {/* Pinned Messages List */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              {filteredPins.length === 0 ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  gap: '8px'
                }}>
                  <Pin size={32} style={{ opacity: 0.3 }} />
                  <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>No Pinned Messages Found</div>
                  <div style={{ fontSize: '0.75rem' }}>Try adjusting your search criteria or filters.</div>
                </div>
              ) : (
                filteredPins.map((msg) => {
                  const isUserAllowedToUnpin = isDirect ?
                    (msg.pinned_by === currentUser.tag || ('sender_tag' in msg && msg.sender_tag === currentUser.tag) || ('receiver_tag' in msg && msg.receiver_tag === currentUser.tag)) :
                    (userMember?.role === 'admin' ||
                    userMember?.role === 'co_admin' ||
                    userMember?.role === 'moderator' ||
                    msg.pinned_by === currentUser.tag);

                  const senderName = getPinSenderName(msg);

                  return (
                    <div
                      key={msg.id}
                      style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        padding: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        transition: 'transform 0.2s, background-color 0.2s',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                      onClick={() => handleJumpToMessage(msg.id)}
                    >
                      {/* Sender Info & Date */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-main)' }}>
                            {senderName}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Pinned by @{msg.pinned_by}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {new Date(msg.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </div>
                      </div>

                      {/* Content Preview */}
                      <div style={{
                        fontSize: '0.85rem',
                        color: 'var(--text-main)',
                        lineHeight: 1.4,
                        background: 'rgba(0,0,0,0.15)',
                        padding: '10px',
                        borderRadius: '8px',
                        borderLeft: '3px solid var(--accent-cyan)'
                      }}>
                        {msg.is_deleted ? (
                          <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.9rem' }}>🚫</span>
                            {msg.deleted_by === 'admin' ? 'This message was deleted by admin' : msg.deleted_by === 'moderator' ? 'This message was deleted by moderator' : 'This message was deleted'}
                          </div>
                        ) : (
                          <>
                            {msg.msg_type === 'text' && (
                              <div style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                            )}

                            {msg.msg_type === 'photo' && msg.file_url && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <img
                                  src={getUploadUrl(msg.file_url)}
                                  alt="pinned attachment"
                                  style={{ width: '100%', maxHeight: '120px', objectFit: 'cover', borderRadius: '4px' }}
                                />
                                {msg.content && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{msg.content}</div>}
                              </div>
                            )}

                            {msg.msg_type === 'audio' && msg.file_url && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  🔊 Voice Note preview
                                </div>
                                <audio src={getUploadUrl(msg.file_url)} controls style={{ width: '100%', height: '32px' }} onClick={(e) => e.stopPropagation()} />
                              </div>
                            )}

                            {msg.msg_type === 'file' && msg.file_url && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                  background: 'rgba(0, 168, 204, 0.1)',
                                  color: 'var(--accent-cyan)',
                                  padding: '8px',
                                  borderRadius: '6px'
                                }}>
                                  <FileText size={18} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {msg.file_name}
                                  </div>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                    {msg.file_size ? `${(msg.file_size / 1024).toFixed(1)} KB` : 'Unknown size'}
                                  </div>
                                </div>
                                <a
                                  href={getUploadUrl(msg.file_url)}
                                  download={msg.file_name}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    color: 'var(--text-main)',
                                    padding: '6px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                >
                                  <Download size={14} />
                                </a>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Footer Actions */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--accent-cyan)',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          Click to jump
                        </span>

                        {isUserAllowedToUnpin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUnpinMessage(msg.id);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--accent-orange)',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: 500,
                              padding: '4px 8px',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(230, 74, 25, 0.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                          >
                            <PinOff size={12} />
                            Unpin
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
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
            background: 'var(--bg-secondary)',
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
      {/* Group Settings & Management Modal */}
      {showSettingsModal && activeTag && activeRoom && (
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
          zIndex: 998,
          padding: '24px'
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '500px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: 'var(--shadow-lg)',
            animation: 'fadeIn 0.3s ease',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={20} /> Group Settings: #{activeTag}
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Section 1: Invite Info (QR / Link / Code) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <QrCode size={16} /> Invite Code & QR Link
              </h4>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                {/* Real QR Code */}
                <div style={{ background: 'white', padding: '10px', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`${window.location.origin}/join?code=${activeRoom?.invite_code || ''}`)}`}
                    alt="Invite QR Code"
                    style={{ width: '120px', height: '120px', display: 'block' }}
                  />
                  <span style={{ fontSize: '0.65rem', color: '#1e293b', fontWeight: 700 }}>#{activeTag.toUpperCase()}</span>
                </div>
                {/* Download / Share Buttons */}
                <div style={{ display: 'flex', gap: '8px', width: '140px', justifyContent: 'center' }}>
                  <button
                    onClick={handleDownloadQRCode}
                    className="btn-primary"
                    style={{
                      flex: 1,
                      height: '28px',
                      fontSize: '0.7rem',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      boxShadow: 'none'
                    }}
                    title="Download QR Code"
                  >
                    <Download size={12} /> Download
                  </button>
                  <button
                    onClick={handleShareQRCode}
                    className="btn-primary"
                    style={{
                      flex: 1,
                      height: '28px',
                      fontSize: '0.7rem',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      boxShadow: 'none'
                    }}
                    title="Share QR Code"
                  >
                    <Share2 size={12} /> Share
                  </button>
                </div>
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Invite Code:</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{activeRoom?.invite_code || 'N/A'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(activeRoom?.invite_code || '');
                        showAlert && showAlert('Copied', 'Invite code copied to clipboard.');
                      }}
                      className="btn-primary"
                      style={{ flex: 1, height: '30px', fontSize: '0.75rem', padding: 0 }}
                    >
                      Copy Code
                    </button>
                    <button
                      onClick={() => {
                        const link = `${window.location.origin}/join?code=${activeRoom?.invite_code || ''}`;
                        navigator.clipboard.writeText(link);
                        showAlert && showAlert('Copied', 'Invite link copied to clipboard.');
                      }}
                      className="btn-primary"
                      style={{ flex: 1, height: '30px', fontSize: '0.75rem', padding: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-main)', boxShadow: 'none' }}
                    >
                      Copy Link
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Send Invite to User */}
            {userMember && (
              <form onSubmit={handleSendInvite} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <UserPlus size={16} /> Invite User
                </h4>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Enter user tag (e.g. satoshi)..."
                    className="form-input"
                    style={{ flex: 1, height: '36px', fontSize: '0.85rem', padding: '0 10px' }}
                    value={inviteTargetUser}
                    onChange={(e) => setInviteTargetUser(e.target.value)}
                  />
                  <button type="submit" className="btn-primary" style={{ width: 'auto', height: '36px', padding: '0 12px', fontSize: '0.85rem' }}>
                    Send
                  </button>
                </div>
              </form>
            )}

            {/* Section 3: Room Settings (Visibility & Banned Words) - Admins & Co-admins & Moderators only */}
            {userMember && (() => {
              const level = userMember.role === 'admin' ? 4 : userMember.role === 'co_admin' ? 3 : userMember.role === 'moderator' ? 2 : 1;
              return level >= 2;
            })() && (
                <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    Moderation & Visibility
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Room Visibility</label>
                    <select
                      className="form-input"
                      style={{ height: '36px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-main)', padding: '0 8px' }}
                      value={roomVisibility}
                      onChange={(e: any) => setRoomVisibility(e.target.value)}
                    >
                      <option value="public">🌐 Public (Anyone can find & join)</option>
                      <option value="private">🔒 Private (Join via invite link / code)</option>
                      <option value="invite_only">✉️ Invite Only (Explicit invitations only)</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Banned Words (comma separated)</label>
                    <textarea
                      placeholder="slang1, slang2, promo1"
                      className="form-input"
                      style={{ minHeight: '60px', padding: '8px', fontSize: '0.85rem', background: 'var(--bg-secondary)' }}
                      value={bannedWordsInput}
                      onChange={(e) => setBannedWordsInput(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Group Description</label>
                    <textarea
                      placeholder="What is this group about? Guidelines, rules, etc..."
                      className="form-input"
                      style={{ minHeight: '60px', padding: '8px', fontSize: '0.85rem', background: 'var(--bg-secondary)', resize: 'vertical' }}
                      value={roomDescriptionInput}
                      onChange={(e) => setRoomDescriptionInput(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="btn-primary" style={{ height: '36px', fontSize: '0.85rem' }}>
                    Save Room Settings
                  </button>
                </form>
              )}

            {/* Read-Only Description for regular members */}
            {(!userMember || (() => {
              const level = userMember.role === 'admin' ? 4 : userMember.role === 'co_admin' ? 3 : userMember.role === 'moderator' ? 2 : 1;
              return level < 2;
            })()) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Info size={16} /> Group Description
                  </h4>
                  <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {activeRoom?.description || 'No description set for this group.'}
                  </div>
                </div>
              )}

            {/* Section 4: Group Members Button */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={16} /> Group Members
              </h4>
              <button
                type="button"
                onClick={() => setShowMembersModal(true)}
                style={{
                  width: '100%',
                  height: '38px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 12px',
                  transition: 'background 0.2s'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Users size={14} style={{ color: 'var(--accent-purple)' }} />
                  View & Manage Members
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '12px' }}>
                  {members.length} {members.length === 1 ? 'member' : 'members'}
                </span>
              </button>
            </div>

            {/* Danger Zone (Rename / Delete Group) - Creator only */}
            {isRoomCreator && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid rgba(255, 92, 92, 0.2)', paddingTop: '16px' }}>
                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#ff7043', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldAlert size={16} /> Danger Zone
                </h4>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={handleRenameRoom}
                    className="btn-primary"
                    style={{
                      flex: 1,
                      height: '36px',
                      fontSize: '0.85rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      boxShadow: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                  >
                    <Edit3 size={14} /> Rename Group
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteRoom}
                    style={{
                      flex: 1,
                      height: '36px',
                      fontSize: '0.85rem',
                      background: 'rgba(255, 92, 92, 0.1)',
                      border: '1px solid #ff7043',
                      color: '#ff7043',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                  >
                    <Trash2 size={14} /> Delete Group
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Group Members List Modal */}
      {showMembersModal && activeTag && activeRoom && (
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
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '500px',
            width: '100%',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={20} style={{ color: 'var(--accent-purple)' }} />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Group Members
                </h3>
                <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '12px', color: 'var(--text-muted)' }}>
                  {members.length}
                </span>
              </div>
              <button
                onClick={() => {
                  setShowMembersModal(false);
                  setMemberSearchQuery('');
                }}
                style={{ background: 'rgba(255,255,255,0.04)', border: 'none', borderRadius: '50%', color: 'var(--text-main)', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Search Bar */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search members by name or tag..."
                value={memberSearchQuery}
                onChange={(e) => setMemberSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: '38px',
                  paddingLeft: '36px',
                  paddingRight: '12px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem'
                }}
              />
              {memberSearchQuery && (
                <button
                  onClick={() => setMemberSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Members List */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {(() => {
                const filtered = members.filter(m =>
                  m.user_tag.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
                  (m.custom_title || '').toLowerCase().includes(memberSearchQuery.toLowerCase())
                );

                if (filtered.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '24px 0' }}>
                      No members found matching your search.
                    </div>
                  );
                }

                return filtered.map(m => {
                  const getRoleLevel = (roleName?: string) => {
                    if (roleName === 'admin') return 4;
                    if (roleName === 'co_admin') return 3;
                    if (roleName === 'moderator') return 2;
                    return 1;
                  };
                  const userLevel = userMember ? getRoleLevel(userMember.role) : 0;
                  const memberLevel = getRoleLevel(m.role);
                  const canManage = userLevel > memberLevel;

                  return (
                    <div key={m.user_tag} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                          @{m.user_tag}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent-purple)', textTransform: 'capitalize' }}>
                          {m.role.replace('_', ' ')} {m.custom_title ? `• ${m.custom_title}` : ''}
                        </span>
                      </div>

                      {canManage && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <select
                            style={{ height: '28px', fontSize: '0.8rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)', padding: '0 4px' }}
                            value={m.role}
                            onChange={(e) => handleUpdateMemberRole(m.user_tag, e.target.value)}
                          >
                            <option value="member">Member</option>
                            <option value="moderator">Moderator</option>
                            {userLevel >= 4 && <option value="co_admin">Co Admin</option>}
                          </select>
                          <button
                            onClick={() => handleRemoveMember(m.user_tag)}
                            style={{ background: 'none', border: 'none', color: '#ff7043', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                            title="Remove member"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Group Rename Modal */}
      {showRenameModal && activeTag && activeRoom && (
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
          zIndex: 1000,
          padding: '24px'
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '400px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit3 size={20} style={{ color: 'var(--accent-purple)' }} />
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  Rename Group
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowRenameModal(false);
                  setNewRoomNameInput('');
                }}
                style={{ background: 'rgba(255,255,255,0.04)', border: 'none', borderRadius: '50%', color: 'var(--text-main)', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Description */}
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              Enter a new name for the group <strong>#{activeTag}</strong>. Only lowercase letters, numbers, hyphens, and underscores are allowed.
            </p>

            {/* Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input
                type="text"
                value={newRoomNameInput}
                onChange={(e) => {
                  const cleaned = e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '');
                  setNewRoomNameInput(cleaned);
                }}
                placeholder="new-group-name"
                style={{
                  width: '100%',
                  height: '38px',
                  padding: '0 12px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem'
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setShowRenameModal(false);
                  setNewRoomNameInput('');
                }}
                style={{
                  flex: 1,
                  height: '36px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 500
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitRenameRoom}
                disabled={!newRoomNameInput.trim() || newRoomNameInput.trim() === activeTag}
                style={{
                  flex: 1,
                  height: '36px',
                  background: 'linear-gradient(135deg, var(--accent-purple) 0%, #7c3aed 100%)',
                  border: 'none',
                  color: 'white',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  opacity: (!newRoomNameInput.trim() || newRoomNameInput.trim() === activeTag) ? 0.5 : 1
                }}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Message Modal */}
      {showDeleteModal && deleteMsgData && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: '24px', maxWidth: '320px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', textAlign: 'center' }}>Delete Message</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px', textAlign: 'center' }}>
              Are you sure you want to delete this message?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Only the sender or an admin/moderator can delete for everyone */}
              {(deleteMsgData.sender_tag === currentUser.tag || (!isDirect && userMember && (userMember.role === 'admin' || userMember.role === 'co_admin' || userMember.role === 'moderator'))) && (
                <button
                  onClick={() => handleDeleteMessage('for_everyone')}
                  style={{
                    padding: '12px',
                    background: 'var(--accent-glow)',
                    color: 'var(--bg-main)',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  className="hover-scale"
                >
                  Delete for Everyone
                </button>
              )}
              <button
                onClick={() => handleDeleteMessage('for_me')}
                style={{
                  padding: '12px',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                Delete for Me
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
                style={{
                  padding: '12px',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel
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

export default ChatRoom;
