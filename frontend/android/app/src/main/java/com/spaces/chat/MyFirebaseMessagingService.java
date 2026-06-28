package com.spaces.chat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class MyFirebaseMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "incoming_calls_channel";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        
        Map<String, String> data = remoteMessage.getData();
        if (data != null && "incoming_call".equals(data.get("type"))) {
            String callerName = data.get("caller_name");
            if (callerName == null) callerName = "Someone";
            String callerTag = data.get("caller_tag");
            
            showIncomingCallNotification(callerName, callerTag);
        }
    }

    private void showIncomingCallNotification(String callerName, String callerTag) {
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        // Sound URI pointing to res/raw/ringtone
        Uri ringtoneUri = Uri.parse("android.resource://" + getPackageName() + "/raw/ringtone");

        // Create notification channel with custom ringtone for Android Oreo+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Incoming Calls",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Alerts for incoming voice and video calls");
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .build();
            channel.setSound(ringtoneUri, audioAttributes);
            channel.enableVibration(true);
            channel.setBypassDnd(true);
            
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }

        // 1. Fullscreen / Tap Intent pointing to MainActivity
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra("action", "incoming_call");
        intent.putExtra("caller_tag", callerTag);
        
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        
        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
            this, 
            0, 
            intent, 
            flags
        );

        // 2. Answer Action Intent
        Intent answerIntent = new Intent(this, MainActivity.class);
        answerIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        answerIntent.putExtra("action", "accept_call");
        answerIntent.putExtra("caller_tag", callerTag);
        PendingIntent answerPendingIntent = PendingIntent.getActivity(
            this,
            1,
            answerIntent,
            flags
        );

        // 3. Decline Action Intent
        Intent declineIntent = new Intent(this, MainActivity.class);
        declineIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        declineIntent.putExtra("action", "decline_call");
        declineIntent.putExtra("caller_tag", callerTag);
        PendingIntent declinePendingIntent = PendingIntent.getActivity(
            this,
            2,
            declineIntent,
            flags
        );

        // Build notification with high priority and CATEGORY_CALL
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("📞 Incoming Call")
            .setContentText(callerName + " is calling you...")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setSound(ringtoneUri)
            .addAction(0, "Answer", answerPendingIntent)
            .addAction(0, "Decline", declinePendingIntent)
            .setAutoCancel(false)
            .setOngoing(true);

        if (notificationManager != null) {
            notificationManager.notify(42, builder.build());
        }
    }
}
