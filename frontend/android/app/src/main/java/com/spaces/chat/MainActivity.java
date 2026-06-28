package com.spaces.chat;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private String incomingCallTag = "";
    private String incomingCallAction = "";
    private String fcmToken = "";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Wake screen and show over lock screen for incoming calls
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            );
        }

        // Fetch native Firebase token
        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken()
                .addOnCompleteListener(task -> {
                    if (task.isSuccessful()) {
                        fcmToken = task.getResult();
                        Log.d("SpacesCall", "FCM Device Token: " + fcmToken);
                    } else {
                        Log.e("SpacesCall", "Fetching FCM registration token failed", task.getException());
                    }
                });
        } catch (Exception e) {
            Log.e("SpacesCall", "Firebase init error: ", e);
        }

        // Add native bridge interface for the Web code to check incoming call triggers
        getBridge().getWebView().addJavascriptInterface(new Object() {
            @JavascriptInterface
            public String getIncomingCallTag() {
                String tag = incomingCallTag;
                incomingCallTag = ""; // Clear after reading once
                return tag;
            }

            @JavascriptInterface
            public String getIncomingCallAction() {
                String action = incomingCallAction;
                incomingCallAction = ""; // Clear after reading once
                return action;
            }

            @JavascriptInterface
            public String getFCMToken() {
                return fcmToken;
            }
        }, "AndroidCallBridge");

        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
        
        // Force wake screen on new intent if incoming call received
        if (intent != null && intent.getStringExtra("action") != null) {
            String act = intent.getStringExtra("action");
            if ("incoming_call".equals(act) || "accept_call".equals(act) || "decline_call".equals(act)) {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
                    setShowWhenLocked(true);
                    setTurnScreenOn(true);
                } else {
                    getWindow().addFlags(
                        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    );
                }
            }
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Cancel the calling notification (ID 42) to stop the native ringtone as soon as app is opened
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.cancel(42);
        }
    }

    private void handleIntent(Intent intent) {
        if (intent != null) {
            String action = intent.getStringExtra("action");
            String callerTag = intent.getStringExtra("caller_tag");
            
            if ("incoming_call".equals(action)) {
                if (callerTag != null && !callerTag.isEmpty()) {
                    incomingCallTag = callerTag;
                    incomingCallAction = "";
                    getBridge().triggerJSEvent("nativeCallReceived", "window", "{ \"caller_tag\": \"" + callerTag + "\", \"action\": \"\" }");
                }
            } else if ("accept_call".equals(action)) {
                if (callerTag != null && !callerTag.isEmpty()) {
                    incomingCallTag = callerTag;
                    incomingCallAction = "accept";
                    getBridge().triggerJSEvent("nativeCallReceived", "window", "{ \"caller_tag\": \"" + callerTag + "\", \"action\": \"accept\" }");
                }
            } else if ("decline_call".equals(action)) {
                if (callerTag != null && !callerTag.isEmpty()) {
                    incomingCallTag = callerTag;
                    incomingCallAction = "decline";
                    getBridge().triggerJSEvent("nativeCallReceived", "window", "{ \"caller_tag\": \"" + callerTag + "\", \"action\": \"decline\" }");
                }
            }
        }
    }
}
