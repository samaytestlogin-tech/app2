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

#[derive(Clone)]
pub struct Db {
    client: Client,
    endpoint: String,
    project_id: String,
    api_key: String,
    database_id: String,
    bucket_id: String,
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
            ]),
            ("rooms", "rooms", vec![
                ("name", "string", 255),
                ("creator_tag", "string", 255),
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
                    self.create_document("rooms", name, json!({
                        "name": name,
                        "creator_tag": null
                    })).await.map_err(map_err)?;
                    Ok(())
                }
            }
        })
    }

    pub fn get_rooms(&self) -> Result<Vec<DbRoom>> {
        run_appwrite(async {
            let queries = vec![
                json!({ "method": "limit", "values": [1000] }).to_string(),
            ];
            let docs = self.list_documents("rooms", &queries).await.map_err(map_err)?;
            let mut rooms = Vec::new();
            for d in docs {
                rooms.push(DbRoom {
                    name: d["name"].as_str().unwrap_or("").to_string(),
                    creator_tag: d["creator_tag"].as_str().map(|s| s.to_string()),
                });
            }
            rooms.sort_by(|a, b| a.name.cmp(&b.name));
            Ok(rooms)
        })
    }

    pub fn insert_message(&self, msg: &Message) -> Result<()> {
        run_appwrite(async {
            self.get_or_create_room(&msg.room_tag)?;
            self.create_document("messages", &msg.id, json!({
                "id": msg.id,
                "room_tag": msg.room_tag,
                "sender_id": msg.sender_id,
                "sender_name": msg.sender_name,
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
        run_appwrite(async {
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
        })
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
                        }))
                    } else {
                        Ok(None)
                    }
                }
            }
        })
    }

    pub fn get_all_users(&self) -> Result<Vec<DbUser>> {
        run_appwrite(async {
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
                });
            }
            Ok(users)
        })
    }

    pub fn insert_direct_message(&self, msg: &DirectMessage) -> Result<()> {
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
        run_appwrite(async {
            if self.get_document("rooms", name).await.map_err(map_err)?.is_some() {
                return Ok(false);
            }
            self.create_document("rooms", name, json!({
                "name": name,
                "creator_tag": creator_tag
            })).await.map_err(map_err)?;
            Ok(true)
        })
    }

    pub fn update_room(&self, old_name: &str, new_name: &str, user_tag: &str) -> Result<bool> {
        run_appwrite(async {
            let doc = match self.get_document("rooms", old_name).await.map_err(map_err)? {
                Some(d) => d,
                None => return Ok(false),
            };

            let creator = doc["creator_tag"].as_str().unwrap_or("");
            if creator != user_tag {
                return Ok(false);
            }

            self.delete_document("rooms", old_name).await.map_err(map_err)?;
            self.create_document("rooms", new_name, json!({
                "name": new_name,
                "creator_tag": user_tag
            })).await.map_err(map_err)?;

            Ok(true)
        })
    }

    pub fn delete_room(&self, name: &str, user_tag: &str) -> Result<bool> {
        run_appwrite(async {
            let doc = match self.get_document("rooms", name).await.map_err(map_err)? {
                Some(d) => d,
                None => return Ok(false),
            };

            let creator = doc["creator_tag"].as_str().unwrap_or("");
            if creator != user_tag {
                return Ok(false);
            }

            self.delete_document("rooms", name).await.map_err(map_err)?;
            Ok(true)
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
        run_appwrite(async {
            let q1 = vec![
                json!({ "method": "equal", "attribute": "sender_tag", "values": [user_tag] }).to_string(),
                json!({ "method": "orderDesc", "attribute": "timestamp" }).to_string(),
                json!({ "method": "limit", "values": [100] }).to_string(),
            ];
            let docs1 = self.list_documents("direct_messages", &q1).await.map_err(map_err)?;

            let q2 = vec![
                json!({ "method": "equal", "attribute": "receiver_tag", "values": [user_tag] }).to_string(),
                json!({ "method": "orderDesc", "attribute": "timestamp" }).to_string(),
                json!({ "method": "limit", "values": [100] }).to_string(),
            ];
            let docs2 = self.list_documents("direct_messages", &q2).await.map_err(map_err)?;

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
            Ok(set.into_iter().collect())
        })
    }

    pub fn get_chat_summary(&self, user_tag: &str) -> Result<serde_json::Value> {
        run_appwrite(async {
            // 1. Get last message and unread count for direct messages
            let q1 = vec![
                json!({ "method": "equal", "attribute": "sender_tag", "values": [user_tag] }).to_string(),
                json!({ "method": "orderDesc", "attribute": "timestamp" }).to_string(),
                json!({ "method": "limit", "values": [100] }).to_string(),
            ];
            let docs1 = self.list_documents("direct_messages", &q1).await.unwrap_or_default();

            let q2 = vec![
                json!({ "method": "equal", "attribute": "receiver_tag", "values": [user_tag] }).to_string(),
                json!({ "method": "orderDesc", "attribute": "timestamp" }).to_string(),
                json!({ "method": "limit", "values": [100] }).to_string(),
            ];
            let docs2 = self.list_documents("direct_messages", &q2).await.unwrap_or_default();

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

            // 2. Get last message timestamp for rooms
            let rooms = self.get_rooms().unwrap_or_default();
            let mut room_last_message = std::collections::HashMap::new();
            for room in rooms {
                let q_room = vec![
                    json!({ "method": "equal", "attribute": "room_tag", "values": [room.name] }).to_string(),
                    json!({ "method": "orderDesc", "attribute": "timestamp" }).to_string(),
                    json!({ "method": "limit", "values": [1] }).to_string(),
                ];
                if let Ok(docs) = self.list_documents("messages", &q_room).await {
                    if let Some(d) = docs.first() {
                        let timestamp = d["timestamp"].as_i64().unwrap_or(0);
                        room_last_message.insert(room.name, timestamp);
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
