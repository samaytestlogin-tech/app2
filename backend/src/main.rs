use axum::{
    extract::{Multipart, State, DefaultBodyLimit, Path, Query},
    http::StatusCode,
    response::Json,
    routing::{get, post, put, delete},
    Router,
};
use socketioxide::{
    extract::{Data, SocketRef},
    SocketIo,
};
use std::net::SocketAddr;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;

mod db;

// ----------------------------------------------------
// Structs & Payloads
// ----------------------------------------------------
#[derive(Debug, serde::Deserialize, Clone)]
struct JoinRoomPayload {
    room_tag: String,
    user_id: String,
    username: String,
}

#[derive(Debug, serde::Deserialize, Clone)]
struct SendMessagePayload {
    id: String,
    room_tag: String,
    sender_id: String,
    sender_name: String,
    msg_type: String,
    content: String,
    file_url: Option<String>,
    file_name: Option<String>,
    file_size: Option<i64>,
}

#[derive(Debug, serde::Deserialize, Clone)]
struct MsgDeliveredPayload {
    message_id: String,
    room_tag: String,
}

#[derive(Debug, serde::Deserialize, Clone)]
struct MsgSeenPayload {
    message_id: Option<String>,
    room_tag: String,
    user_id: String,
}

#[derive(Debug, serde::Deserialize, Clone)]
struct PinMessagePayload {
    message_id: String,
    room_tag: Option<String>,
    receiver_tag: Option<String>,
    user_id: String,
}

#[derive(Debug, serde::Deserialize, Clone)]
struct DeleteMessagePayload {
    message_id: String,
    room_tag: Option<String>,
    receiver_tag: Option<String>,
    delete_type: String, // "for_me" or "for_everyone"
    user_tag: String,
}

#[derive(Debug, serde::Deserialize, Clone)]
struct PostStatusPayload {
    id: String,
    creator_id: String,
    creator_name: String,
    creator_avatar: String,
    media_type: String,
    media_url: String,
    text_content: String,
}

#[derive(Debug, serde::Deserialize)]
struct SignupPayload {
    tag: String,
    name: String,
    avatar: String,
    password: String,
}

#[derive(Debug, serde::Deserialize)]
struct UpdateProfilePayload {
    tag: String,
    name: String,
    avatar: String,
    bio: String,
    current_password: Option<String>,
    new_password: Option<String>,
}

#[derive(serde::Deserialize)]
struct UpdateUserSettingsPayload {
    user_tag: String,
    settings: String,
}
#[derive(Debug, serde::Deserialize)]
struct LoginPayload {
    tag: String,
    password: String,
}

#[derive(Debug, serde::Deserialize, Clone)]
struct SendDirectMessagePayload {
    id: String,
    sender_tag: String,
    receiver_tag: String,
    msg_type: String,
    content: String,
    file_url: Option<String>,
    file_name: Option<String>,
    file_size: Option<i64>,
}

#[derive(Debug, serde::Deserialize, Clone)]
struct DirectMsgSeenPayload {
    message_id: Option<String>,
    sender_tag: String,
    receiver_tag: String,
}

#[derive(Debug, serde::Deserialize, Clone)]
struct JoinDirectChatPayload {
    sender_tag: String,
    receiver_tag: String,
}

#[derive(Debug, serde::Deserialize)]
struct UpdateMemberRolePayload {
    role: String,
    custom_title: Option<String>,
    req_by: String,
}

#[derive(Debug, serde::Deserialize)]
struct RemoveMemberPayload {
    req_by: String,
}

#[derive(Debug, serde::Deserialize)]
struct SendInvitationPayload {
    sender_tag: String,
    receiver_tag: String,
}

#[derive(Debug, serde::Deserialize)]
struct HandleInvitationPayload {
    accept: bool,
    user_tag: String,
}

#[derive(Debug, serde::Deserialize)]
struct JoinByCodePayload {
    invite_code: String,
    user_tag: String,
}

#[derive(Debug, serde::Deserialize)]
struct UpdateSettingsPayload {
    visibility: String,
    banned_words: String,
    description: Option<String>,
    req_by: String,
}


#[derive(serde::Serialize)]
struct UploadResponse {
    url: String,
    name: String,
    size: i64,
}

#[derive(Clone)]
struct AppState {
    db: db::Db,
    online_registry: Arc<Mutex<HashMap<String, SocketRef>>>,
    #[allow(dead_code)]
    io: SocketIo,
}

// ----------------------------------------------------
// Main entrypoint
// ----------------------------------------------------
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    std::fs::create_dir_all("uploads")?;
    match dotenvy::dotenv_override() {
        Ok(path) => println!("Loaded env file from: {:?}", path),
        Err(e) => println!("dotenvy error: {:?}", e),
    }

    let (layer, io) = SocketIo::new_layer();

    let db = db::Db::init("chat.db")?;
    let online_registry = Arc::new(Mutex::new(HashMap::new()));
    let app_state = AppState {
        db: db.clone(),
        online_registry: online_registry.clone(),
        io: io.clone(),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);



    let db_clone = db.clone();
    let registry_clone = online_registry.clone();
    io.ns("/", move |socket: SocketRef| {
        let db = db_clone.clone();
        let registry = registry_clone.clone();
        async move {
            println!("Socket connected: {}", socket.id);

            // A. Register Socket Event (maps unique tag to socket)
            let reg_clone = registry.clone();
            let db_for_reg = db.clone();
            socket.on("register_socket", move |socket: SocketRef, Data(payload): Data<serde_json::Value>| {
                let reg = reg_clone.clone();
                let db = db_for_reg.clone();
                async move {
                    if let Some(user_tag) = payload.get("user_tag").and_then(|t| t.as_str()) {
                        let tag = user_tag.to_string();
                        println!("Registering socket ID {} for User tag {}", socket.id, tag);
                        
                        let mut r = reg.lock().await;
                        r.insert(tag.clone(), socket.clone());
                        let _ = socket.join(tag.clone());
                        
                        // Broadcast online notification
                        let _ = socket.broadcast().emit("user_online", &serde_json::json!({ "tag": tag })).await;

                        // Mark all pending sent direct messages as delivered
                        if let Ok(updated_msgs) = db.update_direct_messages_delivered(&tag) {
                            for msg in updated_msgs {
                                if let Some(sender_sock) = r.get(&msg.sender_tag) {
                                    let _ = sender_sock.emit("direct_msg_status_update", &serde_json::json!({
                                        "id": msg.id,
                                        "status": "delivered",
                                        "sender_tag": msg.sender_tag,
                                        "receiver_tag": msg.receiver_tag,
                                    }));
                                }
                            }
                        }
                    }
                }
            });

            // Update User Settings
            let db_for_settings = db.clone();
            socket.on("update_user_settings", move |_socket: SocketRef, Data(payload): Data<UpdateUserSettingsPayload>| {
                let db = db_for_settings.clone();
                async move {
                    if let Err(e) = db.update_user_settings(&payload.user_tag, &payload.settings) {
                        eprintln!("Error updating user settings: {:?}", e);
                    }
                }
            });

            // B. Join Group Tag Room Handler
            let db_for_join = db.clone();
            socket.on("join_room", move |socket: SocketRef, Data(payload): Data<JoinRoomPayload>| {
                let db = db_for_join.clone();
                async move {
                    println!(
                        "User {} ({}) joining room {}",
                        payload.username, payload.user_id, payload.room_tag
                    );

                    socket.leave_all();
                    let _ = socket.join(payload.room_tag.clone());

                    db.get_or_create_room(&payload.room_tag).ok();

                    let updated_ids = match db.update_messages_status_in_room(&payload.room_tag, "seen", &payload.user_id) {
                        Ok(ids) => ids,
                        Err(e) => {
                            eprintln!("Error updating messages status to seen in room {}: {:?}", payload.room_tag, e);
                            Vec::new()
                        }
                    };

                    let history = history_payload(&db, &payload.room_tag, &payload.user_id);
                    println!("Emitting room_history to user_id {}: count = {}", payload.user_id, history.len());
                    socket.emit("room_history", &history).ok();

                    if !updated_ids.is_empty() {
                        let _ = socket
                            .to(payload.room_tag.clone())
                            .emit(
                                "messages_seen",
                                &serde_json::json!({
                                    "room_tag": payload.room_tag,
                                    "user_id": payload.user_id,
                                    "message_ids": updated_ids,
                                }),
                            )
                            .await;
                    }
                }
            });

            // C. Send Group Message Handler
            let db_for_send = db.clone();
            socket.on("send_msg", move |socket: SocketRef, Data(payload): Data<SendMessagePayload>| {
                let db = db_for_send.clone();
                async move {
                    let msg = db::Message {
                        id: payload.id,
                        room_tag: payload.room_tag.clone(),
                        sender_id: payload.sender_id,
                        sender_name: payload.sender_name,
                        msg_type: payload.msg_type,
                        content: payload.content,
                        file_url: payload.file_url,
                        file_name: payload.file_name,
                        file_size: payload.file_size,
                        timestamp: chrono::Utc::now().timestamp_millis(),
                        status: "sent".to_string(),
                        pinned: None,
                        pinned_by: None,
                        pinned_at: None,
                        is_deleted: None,
                        deleted_for_me: None,
                    deleted_by: None,
                    };

                    match db.insert_message(&msg) {
                        Ok(clean_msg) => {
                            let _ = socket.to(payload.room_tag.clone()).emit("new_msg", &clean_msg).await;
                            let _ = socket.emit("new_msg", &clean_msg).ok();
                            socket
                                .emit(
                                    "msg_sent",
                                    &serde_json::json!({ "id": clean_msg.id, "status": "sent" }),
                                )
                                .ok();
                        }
                        Err(e) => {
                            eprintln!("Error inserting message to room {}: {:?}", payload.room_tag, e);
                        }
                    }
                }
            });

            // D. Group Message Delivered Handler
            let db_for_deliv = db.clone();
            socket.on("msg_delivered", move |socket: SocketRef, Data(payload): Data<MsgDeliveredPayload>| {
                let db = db_for_deliv.clone();
                async move {
                    if db
                        .update_message_status(&payload.message_id, "delivered")
                        .unwrap_or(false)
                    {
                        let _ = socket
                            .to(payload.room_tag)
                            .emit(
                                "msg_status_update",
                                &serde_json::json!({
                                    "id": payload.message_id,
                                    "status": "delivered",
                                }),
                            )
                            .await;
                    }
                }
            });

            // E. Group Message Seen Handler
            let db_for_seen = db.clone();
            socket.on("msg_seen", move |socket: SocketRef, Data(payload): Data<MsgSeenPayload>| {
                let db = db_for_seen.clone();
                async move {
                    if let Some(msg_id) = payload.message_id {
                        if db.update_message_status(&msg_id, "seen").unwrap_or(false) {
                            let _ = socket
                                .to(payload.room_tag)
                                .emit(
                                    "msg_status_update",
                                    &serde_json::json!({
                                        "id": msg_id,
                                        "status": "seen",
                                    }),
                                )
                                .await;
                        }
                    } else {
                        let updated_ids = db
                            .update_messages_status_in_room(
                                &payload.room_tag,
                                "seen",
                                &payload.user_id,
                            )
                            .unwrap_or_default();

                        if !updated_ids.is_empty() {
                            let _ = socket
                                .to(payload.room_tag.clone())
                                .emit(
                                    "messages_seen",
                                    &serde_json::json!({
                                        "room_tag": payload.room_tag,
                                        "user_id": payload.user_id,
                                        "message_ids": updated_ids,
                                    }),
                                )
                                .await;
                        }
                    }
                }
            });

            // F. Send 1-to-1 Direct Message Handler
            let db_for_dm = db.clone();
            let reg_for_dm = registry.clone();
            socket.on("send_direct_msg", move |socket: SocketRef, Data(payload): Data<SendDirectMessagePayload>| {
                let db = db_for_dm.clone();
                let reg = reg_for_dm.clone();
                async move {
                    if is_blocked(&db, &payload.sender_tag, &payload.receiver_tag)
                        || is_blocked(&db, &payload.receiver_tag, &payload.sender_tag)
                    {
                        println!("Blocked direct message: from {} to {}", payload.sender_tag, payload.receiver_tag);
                        return;
                    }

                    let mut msg = db::DirectMessage {
                        id: payload.id,
                        sender_tag: payload.sender_tag.clone(),
                        receiver_tag: payload.receiver_tag.clone(),
                        msg_type: payload.msg_type,
                        content: payload.content,
                        file_url: payload.file_url,
                        file_name: payload.file_name,
                        file_size: payload.file_size,
                        timestamp: chrono::Utc::now().timestamp_millis(),
                        status: "sent".to_string(),
                        is_deleted: None,
                        deleted_for_me: None,
                    deleted_by: None,
                    pinned: None,
                    pinned_by: None,
                    pinned_at: None,
                    };

                    // Check if receiver is online
                    let r = reg.lock().await;
                    let receiver_socket = r.get(&payload.receiver_tag);

                    let is_offline = receiver_socket.is_none();
                    if receiver_socket.is_some() {
                        msg.status = "delivered".to_string();
                    }

                    match db.insert_direct_message(&msg) {
                        Ok(_) => {
                            if let Some(sock) = receiver_socket {
                                let _ = sock.emit("new_direct_msg", &msg);
                            }
                            socket.emit("direct_msg_sent", &msg).ok();

                            if is_offline {
                                send_web_push(
                                    &msg.receiver_tag,
                                    &format!("New message from @{}", msg.sender_tag),
                                    &msg.content,
                                    "new_direct_msg",
                                    serde_json::to_value(&msg).unwrap_or(serde_json::Value::Null)
                                );
                            }
                        }
                        Err(e) => {
                            eprintln!("Error inserting direct message: {:?}", e);
                        }
                    }
                }
            });

            // G. 1-to-1 Direct Message Seen Handler
            let db_for_dm_seen = db.clone();
            let reg_for_dm_seen = registry.clone();
            socket.on("direct_msg_seen", move |_socket: SocketRef, Data(payload): Data<DirectMsgSeenPayload>| {
                let db = db_for_dm_seen.clone();
                let reg = reg_for_dm_seen.clone();
                async move {
                    if let Some(msg_id) = payload.message_id {
                        if db.update_direct_message_status(&msg_id, "seen").unwrap_or(false) {
                            // Notify sender
                            let r = reg.lock().await;
                            if let Some(sock) = r.get(&payload.sender_tag) {
                                let _ = sock.emit("direct_msg_status_update", &serde_json::json!({
                                    "id": msg_id,
                                    "status": "seen",
                                    "sender_tag": payload.sender_tag,
                                    "receiver_tag": payload.receiver_tag,
                                }));
                            }
                        }
                    } else {
                        // Mark all as seen
                        let updated_ids = db
                            .update_direct_messages_seen(&payload.sender_tag, &payload.receiver_tag)
                            .unwrap_or_default();

                        if !updated_ids.is_empty() {
                            let r = reg.lock().await;
                            if let Some(sock) = r.get(&payload.sender_tag) {
                                let _ = sock.emit("direct_messages_seen", &serde_json::json!({
                                    "sender_tag": payload.sender_tag,
                                    "receiver_tag": payload.receiver_tag,
                                    "message_ids": updated_ids,
                                }));
                            }
                        }
                    }
                }
            });

            // H. Retrieve Direct Chat History
            let db_for_dm_hist = db.clone();
            socket.on("get_direct_history", move |socket: SocketRef, Data(payload): Data<JoinDirectChatPayload>| {
                let db = db_for_dm_hist.clone();
                async move {
                    let history = match db.get_direct_messages(&payload.sender_tag, &payload.receiver_tag, 100) {
                        Ok(h) => h,
                        Err(e) => {
                            eprintln!("Error getting direct messages between {} and {}: {:?}", payload.sender_tag, payload.receiver_tag, e);
                            Vec::new()
                        }
                    };
                    socket.emit("direct_history", &history).ok();
                }
            });

            // I. Post User Status Story Handler
            let db_for_status = db.clone();
            let reg_for_post = registry.clone();
            socket.on("post_status", move |socket: SocketRef, Data(payload): Data<PostStatusPayload>| {
                let db = db_for_status.clone();
                let reg = reg_for_post.clone();
                async move {
                    let status = db::UserStatus {
                        id: payload.id,
                        creator_id: payload.creator_id,
                        creator_name: payload.creator_name,
                        creator_avatar: payload.creator_avatar,
                        media_type: payload.media_type,
                        media_url: payload.media_url,
                        text_content: payload.text_content,
                        timestamp: chrono::Utc::now().timestamp_millis(),
                    };

                    match db.insert_status(&status) {
                        Ok(_) => {
                            let r = reg.lock().await;
                            for (tag, sock) in r.iter() {
                                if tag != &status.creator_id {
                                    if let Ok(Some(allowed)) = db.get_status_permission(&status.creator_id, tag) {
                                        if allowed {
                                            let _ = sock.emit("new_status", &status);
                                        }
                                    }
                                }
                            }
                            socket.emit("status_posted", &status).ok();
                        }
                        Err(e) => {
                            eprintln!("Error inserting status for user {}: {:?}", status.creator_id, e);
                        }
                    }
                }
            });

            // J. Retrieve Status List
            let db_for_get_status = db.clone();
            let reg_for_get_status = registry.clone();
            socket.on("get_statuses", move |socket: SocketRef| {
                let db = db_for_get_status.clone();
                let reg = reg_for_get_status.clone();
                async move {
                    let mut viewer_tag = String::new();
                    {
                        let r = reg.lock().await;
                        for (tag, sock) in r.iter() {
                            if sock.id == socket.id {
                                viewer_tag = tag.clone();
                                break;
                            }
                        }
                    }
                    if !viewer_tag.is_empty() {
                        let statuses = match db.get_active_statuses(&viewer_tag, 86_400_000) {
                            Ok(s) => s,
                            Err(e) => {
                                eprintln!("Error getting active statuses for viewer {}: {:?}", viewer_tag, e);
                                Vec::new()
                            }
                        };
                        socket.emit("statuses_list", &statuses).ok();
                    } else {
                        socket.emit("statuses_list", &Vec::<db::UserStatus>::new()).ok();
                    }
                }
            });

            let db_for_call = db.clone();
            let reg_for_call = registry.clone();
            socket.on("call_user", move |socket: SocketRef, Data(payload): Data<serde_json::Value>| {
                let reg = reg_for_call.clone();
                let db = db_for_call.clone();
                async move {
                    if let (Some(receiver_tag), Some(offer)) = (
                        payload.get("receiver_tag").and_then(|v| v.as_str()),
                        payload.get("offer")
                    ) {
                        let caller_tag = payload.get("caller_tag").and_then(|v| v.as_str()).unwrap_or("");
                        let caller_name = payload.get("caller_name").and_then(|v| v.as_str()).unwrap_or("Someone");
                        let caller_avatar = payload.get("caller_avatar").and_then(|v| v.as_str()).unwrap_or("");

                        // Block call signaling if a blocking relationship exists
                        if is_blocked(&db, caller_tag, receiver_tag) || is_blocked(&db, receiver_tag, caller_tag) {
                            let _ = socket.emit("call_rejected", &serde_json::json!({
                                "caller_tag": caller_tag,
                                "reason": "blocked"
                            }));
                            return;
                        }

                        // Trigger Web Push Notification for Call (wakes up receiver PWA)
                        send_web_push(
                            receiver_tag,
                            &format!("📞 Incoming Call from {}", caller_name),
                            &format!("@{} is calling you...", caller_tag),
                            "incoming_call",
                            serde_json::json!({
                                "caller_tag": caller_tag,
                                "caller_name": caller_name,
                                "caller_avatar": caller_avatar,
                                "offer": offer
                            })
                        );

                        let r = reg.lock().await;
                        if let Some(target_socket) = r.get(receiver_tag) {
                            let _ = target_socket.emit("incoming_call", &serde_json::json!({
                                "caller_tag": caller_tag,
                                "caller_name": caller_name,
                                "caller_avatar": caller_avatar,
                                "offer": offer
                            }));
                        }
                    }
                }
            });

            let reg_for_accept = registry.clone();
            socket.on("accept_call", move |_socket: SocketRef, Data(payload): Data<serde_json::Value>| {
                let reg = reg_for_accept.clone();
                async move {
                    if let (Some(caller_tag), Some(answer)) = (
                        payload.get("caller_tag").and_then(|v| v.as_str()),
                        payload.get("answer")
                    ) {
                        let r = reg.lock().await;
                        if let Some(target_socket) = r.get(caller_tag) {
                            let _ = target_socket.emit("call_accepted", &serde_json::json!({
                                "receiver_tag": payload.get("receiver_tag").and_then(|v| v.as_str()).unwrap_or(""),
                                "answer": answer
                            }));
                        }
                    }
                }
            });

            let reg_for_reject = registry.clone();
            socket.on("reject_call", move |_socket: SocketRef, Data(payload): Data<serde_json::Value>| {
                let reg = reg_for_reject.clone();
                async move {
                    if let Some(caller_tag) = payload.get("caller_tag").and_then(|v| v.as_str()) {
                        let r = reg.lock().await;
                        if let Some(target_socket) = r.get(caller_tag) {
                            let _ = target_socket.emit("call_rejected", &serde_json::json!({
                                "receiver_tag": payload.get("receiver_tag").and_then(|v| v.as_str()).unwrap_or("")
                            }));
                        }
                    }
                }
            });

            let reg_for_end = registry.clone();
            socket.on("end_call", move |_socket: SocketRef, Data(payload): Data<serde_json::Value>| {
                let reg = reg_for_end.clone();
                async move {
                    if let Some(target_tag) = payload.get("target_tag").and_then(|v| v.as_str()) {
                        let r = reg.lock().await;
                        if let Some(target_socket) = r.get(target_tag) {
                            let _ = target_socket.emit("call_ended", &serde_json::json!({}));
                        }
                    }
                }
            });

            let reg_for_ice = registry.clone();
            socket.on("ice_candidate", move |_socket: SocketRef, Data(payload): Data<serde_json::Value>| {
                let reg = reg_for_ice.clone();
                async move {
                    if let (Some(target_tag), Some(candidate)) = (
                        payload.get("target_tag").and_then(|v| v.as_str()),
                        payload.get("candidate")
                    ) {
                        let r = reg.lock().await;
                        if let Some(target_socket) = r.get(target_tag) {
                            let _ = target_socket.emit("ice_candidate", &serde_json::json!({
                                "sender_tag": payload.get("sender_tag").and_then(|v| v.as_str()).unwrap_or(""),
                                "candidate": candidate
                            }));
                        }
                    }
                }
            });

            let db_for_pin = db.clone();
            socket.on("pin_message", move |socket: SocketRef, Data(payload): Data<PinMessagePayload>| {
                let db = db_for_pin.clone();
                async move {
                    if let Some(room_tag) = &payload.room_tag {
                        if let Ok(true) = db.is_room_member(room_tag, &payload.user_id) {
                            if let Ok(Some(msg)) = db.get_message_by_id(&payload.message_id) {
                                if !msg.is_deleted.unwrap_or(false) {
                                    match db.pin_message(&payload.message_id, &payload.user_id) {
                                        Ok(Some(msg)) => {
                                            let _ = socket.to(room_tag.clone()).emit("message_pinned", &msg).await;
                                            let _ = socket.emit("message_pinned", &msg).ok();
                                        }
                                        other => {
                                            eprintln!("Error pinning message {}: {:?}", payload.message_id, other);
                                        }
                                    }
                                }
                            }
                        }
                    } else if let Some(receiver_tag) = &payload.receiver_tag {
                        if let Ok(Some(msg)) = db.get_direct_message_by_id(&payload.message_id) {
                            if !msg.is_deleted.unwrap_or(false) && (msg.sender_tag == payload.user_id || msg.receiver_tag == payload.user_id) {
                                match db.pin_direct_message(&payload.message_id, &payload.user_id) {
                                    Ok(Some(msg)) => {
                                        let _ = socket.to(receiver_tag.clone()).emit("message_pinned", &msg).await;
                                        let _ = socket.emit("message_pinned", &msg).ok();
                                    }
                                    other => {
                                        eprintln!("Error pinning direct message {}: {:?}", payload.message_id, other);
                                    }
                                }
                            }
                        }
                    }
                }
            });

            let db_for_unpin = db.clone();
            socket.on("unpin_message", move |socket: SocketRef, Data(payload): Data<PinMessagePayload>| {
                let db = db_for_unpin.clone();
                async move {
                    if let Some(room_tag) = &payload.room_tag {
                        if let Ok(true) = db.is_room_member(room_tag, &payload.user_id) {
                            let mut allowed = false;
                            if let Ok(req_lvl) = db.get_member_role_level(room_tag, &payload.user_id) {
                                if req_lvl >= 2 {
                                    allowed = true;
                                }
                            }

                            if !allowed {
                                if let Ok(Some(msg)) = db.get_message_by_id(&payload.message_id) {
                                    if let Some(pinned_by) = msg.pinned_by {
                                        if pinned_by == payload.user_id {
                                            allowed = true;
                                        }
                                    }
                                }
                            }

                            if allowed {
                                match db.unpin_message(&payload.message_id) {
                                    Ok(Some(_msg)) => {
                                        let payload_out = serde_json::json!({
                                            "message_id": payload.message_id,
                                            "room_tag": room_tag
                                        });
                                        let _ = socket.to(room_tag.clone()).emit("message_unpinned", &payload_out).await;
                                        let _ = socket.emit("message_unpinned", &payload_out).ok();
                                    }
                                    other => {
                                        eprintln!("Error unpinning message {}: {:?}", payload.message_id, other);
                                    }
                                }
                            }
                        }
                    } else if let Some(receiver_tag) = &payload.receiver_tag {
                        let mut allowed = false;
                        if let Ok(Some(msg)) = db.get_direct_message_by_id(&payload.message_id) {
                            if msg.sender_tag == payload.user_id || msg.receiver_tag == payload.user_id {
                                allowed = true;
                            }
                        }
                        
                        if allowed {
                            match db.unpin_direct_message(&payload.message_id) {
                                Ok(Some(_msg)) => {
                                    let payload_out = serde_json::json!({
                                        "message_id": payload.message_id,
                                        "receiver_tag": receiver_tag
                                    });
                                    let _ = socket.to(receiver_tag.clone()).emit("message_unpinned", &payload_out).await;
                                    let _ = socket.emit("message_unpinned", &payload_out).ok();
                                }
                                other => {
                                    eprintln!("Error unpinning direct message {}: {:?}", payload.message_id, other);
                                }
                            }
                        }
                    }
                }
            });

            let db_for_delete = db.clone();
            socket.on("delete_message", move |socket: SocketRef, Data(payload): Data<DeleteMessagePayload>| {
                let db = db_for_delete.clone();
                async move {
                    let for_everyone = payload.delete_type == "for_everyone";
                    let mut allowed = false;
                    let mut deleted_by_role: Option<String> = None;

                    if let Some(room_tag) = &payload.room_tag {
                        if !for_everyone {
                            if let Ok(true) = db.is_room_member(room_tag, &payload.user_tag) {
                                allowed = true;
                            }
                        } else if let Ok(Some(msg)) = db.get_message_by_id(&payload.message_id) {
                            if !msg.is_deleted.unwrap_or(false) {
                                if msg.sender_id == payload.user_tag {
                                    allowed = true;
                                } else if let Ok(req_lvl) = db.get_member_role_level(room_tag, &payload.user_tag) {
                                    if req_lvl >= 2 {
                                        allowed = true;
                                        deleted_by_role = match req_lvl {
                                            4 | 3 => Some("admin".to_string()),
                                            2 => Some("moderator".to_string()),
                                            _ => None,
                                        };
                                    }
                                }
                            }
                        }

                        if allowed {
                            if let Ok(_) = db.delete_message(&payload.message_id, &payload.user_tag, for_everyone, deleted_by_role.clone()) {
                                let payload_out = serde_json::json!({
                                    "message_id": payload.message_id,
                                    "room_tag": room_tag,
                                    "delete_type": payload.delete_type,
                                    "user_tag": payload.user_tag,
                                    "deleted_by_role": deleted_by_role,
                                });
                                
                                if for_everyone {
                                    let _ = socket.to(room_tag.clone()).emit("message_deleted", &payload_out).await;
                                }
                                let _ = socket.emit("message_deleted", &payload_out).ok();
                            }
                        }
                    } else if let Some(receiver_tag) = &payload.receiver_tag {
                        if !for_everyone {
                            match db.get_direct_message_by_id(&payload.message_id) {
                                Ok(Some(msg)) => {
                                    if msg.sender_tag == payload.user_tag || msg.receiver_tag == payload.user_tag {
                                        allowed = true;
                                    }
                                }
                                Ok(None) => {}
                                Err(e) => {
                                    eprintln!("DB error getting direct message: {:?}", e);
                                }
                            }
                        } else if let Ok(Some(msg)) = db.get_direct_message_by_id(&payload.message_id) {
                            if !msg.is_deleted.unwrap_or(false) && msg.sender_tag == payload.user_tag {
                                allowed = true;
                            }
                        }

                        if allowed {
                            match db.delete_direct_message(&payload.message_id, &payload.user_tag, for_everyone, None) {
                                Ok(_) => {
                                    let payload_out = serde_json::json!({
                                        "message_id": payload.message_id,
                                        "receiver_tag": receiver_tag,
                                        "delete_type": payload.delete_type,
                                        "user_tag": payload.user_tag
                                    });
                                    
                                    if for_everyone {
                                        let _ = socket.to(receiver_tag.clone()).emit("message_deleted", &payload_out).await;
                                        let _ = socket.to(payload.user_tag.clone()).emit("message_deleted", &payload_out).await;
                                    }
                                    let _ = socket.emit("message_deleted", &payload_out).ok();
                                }
                                Err(e) => {
                                    eprintln!("DB error deleting direct message: {:?}", e);
                                }
                            }
                        }
                    }
                }
            });

            // K. Socket Disconnect Handler
            let reg_for_disc = registry.clone();
            socket.on_disconnect(move |socket: SocketRef| {
                let reg = reg_for_disc.clone();
                async move {
                    let mut r = reg.lock().await;
                    let mut disconnected_tag = None;
                    for (tag, sock) in r.iter() {
                        if sock.id == socket.id {
                            disconnected_tag = Some(tag.clone());
                            break;
                        }
                    }
                    if let Some(tag) = disconnected_tag {
                        r.remove(&tag);
                        println!("Socket ID {} disconnected for User tag {}", socket.id, tag);
                        let _ = socket.broadcast().emit("user_offline", &serde_json::json!({ "tag": tag })).await;
                    }
                }
            });
        }
    });

    let app = Router::new()
        .route("/api/tags", get(get_tags))
        .route("/api/rooms", post(create_room_route))
        .route("/api/rooms/{name}", put(update_room_route).delete(delete_room_route))
        .route("/api/rooms/{room_tag}/members", get(get_room_members_route))
        .route("/api/rooms/{room_tag}/members/{user_tag}", put(update_room_member_role_route).delete(remove_room_member_route))
        .route("/api/rooms/{room_tag}/invitations", post(send_room_invitation_route))
        .route("/api/users/{user_tag}/invitations", get(get_room_invitations_route))
        .route("/api/invitations/{invite_id}", put(handle_room_invitation_route))
        .route("/api/rooms/join", post(join_room_by_invite_code_route))
        .route("/api/rooms/{room_tag}/join_public", post(join_public_room_route))
        .route("/api/rooms/{room_tag}/settings", put(update_room_settings_route))
        .route("/api/rooms/{room_tag}/pins", get(get_pinned_messages_route))
        .route("/api/dms/{target_tag}/pins", get(get_pinned_direct_messages_route))
        .route("/api/statuses/{id}", delete(delete_status_route))
        .route("/api/status-permissions", post(set_permission_route).get(get_permissions_route))
        .route("/api/status-permissions/check", get(check_permission_route))
        .route("/api/upload", post(upload_file))
        .route("/api/auth/signup", post(signup))
        .route("/api/auth/login", post(login))
        .route("/api/users", get(get_users))
        .route("/api/users/update-profile", post(update_profile_route))
        .route("/api/users/chatted", get(get_chatted_users))
        .route("/api/chats/summary", get(get_chat_summary))
        .route("/api/memory-cards", get(get_memory_cards))
        .route("/api/memory-cards/search", get(search_memory_cards_route))
        .route("/api/push/subscribe", post(subscribe_push))
        .route("/api/push/public-key", get(get_push_public_key))
        .nest_service("/uploads", ServeDir::new("uploads"))
        .with_state(app_state)
        .layer(layer)
        .layer(cors)
        .layer(DefaultBodyLimit::max(50 * 1024 * 1024));

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    println!("Backend server starting on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

// ----------------------------------------------------
// Axum REST & Helper Functions
// ----------------------------------------------------
fn history_payload(db: &db::Db, room_tag: &str, user_tag: &str) -> Vec<db::Message> {
    match db.get_messages_for_user(room_tag, 100, user_tag) {
        Ok(msgs) => msgs,
        Err(e) => {
            eprintln!("Error getting messages for room {} for user {}: {:?}", room_tag, user_tag, e);
            Vec::new()
        }
    }
}

#[derive(Debug, serde::Deserialize)]
struct GetTagsParams {
    user_tag: Option<String>,
}

async fn get_tags(
    State(state): State<AppState>,
    Query(params): Query<GetTagsParams>,
) -> Result<Json<Vec<db::DbRoom>>, StatusCode> {
    state.db.get_rooms_for_user(params.user_tag.as_deref())
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn signup(
    State(state): State<AppState>,
    Json(payload): Json<SignupPayload>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    match state.db.create_user(&payload.tag, &payload.name, &payload.avatar, &payload.password) {
        Ok(true) => Ok(Json(serde_json::json!({ "status": "success", "tag": payload.tag }))),
        Ok(false) => Err(StatusCode::CONFLICT),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginPayload>,
) -> Result<Json<db::DbUser>, StatusCode> {
    match state.db.authenticate_user(&payload.tag, &payload.password) {
        Ok(Some(user)) => Ok(Json(user)),
        Ok(None) => Err(StatusCode::UNAUTHORIZED),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

#[derive(serde::Deserialize)]
struct GetUsersParams {
    request_by: Option<String>,
}

async fn get_users(
    State(state): State<AppState>,
    Query(params): Query<GetUsersParams>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let users = state.db.get_all_users().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let reg = state.online_registry.lock().await;

    let mut users_with_status = Vec::new();
    for u in users {
        let online = reg.contains_key(&u.tag);
        let mut blocked_by_them = false;

        if let Some(ref req_by) = params.request_by {
            if let Some(ref settings_str) = u.settings {
                if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(settings_str) {
                    if let Some(blocked_list) = json_val.get("blockedUsers").and_then(|v| v.as_array()) {
                        blocked_by_them = blocked_list.iter().any(|v| v.as_str() == Some(req_by.as_str()));
                    }
                }
            }
        }

        users_with_status.push(serde_json::json!({
            "tag": u.tag,
            "username": u.name,
            "avatar": u.avatar,
            "online": online,
            "bio": u.bio,
            "blocked_by_them": blocked_by_them,
        }));
    }
    Ok(Json(serde_json::json!(users_with_status)))
}


async fn update_profile_route(
    State(state): State<AppState>,
    Json(payload): Json<UpdateProfilePayload>,
) -> Result<Json<db::DbUser>, StatusCode> {
    let curr_pwd = payload.current_password.as_deref();
    let new_pwd = payload.new_password.as_deref();

    match state.db.update_user_profile(&payload.tag, &payload.name, &payload.avatar, &payload.bio, curr_pwd, new_pwd) {
        Ok(user) => Ok(Json(user)),
        Err(e) => {
            let err_str = e.to_string();
            if err_str.contains("Unauthorized") {
                Err(StatusCode::UNAUTHORIZED)
            } else {
                Err(StatusCode::INTERNAL_SERVER_ERROR)
            }
        }
    }
}

async fn get_chatted_users(
    State(state): State<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<Vec<String>>, StatusCode> {
    let user_tag = params.get("user_tag").ok_or(StatusCode::BAD_REQUEST)?;
    let tags = state.db.get_chatted_user_tags(user_tag).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(tags))
}

async fn get_chat_summary(
    State(state): State<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let user_tag = params.get("user_tag").ok_or(StatusCode::BAD_REQUEST)?;
    let summary = state.db.get_chat_summary(user_tag).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(summary))
}

#[derive(serde::Deserialize)]
struct MemoryCardQuery {
    user_tag: String,
}

#[derive(serde::Deserialize)]
struct MemorySearchQuery {
    user_tag: String,
    query: String,
}

async fn get_memory_cards(
    State(state): State<AppState>,
    Query(params): Query<MemoryCardQuery>,
) -> Result<Json<Vec<db::MemoryCard>>, StatusCode> {
    match state.db.get_or_build_memory_cards(&params.user_tag) {
        Ok(cards) => Ok(Json(cards)),
        Err(e) => {
            println!("Error fetching memory cards: {:?}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn search_memory_cards_route(
    State(state): State<AppState>,
    Query(params): Query<MemorySearchQuery>,
) -> Result<Json<Vec<db::MemoryCard>>, StatusCode> {
    match state.db.search_memory_cards(&params.user_tag, &params.query) {
        Ok(cards) => Ok(Json(cards)),
        Err(e) => {
            println!("Error searching memory cards: {:?}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn upload_file(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>, StatusCode> {
    let mut file_url = String::new();
    let mut file_name = String::new();
    let mut file_size = 0;

    while let Ok(Some(field)) = multipart.next_field().await {
        let field_name = field.name().unwrap_or("").to_string();
        
        if field_name == "file" {
            file_name = field.file_name().unwrap_or("file").to_string();
            
            if let Ok(bytes) = field.bytes().await {
                file_size = bytes.len() as i64;
                match state.db.upload_file(&bytes, &file_name) {
                    Ok(url) => {
                        file_url = url;
                    }
                    Err(e) => {
                        println!("Upload to Appwrite failed: {:?}", e);
                        return Err(StatusCode::INTERNAL_SERVER_ERROR);
                    }
                }
            } else {
                return Err(StatusCode::BAD_REQUEST);
            }
        }
    }

    if file_url.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    Ok(Json(UploadResponse {
        url: file_url,
        name: file_name,
        size: file_size,
    }))
}

// --- NEW ROOM & STATUS PERMISSION ROUTE HANDLERS ---

#[derive(serde::Deserialize)]
struct CreateRoomPayload {
    name: String,
    creator_tag: String,
}

#[derive(serde::Deserialize)]
struct UpdateRoomPayload {
    new_name: String,
    user_tag: String,
}

#[derive(serde::Deserialize)]
struct DeleteRoomPayload {
    user_tag: String,
}

#[derive(serde::Deserialize)]
struct DeleteStatusPayload {
    creator_tag: String,
}

#[derive(serde::Deserialize)]
struct SetPermissionPayload {
    user_tag: String,
    viewer_tag: String,
    allowed: bool,
}

#[derive(serde::Deserialize)]
struct GetPermissionsQuery {
    user_tag: String,
}

#[derive(serde::Deserialize)]
struct CheckPermissionQuery {
    user_tag: String,
    viewer_tag: String,
}

async fn create_room_route(
    State(state): State<AppState>,
    Json(payload): Json<CreateRoomPayload>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let clean_name = payload.name.trim().to_lowercase().replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "");
    if clean_name.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    match state.db.create_room(&clean_name, &payload.creator_tag) {
        Ok(true) => Ok(Json(serde_json::json!({ "status": "success", "name": clean_name }))),
        Ok(false) => Err(StatusCode::CONFLICT),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn update_room_route(
    State(state): State<AppState>,
    Path(old_name): Path<String>,
    Json(payload): Json<UpdateRoomPayload>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let clean_new_name = payload.new_name.trim().to_lowercase().replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "");
    if clean_new_name.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    match state.db.update_room(&old_name, &clean_new_name, &payload.user_tag) {
        Ok(true) => Ok(Json(serde_json::json!({ "status": "success", "old_name": old_name, "new_name": clean_new_name }))),
        Ok(false) => Err(StatusCode::UNAUTHORIZED),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn delete_room_route(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Json(payload): Json<DeleteRoomPayload>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    match state.db.delete_room(&name, &payload.user_tag) {
        Ok(true) => Ok(Json(serde_json::json!({ "status": "success", "name": name }))),
        Ok(false) => Err(StatusCode::UNAUTHORIZED),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn delete_status_route(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<DeleteStatusPayload>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    match state.db.delete_status(&id, &payload.creator_tag) {
        Ok(true) => Ok(Json(serde_json::json!({ "status": "success", "id": id }))),
        Ok(false) => Err(StatusCode::UNAUTHORIZED),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn set_permission_route(
    State(state): State<AppState>,
    Json(payload): Json<SetPermissionPayload>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    match state.db.set_status_permission(&payload.user_tag, &payload.viewer_tag, payload.allowed) {
        Ok(_) => Ok(Json(serde_json::json!({ "status": "success" }))),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn get_permissions_route(
    State(state): State<AppState>,
    Query(params): Query<GetPermissionsQuery>,
) -> Result<Json<Vec<db::StatusPermissionItem>>, StatusCode> {
    match state.db.get_status_permissions_list(&params.user_tag) {
        Ok(list) => Ok(Json(list)),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn check_permission_route(
    State(state): State<AppState>,
    Query(params): Query<CheckPermissionQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    match state.db.get_status_permission(&params.user_tag, &params.viewer_tag) {
        Ok(Some(allowed)) => Ok(Json(serde_json::json!({ "decided": true, "allowed": allowed }))),
        Ok(None) => Ok(Json(serde_json::json!({ "decided": false }))),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

// ----------------------------------------------------
// Web Push Notifications via Node helper & SQLite
// ----------------------------------------------------
#[derive(Debug, serde::Deserialize)]
struct SubscribePushPayload {
    user_tag: String,
    subscription: serde_json::Value,
}

async fn subscribe_push(
    Json(payload): Json<SubscribePushPayload>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let sub_str = payload.subscription.to_string();
    if save_subscription(&payload.user_tag, &sub_str).is_ok() {
        Ok(Json(serde_json::json!({ "status": "success" })))
    } else {
        Err(StatusCode::INTERNAL_SERVER_ERROR)
    }
}

async fn get_push_public_key() -> Json<serde_json::Value> {
    let key = "BKLtvWU6Ub89F667k8bmXw4ngUdHYY__aU7a8ZdpLRBAARHBWDaSzu8TBFWqOnMvCVHJ_YNhmx3Rlpz6Z94TqIU";
    Json(serde_json::json!({ "publicKey": key }))
}

fn get_subscription(user_tag: &str) -> Result<Option<String>, rusqlite::Error> {
    let conn = rusqlite::Connection::open("push_subscriptions.db")?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS subscriptions (
            user_tag TEXT PRIMARY KEY,
            subscription_json TEXT
        )",
        [],
    )?;
    let mut stmt = conn.prepare("SELECT subscription_json FROM subscriptions WHERE user_tag = ?1")?;
    let mut rows = stmt.query([user_tag])?;
    if let Some(row) = rows.next()? {
        let json: String = row.get(0)?;
        Ok(Some(json))
    } else {
        Ok(None)
    }
}

fn save_subscription(user_tag: &str, subscription_json: &str) -> Result<(), rusqlite::Error> {
    let conn = rusqlite::Connection::open("push_subscriptions.db")?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS subscriptions (
            user_tag TEXT PRIMARY KEY,
            subscription_json TEXT
        )",
        [],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO subscriptions (user_tag, subscription_json) VALUES (?1, ?2)",
        [user_tag, subscription_json],
    )?;
    Ok(())
}

fn send_web_push(receiver_tag: &str, title: &str, body: &str, data_type: &str, extra_data: serde_json::Value) {
    let receiver = receiver_tag.to_string();
    let t = title.to_string();
    let b = body.to_string();
    let dtype = data_type.to_string();
    
    tokio::task::spawn_blocking(move || {
        if let Ok(Some(sub_json)) = get_subscription(&receiver) {
            let payload = serde_json::json!({
                "title": t,
                "body": b,
                "type": dtype,
                "data": extra_data
            }).to_string();
            
            let status = std::process::Command::new("node")
                .arg("send_push.js")
                .arg(&sub_json)
                .arg(&payload)
                .status();
                
            match status {
                Ok(s) if s.success() => {
                    println!("Push notification sent successfully to {}", receiver);
                }
                other => {
                    eprintln!("Failed to send push notification to {}: {:?}", receiver, other);
                }
            }
        }
    });
}

async fn get_room_members_route(
    State(state): State<AppState>,
    Path(room_tag): Path<String>,
) -> Result<Json<Vec<db::DbRoomMember>>, StatusCode> {
    match state.db.get_room_members(&room_tag) {
        Ok(members) => Ok(Json(members)),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn update_room_member_role_route(
    State(state): State<AppState>,
    Path((room_tag, user_tag)): Path<(String, String)>,
    Json(payload): Json<UpdateMemberRolePayload>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    match state.db.update_room_member_role(&room_tag, &user_tag, &payload.role, payload.custom_title, &payload.req_by) {
        Ok(true) => Ok(Json(serde_json::json!({ "status": "success" }))),
        Ok(false) => Err(StatusCode::FORBIDDEN),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn remove_room_member_route(
    State(state): State<AppState>,
    Path((room_tag, user_tag)): Path<(String, String)>,
    Json(payload): Json<RemoveMemberPayload>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    match state.db.remove_room_member(&room_tag, &user_tag, &payload.req_by) {
        Ok(true) => Ok(Json(serde_json::json!({ "status": "success" }))),
        Ok(false) => Err(StatusCode::FORBIDDEN),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn send_room_invitation_route(
    State(state): State<AppState>,
    Path(room_tag): Path<String>,
    Json(payload): Json<SendInvitationPayload>,
) -> Result<Json<db::DbRoomInvitation>, StatusCode> {
    match state.db.send_room_invitation(&room_tag, &payload.sender_tag, &payload.receiver_tag) {
        Ok(inv) => {
            send_web_push(
                &payload.receiver_tag,
                "✉️ New Group Invitation",
                &format!("You've been invited to join #{}", room_tag),
                "room_invitation",
                serde_json::json!({ "room_tag": room_tag })
            );
            Ok(Json(inv))
        },
        Err(e) => {
            eprintln!("Error sending invitation: {:?}", e);
            Err(StatusCode::BAD_REQUEST)
        }
    }
}

async fn get_room_invitations_route(
    State(state): State<AppState>,
    Path(user_tag): Path<String>,
) -> Result<Json<Vec<db::DbRoomInvitation>>, StatusCode> {
    match state.db.get_room_invitations(&user_tag) {
        Ok(invites) => Ok(Json(invites)),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn handle_room_invitation_route(
    State(state): State<AppState>,
    Path(invite_id): Path<String>,
    Json(payload): Json<HandleInvitationPayload>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    match state.db.handle_room_invitation(&invite_id, payload.accept, &payload.user_tag) {
        Ok(true) => Ok(Json(serde_json::json!({ "status": "success" }))),
        Ok(false) => Err(StatusCode::FORBIDDEN),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn join_room_by_invite_code_route(
    State(state): State<AppState>,
    Json(payload): Json<JoinByCodePayload>,
) -> Result<Json<db::DbRoom>, StatusCode> {
    match state.db.join_room_by_invite_code(&payload.invite_code, &payload.user_tag) {
        Ok(Some(room)) => Ok(Json(room)),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

#[derive(Debug, serde::Deserialize)]
struct JoinPublicRoomPayload {
    user_tag: String,
}

async fn join_public_room_route(
    State(state): State<AppState>,
    Path(room_tag): Path<String>,
    Json(payload): Json<JoinPublicRoomPayload>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let rooms = state.db.get_rooms().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let room = rooms.iter().find(|r| r.name == room_tag).cloned();
    let Some(room) = room else {
        println!("DEBUG join_public: room {} not found. available: {:?}", room_tag, rooms.iter().map(|r| &r.name).collect::<Vec<_>>());
        return Err(StatusCode::NOT_FOUND);
    };
    if room.visibility.as_deref() != Some("public") {
        return Err(StatusCode::FORBIDDEN);
    }
    match state.db.add_room_member(&room_tag, &payload.user_tag, "member", "Member") {
        Ok(_) => Ok(Json(serde_json::json!({ "status": "success" }))),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn update_room_settings_route(
    State(state): State<AppState>,
    Path(room_tag): Path<String>,
    Json(payload): Json<UpdateSettingsPayload>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let desc = payload.description.as_deref().unwrap_or("");
    match state.db.update_room_settings(&room_tag, &payload.visibility, &payload.banned_words, desc, &payload.req_by) {
        Ok(true) => Ok(Json(serde_json::json!({ "status": "success" }))),
        Ok(false) => Err(StatusCode::FORBIDDEN),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn get_pinned_messages_route(
    State(state): State<AppState>,
    Path(room_tag): Path<String>,
) -> Result<Json<Vec<db::Message>>, StatusCode> {
    match state.db.get_pinned_messages(&room_tag) {
        Ok(msgs) => Ok(Json(msgs)),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}
async fn get_pinned_direct_messages_route(
    State(state): State<AppState>,
    Path(target_tag): Path<String>,
    headers: axum::http::HeaderMap,
) -> Result<Json<Vec<db::DirectMessage>>, StatusCode> {
    let user_tag = headers.get("X-User-Tag")
        .and_then(|h| h.to_str().ok())
        .ok_or(StatusCode::BAD_REQUEST)?;

    match state.db.get_pinned_direct_messages(user_tag, &target_tag) {
        Ok(msgs) => Ok(Json(msgs)),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

fn is_blocked(db: &db::Db, user_tag: &str, target_tag: &str) -> bool {
    if let Ok(users) = db.get_all_users() {
        if let Some(user) = users.iter().find(|u: &&db::DbUser| u.tag == user_tag) {
            if let Some(settings_str) = user.settings.as_deref() {
                if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(settings_str) {
                    if let Some(blocked_list) = json_val.get("blockedUsers").and_then(|v| v.as_array()) {
                        return blocked_list.iter().any(|v| v.as_str() == Some(target_tag));
                    }
                }
            }
        }
    }
    false
}


