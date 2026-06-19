export interface User {
  tag: string; // Unique user tag/handle (e.g. satoshi)
  username: string; // Display name
  avatar: string; // Avatar emoji
  online?: boolean;
}

export interface Message {
  id: string;
  room_tag: string;
  sender_id: string;
  sender_name: string;
  msg_type: 'text' | 'photo' | 'audio' | 'file';
  content: string;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  timestamp: number;
  status: 'sent' | 'delivered' | 'seen';
  pinned?: boolean;
  pinned_by?: string;
  pinned_at?: number;
}

export interface DirectMessage {
  id: string;
  sender_tag: string;
  receiver_tag: string;
  msg_type: 'text' | 'photo' | 'audio' | 'file';
  content: string;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  timestamp: number;
  status: 'sent' | 'delivered' | 'seen';
}

export interface UserStatus {
  id: string;
  creator_id: string;
  creator_name: string;
  creator_avatar: string;
  media_type: 'photo' | 'video' | 'music';
  media_url: string;
  text_content: string;
  timestamp: number;
}

export interface Room {
  name: string;
  creator_tag?: string;
  visibility?: 'public' | 'private' | 'invite_only';
  invite_code?: string;
  banned_words?: string;
  description?: string;
}

export interface RoomMember {
  room_tag: string;
  user_tag: string;
  role: 'admin' | 'co_admin' | 'moderator' | 'member';
  custom_title?: string;
}

export interface RoomInvitation {
  id: string;
  room_tag: string;
  sender_tag: string;
  receiver_tag: string;
  status: 'pending' | 'accepted' | 'declined';
}

export interface StatusPermission {
  viewer_tag: string;
  username: string;
  avatar: string;
  allowed: boolean;
}
