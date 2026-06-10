use std::sync::{Arc, Mutex};
use rusqlite::{params, Connection, Result, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub room_tag: String,
    pub sender_id: String,
    pub sender_name: String,
    pub msg_type: String, // "text" | "photo" | "audio" | "file"
    pub content: String,
    pub file_url: Option<String>,
    pub file_name: Option<String>,
    pub file_size: Option<i64>,
    pub timestamp: i64,
    pub status: String, // "sent" | "delivered" | "seen"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserStatus {
    pub id: String,
    pub creator_id: String,
    pub creator_name: String,
    pub creator_avatar: String,
    pub media_type: String, // "photo" | "video" | "music"
    pub media_url: String,
    pub text_content: String,
    pub timestamp: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbUser {
    pub tag: String,
    pub name: String,
    pub avatar: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DirectMessage {
    pub id: String,
    pub sender_tag: String,
    pub receiver_tag: String,
    pub msg_type: String, // "text" | "photo" | "audio" | "file"
    pub content: String,
    pub file_url: Option<String>,
    pub file_name: Option<String>,
    pub file_size: Option<i64>,
    pub timestamp: i64,
    pub status: String, // "sent" | "delivered" | "seen"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbRoom {
    pub name: String,
    pub creator_tag: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StatusPermissionItem {
    pub viewer_tag: String,
    pub username: String,
    pub avatar: String,
    pub allowed: bool,
}

#[derive(Clone)]
pub struct Db {
    conn: Arc<Mutex<Connection>>,
}

impl Db {
    pub fn init(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        
        // Enable WAL mode for concurrency
        conn.pragma_update(None, "journal_mode", &"WAL")?;
        conn.pragma_update(None, "foreign_keys", &"ON")?;

        // Create tables
        conn.execute(
            "CREATE TABLE IF NOT EXISTS users (
                tag TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                avatar TEXT NOT NULL,
                password_hash TEXT NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS rooms (
                name TEXT PRIMARY KEY,
                creator_tag TEXT
            )",
            [],
        )?;

        // Run migrations: alter rooms to add creator_tag column if it was created previously
        let _ = conn.execute("ALTER TABLE rooms ADD COLUMN creator_tag TEXT", []);

        conn.execute(
            "CREATE TABLE IF NOT EXISTS status_permissions (
                user_tag TEXT NOT NULL,
                viewer_tag TEXT NOT NULL,
                allowed INTEGER NOT NULL,
                PRIMARY KEY (user_tag, viewer_tag),
                FOREIGN KEY(user_tag) REFERENCES users(tag),
                FOREIGN KEY(viewer_tag) REFERENCES users(tag)
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                room_tag TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                sender_name TEXT NOT NULL,
                msg_type TEXT NOT NULL,
                content TEXT NOT NULL,
                file_url TEXT,
                file_name TEXT,
                file_size INTEGER,
                timestamp INTEGER NOT NULL,
                status TEXT NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS direct_messages (
                id TEXT PRIMARY KEY,
                sender_tag TEXT NOT NULL,
                receiver_tag TEXT NOT NULL,
                msg_type TEXT NOT NULL,
                content TEXT NOT NULL,
                file_url TEXT,
                file_name TEXT,
                file_size INTEGER,
                timestamp INTEGER NOT NULL,
                status TEXT NOT NULL,
                FOREIGN KEY(sender_tag) REFERENCES users(tag),
                FOREIGN KEY(receiver_tag) REFERENCES users(tag)
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS statuses (
                id TEXT PRIMARY KEY,
                creator_id TEXT NOT NULL,
                creator_name TEXT NOT NULL,
                creator_avatar TEXT NOT NULL,
                media_type TEXT NOT NULL,
                media_url TEXT NOT NULL,
                text_content TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            )",
            [],
        )?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn get_or_create_room(&self, name: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO rooms (name) VALUES (?1)",
            params![name],
        )?;
        Ok(())
    }

    pub fn get_rooms(&self) -> Result<Vec<DbRoom>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT name, creator_tag FROM rooms ORDER BY name ASC")?;
        let rows = stmt.query_map([], |row| {
            Ok(DbRoom {
                name: row.get(0)?,
                creator_tag: row.get(1)?,
            })
        })?;
        let mut rooms = Vec::new();
        for r in rows {
            rooms.push(r?);
        }
        Ok(rooms)
    }

    pub fn insert_message(&self, msg: &Message) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        
        // Ensure room exists
        conn.execute(
            "INSERT OR IGNORE INTO rooms (name) VALUES (?1)",
            params![msg.room_tag],
        )?;

        conn.execute(
            "INSERT OR REPLACE INTO messages (
                id, room_tag, sender_id, sender_name, msg_type, content, file_url, file_name, file_size, timestamp, status
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                msg.id,
                msg.room_tag,
                msg.sender_id,
                msg.sender_name,
                msg.msg_type,
                msg.content,
                msg.file_url,
                msg.file_name,
                msg.file_size,
                msg.timestamp,
                msg.status
            ],
        )?;
        Ok(())
    }

    pub fn get_messages(&self, room_tag: &str, limit: usize) -> Result<Vec<Message>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, room_tag, sender_id, sender_name, msg_type, content, file_url, file_name, file_size, timestamp, status 
             FROM messages 
             WHERE room_tag = ?1 
             ORDER BY timestamp ASC 
             LIMIT ?2"
        )?;
        
        let rows = stmt.query_map(params![room_tag, limit], |row| {
            Ok(Message {
                id: row.get(0)?,
                room_tag: row.get(1)?,
                sender_id: row.get(2)?,
                sender_name: row.get(3)?,
                msg_type: row.get(4)?,
                content: row.get(5)?,
                file_url: row.get(6)?,
                file_name: row.get(7)?,
                file_size: row.get(8)?,
                timestamp: row.get(9)?,
                status: row.get(10)?,
            })
        })?;

        let mut messages = Vec::new();
        for m in rows {
            messages.push(m?);
        }
        Ok(messages)
    }

    pub fn update_message_status(&self, message_id: &str, status: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        
        // Find current status first so we don't downgrade status (e.g. from 'seen' back to 'delivered')
        let mut stmt = conn.prepare("SELECT status FROM messages WHERE id = ?1")?;
        let current_status: Option<String> = stmt.query_row(params![message_id], |row| row.get(0)).ok();
        
        if let Some(curr) = current_status {
            // Downgrade protection: seen > delivered > sent
            let should_update = match (curr.as_str(), status) {
                ("seen", _) => false,
                ("delivered", "seen") => true,
                ("delivered", _) => false,
                ("sent", "delivered") => true,
                ("sent", "seen") => true,
                _ => false,
            };

            if should_update {
                conn.execute(
                    "UPDATE messages SET status = ?1 WHERE id = ?2",
                    params![status, message_id],
                )?;
                return Ok(true);
            }
        }
        Ok(false)
    }

    pub fn update_messages_status_in_room(
        &self,
        room_tag: &str,
        exclude_sender_id: &str,
        status: &str,
    ) -> Result<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        
        // Select message IDs to update
        let mut stmt = conn.prepare(
            "SELECT id, status FROM messages 
             WHERE room_tag = ?1 AND sender_id != ?2"
        )?;
        
        let mut ids_to_update = Vec::new();
        let rows = stmt.query_map(params![room_tag, exclude_sender_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        for r in rows {
            let (id, curr) = r?;
            let should_update = match (curr.as_str(), status) {
                ("seen", _) => false,
                ("delivered", "seen") => true,
                ("delivered", _) => false,
                ("sent", "delivered") => true,
                ("sent", "seen") => true,
                _ => false,
            };
            if should_update {
                ids_to_update.push(id);
            }
        }

        if !ids_to_update.is_empty() {
            // Update them
            for id in &ids_to_update {
                conn.execute(
                    "UPDATE messages SET status = ?1 WHERE id = ?2",
                    params![status, id],
                )?;
            }
        }

        Ok(ids_to_update)
    }

    pub fn insert_status(&self, status: &UserStatus) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO statuses (
                id, creator_id, creator_name, creator_avatar, media_type, media_url, text_content, timestamp
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                status.id,
                status.creator_id,
                status.creator_name,
                status.creator_avatar,
                status.media_type,
                status.media_url,
                status.text_content,
                status.timestamp
            ],
        )?;
        Ok(())
    }

    pub fn get_active_statuses(&self, viewer_tag: &str, expiration_ms: i64) -> Result<Vec<UserStatus>> {
        let conn = self.conn.lock().unwrap();
        let cutoff = chrono::Utc::now().timestamp_millis() - expiration_ms;
        
        let mut stmt = conn.prepare(
            "SELECT id, creator_id, creator_name, creator_avatar, media_type, media_url, text_content, timestamp 
             FROM statuses 
             WHERE timestamp > ?1 
               AND (creator_id = ?2 OR creator_id IN (
                   SELECT user_tag FROM status_permissions WHERE viewer_tag = ?2 AND allowed = 1
               ))
             ORDER BY timestamp ASC"
        )?;

        let rows = stmt.query_map(params![cutoff, viewer_tag], |row| {
            Ok(UserStatus {
                id: row.get(0)?,
                creator_id: row.get(1)?,
                creator_name: row.get(2)?,
                creator_avatar: row.get(3)?,
                media_type: row.get(4)?,
                media_url: row.get(5)?,
                text_content: row.get(6)?,
                timestamp: row.get(7)?,
            })
        })?;

        let mut statuses = Vec::new();
        for s in rows {
            statuses.push(s?);
        }
        Ok(statuses)
    }

    pub fn create_user(&self, tag: &str, name: &str, avatar: &str, password: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        // Check if user exists
        let mut stmt = conn.prepare("SELECT 1 FROM users WHERE tag = ?1")?;
        let exists = stmt.exists(params![tag])?;
        if exists {
            return Ok(false);
        }

        let password_hash = bcrypt::hash(password, bcrypt::DEFAULT_COST).map_err(|e| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(e))
        })?;

        conn.execute(
            "INSERT INTO users (tag, name, avatar, password_hash) VALUES (?1, ?2, ?3, ?4)",
            params![tag, name, avatar, password_hash],
        )?;
        Ok(true)
    }

    pub fn authenticate_user(&self, tag: &str, password: &str) -> Result<Option<DbUser>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT name, avatar, password_hash FROM users WHERE tag = ?1")?;
        
        let res = stmt.query_row(params![tag], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
        });

        match res {
            Ok((name, avatar, hash)) => {
                let matches = bcrypt::verify(password, &hash).map_err(|e| {
                    rusqlite::Error::ToSqlConversionFailure(Box::new(e))
                })?;

                if matches {
                    Ok(Some(DbUser {
                        tag: tag.to_string(),
                        name,
                        avatar,
                    }))
                } else {
                    Ok(None)
                }
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn get_all_users(&self) -> Result<Vec<DbUser>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT tag, name, avatar FROM users ORDER BY name ASC")?;
        let rows = stmt.query_map([], |row| {
            Ok(DbUser {
                tag: row.get(0)?,
                name: row.get(1)?,
                avatar: row.get(2)?,
            })
        })?;

        let mut users = Vec::new();
        for u in rows {
            users.push(u?);
        }
        Ok(users)
    }

    pub fn insert_direct_message(&self, msg: &DirectMessage) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO direct_messages (
                id, sender_tag, receiver_tag, msg_type, content, file_url, file_name, file_size, timestamp, status
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                msg.id,
                msg.sender_tag,
                msg.receiver_tag,
                msg.msg_type,
                msg.content,
                msg.file_url,
                msg.file_name,
                msg.file_size,
                msg.timestamp,
                msg.status
            ],
        )?;
        Ok(())
    }

    pub fn get_direct_messages(&self, user1: &str, user2: &str, limit: usize) -> Result<Vec<DirectMessage>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, sender_tag, receiver_tag, msg_type, content, file_url, file_name, file_size, timestamp, status 
             FROM direct_messages 
             WHERE (sender_tag = ?1 AND receiver_tag = ?2) OR (sender_tag = ?2 AND receiver_tag = ?1) 
             ORDER BY timestamp ASC 
             LIMIT ?3"
        )?;

        let rows = stmt.query_map(params![user1, user2, limit], |row| {
            Ok(DirectMessage {
                id: row.get(0)?,
                sender_tag: row.get(1)?,
                receiver_tag: row.get(2)?,
                msg_type: row.get(3)?,
                content: row.get(4)?,
                file_url: row.get(5)?,
                file_name: row.get(6)?,
                file_size: row.get(7)?,
                timestamp: row.get(8)?,
                status: row.get(9)?,
            })
        })?;

        let mut messages = Vec::new();
        for m in rows {
            messages.push(m?);
        }
        Ok(messages)
    }

    pub fn update_direct_message_status(&self, message_id: &str, status: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT status FROM direct_messages WHERE id = ?1")?;
        let current_status: Option<String> = stmt.query_row(params![message_id], |row| row.get(0)).ok();

        if let Some(curr) = current_status {
            let should_update = match (curr.as_str(), status) {
                ("seen", _) => false,
                ("delivered", "seen") => true,
                ("delivered", _) => false,
                ("sent", "delivered") => true,
                ("sent", "seen") => true,
                _ => false,
            };

            if should_update {
                conn.execute(
                    "UPDATE direct_messages SET status = ?1 WHERE id = ?2",
                    params![status, message_id],
                )?;
                return Ok(true);
            }
        }
        Ok(false)
    }

    pub fn update_direct_messages_seen(&self, sender: &str, receiver: &str) -> Result<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, status FROM direct_messages 
             WHERE sender_tag = ?1 AND receiver_tag = ?2 AND status != 'seen'"
        )?;

        let mut ids_to_update = Vec::new();
        let rows = stmt.query_map(params![sender, receiver], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        for r in rows {
            let (id, _) = r?;
            ids_to_update.push(id);
        }

        if !ids_to_update.is_empty() {
            for id in &ids_to_update {
                conn.execute(
                    "UPDATE direct_messages SET status = 'seen' WHERE id = ?1",
                    params![id],
                )?;
            }
        }

        Ok(ids_to_update)
    }

    // --- GROUP & ROOM MANAGEMENT METHODS ---

    pub fn create_room(&self, name: &str, creator_tag: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT 1 FROM rooms WHERE name = ?1")?;
        let exists = stmt.exists(params![name])?;
        if exists {
            return Ok(false);
        }
        conn.execute(
            "INSERT INTO rooms (name, creator_tag) VALUES (?1, ?2)",
            params![name, creator_tag],
        )?;
        Ok(true)
    }

    pub fn update_room(&self, old_name: &str, new_name: &str, user_tag: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        // Check authorization
        let mut stmt = conn.prepare("SELECT creator_tag FROM rooms WHERE name = ?1")?;
        let creator: Option<String> = stmt.query_row(params![old_name], |row| row.get(0)).optional()?.flatten();

        if let Some(ref c) = creator {
            if c != user_tag {
                return Ok(false); // Unauthorized
            }
        }

        // Perform rename
        conn.execute(
            "UPDATE rooms SET name = ?1, creator_tag = ?2 WHERE name = ?3",
            params![new_name, user_tag, old_name],
        )?;
        conn.execute(
            "UPDATE messages SET room_tag = ?1 WHERE room_tag = ?2",
            params![new_name, old_name],
        )?;
        Ok(true)
    }

    pub fn delete_room(&self, name: &str, user_tag: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        // Check authorization
        let mut stmt = conn.prepare("SELECT creator_tag FROM rooms WHERE name = ?1")?;
        let creator: Option<String> = stmt.query_row(params![name], |row| row.get(0)).optional()?.flatten();

        if let Some(ref c) = creator {
            if c != user_tag {
                return Ok(false); // Unauthorized
            }
        }

        conn.execute("DELETE FROM rooms WHERE name = ?1", params![name])?;
        conn.execute("DELETE FROM messages WHERE room_tag = ?1", params![name])?;
        Ok(true)
    }

    // --- STATUS PRIVACY & PERMISSIONS METHODS ---

    pub fn delete_status(&self, status_id: &str, creator_tag: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let rows = conn.execute(
            "DELETE FROM statuses WHERE id = ?1 AND creator_id = ?2",
            params![status_id, creator_tag],
        )?;
        Ok(rows > 0)
    }

    pub fn set_status_permission(&self, user_tag: &str, viewer_tag: &str, allowed: bool) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let allowed_int = if allowed { 1 } else { 0 };
        conn.execute(
            "INSERT OR REPLACE INTO status_permissions (user_tag, viewer_tag, allowed) VALUES (?1, ?2, ?3)",
            params![user_tag, viewer_tag, allowed_int],
        )?;
        Ok(())
    }

    pub fn get_status_permission(&self, user_tag: &str, viewer_tag: &str) -> Result<Option<bool>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT allowed FROM status_permissions WHERE user_tag = ?1 AND viewer_tag = ?2")?;
        let res: Option<i32> = stmt.query_row(params![user_tag, viewer_tag], |row| row.get(0)).optional()?;
        Ok(res.map(|val| val == 1))
    }

    pub fn get_status_permissions_list(&self, user_tag: &str) -> Result<Vec<StatusPermissionItem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT p.viewer_tag, u.name, u.avatar, p.allowed
             FROM status_permissions p
             JOIN users u ON p.viewer_tag = u.tag
             WHERE p.user_tag = ?1"
        )?;
        let rows = stmt.query_map(params![user_tag], |row| {
            let allowed_int: i32 = row.get(3)?;
            Ok(StatusPermissionItem {
                viewer_tag: row.get(0)?,
                username: row.get(1)?,
                avatar: row.get(2)?,
                allowed: allowed_int == 1,
            })
        })?;
        let mut items = Vec::new();
        for r in rows {
            items.push(r?);
        }
        Ok(items)
    }

    pub fn get_chatted_user_tags(&self, user_tag: &str) -> Result<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT DISTINCT sender_tag FROM direct_messages WHERE receiver_tag = ?1
             UNION
             SELECT DISTINCT receiver_tag FROM direct_messages WHERE sender_tag = ?1"
        )?;
        let rows = stmt.query_map(params![user_tag], |row| row.get(0))?;
        let mut tags = Vec::new();
        for tag in rows {
            if let Ok(t) = tag {
                tags.push(t);
            }
        }
        Ok(tags)
    }
}
