import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Users, 
  Plus, 
  Search, 
  Image, 
  LogOut, 
  Edit3, 
  Trash2, 
  Settings, 
  Eye, 
  EyeOff, 
  FolderPlus, 
  Pin, 
  PinOff, 
  Clock,
  LayoutGrid,
  ShieldAlert,
  GripVertical,
  Globe,
  Mail,
  Lock,
  Key,
  ChevronDown,
  ChevronRight,
  Check
} from 'lucide-react';
import type { User, UserStatus, Room, StatusPermission, RoomInvitation } from '../types';
import { socket, BACKEND_URL } from '../socket';

interface SidebarProps {
  currentUser: User;
  onUpdateCurrentUser: (user: User) => void;
  activeTab: 'chats' | 'groups' | 'spaces' | 'activity' | 'profile';
  setActiveTab: (tab: 'chats' | 'groups' | 'spaces' | 'activity' | 'profile') => void;
  rooms: Room[];
  activeTag: string | null;
  setActiveTag: (tag: string | null) => void;
  onAddTag: (tag: string) => void;
  statuses: UserStatus[];
  onOpenStatusModal: () => void;
  onSelectUserStatus: (userId: string, initialIndex?: number) => void;
  allUsers: User[];
  activeDirectUser: User | null;
  setActiveDirectUser: (user: User | null) => void;
  onLogout: (tag?: string) => void;
  savedAccounts?: User[];
  onSwitchAccount?: (tag: string) => void;
  onAddAccount?: () => void;
  onLogoutAll?: () => void;
  fetchRooms: () => Promise<void>;
  unreadRooms: { [roomTag: string]: number };
  unreadDirects: { [userTag: string]: number };
  roomLastMessage: { [roomTag: string]: number };
  directLastMessage: { [userTag: string]: number };
  // Spaces props
  spaces: string[];
  saveSpaces: (spaces: string[]) => void;
  spaceAssignments: { [chatId: string]: string[] };
  saveSpaceAssignments: (assignments: { [chatId: string]: string[] }) => void;
  mainWallPins: string[];
  saveMainWallPins: (pins: string[]) => void;
  spacePins: { [spaceName: string]: string[] };
  saveSpacePins: (spacePins: { [spaceName: string]: string[] }) => void;
  keepOnWall: string[];
  saveKeepOnWall: (keep: string[]) => void;
  timerDurationHours: number;
  saveTimerDurationHours: (hours: number) => void;
  warnOnMultiSpace: boolean;
  saveWarnOnMultiSpace: (warn: boolean) => void;
  showCountdown: boolean;
  saveShowCountdown: (val: boolean) => void;
  showConfirm: (title: string, message: string, confirmText?: string, cancelText?: string) => Promise<boolean>;
  showAlert: (title: string, message: string, confirmText?: string) => Promise<boolean>;
  blockedUsers: string[];
  saveBlockedUsers: (newBlocked: string[]) => void;
}


const getSpaceColor = (name: string) => {
  const lower = name.toLowerCase();
  if (lower === 'work') return '#2563eb'; // Blue
  if (lower === 'family') return '#c2410c'; // Red-orange
  if (lower === 'cousins' || lower === 'friends') return '#0f766e'; // Green-teal
  
  const colors = [
    '#3b82f6', // Blue
    '#ea580c', // Orange-red
    '#0d9488', // Teal
    '#8b5cf6', // Purple
    '#db2777', // Pink
    '#d97706', // Amber
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

const getSpaceInitials = (name: string) => {
  const clean = name.trim().toUpperCase();
  if (clean.length <= 2) return clean;
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).substring(0, 2);
  }
  return clean.substring(0, 2);
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

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  onUpdateCurrentUser,
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
  activeDirectUser,
  setActiveDirectUser,
  onLogout,
  savedAccounts = [],
  onSwitchAccount,
  onAddAccount,
  onLogoutAll,
  fetchRooms,
  unreadRooms,
  unreadDirects,
  roomLastMessage,
  directLastMessage,
  spaces,
  saveSpaces,
  spaceAssignments,
  saveSpaceAssignments,
  mainWallPins,
  saveMainWallPins,
  spacePins,
  saveSpacePins,
  keepOnWall,
  saveKeepOnWall: _saveKeepOnWall,
  timerDurationHours,
  saveTimerDurationHours,
  warnOnMultiSpace,
  saveWarnOnMultiSpace,
  showCountdown,
  saveShowCountdown,
  showConfirm,
  showAlert,
  blockedUsers,
  saveBlockedUsers,
}) => {
  const AVATAR_OPTIONS = ['🦊', '🐯', '🐼', '🐨', '🐙', '🦄', '🦖', '👽', '👻', '👾', '🦁', '🦉'];

  // Profile settings state
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showBlockedUsersModal, setShowBlockedUsersModal] = useState(false);
  const [profileName, setProfileName] = useState(currentUser.username);
  const [profileAvatar, setProfileAvatar] = useState(currentUser.avatar);
  const [profileBio, setProfileBio] = useState(currentUser.bio || '');
  const [profileCurrentPassword, setProfileCurrentPassword] = useState('');
  const [profileNewPassword, setProfileNewPassword] = useState('');
  const [profileConfirmPassword, setProfileConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [isTimerDropdownOpen, setIsTimerDropdownOpen] = useState(false);
  useEffect(() => {
    setProfileName(currentUser.username);
    setProfileAvatar(currentUser.avatar);
    setProfileBio(currentUser.bio || '');
    setProfileCurrentPassword('');
    setProfileNewPassword('');
    setProfileConfirmPassword('');
    setProfileError(null);
    setProfileSuccess(null);
  }, [currentUser]);

  const [searchQuery, setSearchQuery] = useState('');
  const [newTag, setNewTag] = useState('');
  const [showAddTag, setShowAddTag] = useState(false);
  const [showJoinByCode, setShowJoinByCode] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');

  // Space selected inside Chats tab vs Groups tab
  const [activeChatSpace, setActiveChatSpace] = useState<string>('main_wall');
  const [activeGroupSpace, setActiveGroupSpace] = useState<string>('main_wall');

  // Drag & drop sorting state for pins
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Group invitations and invite codes
  const [invitations, setInvitations] = useState<RoomInvitation[]>([]);
  const [inviteCodeInput, setInviteCodeInput] = useState('');

  const fetchInvitations = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/users/${currentUser.tag}/invitations`);
      if (res.ok) {
        const data = await res.json();
        setInvitations(data);
      }
    } catch (e) {
      console.error("Error fetching invitations:", e);
    }
  };

  useEffect(() => {
    fetchInvitations();
    const interval = setInterval(fetchInvitations, 10000);
    return () => clearInterval(interval);
  }, [currentUser.tag]);

  const handleInvitation = async (inviteId: string, accept: boolean) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/invitations/${inviteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept, user_tag: currentUser.tag }),
      });
      if (res.ok) {
        fetchInvitations();
        fetchRooms();
        showAlert(
          accept ? 'Joined Group!' : 'Declined invitation',
          accept ? 'You have successfully joined the group.' : 'You have declined the group invitation.'
        );
      } else {
        showAlert('Error', 'Failed to handle invitation.');
      }
    } catch (e) {
      console.error(e);
      showAlert('Error', 'Failed to connect to backend.');
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    if (!profileName.trim()) {
      setProfileError("Display Name cannot be empty.");
      return;
    }

    if (profileNewPassword) {
      if (!profileCurrentPassword) {
        setProfileError("Please enter your current password to set a new password.");
        return;
      }
      if (profileNewPassword !== profileConfirmPassword) {
        setProfileError("New password and confirm password do not match.");
        return;
      }
      if (profileNewPassword.length < 6) {
        setProfileError("New password must be at least 6 characters long.");
        return;
      }
    }

    setProfileSaving(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/users/update-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag: currentUser.tag,
          name: profileName.trim(),
          avatar: profileAvatar,
          bio: profileBio.trim(),
          current_password: profileCurrentPassword || null,
          new_password: profileNewPassword || null,
        }),
      });

      if (res.ok) {
        const updatedUser = await res.json();
        onUpdateCurrentUser({
          tag: updatedUser.tag,
          username: updatedUser.name,
          avatar: updatedUser.avatar,
          bio: updatedUser.bio,
        });
        setProfileSuccess("Profile updated successfully!");
        setProfileCurrentPassword('');
        setProfileNewPassword('');
        setProfileConfirmPassword('');
        setTimeout(() => {
          setShowEditProfileModal(false);
          setProfileSuccess(null);
        }, 1200);
      } else if (res.status === 401) {
        setProfileError("Incorrect current password.");
      } else {
        setProfileError("Failed to update profile. Please try again.");
      }
    } catch (err) {
      console.error(err);
      setProfileError("Network error. Failed to update profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCodeInput.trim()) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/rooms/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_code: inviteCodeInput.trim(), user_tag: currentUser.tag }),
      });
      if (res.ok) {
        const room = await res.json();
        setInviteCodeInput('');
        fetchRooms();
        setActiveTag(room.name);
        showAlert('Success', `Successfully joined group #${room.name}`);
      } else {
        showAlert('Error', 'Invalid invite code or group not found.');
      }
    } catch (e) {
      console.error(e);
      showAlert('Error', 'Failed to join group.');
    }
  };

  // Assign to Space modal
  const [assignTarget, setAssignTarget] = useState<{ type: 'dm' | 'group'; tag: string; name: string } | null>(null);

  // Custom timer states
  const presets = [1, 6, 24, 72, 168];
  const [isCustomTimer, setIsCustomTimer] = useState(!presets.includes(timerDurationHours));

  const getNaturalUnitAndValue = (hours: number): { value: number; unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'months' } => {
    if (hours <= 0) return { value: 24, unit: 'hours' };
    
    // If it's a multiple of a month (720 hours)
    if (hours >= 720 && hours % 720 === 0) {
      return { value: hours / 720, unit: 'months' };
    }
    // If it's a multiple of a week (168 hours)
    if (hours >= 168 && hours % 168 === 0) {
      return { value: hours / 168, unit: 'weeks' };
    }
    // If it's a multiple of a day (24 hours)
    if (hours >= 24 && hours % 24 === 0) {
      return { value: hours / 24, unit: 'days' };
    }
    // If it is less than 1 hour or has a fractional part, try minutes
    const mins = Math.round(hours * 60);
    if (hours < 1 || (hours % 1 !== 0 && mins % 1 === 0)) {
      if (mins > 0) return { value: mins, unit: 'minutes' };
    }
    
    return { value: hours, unit: 'hours' };
  };

  const initialNatural = getNaturalUnitAndValue(timerDurationHours);
  const [customHoursValue, setCustomHoursValue] = useState<number>(initialNatural.value);
  const [customHoursUnit, setCustomHoursUnit] = useState<'minutes' | 'hours' | 'days' | 'weeks' | 'months'>(initialNatural.unit);

  const convertToHours = (val: number, unit: string): number => {
    if (unit === 'minutes') return val / 60;
    if (unit === 'hours') return val;
    if (unit === 'days') return val * 24;
    if (unit === 'weeks') return val * 168;
    if (unit === 'months') return val * 720;
    return val;
  };

  useEffect(() => {
    const isCustom = !presets.includes(timerDurationHours);
    setIsCustomTimer(isCustom);
    if (isCustom) {
      const natural = getNaturalUnitAndValue(timerDurationHours);
      setCustomHoursValue(natural.value);
      setCustomHoursUnit(natural.unit);
    }
  }, [timerDurationHours]);

  const handleTimerSelectChange = (val: string) => {
    if (val === 'custom') {
      setIsCustomTimer(true);
      const hours = convertToHours(customHoursValue, customHoursUnit);
      saveTimerDurationHours(hours);
    } else {
      setIsCustomTimer(false);
      saveTimerDurationHours(Number(val));
    }
  };

  const handleCustomValueChange = (val: string) => {
    const num = Number(val);
    if (!isNaN(num) && num > 0) {
      setCustomHoursValue(num);
      const hours = convertToHours(num, customHoursUnit);
      saveTimerDurationHours(hours);
    } else {
      setCustomHoursValue(0);
    }
  };

  const handleCustomUnitChange = (unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'months') => {
    setCustomHoursUnit(unit);
    const hours = convertToHours(customHoursValue, unit);
    saveTimerDurationHours(hours);
  };

  // Time tracker for countdown badges
  const [timeNow, setTimeNow] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeNow(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Status settings state
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [permissionsList, setPermissionsList] = useState<StatusPermission[]>([]);

  // Group statuses by creator_id
  const groupedStatuses = React.useMemo(() => {
    const groups: { [key: string]: UserStatus[] } = {};
    statuses.forEach((status) => {
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

  const handleCreateSpace = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newSpaceName.trim();
    if (!clean) return;
    if (spaces.includes(clean)) {
      showAlert("Space Warning", "Space already exists!");
      return;
    }
    saveSpaces([...spaces, clean]);
    setNewSpaceName('');
  };

  const handleDeleteSpace = async (spaceName: string) => {
    const confirmed = await showConfirm(
      "Delete Space",
      `Are you sure you want to delete the space "${spaceName}"?\nConversations will remain in Unassigned or other spaces.`,
      "Delete",
      "Cancel"
    );
    if (!confirmed) return;
    saveSpaces(spaces.filter(s => s !== spaceName));

    const updatedAssignments = { ...spaceAssignments };
    Object.keys(updatedAssignments).forEach(chatId => {
      updatedAssignments[chatId] = updatedAssignments[chatId]?.filter(s => s !== spaceName) || [];
    });
    saveSpaceAssignments(updatedAssignments);

    const updatedPins = { ...spacePins };
    delete updatedPins[spaceName];
    saveSpacePins(updatedPins);

    if (activeChatSpace === spaceName) setActiveChatSpace('main_wall');
    if (activeGroupSpace === spaceName) setActiveGroupSpace('main_wall');
  };

  const handleRenameSpace = (spaceName: string) => {
    const newName = prompt(`Rename space "${spaceName}" to:`, spaceName);
    if (!newName) return;
    const clean = newName.trim();
    if (!clean || clean === spaceName) return;
    if (spaces.includes(clean)) {
      showAlert("Space Warning", "Space already exists!");
      return;
    }
    saveSpaces(spaces.map(s => s === spaceName ? clean : s));

    const updatedAssignments = { ...spaceAssignments };
    Object.keys(updatedAssignments).forEach(chatId => {
      updatedAssignments[chatId] = updatedAssignments[chatId]?.map(s => s === spaceName ? clean : s) || [];
    });
    saveSpaceAssignments(updatedAssignments);

    const updatedPins = { ...spacePins };
    if (updatedPins[spaceName]) {
      updatedPins[clean] = updatedPins[spaceName];
      delete updatedPins[spaceName];
      saveSpacePins(updatedPins);
    }

    if (activeChatSpace === spaceName) setActiveChatSpace(clean);
    if (activeGroupSpace === spaceName) setActiveGroupSpace(clean);
  };

  const handleToggleSpaceAssign = async (spaceName: string) => {
    if (!assignTarget) return;
    const chatId = `${assignTarget.type}:${assignTarget.tag}`;
    const currentAssigned = spaceAssignments[chatId] || [];
    let newAssigned: string[];
    if (currentAssigned.includes(spaceName)) {
      newAssigned = currentAssigned.filter(s => s !== spaceName);
    } else {
      if (warnOnMultiSpace && currentAssigned.length > 0) {
        const targetName = assignTarget.type === 'group' ? `#${assignTarget.name}` : `@${assignTarget.tag}`;
        const spacesList = currentAssigned.join(', ');
        const confirmed = await showConfirm(
          "Space Warning",
          `${targetName} is already present in "${spacesList}" space.\nDo you still want to add this user here as well?`,
          "Add anyway",
          "Cancel"
        );
        if (!confirmed) return;
      }
      newAssigned = [...currentAssigned, spaceName];
    }
    saveSpaceAssignments({
      ...spaceAssignments,
      [chatId]: newAssigned
    });
  };

  const handleTogglePin = (chatId: string, isMainWall: boolean, spaceName?: string) => {
    if (isMainWall) {
      if (mainWallPins.includes(chatId)) {
        saveMainWallPins(mainWallPins.filter(id => id !== chatId));
      } else {
        saveMainWallPins([...mainWallPins, chatId]);
      }
    } else if (spaceName) {
      const pins = spacePins[spaceName] || [];
      if (pins.includes(chatId)) {
        saveSpacePins({
          ...spacePins,
          [spaceName]: pins.filter(id => id !== chatId)
        });
      } else {
        saveSpacePins({
          ...spacePins,
          [spaceName]: [...pins, chatId]
        });
      }
    }
  };

  // Drag & drop handlers
  const handleDragStart = (id: string) => {
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOverId(id);
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (targetId: string, isMainWall: boolean, spaceName?: string) => {
    setDragOverId(null);
    if (!draggedId || draggedId === targetId) return;

    if (isMainWall) {
      const pins = [...mainWallPins];
      const dragIdx = pins.indexOf(draggedId);
      const dropIdx = pins.indexOf(targetId);
      if (dragIdx !== -1 && dropIdx !== -1) {
        pins.splice(dragIdx, 1);
        pins.splice(dropIdx, 0, draggedId);
        saveMainWallPins(pins);
      }
    } else if (spaceName) {
      const pins = [...(spacePins[spaceName] || [])];
      const dragIdx = pins.indexOf(draggedId);
      const dropIdx = pins.indexOf(targetId);
      if (dragIdx !== -1 && dropIdx !== -1) {
        pins.splice(dragIdx, 1);
        pins.splice(dropIdx, 0, draggedId);
        saveSpacePins({ ...spacePins, [spaceName]: pins });
      }
    }
    setDraggedId(null);
  };

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

  // Helper renderers for badges and buttons on chat rows
  const renderCountdown = (chatId: string, lastMsgTime: number) => {
    if (!showCountdown) return null;
    if (keepOnWall.includes(chatId)) return null;
    if (lastMsgTime <= 0) return null;
    const remainingMs = lastMsgTime + timerDurationHours * 3600000 - timeNow;
    if (remainingMs <= 0) return null;

    if (remainingMs > 3600000) {
      const hours = Math.ceil(remainingMs / 3600000);
      return (
        <span className="countdown-badge" title="Surfaced on Main Wall">
          <Clock size={10} /> {hours}h left
        </span>
      );
    } else {
      const mins = Math.ceil(remainingMs / 60000);
      return (
        <span className="countdown-badge" title="Surfaced on Main Wall">
          <Clock size={10} /> {mins}m left
        </span>
      );
    }
  };

  const renderMultiSpaceBadge = (chatId: string) => {
    const assigned = spaceAssignments[chatId] || [];
    if (assigned.length === 0) return null;
    const label = assigned.join(', ');
    return (
      <span className="multi-space-badge" title={`Belongs to: ${label}`}>
        {assigned.length === 1 ? assigned[0] : `${assigned.length} spaces`}
      </span>
    );
  };

  const renderChatActions = (chatId: string, isMainWall: boolean, spaceName?: string, _lastMsgTime?: number) => {
    const isPinned = isMainWall ? mainWallPins.includes(chatId) : (spacePins[spaceName || '']?.includes(chatId) || false);

    const parts = chatId.split(':');
    const type = parts[0] as 'dm' | 'group';
    const tag = parts[1];

    return (
      <div className="chat-actions-hover" style={{ display: 'flex', gap: '6px', alignItems: 'center', marginLeft: 'auto' }} onClick={e => e.stopPropagation()}>

        <button
          className="space-action-btn"
          onClick={() => handleTogglePin(chatId, isMainWall, spaceName)}
          title={isPinned ? "Unpin from top" : "Pin to top"}
        >
          {isPinned ? <PinOff size={14} style={{ color: 'var(--accent-purple)' }} /> : <Pin size={14} />}
        </button>
        <button
          className="space-action-btn"
          onClick={() => {
            const name = type === 'dm' ? (allUsers.find(u => u.tag === tag)?.username || tag) : tag;
            setAssignTarget({ type, tag, name });
          }}
          title="Assign to Spaces"
        >
          <FolderPlus size={14} />
        </button>
      </div>
    );
  };

  // ----------------------------------------------------
  // FILTERING AND SORTING FOR DM CHATS
  // ----------------------------------------------------
  const otherUsers = allUsers.filter((u) => u.tag !== currentUser.tag);

  const filteredUsers = otherUsers.filter((u) => {
    const matchesSearch =
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.tag.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Partition DMs into pinned, active, and global matches
  const { pinnedDMs, activeDMs, globalMatches } = React.useMemo(() => {
    const chatId = (tag: string) => `dm:${tag}`;

    // Filter list based on selected space
    let baseList = [...filteredUsers];
    let globalList: typeof filteredUsers = [];

    if (activeChatSpace === 'main_wall') {
      // Main wall filters out things that are expired (not pinned, not kept, activity > global timer)
      const mainWallMatches = baseList.filter(u => {
        const id = chatId(u.tag);
        if (mainWallPins.includes(id)) return true;
        if (keepOnWall.includes(id)) return true;
        
        const lastMsgTime = directLastMessage[u.tag] || 0;
        if (lastMsgTime <= 0) return false;
        
        const ageHours = (timeNow - lastMsgTime) / 3600000;
        return ageHours < timerDurationHours;
      });

      // Global matches are users who match the search but are NOT on the main wall
      // Only compute and show global matches if search query is active
      if (searchQuery.trim() !== '') {
        const mainWallTags = new Set(mainWallMatches.map(u => u.tag));
        globalList = baseList.filter(u => !mainWallTags.has(u.tag));
      }

      baseList = mainWallMatches;
    } else if (activeChatSpace === 'unassigned') {
      // Unassigned contains chats with activity that have no space assignments
      baseList = baseList.filter(u => {
        const id = chatId(u.tag);
        const lastMsg = directLastMessage[u.tag] || 0;
        const assigned = spaceAssignments[id] || [];
        return lastMsg > 0 && assigned.length === 0;
      });
    } else {
      // Custom space contains chats assigned to it
      baseList = baseList.filter(u => {
        const id = chatId(u.tag);
        return spaceAssignments[id]?.includes(activeChatSpace);
      });
    }

    // Now split into pinned vs active
    const pinnedList: typeof baseList = [];
    const activeList: typeof baseList = [];

    baseList.forEach(u => {
      const id = chatId(u.tag);
      const isPinned = activeChatSpace === 'main_wall' 
        ? mainWallPins.includes(id) 
        : (activeChatSpace !== 'unassigned' && (spacePins[activeChatSpace]?.includes(id)));
      
      if (isPinned) {
        pinnedList.push(u);
      } else {
        activeList.push(u);
      }
    });

    // Sort Pinned List based on the custom pinned index arrays
    pinnedList.sort((a, b) => {
      const idA = chatId(a.tag);
      const idB = chatId(b.tag);
      const arr = activeChatSpace === 'main_wall' ? mainWallPins : (spacePins[activeChatSpace] || []);
      return arr.indexOf(idA) - arr.indexOf(idB);
    });

    // Sort Active List by last message timestamp descending
    activeList.sort((a, b) => {
      const timeA = directLastMessage[a.tag] || 0;
      const timeB = directLastMessage[b.tag] || 0;
      return timeB - timeA;
    });

    // Sort Global List by username
    globalList.sort((a, b) => a.username.localeCompare(b.username));

    return { pinnedDMs: pinnedList, activeDMs: activeList, globalMatches: globalList };
  }, [filteredUsers, activeChatSpace, mainWallPins, spacePins, keepOnWall, spaceAssignments, directLastMessage, timeNow, timerDurationHours, searchQuery]);


  // ----------------------------------------------------
  // FILTERING AND SORTING FOR GROUP ROOMS
  // ----------------------------------------------------
  const isRoomJoined = (r: Room) => {
    const defaultNames = ['general', 'tech', 'music', 'gaming'];
    return r.is_member === true || defaultNames.includes(r.name);
  };

  const filteredRooms = rooms.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const { pinnedGroups, activeGroups, globalGroupsMatches } = React.useMemo(() => {
    const chatId = (name: string) => `group:${name}`;

    // Base list only includes rooms that the user has joined
    let baseList = filteredRooms.filter(isRoomJoined);
    let globalList: typeof filteredRooms = [];

    if (activeGroupSpace === 'main_wall') {
      const mainWallMatches = baseList.filter(r => {
        const id = chatId(r.name);
        if (mainWallPins.includes(id)) return true;
        if (keepOnWall.includes(id)) return true;
        
        const lastMsgTime = roomLastMessage[r.name] || 0;
        if (lastMsgTime <= 0) return false;
        
        const ageHours = (timeNow - lastMsgTime) / 3600000;
        return ageHours < timerDurationHours;
      });

      // Global Matches are public rooms that match search but have NOT been joined yet
      if (searchQuery.trim() !== '') {
        globalList = filteredRooms.filter(r => !isRoomJoined(r) && r.visibility === 'public');
      }

      baseList = mainWallMatches;
    } else if (activeGroupSpace === 'unassigned') {
      baseList = baseList.filter(r => {
        const id = chatId(r.name);
        const assigned = spaceAssignments[id] || [];
        return assigned.length === 0;
      });
    } else {
      baseList = baseList.filter(r => {
        const id = chatId(r.name);
        return spaceAssignments[id]?.includes(activeGroupSpace);
      });
    }

    const pinnedList: typeof baseList = [];
    const activeList: typeof baseList = [];

    baseList.forEach(r => {
      const id = chatId(r.name);
      const isPinned = activeGroupSpace === 'main_wall' 
        ? mainWallPins.includes(id) 
        : (activeGroupSpace !== 'unassigned' && (spacePins[activeGroupSpace]?.includes(id)));
      
      if (isPinned) {
        pinnedList.push(r);
      } else {
        activeList.push(r);
      }
    });

    pinnedList.sort((a, b) => {
      const idA = chatId(a.name);
      const idB = chatId(b.name);
      const arr = activeGroupSpace === 'main_wall' ? mainWallPins : (spacePins[activeGroupSpace] || []);
      return arr.indexOf(idA) - arr.indexOf(idB);
    });

    activeList.sort((a, b) => {
      const timeA = roomLastMessage[a.name] || 0;
      const timeB = roomLastMessage[b.name] || 0;
      return timeB - timeA;
    });

    return { pinnedGroups: pinnedList, activeGroups: activeList, globalGroupsMatches: globalList };
  }, [filteredRooms, activeGroupSpace, mainWallPins, spacePins, keepOnWall, spaceAssignments, roomLastMessage, timeNow, timerDurationHours, searchQuery]);

  return (
    <aside className="sidebar">
      {/* User profile header */}
      {/* User profile header */}
      <div style={{ position: 'relative' }}>
        <div 
          className="sidebar-header" 
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '16px' }}
          onClick={() => setShowAccountSwitcher(!showAccountSwitcher)}
        >
          <div className="user-profile">
            <div className="user-avatar">{currentUser.avatar}</div>
            <div className="user-info">
              <div className="username">{currentUser.username}</div>
              <div className="tagline">@{currentUser.tag}</div>
            </div>
          </div>
          <ChevronDown size={18} style={{ color: 'var(--text-muted)', transform: showAccountSwitcher ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
        </div>

        {/* Account Switcher Dropdown */}
        {showAccountSwitcher && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '12px',
            right: '12px',
            zIndex: 100,
            background: 'rgba(18, 18, 24, 0.85)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
            padding: '12px',
            marginTop: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            overflow: 'hidden'
          }}>
            {savedAccounts.map(account => (
              <div 
                key={account.tag}
                onClick={() => {
                  if (onSwitchAccount && account.tag !== currentUser.tag) {
                    onSwitchAccount(account.tag);
                  }
                  setShowAccountSwitcher(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  cursor: account.tag === currentUser.tag ? 'default' : 'pointer',
                  background: account.tag === currentUser.tag ? 'rgba(168, 85, 247, 0.08)' : 'transparent',
                  border: account.tag === currentUser.tag ? '1px solid rgba(168, 85, 247, 0.2)' : '1px solid transparent',
                  transition: 'all 0.2s ease',
                  transform: 'scale(1)',
                }}
                onMouseEnter={(e) => { 
                  if (account.tag !== currentUser.tag) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.transform = 'scale(1.02)';
                  }
                }}
                onMouseLeave={(e) => { 
                  if (account.tag !== currentUser.tag) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
              >
                <div style={{ fontSize: '1.8rem', marginRight: '14px', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>{account.avatar}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: account.tag === currentUser.tag ? 'white' : 'rgba(255,255,255,0.9)' }}>{account.username}</div>
                  <div style={{ fontSize: '0.8rem', color: account.tag === currentUser.tag ? 'var(--accent-purple)' : 'rgba(255,255,255,0.5)', marginTop: '2px' }}>@{account.tag}</div>
                </div>
                {account.tag === currentUser.tag && (
                  <div style={{ 
                    color: 'var(--accent-cyan)', 
                    background: 'rgba(0, 229, 255, 0.1)', 
                    padding: '4px', 
                    borderRadius: '50%',
                    display: 'flex'
                  }}>
                    <Check size={16} strokeWidth={3} />
                  </div>
                )}
              </div>
            ))}
            
            <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '6px 4px' }} />
            
            <div 
              onClick={() => {
                if (onAddAccount) onAddAccount();
                setShowAccountSwitcher(false);
              }}
              style={{ padding: '10px 14px', borderRadius: '12px', display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.9)', cursor: 'pointer', transition: 'all 0.2s ease' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.color = 'white';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
              }}
            >
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '14px' }}>
                <Plus size={16} />
              </div>
              <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Add existing account</span>
            </div>
            
            <div 
              onClick={() => {
                if (onLogout) onLogout(currentUser.tag);
                setShowAccountSwitcher(false);
              }}
              style={{ padding: '10px 14px', borderRadius: '12px', display: 'flex', alignItems: 'center', color: '#ff6b6b', cursor: 'pointer', transition: 'all 0.2s ease' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 107, 107, 0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '14px' }}>
                <LogOut size={18} />
              </div>
              <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Log out @{currentUser.tag}</span>
            </div>

            {savedAccounts.length > 1 && (
              <div 
                onClick={() => {
                  if (onLogoutAll) onLogoutAll();
                  setShowAccountSwitcher(false);
                }}
                style={{ padding: '10px 14px', borderRadius: '12px', display: 'flex', alignItems: 'center', color: '#ff6b6b', cursor: 'pointer', transition: 'all 0.2s ease' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 107, 107, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '14px' }}>
                  <Users size={18} />
                </div>
                <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Log out of all accounts</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Sidebar Contents */}
      <div className="sidebar-content" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 130px)', overflowY: 'hidden' }}>
        
        {activeTab === 'chats' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Search */}
            <div className="search-container" style={{ padding: '12px 16px 4px 16px' }}>
              <div className="search-box" style={{ position: 'relative', width: '100%' }}>
                <Search className="search-icon" size={18} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder={activeChatSpace === 'main_wall' ? "Search Main wall..." : `Search ${activeChatSpace}...`}
                  className="search-input"
                  style={{ width: '100%', paddingLeft: '38px', height: '38px' }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Chats Feed Scrollable */}
            <div className="sidebar-scrollable-feed" style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
              {/* Pinned Section */}
              {pinnedDMs.length > 0 && (
                <>
                  <div className="tag-list-label" style={{ padding: '8px 12px 4px 12px', color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Pin size={11} /> Pinned Chats
                  </div>
                  <div className="tag-items">
                    {pinnedDMs.map((user) => {
                      const id = `dm:${user.tag}`;
                      const unreadCount = unreadDirects[user.tag] || 0;
                      return (
                        <div
                          key={user.tag}
                          className={`tag-item drag-handle ${activeDirectUser?.tag === user.tag ? 'active' : ''} ${dragOverId === id ? 'drag-over' : ''}`}
                          onClick={() => setActiveDirectUser(user)}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move';
                            handleDragStart(id);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            handleDragOver(e, id);
                          }}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDrop(id, activeChatSpace === 'main_wall', activeChatSpace !== 'main_wall' ? activeChatSpace : undefined);
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                            <div className="drag-grip" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', cursor: 'grab', marginRight: '-4px' }} title="Drag to rearrange">
                              <GripVertical size={14} />
                            </div>
                            <div style={{ position: 'relative' }}>
                              <div className="user-avatar" style={{ width: '36px', height: '36px', fontSize: '1.2rem' }}>
                                {user.avatar}
                              </div>
                              {user.online && (
                                <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#2ec4b6', border: '2px solid var(--bg-dark)' }} />
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0 }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {user.username}
                                </span>
                                {renderMultiSpaceBadge(id)}
                              </div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--accent-purple)' }}>
                                @{user.tag}
                              </div>
                            </div>
                            {unreadCount > 0 && <div className="unread-badge">{unreadCount}</div>}
                            {renderChatActions(id, activeChatSpace === 'main_wall', activeChatSpace !== 'main_wall' ? activeChatSpace : undefined)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Active Section */}
              <div className="tag-list-label" style={{ padding: '16px 12px 4px 12px' }}>Conversations</div>
              <div className="tag-items">
                {activeDMs.length > 0 ? (
                  activeDMs.map((user) => {
                    const id = `dm:${user.tag}`;
                    const unreadCount = unreadDirects[user.tag] || 0;
                    const lastMsgTime = directLastMessage[user.tag] || 0;
                    return (
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
                              <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#2ec4b6', border: '2px solid var(--bg-dark)' }} />
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0 }}>
                              <span style={{ fontWeight: 500, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {user.username}
                              </span>
                              {renderMultiSpaceBadge(id)}
                              {activeChatSpace === 'main_wall' && renderCountdown(id, lastMsgTime)}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              @{user.tag}
                            </div>
                          </div>
                          {unreadCount > 0 && <div className="unread-badge">{unreadCount}</div>}
                          {renderChatActions(id, activeChatSpace === 'main_wall', activeChatSpace !== 'main_wall' ? activeChatSpace : undefined, lastMsgTime)}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No conversations in this space.
                  </div>
                )}
              </div>

              {/* Global Search Section */}
              {activeChatSpace === 'main_wall' && globalMatches.length > 0 && (
                <>
                  <div className="tag-list-label" style={{ 
                    padding: '24px 12px 6px 12px', 
                    color: 'var(--accent-cyan)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    marginTop: '16px'
                  }}>
                    <Globe size={13} /> Global Platform Users
                  </div>
                  <div className="tag-items">
                    {globalMatches.map((user) => {
                      const id = `dm:${user.tag}`;
                      const unreadCount = unreadDirects[user.tag] || 0;
                      const lastMsgTime = directLastMessage[user.tag] || 0;
                      return (
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
                                <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#2ec4b6', border: '2px solid var(--bg-dark)' }} />
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0 }}>
                                <span style={{ fontWeight: 500, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {user.username}
                                </span>
                                {renderMultiSpaceBadge(id)}
                              </div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                @{user.tag}
                              </div>
                            </div>
                            {unreadCount > 0 && <div className="unread-badge">{unreadCount}</div>}
                            {renderChatActions(id, false, undefined, lastMsgTime)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Circular Space Strip at the Bottom */}
            <div className="space-strip">
              <div 
                className={`space-circle-container ${activeChatSpace === 'main_wall' ? 'active' : ''}`}
                onClick={() => setActiveChatSpace('main_wall')}
              >
                <div className="space-circle" style={{ backgroundColor: 'var(--accent-purple)' }}>
                  <LayoutGrid size={20} />
                </div>
                <span className="space-circle-label">Main</span>
              </div>
              {spaces.map(space => (
                <div 
                  key={space}
                  className={`space-circle-container ${activeChatSpace === space ? 'active' : ''}`}
                  onClick={() => setActiveChatSpace(space)}
                >
                  <div className="space-circle" style={{ backgroundColor: getSpaceColor(space) }}>
                    {getSpaceInitials(space)}
                  </div>
                  <span className="space-circle-label">{space}</span>
                </div>
              ))}
              <div 
                className={`space-circle-container ${activeChatSpace === 'unassigned' ? 'active' : ''}`}
                onClick={() => setActiveChatSpace('unassigned')}
              >
                <div className="space-circle" style={{ backgroundColor: '#27272a' }}>
                  <ShieldAlert size={20} />
                </div>
                <span className="space-circle-label">Unassigned</span>
              </div>
            </div>
          </div>
        ) : activeTab === 'groups' ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Search */}
            <div className="search-container" style={{ padding: '12px 16px 4px 16px' }}>
              <div className="search-box" style={{ position: 'relative', width: '100%' }}>
                <Search className="search-icon" size={18} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder={activeGroupSpace === 'main_wall' ? "Search Main wall..." : `Search ${activeGroupSpace}...`}
                  className="search-input"
                  style={{ width: '100%', paddingLeft: '38px', height: '38px' }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Create / Join Actions */}
            <div style={{ padding: '4px 16px 12px 16px' }}>
              {showAddTag ? (
                <form onSubmit={handleCreateTag} style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="e.g. tech, movies"
                    className="form-input"
                    style={{ padding: '8px 12px', height: '38px', flex: 1 }}
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" className="btn-primary" style={{ padding: '0 12px', width: 'auto', height: '38px' }}>
                    Add
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ padding: '0 12px', width: 'auto', height: '38px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-main)', boxShadow: 'none' }}
                    onClick={() => setShowAddTag(false)}
                  >
                    Cancel
                  </button>
                </form>
              ) : showJoinByCode ? (
                <form onSubmit={(e) => { handleJoinByCode(e); setShowJoinByCode(false); }} style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Enter invite code..."
                    className="form-input"
                    style={{ flex: 1, height: '38px', fontSize: '0.82rem', padding: '0 10px' }}
                    value={inviteCodeInput}
                    onChange={(e) => setInviteCodeInput(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" className="btn-primary" style={{ width: 'auto', height: '38px', padding: '0 12px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                    Join
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ padding: '0 12px', width: 'auto', height: '38px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-main)', boxShadow: 'none' }}
                    onClick={() => setShowJoinByCode(false)}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    className="create-tag-btn"
                    style={{ height: '38px', flex: 1, fontSize: '0.8rem', padding: '0 8px', borderRadius: '10px' }}
                    onClick={() => {
                      setShowAddTag(true);
                      setShowJoinByCode(false);
                    }}
                  >
                    <Plus size={14} /> Create Tag
                  </button>
                  <button
                    className="create-tag-btn"
                    style={{
                      height: '38px',
                      flex: 1,
                      fontSize: '0.8rem',
                      padding: '0 8px',
                      borderRadius: '10px',
                      color: 'var(--text-main)',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px dashed var(--border-color)'
                    }}
                    onClick={() => {
                      setShowJoinByCode(true);
                      setShowAddTag(false);
                    }}
                  >
                    <Key size={14} /> Join by Code
                  </button>
                </div>
              )}
            </div>

            {/* Pending Invitations */}
            {invitations.length > 0 && (
              <div style={{ padding: '0 16px 12px 16px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-purple)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Mail size={12} /> Pending Invitations ({invitations.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {invitations.map(inv => (
                    <div key={inv.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>
                        Invited to <strong style={{ color: 'var(--accent-purple)' }}>#{inv.room_tag}</strong> by @{inv.sender_tag}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          onClick={() => handleInvitation(inv.id, true)} 
                          className="btn-primary" 
                          style={{ flex: 1, height: '28px', fontSize: '0.75rem', padding: 0 }}
                        >
                          Accept
                        </button>
                        <button 
                          onClick={() => handleInvitation(inv.id, false)} 
                          className="btn-primary" 
                          style={{ flex: 1, height: '28px', fontSize: '0.75rem', padding: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-main)', boxShadow: 'none' }}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Groups Scrollable Feed */}
            <div className="sidebar-scrollable-feed" style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
              {/* Pinned Section */}
              {pinnedGroups.length > 0 && (
                <>
                  <div className="tag-list-label" style={{ padding: '8px 12px 4px 12px', color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Pin size={11} /> Pinned Groups
                  </div>
                  <div className="tag-items">
                    {pinnedGroups.map((room) => {
                      const id = `group:${room.name}`;
                      const unreadCount = unreadRooms[room.name] || 0;
                      const initials = getChannelInitials(room.name);
                      const grad = getChannelGradient(room.name);
                      return (
                        <div
                          key={room.name}
                          className={`tag-item drag-handle ${activeTag === room.name ? 'active' : ''} ${dragOverId === id ? 'drag-over' : ''}`}
                          onClick={() => setActiveTag(room.name)}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move';
                            handleDragStart(id);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            handleDragOver(e, id);
                          }}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDrop(id, activeGroupSpace === 'main_wall', activeGroupSpace !== 'main_wall' ? activeGroupSpace : undefined);
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                            <div className="drag-grip" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', cursor: 'grab', marginRight: '-4px' }} title="Drag to rearrange">
                              <GripVertical size={14} />
                            </div>
                            <div className="room-avatar" style={{ 
                              background: grad, 
                              color: 'white', 
                              fontWeight: 700, 
                              fontSize: '0.85rem', 
                              width: '36px', 
                              height: '36px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center', 
                              borderRadius: '12px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              letterSpacing: '0.5px'
                            }}>
                              {initials}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0 }}>
                                <span className="tag-title" style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {cleanRoomName(room.name)}
                                </span>
                                {room.visibility === 'private' && (
                                  <span title="Private" style={{ display: 'inline-flex', alignItems: 'center' }}><Lock size={12} style={{ marginLeft: '6px', color: 'var(--accent-orange)' }} /></span>
                                )}
                                {room.visibility === 'invite_only' && (
                                  <span title="Invite Only" style={{ display: 'inline-flex', alignItems: 'center' }}><Mail size={12} style={{ marginLeft: '6px', color: 'var(--accent-purple)' }} /></span>
                                )}
                                {(!room.visibility || room.visibility === 'public') && (
                                  <span title="Public" style={{ display: 'inline-flex', alignItems: 'center' }}><Globe size={12} style={{ marginLeft: '6px', color: 'var(--accent-cyan)' }} /></span>
                                )}
                                {renderMultiSpaceBadge(id)}
                              </div>
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                <span style={{ color: 'var(--accent-purple)', fontWeight: 500 }}>#{room.name.toLowerCase()}</span>
                                {room.creator_tag && (
                                  <>
                                    <span>•</span>
                                    <span>by @{room.creator_tag}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            {unreadCount > 0 && <div className="unread-badge">{unreadCount}</div>}
                            {renderChatActions(id, activeGroupSpace === 'main_wall', activeGroupSpace !== 'main_wall' ? activeGroupSpace : undefined)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Active Channels */}
              <div className="tag-list-label" style={{ padding: '16px 12px 4px 12px' }}>Group Channels</div>
              <div className="tag-items">
                {activeGroups.length > 0 ? (
                  activeGroups.map((room) => {
                    const id = `group:${room.name}`;
                    const unreadCount = unreadRooms[room.name] || 0;
                    const lastMsgTime = roomLastMessage[room.name] || 0;
                    const initials = getChannelInitials(room.name);
                    const grad = getChannelGradient(room.name);
                    return (
                      <div
                        key={room.name}
                        className={`tag-item ${activeTag === room.name ? 'active' : ''}`}
                        onClick={() => setActiveTag(room.name)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                          <div className="room-avatar" style={{ 
                            background: grad, 
                            color: 'white', 
                            fontWeight: 700, 
                            fontSize: '0.85rem', 
                            width: '36px', 
                            height: '36px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            borderRadius: '12px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            letterSpacing: '0.5px'
                          }}>
                            {initials}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0 }}>
                              <span className="tag-title" style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {cleanRoomName(room.name)}
                              </span>
                              {room.visibility === 'private' && (
                                <span title="Private" style={{ display: 'inline-flex', alignItems: 'center' }}><Lock size={12} style={{ marginLeft: '6px', color: 'var(--accent-orange)' }} /></span>
                              )}
                              {room.visibility === 'invite_only' && (
                                <span title="Invite Only" style={{ display: 'inline-flex', alignItems: 'center' }}><Mail size={12} style={{ marginLeft: '6px', color: 'var(--accent-purple)' }} /></span>
                              )}
                              {(!room.visibility || room.visibility === 'public') && (
                                <span title="Public" style={{ display: 'inline-flex', alignItems: 'center' }}><Globe size={12} style={{ marginLeft: '6px', color: 'var(--accent-cyan)' }} /></span>
                              )}
                              {renderMultiSpaceBadge(id)}
                              {activeGroupSpace === 'main_wall' && renderCountdown(id, lastMsgTime)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                              <span style={{ color: 'var(--accent-cyan)', fontWeight: 500 }}>#{room.name.toLowerCase()}</span>
                              {room.creator_tag && (
                                <>
                                  <span>•</span>
                                  <span>by @{room.creator_tag}</span>
                                </>
                              )}
                            </div>
                          </div>
                          {unreadCount > 0 && <div className="unread-badge">{unreadCount}</div>}
                          {renderChatActions(id, activeGroupSpace === 'main_wall', activeGroupSpace !== 'main_wall' ? activeGroupSpace : undefined, lastMsgTime)}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No group tags in this space.
                  </div>
                )}
              </div>

              {/* Global Search Section for Public Groups */}
              {activeGroupSpace === 'main_wall' && globalGroupsMatches.length > 0 && (
                <>
                  <div className="tag-list-label" style={{ 
                    padding: '24px 12px 6px 12px', 
                    color: 'var(--accent-cyan)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    marginTop: '16px'
                  }}>
                    <Globe size={13} /> Global Public Groups
                  </div>
                  <div className="tag-items">
                    {globalGroupsMatches.map((room) => {
                      const initials = getChannelInitials(room.name);
                      const grad = getChannelGradient(room.name);
                      return (
                        <div
                          key={room.name}
                          className={`tag-item ${activeTag === room.name ? 'active' : ''}`}
                          onClick={() => setActiveTag(room.name)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                            <div className="room-avatar" style={{ 
                              background: grad, 
                              color: 'white', 
                              fontWeight: 700, 
                              fontSize: '0.85rem', 
                              width: '36px', 
                              height: '36px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center', 
                              borderRadius: '12px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              letterSpacing: '0.5px'
                            }}>
                              {initials}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0 }}>
                                <span className="tag-title" style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {cleanRoomName(room.name)}
                                </span>
                                <span title="Public" style={{ display: 'inline-flex', alignItems: 'center' }}><Globe size={12} style={{ marginLeft: '6px', color: 'var(--accent-cyan)' }} /></span>
                              </div>
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                <span style={{ color: 'var(--accent-cyan)', fontWeight: 500 }}>#{room.name.toLowerCase()}</span>
                                {room.creator_tag && (
                                  <>
                                    <span>•</span>
                                    <span>by @{room.creator_tag}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Circular Space Strip at the Bottom */}
            <div className="space-strip">
              <div 
                className={`space-circle-container ${activeGroupSpace === 'main_wall' ? 'active' : ''}`}
                onClick={() => setActiveGroupSpace('main_wall')}
              >
                <div className="space-circle" style={{ backgroundColor: 'var(--accent-purple)' }}>
                  <LayoutGrid size={20} />
                </div>
                <span className="space-circle-label">Main</span>
              </div>
              {spaces.map(space => (
                <div 
                  key={space}
                  className={`space-circle-container ${activeGroupSpace === space ? 'active' : ''}`}
                  onClick={() => setActiveGroupSpace(space)}
                >
                  <div className="space-circle" style={{ backgroundColor: getSpaceColor(space) }}>
                    {getSpaceInitials(space)}
                  </div>
                  <span className="space-circle-label">{space}</span>
                </div>
              ))}
              <div 
                className={`space-circle-container ${activeGroupSpace === 'unassigned' ? 'active' : ''}`}
                onClick={() => setActiveGroupSpace('unassigned')}
              >
                <div className="space-circle" style={{ backgroundColor: '#27272a' }}>
                  <ShieldAlert size={20} />
                </div>
                <span className="space-circle-label">Unassigned</span>
              </div>
            </div>
          </div>
        ) : activeTab === 'spaces' ? (
          /* Spaces Grid Management Tab */
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
            <div style={{ padding: '16px 16px 8px 16px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--accent-purple)', marginBottom: '12px' }}>Create New Space</h3>
              <form onSubmit={handleCreateSpace} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="e.g. Work, Family, Study"
                  className="form-input"
                  style={{ padding: '10px 14px', height: '38px', flex: 1 }}
                  value={newSpaceName}
                  onChange={(e) => setNewSpaceName(e.target.value)}
                />
                <button type="submit" className="btn-primary" style={{ padding: '0 16px', width: 'auto', height: '38px' }}>
                  Create
                </button>
              </form>
            </div>

            <div className="tag-list-label" style={{ padding: '16px 16px 4px 16px' }}>Your Relational Spaces</div>
            
            <div className="spaces-grid">
              {/* Main Wall Card */}
              <div className="space-card" onClick={() => { setActiveTab('chats'); setActiveChatSpace('main_wall'); }}>
                <div>
                  <div className="space-card-name" style={{ color: 'var(--accent-purple)' }}>Main wall</div>
                  <div className="space-card-count">Self-Cleaning view</div>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Default Inbox</div>
              </div>

              {/* Custom Space Cards */}
              {spaces.map(space => {
                // Count chats in this space
                const dmsCount = otherUsers.filter(u => spaceAssignments[`dm:${u.tag}`]?.includes(space)).length;
                const groupsCount = rooms.filter(r => spaceAssignments[`group:${r.name}`]?.includes(space)).length;

                return (
                  <div 
                    key={space} 
                    className="space-card" 
                    onClick={() => { 
                      setActiveTab('chats'); 
                      setActiveChatSpace(space); 
                    }}
                  >
                    <div>
                      <div className="space-card-name">{space}</div>
                      <div className="space-card-count">
                        {dmsCount} {dmsCount === 1 ? 'chat' : 'chats'}, {groupsCount} {groupsCount === 1 ? 'group' : 'groups'}
                      </div>
                    </div>
                    
                    <div className="space-card-actions" onClick={e => e.stopPropagation()}>
                      <button className="space-action-btn" onClick={() => handleRenameSpace(space)} title="Rename Space">
                        <Edit3 size={13} />
                      </button>
                      <button className="space-action-btn delete" onClick={() => handleDeleteSpace(space)} title="Delete Space">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Unassigned Card */}
              <div className="space-card" onClick={() => { setActiveTab('chats'); setActiveChatSpace('unassigned'); }}>
                <div>
                  <div className="space-card-name" style={{ color: 'var(--accent-cyan)' }}>Unassigned</div>
                  <div className="space-card-count">Holding space</div>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Awaiting context</div>
              </div>
            </div>
          </div>
        ) : activeTab === 'activity' ? (
          /* Activity Feed / Status tab combined */
          <div className="status-feed-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
            
            {/* Status updates stories (kept intact) */}
            <div className="status-my-story" style={{ padding: '16px', marginBottom: '8px' }}>
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

              {statuses.filter(s => s.creator_id === currentUser.tag).length > 0 && (
                <div className="my-active-statuses-container">
                  <div className="my-active-statuses-title">My Active Statuses</div>
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

            <div className="status-feed-header" style={{ padding: '0 16px 8px 16px' }}>Recent Status Stories</div>
            <div className="status-stories-list" style={{ padding: '0 8px', marginBottom: '20px' }}>
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
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No active status updates.
                </div>
              )}
            </div>

            {/* Unread message updates and notifications logs */}
            <div className="status-feed-header" style={{ padding: '16px 16px 8px 16px', borderTop: '1px solid var(--border-color)' }}>Unread Activity</div>
            <div style={{ padding: '0 16px 20px 16px' }}>
              {Object.keys(unreadDirects).some(tag => unreadDirects[tag] > 0) || Object.keys(unreadRooms).some(name => unreadRooms[name] > 0) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(unreadDirects).map(([tag, count]) => {
                    if (count <= 0) return null;
                    const u = allUsers.find(user => user.tag === tag);
                    return (
                      <div key={tag} className="tag-item" onClick={() => { setActiveTab('chats'); if (u) setActiveDirectUser(u); }} style={{ padding: '10px 14px', background: 'rgba(139, 92, 246, 0.05)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <span style={{ fontSize: '1.2rem' }}>{u?.avatar || '👤'}</span>
                          <div>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{u?.username || tag}</span>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>@{tag}</div>
                          </div>
                        </div>
                        <span className="unread-badge">{count}</span>
                      </div>
                    );
                  })}
                  {Object.entries(unreadRooms).map(([name, count]) => {
                    if (count <= 0) return null;
                    return (
                      <div key={name} className="tag-item" onClick={() => { setActiveTab('groups'); setActiveTag(name); }} style={{ padding: '10px 14px', background: 'rgba(139, 92, 246, 0.05)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <span style={{ fontSize: '1rem', background: 'rgba(255,255,255,0.05)', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>#</span>
                          <div>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>#{name}</span>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Group channel</div>
                          </div>
                        </div>
                        <span className="unread-badge">{count}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  All conversations are up-to-date!
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Profile / Settings Tab */
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px', borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.01)' }}>
              <div style={{ fontSize: '4.5rem', marginBottom: '12px' }}>{currentUser.avatar}</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'white' }}>{currentUser.username}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--accent-purple)', fontWeight: 500, marginTop: '2px' }}>@{currentUser.tag}</div>
              {currentUser.bio && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center', maxWidth: '250px', fontStyle: 'italic' }}>
                  "{currentUser.bio}"
                </div>
              )}
            </div>

            <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={() => setShowEditProfileModal(true)}
                style={{
                  background: 'rgba(139, 92, 246, 0.1)',
                  border: '1px solid var(--accent-purple)',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  transition: 'all 0.2s',
                }}
                className="edit-profile-btn"
              >
                <Edit3 size={16} />
                Edit Profile
              </button>
            </div>

            {/* Surface Timer preference */}
            <div className="settings-group" style={{ padding: '20px 16px' }}>
              <label className="settings-label" style={{ fontWeight: 600, color: 'var(--accent-purple)', fontSize: '0.9rem', marginBottom: '10px' }}>
                Main Wall Cleanup Duration
              </label>
              <div style={{ position: 'relative' }}>
                <div 
                  onClick={() => setIsTimerDropdownOpen(!isTimerDropdownOpen)}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    width: '100%', 
                    background: 'rgba(20, 15, 38, 0.8)', 
                    border: '1px solid var(--border-color)', 
                    color: 'white', 
                    padding: '10px 14px', 
                    borderRadius: '10px', 
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  <span>
                    {isCustomTimer ? 'Custom...' : 
                      timerDurationHours === 1 ? '1 Hour (Hyper clean)' :
                      timerDurationHours === 6 ? '6 Hours (Frequent checks)' :
                      timerDurationHours === 24 ? '1 Day (Recommended default)' :
                      timerDurationHours === 72 ? '3 Days (Casual checks)' :
                      timerDurationHours === 168 ? '1 Week (Low activity)' : 'Custom...'}
                  </span>
                  <ChevronDown size={16} style={{ color: 'var(--text-muted)', transform: isTimerDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </div>
                {isTimerDropdownOpen && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: '8px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    zIndex: 100,
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                  }}>
                    {[
                      { val: 1, label: '1 Hour (Hyper clean)' },
                      { val: 6, label: '6 Hours (Frequent checks)' },
                      { val: 24, label: '1 Day (Recommended default)' },
                      { val: 72, label: '3 Days (Casual checks)' },
                      { val: 168, label: '1 Week (Low activity)' },
                      { val: 'custom', label: 'Custom...' }
                    ].map(option => (
                      <div
                        key={option.val}
                        onClick={() => {
                          handleTimerSelectChange(option.val.toString());
                          setIsTimerDropdownOpen(false);
                        }}
                        style={{
                          padding: '10px 14px',
                          cursor: 'pointer',
                          background: (isCustomTimer ? option.val === 'custom' : option.val === timerDurationHours) ? 'rgba(255,255,255,0.05)' : 'transparent',
                          color: (isCustomTimer ? option.val === 'custom' : option.val === timerDurationHours) ? 'var(--accent-purple)' : 'var(--text-main)',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = (isCustomTimer ? option.val === 'custom' : option.val === timerDurationHours) ? 'rgba(255,255,255,0.05)' : 'transparent'}
                      >
                        {option.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {isCustomTimer && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                      Custom Value:
                    </label>
                    <input
                      type="number"
                      min="1"
                      className="form-input"
                      value={customHoursValue || ''}
                      onChange={(e) => handleCustomValueChange(e.target.value)}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', background: 'rgba(20, 15, 38, 0.8)', border: '1px solid var(--border-color)', color: 'white', outline: 'none' }}
                    />
                  </div>
                  <div style={{ width: '110px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                      Unit:
                    </label>
                    <select
                      className="form-input"
                      value={customHoursUnit}
                      onChange={(e) => handleCustomUnitChange(e.target.value as any)}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', background: 'rgba(20, 15, 38, 0.8)', border: '1px solid var(--border-color)', color: 'white', outline: 'none' }}
                    >
                      <option value="minutes">Minutes</option>
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                    </select>
                  </div>
                </div>
              )}
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.4 }}>
                Direct Messages and Group Channels will automatically leave the Main Wall and return to their assigned Spaces after this duration of inactivity.
              </p>
            </div>

            {/* Multi-space warning preference */}
            <div className="settings-group" style={{ padding: '0 16px 20px 16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={warnOnMultiSpace}
                  onChange={(e) => saveWarnOnMultiSpace(e.target.checked)}
                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                />
                <span style={{ fontWeight: 600, color: 'var(--accent-purple)', fontSize: '0.9rem' }}>
                  Warn when assigning to multiple spaces
                </span>
              </label>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.4, paddingLeft: '26px' }}>
                Show a confirmation dialog if you add a conversation to a space when it is already assigned to other spaces.
              </p>
            </div>

            {/* Show time remaining preference */}
            <div className="settings-group" style={{ padding: '0 16px 20px 16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showCountdown}
                  onChange={(e) => saveShowCountdown(e.target.checked)}
                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                />
                <span style={{ fontWeight: 600, color: 'var(--accent-cyan)', fontSize: '0.9rem' }}>
                  Show cleanup countdown timers
                </span>
              </label>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.4, paddingLeft: '26px' }}>
                Display the time remaining before a conversation automatically leaves the Main Wall.
              </p>
            </div>

            {/* Relational model description */}
            <div style={{ padding: '0 16px 24px 16px', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <div style={{ fontWeight: 600, color: 'white', marginBottom: '4px' }}>Relational Concept Model</div>
              Spaces is built on a single-entity model. Your chat history remains singular and secure, even if a conversation shortcut is mapped across multiple relational spaces.
            </div>

            {/* Blocked Users settings group */}
            <div className="settings-group" style={{ padding: '0 16px 20px 16px' }}>
              <div 
                onClick={() => setShowBlockedUsersModal(true)}
                className="premium-settings-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease-in-out',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <ShieldAlert size={18} style={{ color: '#ff5c5c' }} />
                  <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'white' }}>Blocked Users</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ 
                    fontSize: '0.78rem', 
                    background: blockedUsers.length > 0 ? '#ff5c5c' : 'rgba(255, 255, 255, 0.08)', 
                    color: 'white', 
                    borderRadius: '12px', 
                    padding: '2px 8px',
                    fontWeight: 600
                  }}>
                    {blockedUsers.length}
                  </span>
                  <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                </div>
              </div>
            </div>

            {/* Logout button in Profile tab */}
            <div style={{ padding: '0 16px 24px 16px' }}>
              <button
                onClick={() => onLogout()}
                style={{
                  background: '#ff5c5c',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  boxShadow: '0 4px 12px rgba(255, 92, 92, 0.25)',
                  transition: 'background-color 0.2s',
                }}
              >
                <LogOut size={16} />
                Logout Account
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Edit Profile Modal */}
      {showEditProfileModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000, padding: '20px' }}>
          <div style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(20px)', border: '1px solid var(--border-color)', borderRadius: '16px', width: '100%', maxWidth: '500px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--accent-purple)' }}>Edit Profile</h3>
              <button 
                onClick={() => setShowEditProfileModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px', overflowY: 'auto' }}>
              {profileError && (
                <div style={{ color: '#ff5c5c', fontSize: '0.8rem', padding: '8px 12px', background: 'rgba(255, 92, 92, 0.08)', borderRadius: '8px', border: '1px solid rgba(255, 92, 92, 0.2)' }}>
                  ⚠️ {profileError}
                </div>
              )}

              {profileSuccess && (
                <div style={{ color: '#2ec4b6', fontSize: '0.8rem', padding: '8px 12px', background: 'rgba(46, 196, 182, 0.08)', borderRadius: '8px', border: '1px solid rgba(46, 196, 182, 0.2)' }}>
                  ✓ {profileSuccess}
                </div>
              )}

              <div className="form-group">
                <label className="form-label" style={{ marginBottom: '8px', display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Choose Avatar</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', background: 'rgba(20, 15, 38, 0.4)', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  {AVATAR_OPTIONS.map((avatar) => (
                    <button
                      key={avatar}
                      type="button"
                      onClick={() => setProfileAvatar(avatar)}
                      style={{
                        fontSize: '1.5rem',
                        background: profileAvatar === avatar ? 'rgba(139, 92, 246, 0.2)' : 'none',
                        border: profileAvatar === avatar ? '1px solid var(--accent-purple)' : '1px solid transparent',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        padding: '4px',
                        width: '38px',
                        height: '38px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                      }}
                    >
                      {avatar}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ marginBottom: '6px', display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Display Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', background: 'rgba(20, 15, 38, 0.8)', border: '1px solid var(--border-color)', color: 'white', outline: 'none' }}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ marginBottom: '6px', display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Bio</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={profileBio}
                  onChange={(e) => setProfileBio(e.target.value)}
                  placeholder="Tell us about yourself..."
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', background: 'rgba(20, 15, 38, 0.8)', border: '1px solid var(--border-color)', color: 'white', outline: 'none', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ marginTop: '8px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>Security (Change Password)</h4>
                
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label className="form-label" style={{ marginBottom: '6px', display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Current Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      className="form-input"
                      value={profileCurrentPassword}
                      onChange={(e) => setProfileCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      style={{ width: '100%', padding: '10px 40px 10px 14px', borderRadius: '10px', background: 'rgba(20, 15, 38, 0.8)', border: '1px solid var(--border-color)', color: 'white', outline: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label className="form-label" style={{ marginBottom: '6px', display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      className="form-input"
                      value={profileNewPassword}
                      onChange={(e) => setProfileNewPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      style={{ width: '100%', padding: '10px 40px 10px 14px', borderRadius: '10px', background: 'rgba(20, 15, 38, 0.8)', border: '1px solid var(--border-color)', color: 'white', outline: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ marginBottom: '6px', display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Confirm New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      className="form-input"
                      value={profileConfirmPassword}
                      onChange={(e) => setProfileConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      style={{ width: '100%', padding: '10px 40px 10px 14px', borderRadius: '10px', background: 'rgba(20, 15, 38, 0.8)', border: '1px solid var(--border-color)', color: 'white', outline: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowEditProfileModal(false)}
                  style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-muted)',
                    borderRadius: '10px',
                    height: '38px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={profileSaving}
                  style={{ flex: 1, height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  {profileSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Privacy Settings Modal (Statuses) */}
      {showPrivacyModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000, padding: '20px' }}>
          <div style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(20px)', border: '1px solid var(--border-color)', borderRadius: '16px', width: '100%', maxWidth: '450px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--accent-purple)' }}>Status Privacy Settings</h3>
              <button onClick={() => setShowPrivacyModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer', padding: 0, lineHeight: 1 }}>&times;</button>
            </div>
            <div style={{ padding: '16px 20px', fontSize: '0.85rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
              Choose who can view the statuses you post. By default, viewers must be granted permission.
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {otherUsers.length > 0 ? (
                otherUsers.map(user => {
                  const perm = permissionsList.find(p => p.viewer_tag === user.tag);
                  const isAllowed = perm ? perm.allowed : false;
                  return (
                    <div key={user.tag} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '1.5rem' }}>{user.avatar}</span>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{user.username}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>@{user.tag}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleTogglePermission(user.tag, isAllowed)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', border: isAllowed ? '1px solid var(--accent-green)' : '1px solid var(--border-color)', background: isAllowed ? 'rgba(46, 196, 182, 0.1)' : 'rgba(255, 255, 255, 0.03)', color: isAllowed ? 'var(--accent-green)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, transition: 'all 0.2s' }}
                      >
                        {isAllowed ? <><Eye size={14} /> Allowed</> : <><EyeOff size={14} /> Denied</>}
                      </button>
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>No other users found in the system.</div>
              )}
            </div>
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', background: 'rgba(255, 255, 255, 0.01)' }}>
              <button className="btn-primary" onClick={() => setShowPrivacyModal(false)} style={{ width: 'auto', padding: '10px 24px' }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Blocked Users Modal */}
      {showBlockedUsersModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000, padding: '20px' }}>
          <div style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(20px)', border: '1px solid var(--border-color)', borderRadius: '16px', width: '100%', maxWidth: '450px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--accent-purple)' }}>Blocked Users</h3>
              <button onClick={() => setShowBlockedUsersModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer', padding: 0, lineHeight: 1 }}>&times;</button>
            </div>
            <div style={{ padding: '16px 20px', fontSize: '0.85rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
              Managed list of users you have blocked. Blocked users cannot message or call you.
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {blockedUsers.length > 0 ? (
                blockedUsers.map(tag => {
                  const u = allUsers.find(user => user.tag === tag);
                  return (
                    <div key={tag} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '1.5rem' }}>{u?.avatar || '👤'}</span>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'white' }}>{u?.username || tag}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>@{tag}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const updated = blockedUsers.filter(t => t !== tag);
                          saveBlockedUsers(updated);
                        }}
                        style={{
                          background: 'rgba(255, 92, 92, 0.1)',
                          border: '1px solid #ff5c5c',
                          color: '#ff5c5c',
                          borderRadius: '8px',
                          padding: '6px 12px',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          fontWeight: 600,
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#ff5c5c';
                          e.currentTarget.style.color = 'white';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 92, 92, 0.1)';
                          e.currentTarget.style.color = '#ff5c5c';
                        }}
                      >
                        Unblock
                      </button>
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>No blocked users.</div>
              )}
            </div>
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', background: 'rgba(255, 255, 255, 0.01)' }}>
              <button className="btn-primary" onClick={() => setShowBlockedUsersModal(false)} style={{ width: 'auto', padding: '10px 24px' }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign to Space modal (custom checkboxes) */}
      {assignTarget && (
        <div className="spaces-modal-overlay">
          <div className="spaces-modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--accent-purple)' }}>
                Assign to Spaces
              </h3>
              <button 
                onClick={() => setAssignTarget(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer', padding: 0 }}
              >
                &times;
              </button>
            </div>
            
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 16px 0' }}>
              Select relational spaces for: <strong style={{ color: 'white' }}>{assignTarget.type === 'group' ? `#${assignTarget.name}` : `@${assignTarget.tag}`}</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '200px', overflowY: 'auto', marginBottom: '20px' }}>
              {spaces.map(space => {
                const chatId = `${assignTarget.type}:${assignTarget.tag}`;
                const isAssigned = spaceAssignments[chatId]?.includes(space) || false;
                return (
                  <label 
                    key={space} 
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}
                  >
                    <input 
                      type="checkbox" 
                      checked={isAssigned} 
                      onChange={() => handleToggleSpaceAssign(space)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ color: isAssigned ? 'white' : 'var(--text-muted)' }}>{space}</span>
                  </label>
                );
              })}
            </div>

            <button 
              className="btn-primary" 
              onClick={() => setAssignTarget(null)}
              style={{ width: '100%', height: '38px' }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Bottom Navigation Tab Bar */}
      <nav className="bottom-nav">
        <button 
          className={`bottom-nav-item ${activeTab === 'chats' ? 'active' : ''}`}
          onClick={() => { setActiveTab('chats'); setSearchQuery(''); }}
        >
          <MessageSquare size={18} />
          Chats
        </button>
        <button 
          className={`bottom-nav-item ${activeTab === 'groups' ? 'active' : ''}`}
          onClick={() => { setActiveTab('groups'); setSearchQuery(''); }}
        >
          <Users size={18} />
          Groups
        </button>
        <button 
          className={`bottom-nav-item ${activeTab === 'spaces' ? 'active' : ''}`}
          onClick={() => { setActiveTab('spaces'); setSearchQuery(''); }}
        >
          <FolderPlus size={18} />
          Spaces
        </button>
        <button 
          className={`bottom-nav-item ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => { setActiveTab('activity'); setSearchQuery(''); }}
        >
          <Image size={18} />
          Activity
        </button>
        <button 
          className={`bottom-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => { setActiveTab('profile'); setSearchQuery(''); }}
        >
          <Settings size={18} />
          Profile
        </button>
      </nav>
    </aside>
  );
};
