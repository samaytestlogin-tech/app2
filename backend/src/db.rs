use serde::{Deserialize, Serialize};
use serde_json::json;
use reqwest::Client;
use bcrypt;

// Re-export rusqlite types for main.rs compatibility
pub type Result<T> = std::result::Result<T, rusqlite::Error>;

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
    pub pinned: Option<bool>,
    pub pinned_by: Option<String>,
    pub pinned_at: Option<i64>,
    pub is_deleted: Option<bool>,
    pub deleted_for_me: Option<String>,
    pub deleted_by: Option<String>,
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
    pub bio: Option<String>,
    pub settings: Option<String>,
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
    pub is_deleted: Option<bool>,
    pub deleted_for_me: Option<String>,
    pub deleted_by: Option<String>,
    pub pinned: Option<bool>,
    pub pinned_by: Option<String>,
    pub pinned_at: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbRoom {
    pub name: String,
    pub creator_tag: Option<String>,
    pub visibility: Option<String>,
    pub invite_code: Option<String>,
    pub banned_words: Option<String>,
    pub description: Option<String>,
    pub is_member: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbRoomMember {
    pub room_tag: String,
    pub user_tag: String,
    pub role: String, // "admin" | "co_admin" | "moderator" | "member"
    pub custom_title: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbRoomInvitation {
    pub id: String,
    pub room_tag: String,
    pub sender_tag: String,
    pub receiver_tag: String,
    pub status: String, // "pending" | "accepted" | "declined"
}


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StatusPermissionItem {
    pub viewer_tag: String,
    pub username: String,
    pub avatar: String,
    pub allowed: bool,
}

#[derive(Debug)]
struct AppwriteError(String);

impl std::fmt::Display for AppwriteError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Appwrite error: {}", self.0)
    }
}

impl std::error::Error for AppwriteError {}

fn map_err<E: std::error::Error + Send + Sync + 'static>(e: E) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(e))
}

fn block_on<F: std::future::Future>(future: F) -> F::Output {
    tokio::task::block_in_place(|| {
        tokio::runtime::Handle::current().block_on(future)
    })
}

fn run_appwrite<T, F>(future: F) -> Result<T>
where
    F: std::future::Future<Output = Result<T>>,
{
    block_on(future)
}

use std::sync::{Arc, RwLock};
use std::time::{Instant, Duration};
use std::collections::HashMap;

#[derive(Clone)]
struct CacheEntry<T> {
    data: T,
    expires_at: Instant,
}

impl<T> CacheEntry<T> {
    fn new(data: T, ttl: Duration) -> Self {
        Self {
            data,
            expires_at: Instant::now() + ttl,
        }
    }

    fn is_expired(&self) -> bool {
        Instant::now() > self.expires_at
    }
}

#[derive(Clone)]
pub struct Db {
    client: Client,
    endpoint: String,
    project_id: String,
    api_key: String,
    database_id: String,
    bucket_id: String,
    
    users_cache: Arc<RwLock<Option<CacheEntry<Vec<DbUser>>>>>,
    rooms_cache: Arc<RwLock<Option<CacheEntry<Vec<DbRoom>>>>>,
    chatted_users_cache: Arc<RwLock<HashMap<String, CacheEntry<Vec<String>>>>>,
    room_last_messages_cache: Arc<RwLock<HashMap<String, i64>>>,
}

impl Db {
    pub fn init(_path: &str) -> Result<Self> {
        let endpoint = std::env::var("APPWRITE_ENDPOINT")
            .unwrap_or_else(|_| "https://fra.cloud.appwrite.io/v1".to_string());
        let project_id = std::env::var("APPWRITE_PROJECT_ID")
            .unwrap_or_else(|_| "69fc8f7800089ff12a9e".to_string());
        let api_key = std::env::var("APPWRITE_API_KEY")
            .unwrap_or_default();
        let database_id = std::env::var("APPWRITE_DATABASE_ID")
            .unwrap_or_else(|_| "erps".to_string());
        let bucket_id = std::env::var("APPWRITE_BUCKET_ID")
            .unwrap_or_else(|_| "default".to_string());

        let client = Client::builder()
            .build()
            .map_err(map_err)?;

        let db = Self {
            client,
            endpoint,
            project_id,
            api_key,
            database_id,
            bucket_id,
            users_cache: Arc::new(RwLock::new(None)),
            rooms_cache: Arc::new(RwLock::new(None)),
            chatted_users_cache: Arc::new(RwLock::new(HashMap::new())),
            room_last_messages_cache: Arc::new(RwLock::new(HashMap::new())),
        };

        // Spawn a background initializer to setup database and collections if API key exists
        if !db.api_key.is_empty() {
            let db_clone = db.clone();
            tokio::spawn(async move {
                if let Err(e) = db_clone.ensure_collections_setup().await {
                    println!("Appwrite database auto-initialization warning: {:?}", e);
                } else {
                    println!("Appwrite database structures validated successfully.");
                }
            });
        } else {
            println!("Warning: APPWRITE_API_KEY environment variable is not set. Skipping DB auto-initialization.");
        }

        Ok(db)
    }

    async fn ensure_collections_setup(&self) -> std::result::Result<(), reqwest::Error> {
        // 1. Create database
        let create_db_url = format!("{}/databases", self.endpoint);
        let res_db = self.client.post(&create_db_url)
            .header("X-Appwrite-Project", &self.project_id)
            .header("X-Appwrite-Key", &self.api_key)
            .json(&json!({
                "databaseId": self.database_id,
                "name": "erps"
            }))
            .send()
            .await;
        match res_db {
            Ok(res) => {
                let status = res.status();
                let text = res.text().await.unwrap_or_default();
                if status.is_success() {
                    println!("Database created successfully: {}", text);
                } else if status == 409 {
                    println!("Database already exists.");
                } else {
                    println!("Failed to create database: status {}, body {}", status, text);
                    if let Ok(dbs) = self.list_databases().await {
                        println!("Available databases in your project: {:?}", dbs);
                    }
                }
            }
            Err(e) => println!("Error sending database creation request: {:?}", e),
        }

        // 2. Create storage bucket
        let create_bucket_url = format!("{}/storage/buckets", self.endpoint);
        let res_bucket = self.client.post(&create_bucket_url)
            .header("X-Appwrite-Project", &self.project_id)
            .header("X-Appwrite-Key", &self.api_key)
            .json(&json!({
                "bucketId": self.bucket_id,
                "name": "erps_files",
                "permissions": ["read(\"any\")", "create(\"any\")", "update(\"any\")", "delete(\"any\")"]
            }))
            .send()
            .await;
        match res_bucket {
            Ok(res) => {
                let status = res.status();
                let text = res.text().await.unwrap_or_default();
                if status.is_success() {
                    println!("Bucket created successfully: {}", text);
                } else if status == 409 {
                    println!("Bucket already exists.");
                } else {
                    println!("Failed to create bucket: status {}, body {}", status, text);
                    if let Ok(buckets) = self.list_buckets().await {
                        println!("Available storage buckets in your project: {:?}", buckets);
                    }
                }
            }
            Err(e) => println!("Error sending bucket creation request: {:?}", e),
        }

        // Collections mapping
        let collections = vec![
            ("users", "users", vec![
                ("tag", "string", 255),
                ("name", "string", 255),
                ("avatar", "string", 255),
                ("password_hash", "string", 255),
                ("bio", "string", 1000),
                ("settings", "string", 10000),
            ]),
            ("rooms", "rooms", vec![
                ("name", "string", 255),
                ("creator_tag", "string", 255),
                ("visibility", "string", 50),
                ("invite_code", "string", 50),
                ("banned_words", "string", 1000),
                ("description", "string", 1000),
            ]),
            ("room_members", "room_members", vec![
                ("room_tag", "string", 255),
                ("user_tag", "string", 255),
                ("role", "string", 50),
                ("custom_title", "string", 255),
            ]),
            ("room_invitations", "room_invitations", vec![
                ("id", "string", 255),
                ("room_tag", "string", 255),
                ("sender_tag", "string", 255),
                ("receiver_tag", "string", 255),
                ("status", "string", 50),
            ]),
            ("messages", "messages", vec![
                ("id", "string", 255),
                ("room_tag", "string", 255),
                ("sender_id", "string", 255),
                ("sender_name", "string", 255),
                ("msg_type", "string", 50),
                ("content", "string", 1000),
                ("file_url", "string", 1000),
                ("file_name", "string", 255),
                ("file_size", "integer", 0),
                ("timestamp", "integer", 0),
                ("status", "string", 50),
                ("pinned", "boolean", 0),
                ("pinned_by", "string", 255),
                ("pinned_at", "integer", 0),
                ("is_deleted", "boolean", 0),
                ("deleted_for_me", "string", 1000),
                ("deleted_by", "string", 50),
            ]),
            ("direct_messages", "direct_messages", vec![
                ("id", "string", 255),
                ("sender_tag", "string", 255),
                ("receiver_tag", "string", 255),
                ("msg_type", "string", 50),
                ("content", "string", 1000),
                ("file_url", "string", 1000),
                ("file_name", "string", 255),
                ("file_size", "integer", 0),
                ("timestamp", "integer", 0),
                ("status", "string", 50),
                ("is_deleted", "boolean", 0),
                ("deleted_for_me", "string", 1000),
                ("deleted_by", "string", 50),
                ("pinned", "boolean", 0),
                ("pinned_by", "string", 50),
                ("pinned_at", "integer", 0),
            ]),
            ("statuses", "statuses", vec![
                ("id", "string", 255),
                ("creator_id", "string", 255),
                ("creator_name", "string", 255),
                ("creator_avatar", "string", 255),
                ("media_type", "string", 50),
                ("media_url", "string", 1000),
                ("text_content", "string", 1000),
                ("timestamp", "integer", 0),
            ]),
            ("status_permissions", "status_permissions", vec![
                ("user_tag", "string", 255),
                ("viewer_tag", "string", 255),
                ("allowed", "boolean", 0),
            ]),
        ];


        for (col_id, col_name, attributes) in collections {
            // Create collection
            let create_col_url = format!("{}/databases/{}/collections", self.endpoint, self.database_id);
            let res_col = self.client.post(&create_col_url)
                .header("X-Appwrite-Project", &self.project_id)
                .header("X-Appwrite-Key", &self.api_key)
                .json(&json!({
                    "collectionId": col_id,
                    "name": col_name,
                    "permissions": ["read(\"any\")", "create(\"any\")", "update(\"any\")", "delete(\"any\")"]
                }))
                .send()
                .await;
            match res_col {
                Ok(res) => {
                    let status = res.status();
                    if !status.is_success() && status != 409 {
                        println!("Failed to create collection {}: status {}, body {}", col_id, status, res.text().await.unwrap_or_default());
                    }
                }
                Err(e) => println!("Error creating collection {}: {:?}", col_id, e),
            }

            // Create attributes
            for &(attr_key, attr_type, attr_size) in &attributes {
                let attr_url = format!("{}/databases/{}/collections/{}/attributes/{}", self.endpoint, self.database_id, col_id, attr_type);
                let mut attr_body = json!({
                    "key": attr_key,
                    "required": false
                });

                if attr_type == "string" {
                    attr_body["size"] = json!(attr_size);
                }

                let res_attr = self.client.post(&attr_url)
                    .header("X-Appwrite-Project", &self.project_id)
                    .header("X-Appwrite-Key", &self.api_key)
                    .json(&attr_body)
                    .send()
                    .await;
                match res_attr {
                    Ok(res) => {
                        let status = res.status();
                        if !status.is_success() && status != 409 {
                            println!("Failed to create attribute {} in {}: status {}, body {}", attr_key, col_id, status, res.text().await.unwrap_or_default());
                        }
                    }
                    Err(e) => println!("Error creating attribute {} in {}: {:?}", attr_key, col_id, e),
                }
            }
        }

        // 4. Create Indexes
        println!("Provisioning database indexes...");
        
        // Collection: messages
        let _ = self.create_index(
            "messages",
            "room_tag_timestamp_idx",
            "key",
            vec!["room_tag", "timestamp"],
            Some(vec!["ASC", "DESC"])
        ).await;

        let _ = self.create_index(
            "messages",
            "room_tag_pinned_idx",
            "key",
            vec!["room_tag", "pinned"],
            None
        ).await;

        // Collection: direct_messages
        let _ = self.create_index(
            "direct_messages",
            "sender_receiver_timestamp_idx",
            "key",
            vec!["sender_tag", "receiver_tag", "timestamp"],
            Some(vec!["ASC", "ASC", "DESC"])
        ).await;

        let _ = self.create_index(
            "direct_messages",
            "receiver_sender_timestamp_idx",
            "key",
            vec!["receiver_tag", "sender_tag", "timestamp"],
            Some(vec!["ASC", "ASC", "DESC"])
        ).await;

        let _ = self.create_index(
            "direct_messages",
            "sender_tag_idx",
            "key",
            vec!["sender_tag"],
            None
        ).await;

        let _ = self.create_index(
            "direct_messages",
            "receiver_tag_idx",
            "key",
            vec!["receiver_tag"],
            None
        ).await;

        // Collection: status_permissions
        let _ = self.create_index(
            "status_permissions",
            "viewer_allowed_idx",
            "key",
            vec!["viewer_tag", "allowed"],
            None
        ).await;

        let _ = self.create_index(
            "status_permissions",
            "user_tag_idx",
            "key",
            vec!["user_tag"],
            None
        ).await;

        // Collection: room_members
        let _ = self.create_index(
            "room_members",
            "room_tag_user_tag_idx",
            "key",
            vec!["room_tag", "user_tag"],
            Some(vec!["ASC", "ASC"])
        ).await;

        // Collection: room_invitations
        let _ = self.create_index(
            "room_invitations",
            "receiver_tag_status_idx",
            "key",
            vec!["receiver_tag", "status"],
            Some(vec!["ASC", "ASC"])
        ).await;

        Ok(())
    }


    async fn create_index(&self, collection: &str, key: &str, index_type: &str, attributes: Vec<&str>, orders: Option<Vec<&str>>) -> Result<()> {
        let url = format!("{}/databases/{}/collections/{}/indexes", self.endpoint, self.database_id, collection);
        let mut body = json!({
            "key": key,
            "type": index_type,
            "attributes": attributes,
        });
        if let Some(ord) = orders {
            body["orders"] = json!(ord);
        }

        // Retry up to 5 times if attribute is still processing
        for attempt in 1..=5 {
            let res = self.client.post(&url)
                .header("X-Appwrite-Project", &self.project_id)
                .header("X-Appwrite-Key", &self.api_key)
                .json(&body)
                .send()
                .await
                .map_err(map_err)?;
            let status = res.status();
            if status.is_success() || status == 409 {
                if status.is_success() {
                    println!("Index {} created successfully in collection {}.", key, collection);
                } else {
                    println!("Index {} already exists in collection {}.", key, collection);
                }
                return Ok(());
            }

            let body_text = res.text().await.unwrap_or_default();
            println!("Attempt {} to create index {} in {} failed: status {}, body {}", attempt, key, collection, status, body_text);
            if attempt < 5 {
                tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
            }
        }
        Ok(())
    }

    pub async fn list_databases(&self) -> Result<serde_json::Value> {
        let url = format!("{}/databases", self.endpoint);
        let res = self.client.get(&url)
            .header("X-Appwrite-Project", &self.project_id)
            .header("X-Appwrite-Key", &self.api_key)
            .send()
            .await
            .map_err(map_err)?;
        let status = res.status();
        if !status.is_success() {
            let body = res.text().await.unwrap_or_default();
            println!("Error list_databases: status {}, body {}", status, body);
            return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(AppwriteError(format!("list_databases failed: {}", body)))));
        }
        let val = res.json::<serde_json::Value>().await.map_err(map_err)?;
        Ok(val)
    }

    pub async fn list_buckets(&self) -> Result<serde_json::Value> {
        let url = format!("{}/storage/buckets", self.endpoint);
        let res = self.client.get(&url)
            .header("X-Appwrite-Project", &self.project_id)
            .header("X-Appwrite-Key", &self.api_key)
            .send()
            .await
            .map_err(map_err)?;
        let status = res.status();
        if !status.is_success() {
            let body = res.text().await.unwrap_or_default();
            println!("Error list_buckets: status {}, body {}", status, body);
            return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(AppwriteError(format!("list_buckets failed: {}", body)))));
        }
        let val = res.json::<serde_json::Value>().await.map_err(map_err)?;
        Ok(val)
    }

    async fn get_document(&self, collection: &str, doc_id: &str) -> Result<Option<serde_json::Value>> {
        let url = format!("{}/databases/{}/collections/{}/documents/{}", self.endpoint, self.database_id, collection, doc_id);
        let res = self.client.get(&url)
            .header("X-Appwrite-Project", &self.project_id)
            .header("X-Appwrite-Key", &self.api_key)
            .send()
            .await
            .map_err(map_err)?;

        let status = res.status();
        if status == 404 {
            Ok(None)
        } else if !status.is_success() {
            let body = res.text().await.unwrap_or_default();
            println!("Error in get_document for collection {} doc {}: status {}, body: {}", collection, doc_id, status, body);
            Err(rusqlite::Error::ToSqlConversionFailure(Box::new(AppwriteError(format!("get_document failed: {}", body)))))
        } else {
            let val = res.json().await.map_err(map_err)?;
            Ok(Some(val))
        }
    }

    async fn list_documents(&self, collection: &str, queries: &[String]) -> Result<Vec<serde_json::Value>> {
        let url = format!("{}/databases/{}/collections/{}/documents", self.endpoint, self.database_id, collection);
        let mut req = self.client.get(&url)
            .header("X-Appwrite-Project", &self.project_id)
            .header("X-Appwrite-Key", &self.api_key);

        for q in queries {
            req = req.query(&[("queries[]", q)]);
        }

        let res = req.send().await.map_err(map_err)?;
        let status = res.status();
        if !status.is_success() {
            let body = res.text().await.unwrap_or_default();
            println!("Error listing documents in collection {}: status {}, body: {}", collection, status, body);
            return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(AppwriteError(format!("list_documents failed: {}", body)))));
        }

        let val: serde_json::Value = res.json().await.map_err(map_err)?;
        if let Some(arr) = val["documents"].as_array() {
            Ok(arr.clone())
        } else {
            Ok(vec![])
        }
    }

    async fn create_document(&self, collection: &str, doc_id: &str, data: serde_json::Value) -> Result<()> {
        let url = format!("{}/databases/{}/collections/{}/documents", self.endpoint, self.database_id, collection);
        let res = self.client.post(&url)
            .header("X-Appwrite-Project", &self.project_id)
            .header("X-Appwrite-Key", &self.api_key)
            .json(&json!({
                "documentId": doc_id,
                "data": data
            }))
            .send()
            .await
            .map_err(map_err)?;
        let status = res.status();
        if !status.is_success() {
            let body = res.text().await.unwrap_or_default();
            println!("Error creating document in collection {} doc {}: status {}, body: {}", collection, doc_id, status, body);
            return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(AppwriteError(format!("create_document failed: {}", body)))));
        }
        Ok(())
    }

    async fn update_document(&self, collection: &str, doc_id: &str, data: serde_json::Value) -> Result<()> {
        let url = format!("{}/databases/{}/collections/{}/documents/{}", self.endpoint, self.database_id, collection, doc_id);
        let res = self.client.patch(&url)
            .header("X-Appwrite-Project", &self.project_id)
            .header("X-Appwrite-Key", &self.api_key)
            .json(&json!({
                "data": data
            }))
            .send()
            .await
            .map_err(map_err)?;
        let status = res.status();
        if !status.is_success() {
            let body = res.text().await.unwrap_or_default();
            println!("Error updating document in collection {} doc {}: status {}, body: {}", collection, doc_id, status, body);
            return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(AppwriteError(format!("update_document failed: {}", body)))));
        }
        Ok(())
    }

    async fn delete_document(&self, collection: &str, doc_id: &str) -> Result<()> {
        let url = format!("{}/databases/{}/collections/{}/documents/{}", self.endpoint, self.database_id, collection, doc_id);
        let res = self.client.delete(&url)
            .header("X-Appwrite-Project", &self.project_id)
            .header("X-Appwrite-Key", &self.api_key)
            .send()
            .await
            .map_err(map_err)?;
        let status = res.status();
        if !status.is_success() {
            let body = res.text().await.unwrap_or_default();
            println!("Error deleting document in collection {} doc {}: status {}, body: {}", collection, doc_id, status, body);
            return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(AppwriteError(format!("delete_document failed: {}", body)))));
        }
        Ok(())
    }

    pub fn get_or_create_room(&self, name: &str) -> Result<()> {
        run_appwrite(async {
            match self.get_document("rooms", name).await.map_err(map_err)? {
                Some(_) => Ok(()),
                None => {
                    let invite_code = uuid::Uuid::new_v4().to_string();
                    self.create_document("rooms", name, json!({
                        "name": name,
                        "creator_tag": null,
                        "visibility": "public",
                        "invite_code": invite_code,
                        "banned_words": "",
                        "description": ""
                    })).await.map_err(map_err)?;
                    Ok(())
                }
            }
        })
    }

    pub fn get_rooms(&self) -> Result<Vec<DbRoom>> {
        {
            if let Some(entry) = self.rooms_cache.read().unwrap().as_ref() {
                if !entry.is_expired() {
                    return Ok(entry.data.clone());
                }
            }
        }

        let rooms = run_appwrite(async {
            let queries = vec![
                json!({ "method": "limit", "values": [1000] }).to_string(),
            ];
            let docs = self.list_documents("rooms", &queries).await.map_err(map_err)?;
            let mut rooms = Vec::new();
            for d in docs {
                let name = d["name"].as_str().unwrap_or("").to_string();
                let creator_tag = d["creator_tag"].as_str().map(|s| s.to_string());
                let visibility = d["visibility"].as_str().map(|s| s.to_string());
                let mut invite_code = d["invite_code"].as_str().map(|s| s.to_string());
                let banned_words = d["banned_words"].as_str().map(|s| s.to_string());
                let description = d["description"].as_str().map(|s| s.to_string());

                if invite_code.is_none() || invite_code.as_deref() == Some("") || invite_code.as_deref() == Some("N/A") {
                    let new_code = uuid::Uuid::new_v4().to_string();
                    let _ = self.update_document("rooms", &name, json!({ "invite_code": new_code })).await;
                    invite_code = Some(new_code);
                }

                rooms.push(DbRoom {
                    name,
                    creator_tag,
                    visibility,
                    invite_code,
                    banned_words,
                    description,
                    is_member: None,
                });
            }
            rooms.sort_by(|a, b| a.name.cmp(&b.name));
            Ok(rooms)
        })?;

        {
            let mut cache = self.rooms_cache.write().unwrap();
            *cache = Some(CacheEntry::new(rooms.clone(), Duration::from_secs(60)));
        }

        Ok(rooms)
    }

    pub fn get_rooms_for_user(&self, user_tag: Option<&str>) -> Result<Vec<DbRoom>> {
        let all_rooms = self.get_rooms()?;
        let Some(user_tag) = user_tag else {
            return Ok(all_rooms.into_iter().map(|mut r| {
                r.is_member = Some(false);
                r
            }).filter(|r| r.visibility.as_deref() == Some("public")).collect());
        };

        if user_tag.is_empty() {
            return Ok(all_rooms.into_iter().map(|mut r| {
                r.is_member = Some(false);
                r
            }).filter(|r| r.visibility.as_deref() == Some("public")).collect());
        }

        let member_room_tags = run_appwrite(async {
            let q = vec![
                json!({ "method": "equal", "attribute": "user_tag", "values": [user_tag] }).to_string(),
                json!({ "method": "limit", "values": [1000] }).to_string(),
            ];
            let docs = self.list_documents("room_members", &q).await.map_err(map_err)?;
            let mut tags = std::collections::HashSet::new();
            for d in docs {
                if let Some(tag) = d["room_tag"].as_str() {
                    tags.insert(tag.to_string());
                }
            }
            Ok(tags)
        })?;

        let filtered = all_rooms
            .into_iter()
            .map(|mut r| {
                let is_mem = r.creator_tag.as_deref() == Some(user_tag) || member_room_tags.contains(&r.name);
                r.is_member = Some(is_mem);
                r
            })
            .filter(|r| {
                r.visibility.as_deref() == Some("public")
                    || r.is_member == Some(true)
            })
            .collect();

        Ok(filtered)
    }



    pub fn insert_message(&self, msg: &Message) -> Result<Message> {
        let mut clean_msg = msg.clone();
        
        {
            let mut cache = self.room_last_messages_cache.write().unwrap();
            cache.insert(msg.room_tag.clone(), msg.timestamp);
        }
        
        run_appwrite(async {
            self.get_or_create_room(&msg.room_tag)?;
            
            // Check banned words
            if clean_msg.msg_type == "text" {
                if let Some(room_doc) = self.get_document("rooms", &msg.room_tag).await.map_err(map_err)? {
                    if let Some(banned_str) = room_doc["banned_words"].as_str() {
                        let words: Vec<&str> = banned_str.split(',')
                            .map(|w| w.trim())
                            .filter(|w| !w.is_empty())
                            .collect();
                            
                        if !words.is_empty() {
                            let mut content = clean_msg.content.clone();
                            for word in words {
                                let word_lower = word.to_lowercase();
                                let mut i = 0;
                                while i < content.len() {
                                    if content[i..].to_lowercase().starts_with(&word_lower) {
                                        let len = word.len();
                                        content.replace_range(i..i+len, &"*".repeat(len));
                                        i += len;
                                    } else {
                                        i += 1;
                                    }
                                }
                            }
                            clean_msg.content = content;
                        }
                    }
                }
            }

            self.create_document("messages", &clean_msg.id, json!({
                "id": clean_msg.id,
                "room_tag": clean_msg.room_tag,
                "sender_id": clean_msg.sender_id,
                "sender_name": clean_msg.sender_name,
                "msg_type": clean_msg.msg_type,
                "content": clean_msg.content,
                "file_url": clean_msg.file_url,
                "file_name": clean_msg.file_name,
                "file_size": clean_msg.file_size,
                "timestamp": clean_msg.timestamp,
                "status": clean_msg.status,
                "pinned": clean_msg.pinned.unwrap_or(false),
                "pinned_by": clean_msg.pinned_by.as_deref().unwrap_or(""),
                "pinned_at": clean_msg.pinned_at.unwrap_or(0),
            })).await.map_err(map_err)?;
            Ok(())
        })?;
        
        Ok(clean_msg)
    }

    pub fn get_messages(&self, room_tag: &str, limit: usize) -> Result<Vec<Message>> {
        run_appwrite(async {
            let queries = vec![
                json!({ "method": "equal", "attribute": "room_tag", "values": [room_tag] }).to_string(),
                json!({ "method": "orderDesc", "attribute": "timestamp" }).to_string(),
                json!({ "method": "limit", "values": [limit] }).to_string(),
            ];
            let docs = self.list_documents("messages", &queries).await.map_err(map_err)?;
            let mut messages = Vec::new();
            for d in docs {
                messages.push(Message {
                    id: d["id"].as_str().unwrap_or("").to_string(),
                    room_tag: d["room_tag"].as_str().unwrap_or("").to_string(),
                    sender_id: d["sender_id"].as_str().unwrap_or("").to_string(),
                    sender_name: d["sender_name"].as_str().unwrap_or("").to_string(),
                    msg_type: d["msg_type"].as_str().unwrap_or("").to_string(),
                    content: d["content"].as_str().unwrap_or("").to_string(),
                    file_url: d["file_url"].as_str().map(|s| s.to_string()),
                    file_name: d["file_name"].as_str().map(|s| s.to_string()),
                    file_size: d["file_size"].as_i64(),
                    timestamp: d["timestamp"].as_i64().unwrap_or(0),
                    status: d["status"].as_str().unwrap_or("").to_string(),
                    pinned: d["pinned"].as_bool(),
                    pinned_by: d["pinned_by"].as_str().map(|s| s.to_string()),
                    pinned_at: d["pinned_at"].as_i64(),
                is_deleted: d["is_deleted"].as_bool(),
                deleted_for_me: d["deleted_for_me"].as_str().map(|s| s.to_string()),
            deleted_by: d["deleted_by"].as_str().map(|s| s.to_string()),
                });
            }
            messages.reverse();
            Ok(messages)
        })
    }

    pub fn get_messages_for_user(&self, room_tag: &str, limit: usize, user_tag: &str) -> Result<Vec<Message>> {
        let is_mem = self.is_room_member(room_tag, user_tag)?;
        let has_inv = self.has_pending_invitation(room_tag, user_tag)?;
        
        let mut is_private = false;
        run_appwrite(async {
            if let Some(room) = self.get_document("rooms", room_tag).await.map_err(map_err)? {
                let vis = room["visibility"].as_str().unwrap_or("public");
                if vis == "private" || vis == "invite_only" {
                    is_private = true;
                }
            }
            Ok(())
        })?;

        if is_private && !is_mem && !has_inv {
            return Ok(Vec::new());
        }

        let limit_to_24h = !is_mem && has_inv;
        let min_timestamp = if limit_to_24h {
            chrono::Utc::now().timestamp_millis() - 24 * 60 * 60 * 1000
        } else {
            0
        };

        run_appwrite(async {
            let mut queries = vec![
                json!({ "method": "equal", "attribute": "room_tag", "values": [room_tag] }).to_string(),
                json!({ "method": "orderDesc", "attribute": "timestamp" }).to_string(),
            ];
            
            if limit_to_24h {
                queries.push(json!({ "method": "greaterThan", "attribute": "timestamp", "values": [min_timestamp] }).to_string());
            }
            
            queries.push(json!({ "method": "limit", "values": [limit] }).to_string());
            
            let docs = self.list_documents("messages", &queries).await.map_err(map_err)?;
            let mut messages = Vec::new();
            for d in docs {
                messages.push(Message {
                    id: d["id"].as_str().unwrap_or("").to_string(),
                    room_tag: d["room_tag"].as_str().unwrap_or("").to_string(),
                    sender_id: d["sender_id"].as_str().unwrap_or("").to_string(),
                    sender_name: d["sender_name"].as_str().unwrap_or("").to_string(),
                    msg_type: d["msg_type"].as_str().unwrap_or("").to_string(),
                    content: d["content"].as_str().unwrap_or("").to_string(),
                    file_url: d["file_url"].as_str().map(|s| s.to_string()),
                    file_name: d["file_name"].as_str().map(|s| s.to_string()),
                    file_size: d["file_size"].as_i64(),
                    timestamp: d["timestamp"].as_i64().unwrap_or(0),
                    status: d["status"].as_str().unwrap_or("").to_string(),
                    pinned: d["pinned"].as_bool(),
                    pinned_by: d["pinned_by"].as_str().map(|s| s.to_string()),
                    pinned_at: d["pinned_at"].as_i64(),
                is_deleted: d["is_deleted"].as_bool(),
                deleted_for_me: d["deleted_for_me"].as_str().map(|s| s.to_string()),
            deleted_by: d["deleted_by"].as_str().map(|s| s.to_string()),
                });
            }
            messages.reverse();
            Ok(messages)
        })
    }


    pub fn update_message_status(&self, message_id: &str, status: &str) -> Result<bool> {
        run_appwrite(async {
            self.update_document("messages", message_id, json!({
                "status": status
            })).await.map_err(map_err)?;
            Ok(true)
        })
    }

    pub fn update_messages_status_in_room(
        &self,
        room_tag: &str,
        status: &str,
        exclude_sender: &str,
    ) -> Result<Vec<Message>> {
        run_appwrite(async {
            let queries = vec![
                json!({ "method": "equal", "attribute": "room_tag", "values": [room_tag] }).to_string(),
                json!({ "method": "orderDesc", "attribute": "timestamp" }).to_string(),
                json!({ "method": "limit", "values": [100] }).to_string(),
            ];
            let docs = self.list_documents("messages", &queries).await.map_err(map_err)?;
            let mut updated = Vec::new();
            for d in docs {
                let sender_id = d["sender_id"].as_str().unwrap_or("");
                let msg_status = d["status"].as_str().unwrap_or("");
                let msg_id = d["id"].as_str().unwrap_or("");
                if sender_id != exclude_sender && msg_status != status {
                    self.update_document("messages", msg_id, json!({ "status": status })).await.map_err(map_err)?;
                    updated.push(Message {
                        id: msg_id.to_string(),
                        room_tag: d["room_tag"].as_str().unwrap_or("").to_string(),
                        sender_id: sender_id.to_string(),
                        sender_name: d["sender_name"].as_str().unwrap_or("").to_string(),
                        msg_type: d["msg_type"].as_str().unwrap_or("").to_string(),
                        content: d["content"].as_str().unwrap_or("").to_string(),
                        file_url: d["file_url"].as_str().map(|s| s.to_string()),
                        file_name: d["file_name"].as_str().map(|s| s.to_string()),
                        file_size: d["file_size"].as_i64(),
                        timestamp: d["timestamp"].as_i64().unwrap_or(0),
                        status: status.to_string(),
                        pinned: d["pinned"].as_bool(),
                        pinned_by: d["pinned_by"].as_str().map(|s| s.to_string()),
                        pinned_at: d["pinned_at"].as_i64(),
                    is_deleted: d["is_deleted"].as_bool(),
                deleted_for_me: d["deleted_for_me"].as_str().map(|s| s.to_string()),
            deleted_by: d["deleted_by"].as_str().map(|s| s.to_string()),
                });
                }
            }
            Ok(updated)
        })
    }

    pub fn insert_status(&self, status: &UserStatus) -> Result<()> {
        run_appwrite(async {
            self.create_document("statuses", &status.id, json!({
                "id": status.id,
                "creator_id": status.creator_id,
                "creator_name": status.creator_name,
                "creator_avatar": status.creator_avatar,
                "media_type": status.media_type,
                "media_url": status.media_url,
                "text_content": status.text_content,
                "timestamp": status.timestamp,
            })).await.map_err(map_err)?;
            Ok(())
        })
    }

    pub fn get_active_statuses(&self, viewer_tag: &str, expiration_ms: i64) -> Result<Vec<UserStatus>> {
        run_appwrite(async {
            let perm_queries = vec![
                json!({ "method": "equal", "attribute": "viewer_tag", "values": [viewer_tag] }).to_string(),
                json!({ "method": "equal", "attribute": "allowed", "values": [true] }).to_string(),
            ];
            let perm_docs = self.list_documents("status_permissions", &perm_queries).await.map_err(map_err)?;
            let mut allowed_creators: std::collections::HashSet<String> = perm_docs.into_iter()
                .map(|d| d["user_tag"].as_str().unwrap_or("").to_string())
                .collect();
            allowed_creators.insert(viewer_tag.to_string());

            let now = chrono::Utc::now().timestamp_millis();
            let status_queries = vec![
                json!({ "method": "limit", "values": [100] }).to_string(),
            ];
            let status_docs = self.list_documents("statuses", &status_queries).await.map_err(map_err)?;
            let mut active = Vec::new();
            for d in status_docs {
                let creator_id = d["creator_id"].as_str().unwrap_or("");
                let timestamp = d["timestamp"].as_i64().unwrap_or(0);
                if allowed_creators.contains(creator_id) && timestamp > (now - expiration_ms) {
                    active.push(UserStatus {
                        id: d["id"].as_str().unwrap_or("").to_string(),
                        creator_id: creator_id.to_string(),
                        creator_name: d["creator_name"].as_str().unwrap_or("").to_string(),
                        creator_avatar: d["creator_avatar"].as_str().unwrap_or("").to_string(),
                        media_type: d["media_type"].as_str().unwrap_or("").to_string(),
                        media_url: d["media_url"].as_str().unwrap_or("").to_string(),
                        text_content: d["text_content"].as_str().unwrap_or("").to_string(),
                        timestamp,
                    });
                }
            }
            active.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
            Ok(active)
        })
    }

    pub fn create_user(&self, tag: &str, name: &str, avatar: &str, password: &str) -> Result<bool> {
        let created = run_appwrite(async {
            if self.get_document("users", tag).await.map_err(map_err)?.is_some() {
                return Ok(false);
            }
            let password_hash = bcrypt::hash(password, bcrypt::DEFAULT_COST).map_err(map_err)?;
            self.create_document("users", tag, json!({
                "tag": tag,
                "name": name,
                "avatar": avatar,
                "password_hash": password_hash,
            })).await.map_err(map_err)?;
            Ok(true)
        })?;

        if created {
            let mut cache = self.users_cache.write().unwrap();
            *cache = None;
        }

        Ok(created)
    }

    pub fn authenticate_user(&self, tag: &str, password: &str) -> Result<Option<DbUser>> {
        run_appwrite(async {
            match self.get_document("users", tag).await.map_err(map_err)? {
                None => Ok(None),
                Some(doc) => {
                    let hash = doc["password_hash"].as_str().unwrap_or("");
                    if bcrypt::verify(password, hash).unwrap_or(false) {
                        Ok(Some(DbUser {
                            tag: tag.to_string(),
                            name: doc["name"].as_str().unwrap_or("").to_string(),
                            avatar: doc["avatar"].as_str().unwrap_or("").to_string(),
                            bio: doc.get("bio").and_then(|v| v.as_str()).map(|s| s.to_string()),
                            settings: doc.get("settings").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        }))
                    } else {
                        Ok(None)
                    }
                }
            }
        })
    }

    pub fn get_all_users(&self) -> Result<Vec<DbUser>> {
        {
            if let Some(entry) = self.users_cache.read().unwrap().as_ref() {
                if !entry.is_expired() {
                    return Ok(entry.data.clone());
                }
            }
        }

        let users = run_appwrite(async {
            let queries = vec![
                json!({ "method": "limit", "values": [1000] }).to_string(),
            ];
            let docs = self.list_documents("users", &queries).await.map_err(map_err)?;
            let mut users = Vec::new();
            for d in docs {
                users.push(DbUser {
                    tag: d["tag"].as_str().unwrap_or("").to_string(),
                    name: d["name"].as_str().unwrap_or("").to_string(),
                    avatar: d["avatar"].as_str().unwrap_or("").to_string(),
                    bio: d.get("bio").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    settings: d.get("settings").and_then(|v| v.as_str()).map(|s| s.to_string()),
                });
            }
            Ok(users)
        })?;

        {
            let mut cache = self.users_cache.write().unwrap();
            *cache = Some(CacheEntry::new(users.clone(), Duration::from_secs(30)));
        }

        Ok(users)
    }


    pub fn insert_direct_message(&self, msg: &DirectMessage) -> Result<()> {
        {
            let mut cache = self.chatted_users_cache.write().unwrap();
            cache.remove(&msg.sender_tag);
            cache.remove(&msg.receiver_tag);
        }
        run_appwrite(async {
            self.create_document("direct_messages", &msg.id, json!({
                "id": msg.id,
                "sender_tag": msg.sender_tag,
                "receiver_tag": msg.receiver_tag,
                "msg_type": msg.msg_type,
                "content": msg.content,
                "file_url": msg.file_url,
                "file_name": msg.file_name,
                "file_size": msg.file_size,
                "timestamp": msg.timestamp,
                "status": msg.status,
            })).await.map_err(map_err)?;
            Ok(())
        })
    }


    pub fn get_direct_messages(&self, user1: &str, user2: &str, limit: usize) -> Result<Vec<DirectMessage>> {
        run_appwrite(async {
            let q1 = vec![
                json!({ "method": "equal", "attribute": "sender_tag", "values": [user1] }).to_string(),
                json!({ "method": "equal", "attribute": "receiver_tag", "values": [user2] }).to_string(),
                json!({ "method": "orderDesc", "attribute": "timestamp" }).to_string(),
                json!({ "method": "limit", "values": [limit] }).to_string(),
            ];
            let docs1 = self.list_documents("direct_messages", &q1).await.map_err(map_err)?;

            let q2 = vec![
                json!({ "method": "equal", "attribute": "sender_tag", "values": [user2] }).to_string(),
                json!({ "method": "equal", "attribute": "receiver_tag", "values": [user1] }).to_string(),
                json!({ "method": "orderDesc", "attribute": "timestamp" }).to_string(),
                json!({ "method": "limit", "values": [limit] }).to_string(),
            ];
            let docs2 = self.list_documents("direct_messages", &q2).await.map_err(map_err)?;

            let mut all = Vec::new();
            for d in docs1.into_iter().chain(docs2.into_iter()) {
                all.push(DirectMessage {
                    id: d["id"].as_str().unwrap_or("").to_string(),
                    sender_tag: d["sender_tag"].as_str().unwrap_or("").to_string(),
                    receiver_tag: d["receiver_tag"].as_str().unwrap_or("").to_string(),
                    msg_type: d["msg_type"].as_str().unwrap_or("").to_string(),
                    content: d["content"].as_str().unwrap_or("").to_string(),
                    file_url: d["file_url"].as_str().map(|s| s.to_string()),
                    file_name: d["file_name"].as_str().map(|s| s.to_string()),
                    file_size: d["file_size"].as_i64(),
                    timestamp: d["timestamp"].as_i64().unwrap_or(0),
                    status: d["status"].as_str().unwrap_or("").to_string(),
                is_deleted: d["is_deleted"].as_bool(),
                    deleted_for_me: d["deleted_for_me"].as_str().map(|s| s.to_string()),
                deleted_by: d["deleted_by"].as_str().map(|s| s.to_string()),
                pinned: d["pinned"].as_bool(),
                pinned_by: d["pinned_by"].as_str().map(|s| s.to_string()),
                pinned_at: d["pinned_at"].as_i64(),
                });
            }

            all.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
            if all.len() > limit {
                let start = all.len() - limit;
                all = all[start..].to_vec();
            }
            Ok(all)
        })
    }

    pub fn update_direct_message_status(&self, message_id: &str, status: &str) -> Result<bool> {
        run_appwrite(async {
            self.update_document("direct_messages", message_id, json!({
                "status": status
            })).await.map_err(map_err)?;
            Ok(true)
        })
    }

    pub fn update_direct_messages_delivered(&self, receiver_tag: &str) -> Result<Vec<DirectMessage>> {
        run_appwrite(async {
            let q = vec![
                json!({ "method": "equal", "attribute": "receiver_tag", "values": [receiver_tag] }).to_string(),
                json!({ "method": "equal", "attribute": "status", "values": ["sent"] }).to_string(),
                json!({ "method": "limit", "values": [100] }).to_string(),
            ];
            let docs = self.list_documents("direct_messages", &q).await.map_err(map_err)?;
            let mut updated = Vec::new();
            for d in docs {
                let msg_id = d["id"].as_str().unwrap_or("").to_string();
                self.update_document("direct_messages", &msg_id, json!({ "status": "delivered" })).await.map_err(map_err)?;
                
                updated.push(DirectMessage {
                    id: msg_id,
                    sender_tag: d["sender_tag"].as_str().unwrap_or("").to_string(),
                    receiver_tag: d["receiver_tag"].as_str().unwrap_or("").to_string(),
                    msg_type: d["msg_type"].as_str().unwrap_or("").to_string(),
                    content: d["content"].as_str().unwrap_or("").to_string(),
                    file_url: d["file_url"].as_str().map(|s| s.to_string()),
                    file_name: d["file_name"].as_str().map(|s| s.to_string()),
                    file_size: d["file_size"].as_i64(),
                    timestamp: d["timestamp"].as_i64().unwrap_or(0),
                    status: "delivered".to_string(),
                    is_deleted: d["is_deleted"].as_bool(),
                    deleted_for_me: d["deleted_for_me"].as_str().map(|s| s.to_string()),
                deleted_by: d["deleted_by"].as_str().map(|s| s.to_string()),
                pinned: d["pinned"].as_bool(),
                pinned_by: d["pinned_by"].as_str().map(|s| s.to_string()),
                pinned_at: d["pinned_at"].as_i64(),
                });
            }
            Ok(updated)
        })
    }

    pub fn update_direct_messages_seen(&self, sender: &str, receiver: &str) -> Result<Vec<String>> {
        run_appwrite(async {
            let q = vec![
                json!({ "method": "equal", "attribute": "sender_tag", "values": [sender] }).to_string(),
                json!({ "method": "equal", "attribute": "receiver_tag", "values": [receiver] }).to_string(),
                json!({ "method": "orderDesc", "attribute": "timestamp" }).to_string(),
                json!({ "method": "limit", "values": [1000] }).to_string(),
            ];
            let docs = self.list_documents("direct_messages", &q).await.map_err(map_err)?;
            let mut updated_ids = Vec::new();
            for d in docs {
                let status = d["status"].as_str().unwrap_or("");
                let msg_id = d["id"].as_str().unwrap_or("");
                if status != "seen" {
                    self.update_document("direct_messages", msg_id, json!({ "status": "seen" })).await.map_err(map_err)?;
                    updated_ids.push(msg_id.to_string());
                }
            }
            Ok(updated_ids)
        })
    }

    pub fn create_room(&self, name: &str, creator_tag: &str) -> Result<bool> {
        let created = run_appwrite(async {
            if self.get_document("rooms", name).await.map_err(map_err)?.is_some() {
                return Ok(false);
            }
            let invite_code = uuid::Uuid::new_v4().to_string();
            self.create_document("rooms", name, json!({
                "name": name,
                "creator_tag": creator_tag,
                "visibility": "public",
                "invite_code": invite_code,
                "banned_words": "",
                "description": ""
            })).await.map_err(map_err)?;

            // Automatically add creator to members as admin
            let member_doc_id = uuid::Uuid::new_v4().to_string();
            self.create_document("room_members", &member_doc_id, json!({
                "room_tag": name,
                "user_tag": creator_tag,
                "role": "admin",
                "custom_title": "Owner"
            })).await.map_err(map_err)?;

            Ok(true)
        })?;

        if created {
            let mut cache = self.rooms_cache.write().unwrap();
            *cache = None;
        }

        Ok(created)
    }

    pub fn update_room(&self, old_name: &str, new_name: &str, user_tag: &str) -> Result<bool> {
        let updated = run_appwrite(async {
            let doc = match self.get_document("rooms", old_name).await.map_err(map_err)? {
                Some(d) => d,
                None => return Ok(false),
            };

            let creator = doc["creator_tag"].as_str().unwrap_or("");
            if creator != user_tag {
                return Ok(false);
            }

            let visibility = doc["visibility"].as_str().unwrap_or("public");
            let invite_code = doc["invite_code"].as_str().unwrap_or("");
            let banned_words = doc["banned_words"].as_str().unwrap_or("");

            self.delete_document("rooms", old_name).await.map_err(map_err)?;
            self.create_document("rooms", new_name, json!({
                "name": new_name,
                "creator_tag": user_tag,
                "visibility": visibility,
                "invite_code": invite_code,
                "banned_words": banned_words
            })).await.map_err(map_err)?;

            // Update old members
            let q = vec![
                json!({ "method": "equal", "attribute": "room_tag", "values": [old_name] }).to_string(),
                json!({ "method": "limit", "values": [1000] }).to_string(),
            ];
            let docs = self.list_documents("room_members", &q).await.map_err(map_err)?;
            for d in docs {
                let doc_id = d["$id"].as_str().unwrap_or("");
                let u_tag = d["user_tag"].as_str().unwrap_or("");
                let role = d["role"].as_str().unwrap_or("member");
                let custom_title = d["custom_title"].as_str().unwrap_or("");
                self.delete_document("room_members", doc_id).await.map_err(map_err)?;
                
                let member_doc_id = uuid::Uuid::new_v4().to_string();
                self.create_document("room_members", &member_doc_id, json!({
                    "room_tag": new_name,
                    "user_tag": u_tag,
                    "role": role,
                    "custom_title": custom_title
                })).await.map_err(map_err)?;
            }

            Ok(true)
        })?;

        if updated {
            let mut cache = self.rooms_cache.write().unwrap();
            *cache = None;
        }

        Ok(updated)
    }

    pub fn delete_room(&self, name: &str, user_tag: &str) -> Result<bool> {
        let deleted = run_appwrite(async {
            let doc = match self.get_document("rooms", name).await.map_err(map_err)? {
                Some(d) => d,
                None => return Ok(false),
            };

            let creator = doc["creator_tag"].as_str().unwrap_or("");
            if creator != user_tag {
                return Ok(false);
            }

            self.delete_document("rooms", name).await.map_err(map_err)?;

            // Delete members
            let q = vec![
                json!({ "method": "equal", "attribute": "room_tag", "values": [name] }).to_string(),
                json!({ "method": "limit", "values": [1000] }).to_string(),
            ];
            let docs = self.list_documents("room_members", &q).await.map_err(map_err)?;
            for d in docs {
                let doc_id = d["$id"].as_str().unwrap_or("");
                self.delete_document("room_members", doc_id).await.map_err(map_err)?;
            }

            Ok(true)
        })?;

        if deleted {
            let mut cache = self.rooms_cache.write().unwrap();
            *cache = None;
        }

        Ok(deleted)
    }

    pub fn get_member_role_level(&self, room_tag: &str, user_tag: &str) -> Result<i32> {
        run_appwrite(async {
            // First check if the user is the creator of the room
            let mut is_public = false;
            if let Some(room) = self.get_document("rooms", room_tag).await.map_err(map_err)? {
                if room["creator_tag"].as_str() == Some(user_tag) {
                    return Ok(4); // Admin
                }
                if room["visibility"].as_str() == Some("public") {
                    is_public = true;
                }
            }
            
            let q = vec![
                json!({ "method": "equal", "attribute": "room_tag", "values": [room_tag] }).to_string(),
                json!({ "method": "equal", "attribute": "user_tag", "values": [user_tag] }).to_string(),
                json!({ "method": "limit", "values": [1] }).to_string(),
            ];
            let docs = self.list_documents("room_members", &q).await.map_err(map_err)?;
            if let Some(d) = docs.first() {
                let role = d["role"].as_str().unwrap_or("member");
                match role {
                    "admin" => Ok(4),
                    "co_admin" => Ok(3),
                    "moderator" => Ok(2),
                    _ => Ok(1),
                }
            } else {
                if is_public {
                    Ok(1) // Public rooms allow everyone as level 1 (Member)
                } else {
                    Ok(0) // Not a member
                }
            }
        })
    }

    pub fn is_room_member(&self, room_tag: &str, user_tag: &str) -> Result<bool> {
        let lvl = self.get_member_role_level(room_tag, user_tag)?;
        Ok(lvl > 0)
    }

    pub fn has_pending_invitation(&self, room_tag: &str, user_tag: &str) -> Result<bool> {
        run_appwrite(async {
            let q = vec![
                json!({ "method": "equal", "attribute": "room_tag", "values": [room_tag] }).to_string(),
                json!({ "method": "equal", "attribute": "receiver_tag", "values": [user_tag] }).to_string(),
                json!({ "method": "equal", "attribute": "status", "values": ["pending"] }).to_string(),
                json!({ "method": "limit", "values": [1] }).to_string(),
            ];
            let docs = self.list_documents("room_invitations", &q).await.map_err(map_err)?;
            Ok(!docs.is_empty())
        })
    }

    pub fn add_room_member(&self, room_tag: &str, user_tag: &str, role: &str, custom_title: &str) -> Result<bool> {
        run_appwrite(async {
            let mut is_explicit_member = false;
            if let Some(room) = self.get_document("rooms", room_tag).await.map_err(map_err)? {
                if room["creator_tag"].as_str() == Some(user_tag) {
                    is_explicit_member = true;
                }
            }
            if !is_explicit_member {
                let q = vec![
                    json!({ "method": "equal", "attribute": "room_tag", "values": [room_tag] }).to_string(),
                    json!({ "method": "equal", "attribute": "user_tag", "values": [user_tag] }).to_string(),
                    json!({ "method": "limit", "values": [1] }).to_string(),
                ];
                let docs = self.list_documents("room_members", &q).await.map_err(map_err)?;
                if !docs.is_empty() {
                    is_explicit_member = true;
                }
            }

            if !is_explicit_member {
                let member_doc_id = uuid::Uuid::new_v4().to_string();
                self.create_document("room_members", &member_doc_id, json!({
                    "room_tag": room_tag,
                    "user_tag": user_tag,
                    "role": role,
                    "custom_title": custom_title
                })).await.map_err(map_err)?;
                Ok(true)
            } else {
                Ok(false)
            }
        })
    }

    pub fn get_room_members(&self, room_tag: &str) -> Result<Vec<DbRoomMember>> {
        run_appwrite(async {
            let q = vec![
                json!({ "method": "equal", "attribute": "room_tag", "values": [room_tag] }).to_string(),
                json!({ "method": "limit", "values": [1000] }).to_string(),
            ];
            let docs = self.list_documents("room_members", &q).await.map_err(map_err)?;
            let mut members = Vec::new();
            for d in docs {
                members.push(DbRoomMember {
                    room_tag: d["room_tag"].as_str().unwrap_or("").to_string(),
                    user_tag: d["user_tag"].as_str().unwrap_or("").to_string(),
                    role: d["role"].as_str().unwrap_or("member").to_string(),
                    custom_title: d["custom_title"].as_str().map(|s| s.to_string()),
                });
            }
            Ok(members)
        })
    }

    pub fn update_room_member_role(&self, room_tag: &str, user_tag: &str, role: &str, custom_title: Option<String>, req_by: &str) -> Result<bool> {
        let req_lvl = self.get_member_role_level(room_tag, req_by)?;
        let target_lvl = self.get_member_role_level(room_tag, user_tag)?;
        
        if req_lvl <= target_lvl || req_lvl < 2 {
            return Ok(false);
        }

        let new_role_lvl = match role {
            "admin" => 4,
            "co_admin" => 3,
            "moderator" => 2,
            _ => 1,
        };
        if req_lvl < new_role_lvl {
            return Ok(false);
        }

        run_appwrite(async {
            let q = vec![
                json!({ "method": "equal", "attribute": "room_tag", "values": [room_tag] }).to_string(),
                json!({ "method": "equal", "attribute": "user_tag", "values": [user_tag] }).to_string(),
                json!({ "method": "limit", "values": [1] }).to_string(),
            ];
            let docs = self.list_documents("room_members", &q).await.map_err(map_err)?;
            if let Some(d) = docs.first() {
                let doc_id = d["$id"].as_str().unwrap_or("");
                self.update_document("room_members", doc_id, json!({
                    "role": role,
                    "custom_title": custom_title.unwrap_or_default()
                })).await.map_err(map_err)?;
                Ok(true)
            } else {
                Ok(false)
            }
        })
    }

    pub fn remove_room_member(&self, room_tag: &str, user_tag: &str, req_by: &str) -> Result<bool> {
        let is_self = user_tag == req_by;
        if !is_self {
            let req_lvl = self.get_member_role_level(room_tag, req_by)?;
            let target_lvl = self.get_member_role_level(room_tag, user_tag)?;
            
            if req_lvl <= target_lvl || req_lvl < 2 {
                return Ok(false);
            }
        }

        run_appwrite(async {
            let q = vec![
                json!({ "method": "equal", "attribute": "room_tag", "values": [room_tag] }).to_string(),
                json!({ "method": "equal", "attribute": "user_tag", "values": [user_tag] }).to_string(),
                json!({ "method": "limit", "values": [1] }).to_string(),
            ];
            let docs = self.list_documents("room_members", &q).await.map_err(map_err)?;
            if let Some(d) = docs.first() {
                let doc_id = d["$id"].as_str().unwrap_or("");
                self.delete_document("room_members", doc_id).await.map_err(map_err)?;
                Ok(true)
            } else {
                Ok(false)
            }
        })
    }

    pub fn send_room_invitation(&self, room_tag: &str, sender_tag: &str, receiver_tag: &str) -> Result<DbRoomInvitation> {
        run_appwrite(async {
            // Verify receiver user exists in Appwrite database
            let user_exists = self.get_document("users", receiver_tag).await.map_err(map_err)?.is_some();
            if !user_exists {
                return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(AppwriteError("User does not exist".to_string()))));
            }

            // Check if explicitly a member (in room_members or creator of room)
            let mut is_mem = false;
            if let Some(room) = self.get_document("rooms", room_tag).await.map_err(map_err)? {
                if room["creator_tag"].as_str() == Some(receiver_tag) {
                    is_mem = true;
                }
            }
            if !is_mem {
                let q = vec![
                    json!({ "method": "equal", "attribute": "room_tag", "values": [room_tag] }).to_string(),
                    json!({ "method": "equal", "attribute": "user_tag", "values": [receiver_tag] }).to_string(),
                    json!({ "method": "limit", "values": [1] }).to_string(),
                ];
                let docs = self.list_documents("room_members", &q).await.map_err(map_err)?;
                if !docs.is_empty() {
                    is_mem = true;
                }
            }

            if is_mem {
                return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(AppwriteError("User is already a member".to_string()))));
            }

            let has_inv = self.has_pending_invitation(room_tag, receiver_tag)?;
            if has_inv {
                return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(AppwriteError("Invitation already pending".to_string()))));
            }

            let invite_id = uuid::Uuid::new_v4().to_string();
            let inv = DbRoomInvitation {
                id: invite_id.clone(),
                room_tag: room_tag.to_string(),
                sender_tag: sender_tag.to_string(),
                receiver_tag: receiver_tag.to_string(),
                status: "pending".to_string(),
            };

            self.create_document("room_invitations", &invite_id, json!({
                "id": invite_id,
                "room_tag": room_tag,
                "sender_tag": sender_tag,
                "receiver_tag": receiver_tag,
                "status": "pending"
            })).await.map_err(map_err)?;

            Ok(inv)
        })
    }

    pub fn get_room_invitations(&self, user_tag: &str) -> Result<Vec<DbRoomInvitation>> {
        run_appwrite(async {
            let q = vec![
                json!({ "method": "equal", "attribute": "receiver_tag", "values": [user_tag] }).to_string(),
                json!({ "method": "equal", "attribute": "status", "values": ["pending"] }).to_string(),
                json!({ "method": "limit", "values": [1000] }).to_string(),
            ];
            let docs = self.list_documents("room_invitations", &q).await.map_err(map_err)?;
            let mut invites = Vec::new();
            for d in docs {
                invites.push(DbRoomInvitation {
                    id: d["id"].as_str().unwrap_or("").to_string(),
                    room_tag: d["room_tag"].as_str().unwrap_or("").to_string(),
                    sender_tag: d["sender_tag"].as_str().unwrap_or("").to_string(),
                    receiver_tag: d["receiver_tag"].as_str().unwrap_or("").to_string(),
                    status: d["status"].as_str().unwrap_or("pending").to_string(),
                });
            }
            Ok(invites)
        })
    }

    pub fn handle_room_invitation(&self, invite_id: &str, accept: bool, user_tag: &str) -> Result<bool> {
        run_appwrite(async {
            let doc = match self.get_document("room_invitations", invite_id).await.map_err(map_err)? {
                Some(d) => d,
                None => return Ok(false),
            };

            if doc["receiver_tag"].as_str() != Some(user_tag) {
                return Ok(false);
            }

            let room_tag = doc["room_tag"].as_str().unwrap_or("");
            let status = if accept { "accepted" } else { "declined" };

            self.update_document("room_invitations", invite_id, json!({
                "status": status
            })).await.map_err(map_err)?;

            if accept {
                let is_mem = self.is_room_member(room_tag, user_tag)?;
                if !is_mem {
                    let member_doc_id = uuid::Uuid::new_v4().to_string();
                    self.create_document("room_members", &member_doc_id, json!({
                        "room_tag": room_tag,
                        "user_tag": user_tag,
                        "role": "member",
                        "custom_title": "Member"
                    })).await.map_err(map_err)?;
                }
            }

            Ok(true)
        })
    }

    pub fn join_room_by_invite_code(&self, invite_code: &str, user_tag: &str) -> Result<Option<DbRoom>> {
        run_appwrite(async {
            let q = vec![
                json!({ "method": "equal", "attribute": "invite_code", "values": [invite_code] }).to_string(),
                json!({ "method": "limit", "values": [1] }).to_string(),
            ];
            let docs = self.list_documents("rooms", &q).await.map_err(map_err)?;
            if let Some(d) = docs.first() {
                let room_tag = d["name"].as_str().unwrap_or("");
                let room = DbRoom {
                    name: room_tag.to_string(),
                    creator_tag: d["creator_tag"].as_str().map(|s| s.to_string()),
                    visibility: d["visibility"].as_str().map(|s| s.to_string()),
                    invite_code: Some(invite_code.to_string()),
                    banned_words: d["banned_words"].as_str().map(|s| s.to_string()),
                    description: d["description"].as_str().map(|s| s.to_string()),
                    is_member: Some(true),
                };

                let is_mem = self.is_room_member(room_tag, user_tag)?;
                if !is_mem {
                    let member_doc_id = uuid::Uuid::new_v4().to_string();
                    self.create_document("room_members", &member_doc_id, json!({
                        "room_tag": room_tag,
                        "user_tag": user_tag,
                        "role": "member",
                        "custom_title": "Member"
                    })).await.map_err(map_err)?;
                }

                Ok(Some(room))
            } else {
                Ok(None)
            }
        })
    }

    pub fn update_room_settings(&self, room_tag: &str, visibility: &str, banned_words: &str, description: &str, req_by: &str) -> Result<bool> {
        let req_lvl = self.get_member_role_level(room_tag, req_by)?;
        if req_lvl < 3 {
            return Ok(false);
        }

        let updated = run_appwrite(async {
            self.update_document("rooms", room_tag, json!({
                "visibility": visibility,
                "banned_words": banned_words,
                "description": description
            })).await.map_err(map_err)?;
            Ok(true)
        })?;

        if updated {
            let mut cache = self.rooms_cache.write().unwrap();
            *cache = None;
        }

        Ok(updated)
    }



    pub fn get_message_by_id(&self, message_id: &str) -> Result<Option<Message>> {
        run_appwrite(async {
            let doc = match self.get_document("messages", message_id).await.map_err(map_err)? {
                Some(d) => d,
                None => return Ok(None),
            };

            Ok(Some(Message {
                id: doc["id"].as_str().unwrap_or("").to_string(),
                room_tag: doc["room_tag"].as_str().unwrap_or("").to_string(),
                sender_id: doc["sender_id"].as_str().unwrap_or("").to_string(),
                sender_name: doc["sender_name"].as_str().unwrap_or("").to_string(),
                msg_type: doc["msg_type"].as_str().unwrap_or("").to_string(),
                content: doc["content"].as_str().unwrap_or("").to_string(),
                file_url: doc["file_url"].as_str().map(|s| s.to_string()),
                file_name: doc["file_name"].as_str().map(|s| s.to_string()),
                file_size: doc["file_size"].as_i64(),
                timestamp: doc["timestamp"].as_i64().unwrap_or(0),
                status: doc["status"].as_str().unwrap_or("").to_string(),
                pinned: doc["pinned"].as_bool(),
                pinned_by: doc["pinned_by"].as_str().map(|s| s.to_string()),
                pinned_at: doc["pinned_at"].as_i64(),
            is_deleted: doc["is_deleted"].as_bool(),
                deleted_for_me: doc["deleted_for_me"].as_str().map(|s| s.to_string()),
            deleted_by: doc["deleted_by"].as_str().map(|s| s.to_string()),
                }))
        })
    }

    pub fn get_direct_message_by_id(&self, message_id: &str) -> Result<Option<DirectMessage>> {
        run_appwrite(async {
            let doc = match self.get_document("direct_messages", message_id).await.map_err(map_err)? {
                Some(d) => d,
                None => return Ok(None),
            };

            Ok(Some(DirectMessage {
                id: doc["id"].as_str().unwrap_or("").to_string(),
                sender_tag: doc["sender_tag"].as_str().unwrap_or("").to_string(),
                receiver_tag: doc["receiver_tag"].as_str().unwrap_or("").to_string(),
                msg_type: doc["msg_type"].as_str().unwrap_or("").to_string(),
                content: doc["content"].as_str().unwrap_or("").to_string(),
                file_url: doc["file_url"].as_str().map(|s| s.to_string()),
                file_name: doc["file_name"].as_str().map(|s| s.to_string()),
                file_size: doc["file_size"].as_i64(),
                timestamp: doc["timestamp"].as_i64().unwrap_or(0),
                status: doc["status"].as_str().unwrap_or("").to_string(),
                is_deleted: doc["is_deleted"].as_bool(),
                deleted_for_me: doc["deleted_for_me"].as_str().map(|s| s.to_string()),
            deleted_by: doc["deleted_by"].as_str().map(|s| s.to_string()),
            pinned: doc["pinned"].as_bool(),
            pinned_by: doc["pinned_by"].as_str().map(|s| s.to_string()),
            pinned_at: doc["pinned_at"].as_i64(),
                }))
        })
    }

    pub fn pin_message(&self, message_id: &str, pinned_by: &str) -> Result<Option<Message>> {
        run_appwrite(async {
            let _doc = match self.get_document("messages", message_id).await.map_err(map_err)? {
                Some(d) => d,
                None => return Ok(None),
            };

            let pinned_at = chrono::Utc::now().timestamp_millis();
            self.update_document("messages", message_id, json!({
                "pinned": true,
                "pinned_by": pinned_by,
                "pinned_at": pinned_at
            })).await.map_err(map_err)?;

            // Fetch the updated document
            let updated_doc = match self.get_document("messages", message_id).await.map_err(map_err)? {
                Some(d) => d,
                None => return Ok(None),
            };

            Ok(Some(Message {
                id: updated_doc["id"].as_str().unwrap_or("").to_string(),
                room_tag: updated_doc["room_tag"].as_str().unwrap_or("").to_string(),
                sender_id: updated_doc["sender_id"].as_str().unwrap_or("").to_string(),
                sender_name: updated_doc["sender_name"].as_str().unwrap_or("").to_string(),
                msg_type: updated_doc["msg_type"].as_str().unwrap_or("").to_string(),
                content: updated_doc["content"].as_str().unwrap_or("").to_string(),
                file_url: updated_doc["file_url"].as_str().map(|s| s.to_string()),
                file_name: updated_doc["file_name"].as_str().map(|s| s.to_string()),
                file_size: updated_doc["file_size"].as_i64(),
                timestamp: updated_doc["timestamp"].as_i64().unwrap_or(0),
                status: updated_doc["status"].as_str().unwrap_or("").to_string(),
                pinned: updated_doc["pinned"].as_bool(),
                pinned_by: updated_doc["pinned_by"].as_str().map(|s| s.to_string()),
                pinned_at: updated_doc["pinned_at"].as_i64(),
            is_deleted: updated_doc["is_deleted"].as_bool(),
                deleted_for_me: updated_doc["deleted_for_me"].as_str().map(|s| s.to_string()),
            deleted_by: updated_doc["deleted_by"].as_str().map(|s| s.to_string()),
                }))
        })
    }

    pub fn unpin_message(&self, message_id: &str) -> Result<Option<Message>> {
        run_appwrite(async {
            let _doc = match self.get_document("messages", message_id).await.map_err(map_err)? {
                Some(d) => d,
                None => return Ok(None),
            };

            self.update_document("messages", message_id, json!({
                "pinned": false,
                "pinned_by": "",
                "pinned_at": 0
            })).await.map_err(map_err)?;

            // Fetch the updated document
            let updated_doc = match self.get_document("messages", message_id).await.map_err(map_err)? {
                Some(d) => d,
                None => return Ok(None),
            };

            Ok(Some(Message {
                id: updated_doc["id"].as_str().unwrap_or("").to_string(),
                room_tag: updated_doc["room_tag"].as_str().unwrap_or("").to_string(),
                sender_id: updated_doc["sender_id"].as_str().unwrap_or("").to_string(),
                sender_name: updated_doc["sender_name"].as_str().unwrap_or("").to_string(),
                msg_type: updated_doc["msg_type"].as_str().unwrap_or("").to_string(),
                content: updated_doc["content"].as_str().unwrap_or("").to_string(),
                file_url: updated_doc["file_url"].as_str().map(|s| s.to_string()),
                file_name: updated_doc["file_name"].as_str().map(|s| s.to_string()),
                file_size: updated_doc["file_size"].as_i64(),
                timestamp: updated_doc["timestamp"].as_i64().unwrap_or(0),
                status: updated_doc["status"].as_str().unwrap_or("").to_string(),
                pinned: updated_doc["pinned"].as_bool(),
                pinned_by: updated_doc["pinned_by"].as_str().map(|s| s.to_string()),
                pinned_at: updated_doc["pinned_at"].as_i64(),
            is_deleted: updated_doc["is_deleted"].as_bool(),
                deleted_for_me: updated_doc["deleted_for_me"].as_str().map(|s| s.to_string()),
            deleted_by: updated_doc["deleted_by"].as_str().map(|s| s.to_string()),
                }))
        })
    }

    pub fn pin_direct_message(&self, message_id: &str, pinned_by: &str) -> Result<Option<DirectMessage>> {
        run_appwrite(async {
            let _doc = match self.get_document("direct_messages", message_id).await.map_err(map_err)? {
                Some(d) => d,
                None => return Ok(None),
            };

            let pinned_at = chrono::Utc::now().timestamp_millis();
            self.update_document("direct_messages", message_id, json!({
                "pinned": true,
                "pinned_by": pinned_by,
                "pinned_at": pinned_at
            })).await.map_err(map_err)?;

            let updated_doc = match self.get_document("direct_messages", message_id).await.map_err(map_err)? {
                Some(d) => d,
                None => return Ok(None),
            };

            Ok(Some(DirectMessage {
                id: updated_doc["id"].as_str().unwrap_or("").to_string(),
                sender_tag: updated_doc["sender_tag"].as_str().unwrap_or("").to_string(),
                receiver_tag: updated_doc["receiver_tag"].as_str().unwrap_or("").to_string(),
                msg_type: updated_doc["msg_type"].as_str().unwrap_or("").to_string(),
                content: updated_doc["content"].as_str().unwrap_or("").to_string(),
                file_url: updated_doc["file_url"].as_str().map(|s| s.to_string()),
                file_name: updated_doc["file_name"].as_str().map(|s| s.to_string()),
                file_size: updated_doc["file_size"].as_i64(),
                timestamp: updated_doc["timestamp"].as_i64().unwrap_or(0),
                status: updated_doc["status"].as_str().unwrap_or("").to_string(),
                is_deleted: updated_doc["is_deleted"].as_bool(),
                deleted_for_me: updated_doc["deleted_for_me"].as_str().map(|s| s.to_string()),
                deleted_by: updated_doc["deleted_by"].as_str().map(|s| s.to_string()),
                pinned: updated_doc["pinned"].as_bool(),
                pinned_by: updated_doc["pinned_by"].as_str().map(|s| s.to_string()),
                pinned_at: updated_doc["pinned_at"].as_i64(),
            }))
        })
    }

    pub fn unpin_direct_message(&self, message_id: &str) -> Result<Option<DirectMessage>> {
        run_appwrite(async {
            let _doc = match self.get_document("direct_messages", message_id).await.map_err(map_err)? {
                Some(d) => d,
                None => return Ok(None),
            };

            self.update_document("direct_messages", message_id, json!({
                "pinned": false,
                "pinned_by": "",
                "pinned_at": 0
            })).await.map_err(map_err)?;

            let updated_doc = match self.get_document("direct_messages", message_id).await.map_err(map_err)? {
                Some(d) => d,
                None => return Ok(None),
            };

            Ok(Some(DirectMessage {
                id: updated_doc["id"].as_str().unwrap_or("").to_string(),
                sender_tag: updated_doc["sender_tag"].as_str().unwrap_or("").to_string(),
                receiver_tag: updated_doc["receiver_tag"].as_str().unwrap_or("").to_string(),
                msg_type: updated_doc["msg_type"].as_str().unwrap_or("").to_string(),
                content: updated_doc["content"].as_str().unwrap_or("").to_string(),
                file_url: updated_doc["file_url"].as_str().map(|s| s.to_string()),
                file_name: updated_doc["file_name"].as_str().map(|s| s.to_string()),
                file_size: updated_doc["file_size"].as_i64(),
                timestamp: updated_doc["timestamp"].as_i64().unwrap_or(0),
                status: updated_doc["status"].as_str().unwrap_or("").to_string(),
                is_deleted: updated_doc["is_deleted"].as_bool(),
                deleted_for_me: updated_doc["deleted_for_me"].as_str().map(|s| s.to_string()),
                deleted_by: updated_doc["deleted_by"].as_str().map(|s| s.to_string()),
                pinned: updated_doc["pinned"].as_bool(),
                pinned_by: updated_doc["pinned_by"].as_str().map(|s| s.to_string()),
                pinned_at: updated_doc["pinned_at"].as_i64(),
            }))
        })
    }

    pub fn get_pinned_direct_messages(&self, user1: &str, user2: &str) -> Result<Vec<DirectMessage>> {
        run_appwrite(async {
            let q = vec![
                json!({ "method": "equal", "attribute": "pinned", "values": [true] }).to_string(),
                json!({ "method": "orderAsc", "attribute": "timestamp" }).to_string(),
                json!({ "method": "limit", "values": [50] }).to_string(),
            ];

            let docs = self.list_documents("direct_messages", &q).await.map_err(map_err)?;
            let mut messages = Vec::new();
            for d in docs {
                let sender = d["sender_tag"].as_str().unwrap_or("");
                let receiver = d["receiver_tag"].as_str().unwrap_or("");
                if (sender == user1 && receiver == user2) || (sender == user2 && receiver == user1) {
                    messages.push(DirectMessage {
                        id: d["id"].as_str().unwrap_or("").to_string(),
                        sender_tag: sender.to_string(),
                        receiver_tag: receiver.to_string(),
                        msg_type: d["msg_type"].as_str().unwrap_or("").to_string(),
                        content: d["content"].as_str().unwrap_or("").to_string(),
                        file_url: d["file_url"].as_str().map(|s| s.to_string()),
                        file_name: d["file_name"].as_str().map(|s| s.to_string()),
                        file_size: d["file_size"].as_i64(),
                        timestamp: d["timestamp"].as_i64().unwrap_or(0),
                        status: d["status"].as_str().unwrap_or("").to_string(),
                        is_deleted: d["is_deleted"].as_bool(),
                        deleted_for_me: d["deleted_for_me"].as_str().map(|s| s.to_string()),
                        deleted_by: d["deleted_by"].as_str().map(|s| s.to_string()),
                        pinned: d["pinned"].as_bool(),
                        pinned_by: d["pinned_by"].as_str().map(|s| s.to_string()),
                        pinned_at: d["pinned_at"].as_i64(),
                    });
                }
            }
            Ok(messages)
        })
    }

    pub fn delete_message(&self, message_id: &str, user_tag: &str, for_everyone: bool, deleted_by_role: Option<String>) -> Result<()> {
        run_appwrite(async {
            let doc = match self.get_document("messages", message_id).await.map_err(map_err)? {
                Some(d) => d,
                None => return Ok(()),
            };

            let mut is_deleted = doc["is_deleted"].as_bool().unwrap_or(false);
            let mut deleted_for_me = doc["deleted_for_me"].as_str().unwrap_or("").to_string();

            if for_everyone {
                is_deleted = true;
            } else {
                let mut users: Vec<&str> = deleted_for_me.split(',').filter(|s| !s.is_empty()).collect();
                if !users.contains(&user_tag) {
                    users.push(user_tag);
                    deleted_for_me = users.join(",");
                }
            }

            self.update_document("messages", message_id, serde_json::json!({
                "is_deleted": is_deleted,
                "deleted_for_me": deleted_for_me,
                "deleted_by": deleted_by_role,
            })).await.map_err(map_err)?;

            Ok(())
        })
    }

    pub fn delete_direct_message(&self, message_id: &str, user_tag: &str, for_everyone: bool, deleted_by_role: Option<String>) -> Result<()> {
        run_appwrite(async {
            let doc = match self.get_document("direct_messages", message_id).await.map_err(map_err)? {
                Some(d) => d,
                None => return Ok(()),
            };

            let mut is_deleted = doc["is_deleted"].as_bool().unwrap_or(false);
            let mut deleted_for_me = doc["deleted_for_me"].as_str().unwrap_or("").to_string();

            if for_everyone {
                is_deleted = true;
            } else {
                let mut users: Vec<&str> = deleted_for_me.split(',').filter(|s| !s.is_empty()).collect();
                if !users.contains(&user_tag) {
                    users.push(user_tag);
                    deleted_for_me = users.join(",");
                }
            }

            self.update_document("direct_messages", message_id, serde_json::json!({
                "is_deleted": is_deleted,
                "deleted_for_me": deleted_for_me,
                "deleted_by": deleted_by_role,
            })).await.map_err(map_err)?;

            Ok(())
        })
    }

    pub fn get_pinned_messages(&self, room_tag: &str) -> Result<Vec<Message>> {
        run_appwrite(async {
            let queries = vec![
                json!({ "method": "equal", "attribute": "room_tag", "values": [room_tag] }).to_string(),
                json!({ "method": "equal", "attribute": "pinned", "values": [true] }).to_string(),
                json!({ "method": "orderDesc", "attribute": "pinned_at" }).to_string(),
                json!({ "method": "limit", "values": [1000] }).to_string(),
            ];
            let docs = self.list_documents("messages", &queries).await.map_err(map_err)?;
            let mut messages = Vec::new();
            for d in docs {
                messages.push(Message {
                    id: d["id"].as_str().unwrap_or("").to_string(),
                    room_tag: d["room_tag"].as_str().unwrap_or("").to_string(),
                    sender_id: d["sender_id"].as_str().unwrap_or("").to_string(),
                    sender_name: d["sender_name"].as_str().unwrap_or("").to_string(),
                    msg_type: d["msg_type"].as_str().unwrap_or("").to_string(),
                    content: d["content"].as_str().unwrap_or("").to_string(),
                    file_url: d["file_url"].as_str().map(|s| s.to_string()),
                    file_name: d["file_name"].as_str().map(|s| s.to_string()),
                    file_size: d["file_size"].as_i64(),
                    timestamp: d["timestamp"].as_i64().unwrap_or(0),
                    status: d["status"].as_str().unwrap_or("").to_string(),
                    pinned: d["pinned"].as_bool(),
                    pinned_by: d["pinned_by"].as_str().map(|s| s.to_string()),
                    pinned_at: d["pinned_at"].as_i64(),
                is_deleted: d["is_deleted"].as_bool(),
                deleted_for_me: d["deleted_for_me"].as_str().map(|s| s.to_string()),
            deleted_by: d["deleted_by"].as_str().map(|s| s.to_string()),
                });
            }
            Ok(messages)
        })
    }

    pub fn delete_status(&self, status_id: &str, creator_tag: &str) -> Result<bool> {
        run_appwrite(async {
            let doc = match self.get_document("statuses", status_id).await.map_err(map_err)? {
                Some(d) => d,
                None => return Ok(false),
            };

            let creator = doc["creator_id"].as_str().unwrap_or("");
            if creator != creator_tag {
                return Ok(false);
            }

            self.delete_document("statuses", status_id).await.map_err(map_err)?;
            Ok(true)
        })
    }

    pub fn set_status_permission(&self, user_tag: &str, viewer_tag: &str, allowed: bool) -> Result<()> {
        run_appwrite(async {
            let doc_id = format!("{}_{}", user_tag, viewer_tag);
            match self.get_document("status_permissions", &doc_id).await.map_err(map_err)? {
                Some(_) => {
                    self.update_document("status_permissions", &doc_id, json!({
                        "allowed": allowed
                    })).await.map_err(map_err)?;
                }
                None => {
                    self.create_document("status_permissions", &doc_id, json!({
                        "user_tag": user_tag,
                        "viewer_tag": viewer_tag,
                        "allowed": allowed
                    })).await.map_err(map_err)?;
                }
            }
            Ok(())
        })
    }

    pub fn get_status_permission(&self, user_tag: &str, viewer_tag: &str) -> Result<Option<bool>> {
        run_appwrite(async {
            let doc_id = format!("{}_{}", user_tag, viewer_tag);
            match self.get_document("status_permissions", &doc_id).await.map_err(map_err)? {
                Some(d) => Ok(d["allowed"].as_bool()),
                None => Ok(None)
            }
        })
    }

    pub fn get_status_permissions_list(&self, user_tag: &str) -> Result<Vec<StatusPermissionItem>> {
        run_appwrite(async {
            let all_users = self.get_all_users()?;
            let queries = vec![
                json!({ "method": "equal", "attribute": "user_tag", "values": [user_tag] }).to_string(),
            ];
            let docs = self.list_documents("status_permissions", &queries).await.map_err(map_err)?;
            
            let mut allowed_map = std::collections::HashMap::new();
            for d in docs {
                let viewer = d["viewer_tag"].as_str().unwrap_or("");
                let allowed = d["allowed"].as_bool().unwrap_or(false);
                allowed_map.insert(viewer.to_string(), allowed);
            }

            let mut list = Vec::new();
            for u in all_users {
                if u.tag != user_tag {
                    let allowed = *allowed_map.get(&u.tag).unwrap_or(&true);
                    list.push(StatusPermissionItem {
                        viewer_tag: u.tag,
                        username: u.name,
                        avatar: u.avatar,
                        allowed,
                    });
                }
            }
            Ok(list)
        })
    }

    pub fn get_chatted_user_tags(&self, user_tag: &str) -> Result<Vec<String>> {
        {
            if let Some(entry) = self.chatted_users_cache.read().unwrap().get(user_tag) {
                if !entry.is_expired() {
                    return Ok(entry.data.clone());
                }
            }
        }

        let tags = run_appwrite(async {
            let q1 = vec![
                json!({ "method": "equal", "attribute": "sender_tag", "values": [user_tag] }).to_string(),
                json!({ "method": "orderDesc", "attribute": "timestamp" }).to_string(),
                json!({ "method": "limit", "values": [100] }).to_string(),
            ];

            let q2 = vec![
                json!({ "method": "equal", "attribute": "receiver_tag", "values": [user_tag] }).to_string(),
                json!({ "method": "orderDesc", "attribute": "timestamp" }).to_string(),
                json!({ "method": "limit", "values": [100] }).to_string(),
            ];

            let (docs1_res, docs2_res) = tokio::join!(
                self.list_documents("direct_messages", &q1),
                self.list_documents("direct_messages", &q2)
            );

            let docs1 = docs1_res.map_err(map_err)?;
            let docs2 = docs2_res.map_err(map_err)?;

            let mut set = std::collections::HashSet::new();
            for d in docs1.into_iter().chain(docs2.into_iter()) {
                let sender = d["sender_tag"].as_str().unwrap_or("");
                let receiver = d["receiver_tag"].as_str().unwrap_or("");
                if sender != user_tag {
                    set.insert(sender.to_string());
                }
                if receiver != user_tag {
                    set.insert(receiver.to_string());
                }
            }
            Ok(set.into_iter().collect::<Vec<String>>())
        })?;

        {
            let mut cache = self.chatted_users_cache.write().unwrap();
            cache.insert(user_tag.to_string(), CacheEntry::new(tags.clone(), Duration::from_secs(10)));
        }

        Ok(tags)
    }


    pub fn get_chat_summary(&self, user_tag: &str) -> Result<serde_json::Value> {
        run_appwrite(async {
            // 1. Get last message and unread count for direct messages concurrently
            let q1 = vec![
                json!({ "method": "equal", "attribute": "sender_tag", "values": [user_tag] }).to_string(),
                json!({ "method": "orderDesc", "attribute": "timestamp" }).to_string(),
                json!({ "method": "limit", "values": [100] }).to_string(),
            ];
            let q2 = vec![
                json!({ "method": "equal", "attribute": "receiver_tag", "values": [user_tag] }).to_string(),
                json!({ "method": "orderDesc", "attribute": "timestamp" }).to_string(),
                json!({ "method": "limit", "values": [100] }).to_string(),
            ];

            let (docs1_res, docs2_res) = tokio::join!(
                self.list_documents("direct_messages", &q1),
                self.list_documents("direct_messages", &q2)
            );

            let docs1 = docs1_res.unwrap_or_default();
            let docs2 = docs2_res.unwrap_or_default();

            let mut direct_last_message = std::collections::HashMap::new();
            let mut direct_unread = std::collections::HashMap::new();

            for d in docs1 {
                let receiver = d["receiver_tag"].as_str().unwrap_or("").to_string();
                let timestamp = d["timestamp"].as_i64().unwrap_or(0);
                let entry = direct_last_message.entry(receiver).or_insert(0);
                if timestamp > *entry {
                    *entry = timestamp;
                }
            }

            for d in docs2 {
                let sender = d["sender_tag"].as_str().unwrap_or("").to_string();
                let timestamp = d["timestamp"].as_i64().unwrap_or(0);
                let entry = direct_last_message.entry(sender.clone()).or_insert(0);
                if timestamp > *entry {
                    *entry = timestamp;
                }

                let status = d["status"].as_str().unwrap_or("sent");
                if status != "seen" {
                    *direct_unread.entry(sender).or_insert(0) += 1;
                }
            }

            // 2. Get last message timestamp for rooms using our cache
            let rooms = self.get_rooms().unwrap_or_default();
            let mut room_last_message = std::collections::HashMap::new();

            let mut cached_map = self.room_last_messages_cache.read().unwrap().clone();
            let mut missing_rooms = Vec::new();

            for room in &rooms {
                if let Some(&ts) = cached_map.get(&room.name) {
                    room_last_message.insert(room.name.clone(), ts);
                } else {
                    missing_rooms.push(room.name.clone());
                }
            }

            // If there are missing rooms, run a bulk recent message query first
            if !missing_rooms.is_empty() {
                let q_bulk = vec![
                    json!({ "method": "orderDesc", "attribute": "timestamp" }).to_string(),
                    json!({ "method": "limit", "values": [300] }).to_string(),
                ];
                if let Ok(recent_docs) = self.list_documents("messages", &q_bulk).await {
                    let mut temp_map = std::collections::HashMap::new();
                    for d in recent_docs {
                        let room_tag = d["room_tag"].as_str().unwrap_or("").to_string();
                        let timestamp = d["timestamp"].as_i64().unwrap_or(0);
                        let entry = temp_map.entry(room_tag).or_insert(0);
                        if timestamp > *entry {
                            *entry = timestamp;
                        }
                    }

                    // Write back to cache
                    let mut cache_write = self.room_last_messages_cache.write().unwrap();
                    for (room_name, ts) in temp_map {
                        cache_write.insert(room_name.clone(), ts);
                        cached_map.insert(room_name, ts);
                    }
                }

                // Re-evaluate missing rooms
                let mut still_missing = Vec::new();
                for room in &rooms {
                    if let Some(&ts) = cached_map.get(&room.name) {
                        room_last_message.insert(room.name.clone(), ts);
                    } else {
                        still_missing.push(room.name.clone());
                    }
                }

                // Query any still missing rooms concurrently
                if !still_missing.is_empty() {
                    let mut futures = Vec::new();
                    for r_name in still_missing {
                        let db_clone = self.clone();
                        futures.push(async move {
                            let q = vec![
                                json!({ "method": "equal", "attribute": "room_tag", "values": [&r_name] }).to_string(),
                                json!({ "method": "orderDesc", "attribute": "timestamp" }).to_string(),
                                json!({ "method": "limit", "values": [1] }).to_string(),
                            ];
                            let ts = match db_clone.list_documents("messages", &q).await {
                                Ok(docs) => docs.first().and_then(|d| d["timestamp"].as_i64()).unwrap_or(0),
                                Err(_) => 0,
                            };
                            (r_name, ts)
                        });
                    }

                    let results = futures::future::join_all(futures).await;
                    let mut cache_write = self.room_last_messages_cache.write().unwrap();
                    for (r_name, ts) in results {
                        cache_write.insert(r_name.clone(), ts);
                        room_last_message.insert(r_name, ts);
                    }
                }
            }

            Ok(json!({
                "direct_last_message": direct_last_message,
                "direct_unread": direct_unread,
                "room_last_message": room_last_message,
            }))
        })
    }

    pub fn update_user_profile(
        &self,
        tag: &str,
        name: &str,
        avatar: &str,
        bio: &str,
        current_password: Option<&str>,
        new_password: Option<&str>,
    ) -> Result<DbUser> {
        let res = run_appwrite(async {
            let doc = self.get_document("users", tag).await.map_err(map_err)?
                .ok_or_else(|| rusqlite::Error::ToSqlConversionFailure(Box::new(AppwriteError("User not found".to_string()))))?;

            let mut updated_data = json!({
                "name": name,
                "avatar": avatar,
                "bio": bio,
            });

            if let Some(new_pwd) = new_password {
                if !new_pwd.trim().is_empty() {
                    let current_pwd = current_password.unwrap_or("");
                    let stored_hash = doc["password_hash"].as_str().unwrap_or("");
                    if !bcrypt::verify(current_pwd, stored_hash).unwrap_or(false) {
                        return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(AppwriteError("Unauthorized: Invalid password".to_string()))));
                    }
                    let new_hash = bcrypt::hash(new_pwd, bcrypt::DEFAULT_COST).map_err(map_err)?;
                    updated_data["password_hash"] = serde_json::Value::String(new_hash);
                }
            }

            let _ = self.update_document("users", tag, updated_data).await.map_err(map_err)?;

            Ok(DbUser {
                tag: tag.to_string(),
                name: name.to_string(),
                avatar: avatar.to_string(),
                bio: if bio.trim().is_empty() { None } else { Some(bio.to_string()) },
                settings: doc.get("settings").and_then(|v| v.as_str()).map(|s| s.to_string()),
            })
        })?;

        // Invalidate users cache
        {
            let mut cache = self.users_cache.write().unwrap();
            *cache = None;
        }

        Ok(res)
    }

    pub fn update_user_settings(&self, tag: &str, settings: &str) -> Result<()> {
        run_appwrite(async {
            let mut updated_data = serde_json::Map::new();
            updated_data.insert("settings".to_string(), serde_json::Value::String(settings.to_string()));
            let _ = self.update_document("users", tag, serde_json::Value::Object(updated_data)).await.map_err(map_err)?;
            Ok(())
        })?;

        // Invalidate users cache
        {
            let mut cache = self.users_cache.write().unwrap();
            *cache = None;
        }

        Ok(())
    }

    pub fn upload_file(&self, bytes: &[u8], filename: &str) -> Result<String> {
        let url = format!("{}/storage/buckets/{}/files", self.endpoint, self.bucket_id);
        let form = reqwest::multipart::Form::new()
            .text("fileId", "unique()")
            .part("file", reqwest::multipart::Part::bytes(bytes.to_vec()).file_name(filename.to_string()));

        let res = block_on(async {
            self.client.post(&url)
                .header("X-Appwrite-Project", &self.project_id)
                .header("X-Appwrite-Key", &self.api_key)
                .multipart(form)
                .send()
                .await
        }).map_err(map_err)?;

        if !res.status().is_success() {
            let status = res.status();
            let body = block_on(async { res.text().await }).unwrap_or_default();
            return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(AppwriteError(format!("Appwrite upload failed: status {}, body {}", status, body)))));
        }

        let json: serde_json::Value = block_on(async { res.json().await }).map_err(map_err)?;
        let file_id = json["$id"].as_str().ok_or_else(|| rusqlite::Error::ToSqlConversionFailure(Box::new(AppwriteError("Missing file $id".to_string()))))?;

        let public_url = format!("{}/storage/buckets/{}/files/{}/view?project={}", self.endpoint, self.bucket_id, file_id, self.project_id);
        Ok(public_url)
    }
}
