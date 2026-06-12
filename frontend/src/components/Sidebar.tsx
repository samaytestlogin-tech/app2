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
  ShieldAlert
} from 'lucide-react';
import type { User, UserStatus, Room, StatusPermission } from '../types';
import { socket, BACKEND_URL } from '../socket';

interface SidebarProps {
  currentUser: User;
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
  onLogout: () => void;
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
  activeDirectUser,
  setActiveDirectUser,
  onLogout,
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
  saveKeepOnWall,
  timerDurationHours,
  saveTimerDurationHours,
  warnOnMultiSpace,
  saveWarnOnMultiSpace,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [newTag, setNewTag] = useState('');
  const [showAddTag, setShowAddTag] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');

  // Space selected inside Chats tab vs Groups tab
  const [activeChatSpace, setActiveChatSpace] = useState<string>('main_wall');
  const [activeGroupSpace, setActiveGroupSpace] = useState<string>('main_wall');

  // Drag & drop sorting state for pins
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

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
      alert("Space already exists!");
      return;
    }
    saveSpaces([...spaces, clean]);
    setNewSpaceName('');
  };

  const handleDeleteSpace = (spaceName: string) => {
    if (!confirm(`Are you sure you want to delete the space "${spaceName}"? Conversations will remain in Unassigned or other spaces.`)) {
      return;
    }
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
      alert("Space already exists!");
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

  const handleToggleSpaceAssign = (spaceName: string) => {
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
        const confirmed = window.confirm(
          `${targetName} is already present in "${spacesList}" space. Do you still want to add this user here as well?`
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

  const handleToggleKeepOnWall = (chatId: string) => {
    if (keepOnWall.includes(chatId)) {
      saveKeepOnWall(keepOnWall.filter(id => id !== chatId));
    } else {
      saveKeepOnWall([...keepOnWall, chatId]);
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

  // Helper renderers for badges and buttons on chat rows
  const renderCountdown = (chatId: string, lastMsgTime: number) => {
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

  const renderChatActions = (chatId: string, isMainWall: boolean, spaceName?: string, lastMsgTime?: number) => {
    const isPinned = isMainWall ? mainWallPins.includes(chatId) : (spacePins[spaceName || '']?.includes(chatId) || false);
    const isKept = keepOnWall.includes(chatId);

    const parts = chatId.split(':');
    const type = parts[0] as 'dm' | 'group';
    const tag = parts[1];
    const room = type === 'group' ? rooms.find(r => r.name === tag) : null;
    const isRoomCreator = room && room.creator_tag === currentUser.tag;

    return (
      <div className="chat-actions-hover" style={{ display: 'flex', gap: '6px', alignItems: 'center', marginLeft: 'auto' }} onClick={e => e.stopPropagation()}>
        {isRoomCreator && (
          <>
            <button
              className="space-action-btn"
              onClick={() => handleEditRoom(tag)}
              title="Rename Group"
            >
              <Edit3 size={13} />
            </button>
            <button
              className="space-action-btn delete"
              onClick={() => handleDeleteRoom(tag)}
              title="Delete Group"
            >
              <Trash2 size={13} style={{ color: '#ff5c5c' }} />
            </button>
          </>
        )}

        <button
          className="space-action-btn"
          onClick={() => handleTogglePin(chatId, isMainWall, spaceName)}
          title={isPinned ? "Unpin from top" : "Pin to top"}
        >
          {isPinned ? <PinOff size={14} style={{ color: 'var(--accent-purple)' }} /> : <Pin size={14} />}
        </button>

        {isMainWall && !isPinned && lastMsgTime && lastMsgTime > 0 ? (
          <button
            className="space-action-btn"
            onClick={() => handleToggleKeepOnWall(chatId)}
            title={isKept ? "Remove from wall" : "Keep on wall permanently"}
          >
            <Eye size={14} style={{ color: isKept ? 'var(--accent-cyan)' : 'inherit' }} />
          </button>
        ) : null}

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

  // Partition DMs into pinned and active
  const { pinnedDMs, activeDMs } = React.useMemo(() => {
    const chatId = (tag: string) => `dm:${tag}`;

    // Filter list based on selected space
    let baseList = [...filteredUsers];

    if (activeChatSpace === 'main_wall') {
      // Main wall filters out things that are expired (not pinned, not kept, activity > global timer)
      baseList = baseList.filter(u => {
        const id = chatId(u.tag);
        if (mainWallPins.includes(id)) return true;
        if (keepOnWall.includes(id)) return true;
        
        const lastMsgTime = directLastMessage[u.tag] || 0;
        if (lastMsgTime <= 0) return false;
        
        const ageHours = (timeNow - lastMsgTime) / 3600000;
        return ageHours < timerDurationHours;
      });
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

    return { pinnedDMs: pinnedList, activeDMs: activeList };
  }, [filteredUsers, activeChatSpace, mainWallPins, spacePins, keepOnWall, spaceAssignments, directLastMessage, timeNow, timerDurationHours]);


  // ----------------------------------------------------
  // FILTERING AND SORTING FOR GROUP ROOMS
  // ----------------------------------------------------
  const filteredRooms = rooms.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const { pinnedGroups, activeGroups } = React.useMemo(() => {
    const chatId = (name: string) => `group:${name}`;

    let baseList = [...filteredRooms];

    if (activeGroupSpace === 'main_wall') {
      baseList = baseList.filter(r => {
        const id = chatId(r.name);
        if (mainWallPins.includes(id)) return true;
        if (keepOnWall.includes(id)) return true;
        
        const lastMsgTime = roomLastMessage[r.name] || 0;
        if (lastMsgTime <= 0) return false;
        
        const ageHours = (timeNow - lastMsgTime) / 3600000;
        return ageHours < timerDurationHours;
      });
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

    return { pinnedGroups: pinnedList, activeGroups: activeList };
  }, [filteredRooms, activeGroupSpace, mainWallPins, spacePins, keepOnWall, spaceAssignments, roomLastMessage, timeNow, timerDurationHours]);

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
                          onDragStart={() => handleDragStart(id)}
                          onDragOver={(e) => handleDragOver(e, id)}
                          onDragLeave={handleDragLeave}
                          onDrop={() => handleDrop(id, activeChatSpace === 'main_wall', activeChatSpace !== 'main_wall' ? activeChatSpace : undefined)}
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

            {/* Create tag */}
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
              ) : (
                <button className="create-tag-btn" style={{ height: '38px', width: '100%' }} onClick={() => setShowAddTag(true)}>
                  <Plus size={18} />
                  Create New Group Tag
                </button>
              )}
            </div>

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
                      return (
                        <div
                          key={room.name}
                          className={`tag-item drag-handle ${activeTag === room.name ? 'active' : ''} ${dragOverId === id ? 'drag-over' : ''}`}
                          onClick={() => setActiveTag(room.name)}
                          draggable
                          onDragStart={() => handleDragStart(id)}
                          onDragOver={(e) => handleDragOver(e, id)}
                          onDragLeave={handleDragLeave}
                          onDrop={() => handleDrop(id, activeGroupSpace === 'main_wall', activeGroupSpace !== 'main_wall' ? activeGroupSpace : undefined)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                            <div className="tag-hash-icon" style={{ fontSize: '1.2rem', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: '50%' }}>#</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0 }}>
                                <span className="tag-title" style={{ fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  #{room.name}
                                </span>
                                {renderMultiSpaceBadge(id)}
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
                    return (
                      <div
                        key={room.name}
                        className={`tag-item ${activeTag === room.name ? 'active' : ''}`}
                        onClick={() => setActiveTag(room.name)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                          <div className="tag-hash-icon" style={{ fontSize: '1.2rem', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: '50%' }}>#</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0 }}>
                              <span className="tag-title" style={{ fontWeight: 500, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                #{room.name}
                              </span>
                              {renderMultiSpaceBadge(id)}
                              {activeGroupSpace === 'main_wall' && renderCountdown(id, lastMsgTime)}
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
            </div>

            {/* Surface Timer preference */}
            <div className="settings-group" style={{ padding: '20px 16px' }}>
              <label className="settings-label" style={{ fontWeight: 600, color: 'var(--accent-purple)', fontSize: '0.9rem', marginBottom: '10px' }}>
                Main Wall Cleanup Duration
              </label>
              <select
                className="form-input"
                value={isCustomTimer ? 'custom' : timerDurationHours}
                onChange={(e) => handleTimerSelectChange(e.target.value)}
                style={{ width: '100%', background: 'rgba(20, 15, 38, 0.8)', border: '1px solid var(--border-color)', color: 'white', padding: '10px 14px', borderRadius: '10px', outline: 'none' }}
              >
                <option value={1}>1 Hour (Hyper clean)</option>
                <option value={6}>6 Hours (Frequent checks)</option>
                <option value={24}>1 Day (Recommended default)</option>
                <option value={72}>3 Days (Casual checks)</option>
                <option value={168}>1 Week (Low activity)</option>
                <option value="custom">Custom...</option>
              </select>

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

            {/* Relational model description */}
            <div style={{ padding: '0 16px 24px 16px', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <div style={{ fontWeight: 600, color: 'white', marginBottom: '4px' }}>Relational Concept Model</div>
              Spaces is built on a single-entity model. Your chat history remains singular and secure, even if a conversation shortcut is mapped across multiple relational spaces.
            </div>

            {/* Logout button in Profile tab */}
            <div style={{ padding: '0 16px 24px 16px' }}>
              <button
                onClick={onLogout}
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
